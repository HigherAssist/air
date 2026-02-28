import type { APIGatewayProxyHandler } from 'aws-lambda';
import Stripe from 'stripe';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  CognitoIdentityProviderClient,
  AdminUserGlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const sesClient = new SESClient({});
const cognitoClient = new CognitoIdentityProviderClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssmClient = new SSMClient({});

const GRAPHQL_ENDPOINT = process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT!;
const API_KEY = process.env.AMPLIFY_DATA_API_KEY!;

async function gql(query: string, variables: Record<string, unknown>) {
  const res = await fetch(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json: any = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
  return json.data;
}

// Lazy-cached SSM lookups (same pattern as create-cognito-user / delete-admin-user)
let _tableName: string | undefined;
async function getTableName(): Promise<string> {
  if (_tableName) return _tableName;
  const param = await ssmClient.send(
    new GetParameterCommand({ Name: process.env.USER_TABLE_SSM_PARAM! })
  );
  _tableName = param.Parameter!.Value!;
  return _tableName;
}

let _userPoolId: string | undefined;
async function getUserPoolId(): Promise<string> {
  if (_userPoolId) return _userPoolId;
  const param = await ssmClient.send(
    new GetParameterCommand({ Name: process.env.USER_POOL_ID_SSM_PARAM! })
  );
  _userPoolId = param.Parameter!.Value!;
  return _userPoolId;
}

const createUserSubscriptionMutation = /* GraphQL */ `
  mutation CreateUserSubscription($input: CreateUserSubscriptionInput!) {
    createUserSubscription(input: $input) {
      id subscriptionId userId state
    }
  }
`;

const updateUserMutation = /* GraphQL */ `
  mutation UpdateUser($input: UpdateUserInput!) {
    updateUser(input: $input) {
      id subscriptionId stripeCustomerId status
    }
  }
`;

const updateUserSubscriptionMutation = /* GraphQL */ `
  mutation UpdateUserSubscription($input: UpdateUserSubscriptionInput!) {
    updateUserSubscription(input: $input) {
      id subscriptionId state
    }
  }
`;

const getUserSubscriptionBySubscriptionIdForCardQuery = /* GraphQL */ `
  query GetUserSubscriptionBySubscriptionId($subscriptionId: String!) {
    getUserSubscriptionBySubscriptionId(subscriptionId: $subscriptionId) {
      items { id subscriptionId }
    }
  }
`;

const getUserSubscriptionBySubscriptionIdQuery = /* GraphQL */ `
  query GetUserSubscriptionBySubscriptionId($subscriptionId: String!) {
    getUserSubscriptionBySubscriptionId(subscriptionId: $subscriptionId) {
      items { id subscriptionId userId state }
    }
  }
`;

export const handler: APIGatewayProxyHandler = async (event) => {
  const signature =
    event.headers['stripe-signature'] || event.headers['Stripe-Signature'];

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body!,
      signature!,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: 'Invalid signature' };
  }

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        const subscriptionId = session.subscription as string;
        const userId = session.metadata?.userId;

        if (!subscriptionId || !userId) break;

        const subscription = await stripe.subscriptions.retrieve(
          subscriptionId,
          { expand: ['items.data.price.product', 'default_payment_method'] }
        );
        const priceItem = subscription.items.data[0];
        const product = priceItem.price.product as Stripe.Product;
        const dpm = subscription.default_payment_method as Stripe.PaymentMethod | null;
        const checkoutCard = dpm?.type === 'card' ? dpm.card : null;

        const customerEmail =
          session.customer_details?.email || session.customer_email || '';

        await gql(createUserSubscriptionMutation, {
          input: {
            subscriptionId: subscription.id,
            userId,
            email: customerEmail,
            company: session.metadata?.companyName || '',
            state: subscription.status,
            planId: priceItem.price.id,
            planName: product.name,
            planCode: product.metadata?.code || '',
            currentPeriodStart: priceItem.current_period_start,
            currentPeriodEnd: priceItem.current_period_end,
            trialStart: subscription.trial_start,
            trialEnd: subscription.trial_end,
            canceledAt: null,
            quantity: priceItem.quantity || 1,
            cardExpMonth: checkoutCard?.exp_month ?? null,
            cardExpYear: checkoutCard?.exp_year ?? null,
          },
        });

        await gql(updateUserMutation, {
          input: {
            id: userId,
            subscriptionId: subscription.id,
            stripeCustomerId: session.customer as string,
            status: 'Active',
          },
        });

        if (process.env.SES_EMAIL) {
          await sesClient.send(
            new SendEmailCommand({
              Source: process.env.SES_EMAIL,
              Destination: { ToAddresses: [process.env.SES_EMAIL] },
              Message: {
                Subject: {
                  Data: `New subscription: ${customerEmail} - ${product.name}`,
                },
                Body: {
                  Text: {
                    Data: `User ${customerEmail} subscribed to ${product.name} (${subscription.status})`,
                  },
                },
              },
            })
          );
        }
        break;
      }

      case 'customer.subscription.updated': {
        const rawSub = stripeEvent.data.object as Stripe.Subscription;

        // Retrieve with expansion so product name/code and card expiry are available
        const subscription = await stripe.subscriptions.retrieve(rawSub.id, {
          expand: ['items.data.price.product', 'default_payment_method'],
        });
        const priceItem = subscription.items.data[0];
        const product = priceItem.price.product as Stripe.Product;
        const updatedDpm = subscription.default_payment_method as Stripe.PaymentMethod | null;
        const updatedCard = updatedDpm?.type === 'card' ? updatedDpm.card : null;

        const result: any = await gql(getUserSubscriptionBySubscriptionIdQuery, {
          subscriptionId: subscription.id,
        });
        const dbSub = result.getUserSubscriptionBySubscriptionId.items[0];

        if (dbSub) {
          await gql(updateUserSubscriptionMutation, {
            input: {
              id: dbSub.id,
              state: subscription.status,
              planId: priceItem.price.id,
              planName: product.name || '',
              planCode: product.metadata?.code || '',
              currentPeriodStart: priceItem.current_period_start,
              currentPeriodEnd: priceItem.current_period_end,
              trialStart: subscription.trial_start,
              trialEnd: subscription.trial_end,
              canceledAt: subscription.canceled_at,
              quantity: priceItem.quantity || 1,
              cardExpMonth: updatedCard?.exp_month ?? null,
              cardExpYear: updatedCard?.exp_year ?? null,
            },
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = stripeEvent.data.object as Stripe.Subscription;

        // 1. Update UserSubscription state to canceled
        const result: any = await gql(getUserSubscriptionBySubscriptionIdQuery, {
          subscriptionId: subscription.id,
        });
        const dbSub = result.getUserSubscriptionBySubscriptionId.items[0];

        if (dbSub) {
          await gql(updateUserSubscriptionMutation, {
            input: {
              id: dbSub.id,
              state: 'canceled',
              canceledAt:
                subscription.canceled_at || Math.floor(Date.now() / 1000),
            },
          });

          const TABLE_NAME = await getTableName();
          const USER_POOL_ID = await getUserPoolId();

          // 2. Get admin user details for the email
          const adminResult = await ddb.send(
            new GetCommand({
              TableName: TABLE_NAME,
              Key: { id: dbSub.userId },
            })
          );
          const adminUser = adminResult.Item;
          const adminFirstName = adminUser?.firstName || '';
          const adminLastName = adminUser?.lastName || '';
          const adminEmail = adminUser?.email || '';

          // 3. Find all users on this subscription and force global sign-out
          const scanResult = await ddb.send(
            new ScanCommand({
              TableName: TABLE_NAME,
              FilterExpression: 'subscriptionId = :sid',
              ExpressionAttributeValues: { ':sid': subscription.id },
              ProjectionExpression: 'id, email',
            })
          );
          const usersToSignOut = scanResult.Items || [];
          console.log(`Subscription canceled: signing out ${usersToSignOut.length} user(s) for sub ${subscription.id}`);

          const now = new Date().toISOString();
          for (const user of usersToSignOut) {
            if (user.email) {
              // Force global sign-out (invalidates refresh tokens)
              try {
                await cognitoClient.send(
                  new AdminUserGlobalSignOutCommand({
                    Username: user.email,
                    UserPoolId: USER_POOL_ID,
                  })
                );
                console.log(`Global sign-out: ${user.email}`);
              } catch (signOutError) {
                console.warn(`Global sign-out failed for ${user.email} (non-fatal):`, signOutError);
              }
            }

            // Mark user as Inactive in DynamoDB
            try {
              await ddb.send(
                new UpdateCommand({
                  TableName: TABLE_NAME,
                  Key: { id: user.id },
                  UpdateExpression: 'SET #status = :inactive, updatedAt = :now',
                  ExpressionAttributeNames: { '#status': 'status' },
                  ExpressionAttributeValues: { ':inactive': 'Inactive', ':now': now },
                })
              );
            } catch (updateError) {
              console.warn(`Failed to set Inactive for user ${user.id} (non-fatal):`, updateError);
            }
          }

          // 4. Send cancellation email to admin and operations
          const appOrigin = process.env.AMPLIFY_APP_ORIGIN || '';
          const sesEmail = process.env.SES_EMAIL || '';

          if (sesEmail && adminEmail) {
            const toAddresses: string[] = [adminEmail];
            if (sesEmail !== adminEmail) toAddresses.push(sesEmail);

            const htmlBody = `
<p>Hello,</p>
<p>
  ${adminFirstName} ${adminLastName} has cancelled their subscription to the HireAssist AIR team account.<br>
  We are sorry to see you go, and we really do hope the services have been useful for you.<br>
  If you want to sign up again, go to this link: <a href="${appOrigin}">${appOrigin}</a>
</p>
<p>Best regards,<br>The HireAssist team</p>
`.trim();

            const textBody = `Hello,

${adminFirstName} ${adminLastName} has cancelled their subscription to the HireAssist AIR team account.
We are sorry to see you go, and we really do hope the services have been useful for you.
If you want to sign up again, go to this link: ${appOrigin}

Best regards,
The HireAssist team`;

            try {
              await sesClient.send(
                new SendEmailCommand({
                  Source: sesEmail,
                  Destination: { ToAddresses: toAddresses },
                  Message: {
                    Subject: { Data: 'You have cancelled your subscription to HireAssist AIR' },
                    Body: {
                      Html: { Data: htmlBody },
                      Text: { Data: textBody },
                    },
                  },
                })
              );
              console.log(`Cancellation email sent to: ${toAddresses.join(', ')}`);
            } catch (emailError: any) {
              console.error('Failed to send cancellation email:', emailError.message);
            }
          }
        }
        break;
      }

      case 'payment_method.updated': {
        // Fires when a card is automatically renewed by the card network (same PM id, new expiry).
        const pm = stripeEvent.data.object as Stripe.PaymentMethod;
        if (pm.type !== 'card' || !pm.customer) break;

        const customerId = typeof pm.customer === 'string' ? pm.customer : pm.customer.id;
        const card = pm.card;
        if (!card) break;

        // Find the active subscription for this customer that uses this payment method
        const subs = await stripe.subscriptions.list({ customer: customerId, limit: 10 });
        const matchingSub = subs.data.find((s) => {
          const subDpm = s.default_payment_method;
          const subDpmId = typeof subDpm === 'string' ? subDpm : subDpm?.id;
          return subDpmId === pm.id;
        });

        if (!matchingSub) {
          console.log(`payment_method.updated: no subscription found using pm ${pm.id} for customer ${customerId}`);
          break;
        }

        const pmResult: any = await gql(getUserSubscriptionBySubscriptionIdForCardQuery, {
          subscriptionId: matchingSub.id,
        });
        const pmDbSub = pmResult.getUserSubscriptionBySubscriptionId.items[0];

        if (pmDbSub) {
          console.log(`payment_method.updated: updating card expiry for sub ${matchingSub.id} → ${card.exp_month}/${card.exp_year}`);
          await gql(updateUserSubscriptionMutation, {
            input: {
              id: pmDbSub.id,
              cardExpMonth: card.exp_month,
              cardExpYear: card.exp_year,
            },
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object as Stripe.Invoice;
        console.log('Payment failed for subscription:', (invoice as any).subscription);
        break;
      }
    }
  } catch (error) {
    console.error('Error processing webhook event:', error);
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  };
};
