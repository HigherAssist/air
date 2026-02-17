import { defineBackend } from '@aws-amplify/backend';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
// auth temporarily removed to force user pool recreation
// import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
// import { preSignup } from './functions/pre-signup/resource';
// import { createAuthChallenge } from './functions/create-auth-challenge/resource';
// import { defineAuthChallenge } from './functions/define-auth-challenge/resource';
// import { verifyAuthChallenge } from './functions/verify-auth-challenge/resource';
import { createCognitoUser } from './functions/create-cognito-user/resource';
import { getCognitoUser } from './functions/get-cognito-user/resource';
import { deleteAdminUser } from './functions/delete-admin-user/resource';
import { stripeCreateCheckout } from './functions/stripe-create-checkout/resource';
import { stripeWebhook } from './functions/stripe-webhook/resource';
import { stripeGetPlans } from './functions/stripe-get-plans/resource';
import { stripeGetSubscriptions } from './functions/stripe-get-subscriptions/resource';
import { stripeCustomerPortal } from './functions/stripe-customer-portal/resource';
import { contactFormTrigger } from './functions/contact-form-trigger/resource';
import { sendEmailPlanQuery } from './functions/send-email-plan-query/resource';

const backend = defineBackend({
  // auth temporarily removed to force user pool recreation
  data,
  storage,
  createCognitoUser,
  getCognitoUser,
  deleteAdminUser,
  stripeCreateCheckout,
  stripeWebhook,
  stripeGetPlans,
  stripeGetSubscriptions,
  stripeCustomerPortal,
  contactFormTrigger,
  sendEmailPlanQuery,
});

// ============================================================
// REST API Gateway (CDK escape hatch)
// ============================================================
const apiStack = backend.createStack('AirApiStack');

const api = new apigateway.RestApi(apiStack, 'AirRestApi', {
  restApiName: 'air-api',
  description: 'AIR Application REST API',
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS,
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'Stripe-Signature',
      'X-Amz-Date',
      'X-Api-Key',
      'X-Amz-Security-Token',
    ],
  },
});

// Cognito Authorizer temporarily removed for user pool recreation
// const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
//   apiStack,
//   'AirCognitoAuthorizer',
//   {
//     cognitoUserPools: [backend.auth.resources.userPool],
//   }
// );

// const authOptions = {
//   authorizer: cognitoAuthorizer,
//   authorizationType: apigateway.AuthorizationType.COGNITO,
// };

// --- Stripe Webhook (PUBLIC - no auth, Stripe needs direct access) ---
const webhookResource = api.root.addResource('webhook');
const stripeWebhookResource = webhookResource.addResource('stripe');
stripeWebhookResource.addMethod(
  'POST',
  new apigateway.LambdaIntegration(
    backend.stripeWebhook.resources.lambda
  )
);

// --- Subscription endpoints (temporarily public during user pool recreation) ---
const subscriptionResource = api.root.addResource('subscription');

subscriptionResource.addResource('plans').addMethod(
  'GET',
  new apigateway.LambdaIntegration(
    backend.stripeGetPlans.resources.lambda
  )
);

subscriptionResource.addResource('checkout').addMethod(
  'POST',
  new apigateway.LambdaIntegration(
    backend.stripeCreateCheckout.resources.lambda
  )
);

subscriptionResource.addResource('portal').addMethod(
  'POST',
  new apigateway.LambdaIntegration(
    backend.stripeCustomerPortal.resources.lambda
  )
);

// --- User endpoints ---
const userResource = api.root.addResource('user');
userResource
  .addResource('subscriptions')
  .addResource('{customerId}')
  .addMethod(
    'GET',
    new apigateway.LambdaIntegration(
      backend.stripeGetSubscriptions.resources.lambda
    )
  );

// --- Admin endpoints ---
const adminResource = api.root.addResource('admin');
const adminUserResource = adminResource.addResource('user');

adminUserResource.addResource('create').addMethod(
  'POST',
  new apigateway.LambdaIntegration(
    backend.createCognitoUser.resources.lambda
  )
);

adminUserResource.addResource('remove').addMethod(
  'POST',
  new apigateway.LambdaIntegration(
    backend.deleteAdminUser.resources.lambda
  )
);

adminUserResource.addMethod(
  'POST',
  new apigateway.LambdaIntegration(
    backend.getCognitoUser.resources.lambda
  )
);

// --- Plan inquiry endpoint ---
const planResource = api.root.addResource('plan');
planResource.addResource('query').addMethod(
  'POST',
  new apigateway.LambdaIntegration(
    backend.sendEmailPlanQuery.resources.lambda
  )
);

// ============================================================
// DynamoDB Stream trigger for Contact form → SES email
// ============================================================
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';

const contactTable = backend.data.resources.tables['Contact'];
const contactTriggerLambda = backend.contactFormTrigger.resources.lambda as lambda.Function;

contactTriggerLambda.addEventSource(
  new lambdaEventSources.DynamoEventSource(contactTable, {
    startingPosition: lambda.StartingPosition.LATEST,
    batchSize: 1,
  })
);

// Grant SES permissions to the contact form trigger Lambda
import * as iam from 'aws-cdk-lib/aws-iam';
contactTriggerLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: ['*'],
  })
);

// Output the API URL so the frontend can use it
backend.addOutput({
  custom: {
    apiUrl: api.url,
    apiId: api.restApiId,
  },
});
