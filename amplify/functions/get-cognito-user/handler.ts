import type { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';

const client = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

const USER_POOL_ID = process.env.AMPLIFY_AUTH_USERPOOL_ID;

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log(`EVENT: ${JSON.stringify(event)}`);
  const body = JSON.parse(event.body || '{}');
  const username = body.username;

  try {
    const command = new AdminGetUserCommand({
      Username: username,
      UserPoolId: USER_POOL_ID,
    });

    const response = await client.send(command);
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    if (error.name === 'UserNotFoundException') {
      return {
        statusCode: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*',
        },
        body: JSON.stringify(null),
      };
    }
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify(null),
    };
  }
};
