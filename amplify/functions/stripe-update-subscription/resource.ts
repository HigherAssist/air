import { defineFunction, secret } from '@aws-amplify/backend';

export const stripeUpdateSubscription = defineFunction({
  name: 'air-stripe-update-subscription',
  entry: './handler.ts',
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
    SES_EMAIL: secret('SES_EMAIL'),
  },
  timeoutSeconds: 30,
});
