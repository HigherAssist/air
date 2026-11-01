import { defineFunction, secret } from '@aws-amplify/backend';

export const stripeWebhook = defineFunction({
  name: 'air-stripe-webhook',
  entry: './handler.ts',
  resourceGroupName: 'data',
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
    STRIPE_WEBHOOK_SECRET: secret('STRIPE_WEBHOOK_SECRET'),
    SES_EMAIL: secret('SES_EMAIL'),
  },
  timeoutSeconds: 30,
});
