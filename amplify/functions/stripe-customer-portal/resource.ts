import { defineFunction, secret } from '@aws-amplify/backend';

export const stripeCustomerPortal = defineFunction({
  name: 'air-stripe-customer-portal',
  entry: './handler.ts',
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
  },
  timeoutSeconds: 15,
});
