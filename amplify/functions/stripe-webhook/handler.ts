import type { APIGatewayProxyHandler } from 'aws-lambda';
import Stripe from 'stripe';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const sesClient = new SESClient({});

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
      id subscriptionId stripeCustomerId
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
          { expand: ['items.data.price.product'] }
        );
        const priceItem = subscription.items.data[0];
        const product = priceItem.price.product as Stripe.Product;

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
          },
        });

        await gql(updateUserMutation, {
          input: {
            id: userId,
            subscriptionId: subscription.id,
            stripeCustomerId: session.customer as string,
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
        const subscription = stripeEvent.data.object as Stripe.Subscription;
        const priceItem = subscription.items.data[0];

        const result: any = await gql(getUserSubscriptionBySubscriptionIdQuery, {
          subscriptionId: subscription.id,
        });
        const dbSub = result.getUserSubscriptionBySubscriptionId.items[0];

        if (dbSub) {
          const product = priceItem.price.product as Stripe.Product | string;
          const productName = typeof product === 'string' ? '' : product.name;
          const productCode =
            typeof product === 'string' ? '' : product.metadata?.code || '';

          await gql(updateUserSubscriptionMutation, {
            input: {
              id: dbSub.id,
              state: subscription.status,
              planId: priceItem.price.id,
              planName: productName,
              planCode: productCode,
              currentPeriodStart: priceItem.current_period_start,
              currentPeriodEnd: priceItem.current_period_end,
              trialStart: subscription.trial_start,
              trialEnd: subscription.trial_end,
              canceledAt: subscription.canceled_at,
              quantity: priceItem.quantity || 1,
            },
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = stripeEvent.data.object as Stripe.Subscription;

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
