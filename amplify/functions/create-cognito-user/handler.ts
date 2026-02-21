import type { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import Stripe from 'stripe';
import { randomUUID } from 'crypto';

const sesClient = new SESClient();
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssmClient = new SSMClient({});

const USER_POOL_ID = process.env.AMPLIFY_AUTH_USERPOOL_ID;

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

    // Fetch admin user from DynamoDB via GSI
    const adminResult = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: 'usersByEmailAndCompanyName',
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': body.adminEmail },
        Limit: 1,
      })
    );
    const adminUser = adminResult.Items?.[0];
    if (!adminUser) {
      return {
        statusCode: 400,
        headers: CORS_HEADERS,
        body: JSON.stringify('Admin user not found.'),
      };
    }

    const inviteToken = randomUUID();
    const inviteExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const companyName = adminUser.companyName || body.companyName;

    // Create Cognito user — inviteToken used as temp password (never shown to user)
    await cognitoClient.send(
      new AdminCreateUserCommand({
        Username: body.username,
        MessageAction: 'SUPPRESS',
        UserPoolId: USER_POOL_ID,
        UserAttributes: [
          { Name: 'email', Value: body.username },
          { Name: 'email_verified', Value: 'true' },
        ],
        TemporaryPassword: inviteToken,
        DesiredDeliveryMediums: ['EMAIL'],
      })
    );

    // Create DB user record directly in DynamoDB
    await ddb.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          id: randomUUID(),
          __typename: 'User',
          email: body.username,
          companyName,
          firstName: '',
          lastName: '',
          phoneNumber: '',
          profileRole: 'User',
          status: 'Invited',
          subscriptionId: adminUser.subscriptionId || '',
          stripeCustomerId: '',
          inviteToken,
          inviteExpiresAt,
          invitedBy: body.adminEmail,
          atsname: adminUser.atsname || '',
          apikeytype: adminUser.apikeytype || '',
          apikey1: adminUser.apikey1 || '',
          apikey2: adminUser.apikey2 || '',
          createdAt: now,
          updatedAt: now,
        },
      })
    );

    // Update Stripe subscription quantity +1
    if (adminUser.subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(adminUser.subscriptionId, {
          expand: ['items.data.price'],
        });
        const item = subscription.items.data[0];
        if (item) {
          await stripe.subscriptions.update(adminUser.subscriptionId, {
            items: [{ id: item.id, quantity: (item.quantity || 1) + 1 }],
          });
        }
      } catch (stripeError) {
        console.error('Stripe seat update failed (non-fatal):', stripeError);
      }
    }

    // Send invite email
    const domain = process.env.AMPLIFY_APP_ORIGIN || 'http://localhost:5173';
    const encodedEmail = encodeURIComponent(body.username);
    const inviteLink = `${domain}/invite-signup?email=${encodedEmail}&token=${inviteToken}`;

    await sesClient.send(
      new SendEmailCommand({
        Source: process.env.SES_EMAIL,
        Destination: { ToAddresses: [body.username] },
        Message: {
          Subject: {
            Data: 'You have been invited to join the HireAssist AIR account.',
          },
          Body: {
            Html: {
              Data: `<!DOCTYPE html>
<html>
<head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head>
<body style="font-family: Arial, sans-serif; font-size: 15px; color: #222;">
  <p>Hello,</p>
  <p>You have been invited by <strong>${body.adminFirstName} ${body.adminLastName}</strong> to join their HireAssist AIR team account.</p>
  <p>Click on the link below to register and access the system.</p>
  <p style="margin: 24px 0;">
    <a href="${inviteLink}" style="background:#1677ff;color:#fff;padding:10px 22px;border-radius:4px;text-decoration:none;font-weight:bold;">
      Create Account
    </a>
  </p>
  <p>Or copy and paste this link into your browser:<br/>
    <a href="${inviteLink}">${inviteLink}</a>
  </p>
  <p>This invitation link expires in 30 days.</p>
  <br/>
  <p>Best regards,<br/>The HireAssist team</p>
</body>
</html>`,
            },
          },
        },
      })
    );

    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: JSON.stringify({ success: true }),
    };
  } catch (error: any) {
    console.error(error);
    return {
      statusCode: 500,
      headers: CORS_HEADERS,
      body: JSON.stringify('There was an error creating the user. Please try again.'),
    };
  }
};
