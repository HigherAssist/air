import type { APIGatewayProxyHandler } from 'aws-lambda';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const stripeCustomerId = event.pathParameters?.customerId;

    if (!stripeCustomerId) {
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify({ error: 'Missing customerId parameter' }),
      };
    }

    // Fetch subscriptions from Stripe /v1/subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      expand: ['data.items.data.price.product'],
    });

    // Fetch customer info
    const customer = await stripe.customers.retrieve(stripeCustomerId);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify({
        subscriptions: subscriptions.data.map((sub) => {
          const priceItem = sub.items.data[0];
          const product = priceItem.price.product as Stripe.Product;
          return {
            id: sub.id,
            status: sub.status,
            currentPeriodStart: sub.items.data[0]?.current_period_start,
            currentPeriodEnd: sub.items.data[0]?.current_period_end,
            trialStart: sub.trial_start,
            trialEnd: sub.trial_end,
            canceledAt: sub.canceled_at,
            plan: {
              id: priceItem.price.id,
              name: product.name,
              code: product.metadata?.code || '',
            },
            quantity: priceItem.quantity || 1,
          };
        }),
        customer: customer.deleted ? null : customer,
      }),
    };
  } catch (error: any) {
    console.error('Error fetching subscriptions:', error);
    if (error.type === 'StripeInvalidRequestError') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify({ subscriptions: [], customer: null }),
      };
    }
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
