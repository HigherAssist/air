import { defineFunction, secret } from '@aws-amplify/backend';

export const preSignup = defineFunction({
  name: 'air-pre-signup',
  entry: './handler.ts',
  environment: {
    RECAPTCHA_SECRET_KEY: secret('RECAPTCHA_SECRET_KEY'),
    REGISTRATION_CODES: secret('REGISTRATION_CODES'),
  },
  timeoutSeconds: 15,
});
