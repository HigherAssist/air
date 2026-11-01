import { defineFunction, secret } from '@aws-amplify/backend';

export const createCognitoUser = defineFunction({
  name: 'air-create-cognito-user',
  entry: './handler.ts',
  environment: {
    SES_EMAIL: secret('SES_EMAIL'),
    STRIPE_SECRET_KEY: secret('STRIPE_SECRET_KEY'),
  },
  timeoutSeconds: 30,
});
