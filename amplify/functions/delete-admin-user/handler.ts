import type { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

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
      items { id email }
    }
  }
`;

const deleteUserMutation = /* GraphQL */ `
  mutation DeleteUser($input: DeleteUserInput!) {
    deleteUser(input: $input) { id }
  }
`;

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log(`EVENT: ${JSON.stringify(event)}`);
  const body = JSON.parse(event.body || '{}');

  try {
    // Delete from Cognito
    await cognitoClient.send(
      new AdminDeleteUserCommand({
        Username: body.username,
        UserPoolId: USER_POOL_ID,
      })
    );

    // Delete from DB
    const client = generateClient();
    const userResult: any = await client.graphql({
      query: getUserByEmailQuery,
      variables: { email: body.username },
      authMode: 'apiKey',
    });
    const user = userResult.data.getUserByEmail.items[0];
    if (user) {
      await client.graphql({
        query: deleteUserMutation,
        variables: { input: { id: user.id } },
        authMode: 'apiKey',
      });
    }

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify(null),
    };
  } catch (error: any) {
    console.error(error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify('Error deleting user. Please try again.'),
    };
  }
};
