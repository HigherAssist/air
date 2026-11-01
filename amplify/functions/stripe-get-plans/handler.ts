import type { APIGatewayProxyHandler } from 'aws-lambda';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const LOOKUP_KEY_ORDER = [
  'starter_monthly',
  'professional_monthly',
  'enterprise_monthly',
];

export const handler: APIGatewayProxyHandler = async () => {
  try {
    const priceList = await stripe.prices.list({
      lookup_keys: LOOKUP_KEY_ORDER,
      expand: ['data.product'],
    });

    // Sort results to match the desired Starter → Professional → Enterprise display order
    const priceMap = new Map(
      priceList.data.map((price) => [price.lookup_key, price])
    );

    const plans = LOOKUP_KEY_ORDER
      .map((key) => {
        const price = priceMap.get(key);
        if (!price) return null;
        const product = price.product as Stripe.Product;
        return {
          id: product.id,
          priceId: price.id,
          name: product.name,
          code: product.metadata?.code || product.name.toLowerCase(),
          description: product.description || '',
          unitAmount: price.unit_amount || 0,
          currency: price.currency,
          interval: price.recurring?.interval || 'month',
          trialDays: price.recurring?.trial_period_days || 0,
          state: product.active ? 'active' : 'inactive',
        };
      })
      .filter(Boolean);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify(plans),
    };
  } catch (error: any) {
    console.error('Error fetching plans:', error);
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
