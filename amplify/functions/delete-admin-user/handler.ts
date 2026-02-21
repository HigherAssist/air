import type { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';
import Stripe from 'stripe';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const GRAPHQL_ENDPOINT = process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT;
const API_KEY = process.env.AMPLIFY_DATA_API_KEY;
const USER_POOL_ID = process.env.AMPLIFY_AUTH_USERPOOL_ID;

Amplify.configure({
  API: {
    GraphQL: {
      defaultAuthMode: 'apiKey',
      endpoint: GRAPHQL_ENDPOINT!,
      region: process.env.AWS_REGION!,
      apiKey: API_KEY!,
    },
  },
});

const getUserByEmailQuery = /* GraphQL */ `
  query GetUserByEmail($email: String!) {
    getUserByEmail(email: $email) {
      items { id email subscriptionId }
    }
  }
`;

const deleteUserMutation = /* GraphQL */ `
  mutation DeleteUser($input: DeleteUserInput!) {
    deleteUser(input: $input) { id }
  }
`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log(`EVENT: ${JSON.stringify(event)}`);
  const body = JSON.parse(event.body || '{}');

  try {
    // Get DB user first to retrieve subscriptionId before deletion
    const client = generateClient();
    const userResult: any = await client.graphql({
      query: getUserByEmailQuery,
      variables: { email: body.username },
      authMode: 'apiKey',
    });
    const user = userResult.data.getUserByEmail.items[0];

    // Delete from Cognito
    await cognitoClient.send(
      new AdminDeleteUserCommand({
        Username: body.username,
        UserPoolId: USER_POOL_ID,
      })
    );

    // Delete from DB
    if (user) {
      await client.graphql({
        query: deleteUserMutation,
        variables: { input: { id: user.id } },
        authMode: 'apiKey',
      });

      // Update Stripe subscription quantity -1
      if (user.subscriptionId) {
        try {
          const subscription = await stripe.subscriptions.retrieve(user.subscriptionId, {
            expand: ['items.data.price'],
          });
          const item = subscription.items.data[0];
          if (item && (item.quantity || 1) > 1) {
            await stripe.subscriptions.update(user.subscriptionId, {
              items: [{ id: item.id, quantity: (item.quantity || 1) - 1 }],
            });
          }
        } catch (stripeError) {
          console.error('Stripe seat update failed (non-fatal):', stripeError);
        }
      }
    }

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify(null),
    };
  } catch (error: any) {
    console.error(error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify('Error deleting user. Please try again.'),
    };
  }
};
