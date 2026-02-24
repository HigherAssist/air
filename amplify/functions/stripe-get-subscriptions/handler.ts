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

    // List subscriptions expanding to price and default_payment_method.
    // 4-level expand limit: data.items.data.price and data.default_payment_method are both within limit.
    const subscriptionList = await stripe.subscriptions.list({
      customer: stripeCustomerId,
      expand: ['data.items.data.price', 'data.default_payment_method'],
    });

    // Fetch each product separately now that we have the price object
    const subscriptionsData = await Promise.all(
      subscriptionList.data.map(async (sub) => {
        const priceItem = sub.items.data[0];
        const productId = priceItem.price.product as string;
        const product = await stripe.products.retrieve(productId);

        // Extract card expiry from default_payment_method
        const dpm = sub.default_payment_method as Stripe.PaymentMethod | null;
        const card = dpm?.type === 'card' ? dpm.card : null;

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
          cardExpMonth: card?.exp_month ?? null,
          cardExpYear: card?.exp_year ?? null,
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
