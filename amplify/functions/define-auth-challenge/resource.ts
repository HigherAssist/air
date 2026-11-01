import { defineFunction } from '@aws-amplify/backend';

export const defineAuthChallenge = defineFunction({
  name: 'air-define-auth-challenge',
  entry: './handler.ts',
  timeoutSeconds: 10,
});
