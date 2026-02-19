import { defineBackend } from '@aws-amplify/backend';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { preSignup } from './functions/pre-signup/resource';
import { postConfirmation } from './functions/post-confirmation/resource';
import { createAuthChallenge } from './functions/create-auth-challenge/resource';
import { defineAuthChallenge } from './functions/define-auth-challenge/resource';
import { verifyAuthChallenge } from './functions/verify-auth-challenge/resource';
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
  auth,
  data,
  storage,
  preSignup,
  postConfirmation,
  createAuthChallenge,
  defineAuthChallenge,
  verifyAuthChallenge,
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
// Grant post-confirmation Lambda access to DynamoDB User table
// (Uses SSM parameter bridge to avoid auth↔data circular dependency)
// ============================================================
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cdk from 'aws-cdk-lib';

// Store the User table name in SSM from the data stack (no cross-stack ref).
// AWS_BRANCH is set by Amplify CI/CD for branch builds (dev/stage/main).
// It is undefined during local sandbox runs, so we fall back to 'sandbox'.
// Using a process.env value (evaluated at synth time) avoids CDK tokens and
// therefore avoids creating cross-stack references that cause circular deps.
const envLabel = process.env.AWS_BRANCH || 'sandbox';
const ssmParamName = `/air/${envLabel}/user-table-name`;

const userTable = backend.data.resources.tables['User'];
const dataStack = cdk.Stack.of(userTable);
new ssm.CfnParameter(dataStack, 'UserTableNameParam', {
  name: ssmParamName,
  type: 'String',
  value: userTable.tableName,
});

// Configure post-confirmation Lambda (in auth stack) with runtime SSM lookup
const postConfirmationLambda = backend.postConfirmation.resources.lambda as lambda.Function;
postConfirmationLambda.addEnvironment('USER_TABLE_SSM_PARAM', ssmParamName);
postConfirmationLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['ssm:GetParameter'],
    resources: [
      // Wildcard on the stack-name segment allows sandbox and all branch deployments
      `arn:aws:ssm:${dataStack.region}:${dataStack.account}:parameter/air/*/user-table-name`,
    ],
  })
);
postConfirmationLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: [
      'dynamodb:PutItem',
      'dynamodb:Query',
    ],
    resources: [
      `arn:aws:dynamodb:${dataStack.region}:${dataStack.account}:table/*`,
    ],
  })
);

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

// Cognito Authorizer for protected endpoints
const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
  apiStack,
  'AirCognitoAuthorizer',
  {
    cognitoUserPools: [backend.auth.resources.userPool],
  }
);

const authOptions = {
  authorizer: cognitoAuthorizer,
  authorizationType: apigateway.AuthorizationType.COGNITO,
};

// --- Stripe Webhook (PUBLIC - no auth, Stripe needs direct access) ---
const webhookResource = api.root.addResource('webhook');
const stripeWebhookResource = webhookResource.addResource('stripe');
stripeWebhookResource.addMethod(
  'POST',
  new apigateway.LambdaIntegration(
    backend.stripeWebhook.resources.lambda
  )
);

// --- Subscription endpoints (Cognito auth) ---
const subscriptionResource = api.root.addResource('subscription');

subscriptionResource.addResource('plans').addMethod(
  'GET',
  new apigateway.LambdaIntegration(
    backend.stripeGetPlans.resources.lambda
  ),
  authOptions
);

subscriptionResource.addResource('checkout').addMethod(
  'POST',
  new apigateway.LambdaIntegration(
    backend.stripeCreateCheckout.resources.lambda
  ),
  authOptions
);

subscriptionResource.addResource('portal').addMethod(
  'POST',
  new apigateway.LambdaIntegration(
    backend.stripeCustomerPortal.resources.lambda
  ),
  authOptions
);

// --- User endpoints (Cognito auth) ---
const userResource = api.root.addResource('user');
userResource
  .addResource('subscriptions')
  .addResource('{customerId}')
  .addMethod(
    'GET',
    new apigateway.LambdaIntegration(
      backend.stripeGetSubscriptions.resources.lambda
    ),
    authOptions
  );

// --- Admin endpoints (Cognito auth) ---
const adminResource = api.root.addResource('admin');
const adminUserResource = adminResource.addResource('user');

adminUserResource.addResource('create').addMethod(
  'POST',
  new apigateway.LambdaIntegration(
    backend.createCognitoUser.resources.lambda
  ),
  authOptions
);

adminUserResource.addResource('remove').addMethod(
  'POST',
  new apigateway.LambdaIntegration(
    backend.deleteAdminUser.resources.lambda
  ),
  authOptions
);

adminUserResource.addMethod(
  'POST',
  new apigateway.LambdaIntegration(
    backend.getCognitoUser.resources.lambda
  ),
  authOptions
);

// --- Plan inquiry endpoint (Cognito auth) ---
const planResource = api.root.addResource('plan');
planResource.addResource('query').addMethod(
  'POST',
  new apigateway.LambdaIntegration(
    backend.sendEmailPlanQuery.resources.lambda
  ),
  authOptions
);

// ============================================================
// DynamoDB Stream trigger for Contact form → SES email
// ============================================================
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
contactTriggerLambda.addToRolePolicy(
  new iam.PolicyStatement({
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resources: ['*'],
  })
);

// ============================================================
// Inject GraphQL endpoint + API key into stripe-webhook Lambda
// (handler uses plain fetch — no Amplify JS browser client in Lambda)
// ============================================================
const webhookLambda = backend.stripeWebhook.resources.lambda as lambda.Function;
const cfnResources = backend.data.resources.cfnResources as any;
webhookLambda.addEnvironment('AMPLIFY_DATA_GRAPHQL_ENDPOINT', cfnResources.cfnGraphqlApi.attrGraphQlUrl);
webhookLambda.addEnvironment('AMPLIFY_DATA_API_KEY', cfnResources.cfnApiKey?.attrApiKey ?? '');

// Output the API URL so the frontend can use it
backend.addOutput({
  custom: {
    apiUrl: api.url,
    apiId: api.restApiId,
  },
});
