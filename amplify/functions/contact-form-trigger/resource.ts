import { defineFunction, secret } from '@aws-amplify/backend';

export const contactFormTrigger = defineFunction({
  name: 'air-contact-form-trigger',
  entry: './handler.ts',
  resourceGroupName: 'data',
  environment: {
    SES_EMAIL: secret('SES_EMAIL'),
  },
  timeoutSeconds: 15,
});
