import { defineFunction, secret } from '@aws-amplify/backend';

export const stripeGetPlans = defineFunction({
  name: 'air-stripe-get-plans',
  entry: './handler.ts',
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
    STRIPE_PRICE_STARTER: secret('STRIPE_PRICE_STARTER'),
    STRIPE_PRICE_PROFESSIONAL: secret('STRIPE_PRICE_PROFESSIONAL'),
    STRIPE_PRICE_ENTERPRISE: secret('STRIPE_PRICE_ENTERPRISE'),
  },
  timeoutSeconds: 15,
});
