import type { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
  AdminUserGlobalSignOutCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import Stripe from 'stripe';

const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssmClient = new SSMClient({});

let userPoolId: string | undefined;

async function getUserPoolId(): Promise<string> {
  if (userPoolId) return userPoolId;
  const param = await ssmClient.send(
    new GetParameterCommand({ Name: process.env.USER_POOL_ID_SSM_PARAM! })
  );
  const value = param.Parameter!.Value!;
  userPoolId = value;
  return value;
}

let tableName: string | undefined;

async function getTableName(): Promise<string> {
  if (tableName) return tableName;
  const param = await ssmClient.send(
    new GetParameterCommand({ Name: process.env.USER_TABLE_SSM_PARAM! })
  );
  const value = param.Parameter!.Value!;
  tableName = value;
  return value;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
};

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log(`EVENT: ${JSON.stringify(event)}`);
  const body = JSON.parse(event.body || '{}');

  try {
    const TABLE_NAME = await getTableName();
    const USER_POOL_ID = await getUserPoolId();

    // Get DB user first to retrieve subscriptionId before deletion
    const userResult = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'byEmail',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': body.username },
        Limit: 1,
      })
    );
    const user = userResult.Items?.[0];

    // Revoke all active sessions before deleting
    try {
      await cognitoClient.send(
        new AdminUserGlobalSignOutCommand({
          Username: body.username,
          UserPoolId: USER_POOL_ID,
        })
      );
    } catch (signOutError) {
      // Non-fatal: user may not have active sessions
      console.warn('AdminUserGlobalSignOut failed (non-fatal):', signOutError);
    }

    // Delete from Cognito
    await cognitoClient.send(
      new AdminDeleteUserCommand({
        Username: body.username,
        UserPoolId: USER_POOL_ID,
      })
    );

    // Delete from DynamoDB
    if (user) {
      await ddb.send(
        new DeleteCommand({
          TableName: TABLE_NAME,
          Key: { id: user.id },
        })
      );

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
