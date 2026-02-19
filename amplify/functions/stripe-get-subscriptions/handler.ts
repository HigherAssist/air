import type { APIGatewayProxyHandler } from 'aws-lambda';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const stripeCustomerId = event.pathParameters?.customerId;

    if (!stripeCustomerId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing customerId parameter' }),
      };
    }

    // List subscriptions expanding only to price (4 levels max: data.items.data.price).
    // Expanding further to data.items.data.price.product (5 levels) exceeds Stripe's limit.
    const subscriptionList = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      expand: ['data.items.data.price'],
    });

    // Fetch each product separately now that we have the price object
    const subscriptionsData = await Promise.all(
      subscriptionList.data.map(async (sub) => {
        const priceItem = sub.items.data[0];
        const productId = priceItem.price.product as string;
        const product = await stripe.products.retrieve(productId);
        return {
          id: sub.id,
          status: sub.status,
          currentPeriodStart: priceItem.current_period_start,
          currentPeriodEnd: priceItem.current_period_end,
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
      })
    );

    const customer = await stripe.customers.retrieve(stripeCustomerId);

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        subscriptions: subscriptionsData,
        customer: customer.deleted ? null : customer,
      }),
    };
  } catch (error: any) {
    console.error('Error fetching subscriptions:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
