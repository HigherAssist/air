import { defineFunction } from '@aws-amplify/backend';

export const postConfirmation = defineFunction({
  name: 'air-post-confirmation',
  entry: './handler.ts',
  timeoutSeconds: 15,
});
