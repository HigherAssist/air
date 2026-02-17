import { defineFunction, secret } from '@aws-amplify/backend';

export const stripeGetSubscriptions = defineFunction({
  name: 'air-stripe-get-subscriptions',
  entry: './handler.ts',
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
  },
  timeoutSeconds: 15,
});
