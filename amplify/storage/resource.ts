import { defineStorage } from '@aws-amplify/backend';

// Access rules temporarily removed during user pool recreation
// (guest/authenticated require auth to be defined)
export const storage = defineStorage({
  name: 'airStorage',
});
