import { defineFunction, secret } from '@aws-amplify/backend';

export const verifyAuthChallenge = defineFunction({
  name: 'air-verify-auth-challenge',
  entry: './handler.ts',
  environment: {
    TURNSTILE_SECRET_KEY: secret('TURNSTILE_SECRET_KEY'),
  },
  timeoutSeconds: 15,
});
