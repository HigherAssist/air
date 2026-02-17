import type { APIGatewayProxyHandler } from 'aws-lambda';
import Stripe from 'stripe';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const sesClient = new SESClient();

const GRAPHQL_ENDPOINT = process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT;
const API_KEY = process.env.AMPLIFY_DATA_API_KEY;

Amplify.configure({
  API: {
    GraphQL: {
      defaultAuthMode: 'apiKey',
      endpoint: GRAPHQL_ENDPOINT!,
      region: process.env.AWS_REGION!,
      apiKey: API_KEY!,
    },
  },
});

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

  const client = generateClient();

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object as Stripe.Checkout.Session;
        const subscriptionId = session.subscription as string;
        const userId = session.metadata?.userId;

        if (!subscriptionId || !userId) break;

        // Fetch full subscription details from Stripe
        const subscription = await stripe.subscriptions.retrieve(
          subscriptionId,
          { expand: ['items.data.price.product'] }
        );
        const priceItem = subscription.items.data[0];
        const product = priceItem.price.product as Stripe.Product;

        // Create UserSubscription in DynamoDB
        await client.graphql({
          query: createUserSubscriptionMutation,
          variables: {
            input: {
              subscriptionId: subscription.id,
              userId,
              email: session.customer_email || '',
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
          },
          authMode: 'apiKey',
        });

        // Update User with subscriptionId and stripeCustomerId
        await client.graphql({
          query: updateUserMutation,
          variables: {
            input: {
              id: userId,
              subscriptionId: subscription.id,
              stripeCustomerId: session.customer as string,
            },
          },
          authMode: 'apiKey',
        });

        // Send notification email
        if (process.env.SES_EMAIL) {
          await sesClient.send(
            new SendEmailCommand({
              Source: process.env.SES_EMAIL,
              Destination: { ToAddresses: [process.env.SES_EMAIL] },
              Message: {
                Subject: {
                  Data: `New subscription: ${session.customer_email} - ${product.name}`,
                },
                Body: {
                  Text: {
                    Data: `User ${session.customer_email} subscribed to ${product.name} (${subscription.status})`,
                  },
                },
              },
            })
          );
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = stripeEvent.data
          .object as Stripe.Subscription;
        const priceItem = subscription.items.data[0];

        // Find existing UserSubscription
        const result: any = await client.graphql({
          query: getUserSubscriptionBySubscriptionIdQuery,
          variables: { subscriptionId: subscription.id },
          authMode: 'apiKey',
        });
        const dbSub =
          result.data.getUserSubscriptionBySubscriptionId.items[0];

        if (dbSub) {
          const product = priceItem.price.product as Stripe.Product | string;
          const productName =
            typeof product === 'string' ? '' : product.name;
          const productCode =
            typeof product === 'string'
              ? ''
              : product.metadata?.code || '';

          await client.graphql({
            query: updateUserSubscriptionMutation,
            variables: {
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
            },
            authMode: 'apiKey',
          });
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = stripeEvent.data
          .object as Stripe.Subscription;

        const result: any = await client.graphql({
          query: getUserSubscriptionBySubscriptionIdQuery,
          variables: { subscriptionId: subscription.id },
          authMode: 'apiKey',
        });
        const dbSub =
          result.data.getUserSubscriptionBySubscriptionId.items[0];

        if (dbSub) {
          await client.graphql({
            query: updateUserSubscriptionMutation,
            variables: {
              input: {
                id: dbSub.id,
                state: 'canceled',
                canceledAt: subscription.canceled_at || Math.floor(Date.now() / 1000),
              },
            },
            authMode: 'apiKey',
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = stripeEvent.data.object as Stripe.Invoice;
        console.log(
          'Payment failed for subscription:',
          (invoice as any).subscription
        );
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
