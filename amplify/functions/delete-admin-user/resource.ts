import { defineFunction } from '@aws-amplify/backend';

export const deleteAdminUser = defineFunction({
  name: 'air-delete-admin-user',
  entry: './handler.ts',
  timeoutSeconds: 30,
});
