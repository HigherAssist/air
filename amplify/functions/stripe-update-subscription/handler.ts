import type { APIGatewayProxyHandler } from 'aws-lambda';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  try {
    const body = JSON.parse(event.body || '{}');
    const { subscriptionId, newPriceId } = body;

    if (!subscriptionId || !newPriceId) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'Missing subscriptionId or newPriceId' }),
      };
    }

    // Retrieve the current subscription to get the subscription item ID and quantity
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price'],
    });

    const subscriptionItem = subscription.items.data[0];
    if (!subscriptionItem) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: 'No subscription item found' }),
      };
    }

    // Update the subscription with the new price, prorating the difference
    const updated = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscriptionItem.id,
          price: newPriceId,
        },
      ],
      proration_behavior: 'create_prorations',
    });

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({
        subscriptionId: updated.id,
        status: updated.status,
      }),
    };
  } catch (error: any) {
    console.error('Stripe update subscription error:', error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify({ error: error.message }),
    };
  }
};
