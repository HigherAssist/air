import { defineFunction, secret } from '@aws-amplify/backend';

export const stripeCreateCheckout = defineFunction({
  name: 'air-stripe-create-checkout',
  entry: './handler.ts',
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
    CHECKOUT_SUCCESS_URL: secret('CHECKOUT_SUCCESS_URL'),
    CHECKOUT_CANCEL_URL: secret('CHECKOUT_CANCEL_URL'),
  },
  timeoutSeconds: 30,
});
