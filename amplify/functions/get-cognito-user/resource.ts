import { defineFunction } from '@aws-amplify/backend';

export const getCognitoUser = defineFunction({
  name: 'air-get-cognito-user',
  entry: './handler.ts',
  timeoutSeconds: 15,
});
