import type { APIGatewayProxyHandler } from 'aws-lambda';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export const handler: APIGatewayProxyHandler = async () => {
  try {
    // Get the configured price IDs for this environment
    const priceIds = [
      process.env.STRIPE_PRICE_STARTER,
      process.env.STRIPE_PRICE_PROFESSIONAL,
      process.env.STRIPE_PRICE_ENTERPRISE,
    ].filter(Boolean) as string[];

    const plans = await Promise.all(
      priceIds.map(async (priceId) => {
        const price = await stripe.prices.retrieve(priceId, {
          expand: ['product'],
        });
        const product = price.product as Stripe.Product;
        return {
          id: product.id,
          priceId: price.id,
          name: product.name,
          code: product.metadata?.code ||
            product.name.toLowerCase().replace(/^(hireassist|air)\s+/i, '').trim(),
          description: product.description || '',
          unitAmount: price.unit_amount || 0,
          currency: price.currency,
          interval: price.recurring?.interval || 'month',
          trialDays: price.recurring?.trial_period_days || 0,
          state: product.active ? 'active' : 'inactive',
        };
      })
    );

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
