import { defineFunction, secret } from '@aws-amplify/backend';

export const stripeGetPlans = defineFunction({
  name: 'air-stripe-get-plans',
  entry: './handler.ts',
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
  },
  timeoutSeconds: 15,
});
