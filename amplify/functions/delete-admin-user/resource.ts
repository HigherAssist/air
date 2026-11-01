import { defineFunction, secret } from '@aws-amplify/backend';

export const deleteAdminUser = defineFunction({
  name: 'air-delete-admin-user',
  entry: './handler.ts',
  environment: {
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
  },
  timeoutSeconds: 30,
});
