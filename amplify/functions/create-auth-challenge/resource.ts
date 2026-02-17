import { defineFunction } from '@aws-amplify/backend';

export const createAuthChallenge = defineFunction({
  name: 'air-create-auth-challenge',
  entry: './handler.ts',
  timeoutSeconds: 10,
});
