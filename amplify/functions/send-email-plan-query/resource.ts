import { defineFunction, secret } from '@aws-amplify/backend';

export const sendEmailPlanQuery = defineFunction({
  name: 'air-send-email-plan-query',
  entry: './handler.ts',
  environment: {
    SES_EMAIL: secret('SES_EMAIL'),
  },
  timeoutSeconds: 15,
});
