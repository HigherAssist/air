import type { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
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

    const inviteToken = `Tmp1!${randomUUID()}`;
    const inviteExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();
    const companyName = adminUser.companyName || body.companyName;

    // Create Cognito user — inviteToken used as temp password (never shown to user).
    // If the user already exists (re-invite after cancellation), reset their temp password instead.
    let isReinvite = false;
    try {
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
    } catch (cognitoError: any) {
      if (cognitoError.name !== 'UsernameExistsException') throw cognitoError;
      // User already has a Cognito account — reset to temp password so the invite flow works
      isReinvite = true;
      console.log(`Re-inviting existing Cognito user: ${body.username}`);
      await cognitoClient.send(
        new AdminSetUserPasswordCommand({
          Username: body.username,
          UserPoolId: USER_POOL_ID,
          Password: inviteToken,
          Permanent: false, // triggers CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED on sign-in
        })
      );
    }

    if (isReinvite) {
      // Update the existing DynamoDB record with new invite details and subscription info
      const existingResult = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          IndexName: 'usersByEmailAndCompanyName',
          KeyConditionExpression: 'email = :email',
          ExpressionAttributeValues: { ':email': body.username },
          Limit: 1,
        })
      );
      const existingUser = existingResult.Items?.[0];
      if (existingUser) {
        await ddb.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id: existingUser.id },
            UpdateExpression:
              'SET #status = :status, subscriptionId = :subId, stripeCustomerId = :custId, companyName = :co, inviteToken = :token, inviteExpiresAt = :expires, invitedBy = :by, updatedAt = :now',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
              ':status': 'Invited',
              ':subId': adminUser.subscriptionId || '',
              ':custId': adminUser.stripeCustomerId || '',
              ':co': companyName,
              ':token': inviteToken,
              ':expires': inviteExpiresAt,
              ':by': body.adminEmail,
              ':now': now,
            },
          })
        );
      } else {
        // Safety net: DynamoDB record missing — create it
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
              stripeCustomerId: adminUser.stripeCustomerId || '',
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
      }
    } else {
      // New user — create DynamoDB record
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
            stripeCustomerId: adminUser.stripeCustomerId || '',
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
    }

    // Update Stripe subscription quantity +1
    if (adminUser.subscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(adminUser.subscriptionId, {
          expand: ['items.data.price'],
        });
        const item = subscription.items.data[0];
        if (item) {
          const currentQty = item.quantity || 1;
          const newQty = currentQty + 1;
          console.log(`Stripe seat +1: sub=${adminUser.subscriptionId} item=${item.id} qty ${currentQty} → ${newQty}`);
          const updated = await stripe.subscriptions.update(adminUser.subscriptionId, {
            items: [{ id: item.id, quantity: newQty }],
          });
          console.log(`Stripe seat +1 success: status=${updated.status} qty=${updated.items.data[0]?.quantity}`);
        } else {
          console.warn('Stripe seat +1 skipped: no item found on subscription');
        }
      } catch (stripeError) {
        console.error('Stripe seat +1 failed (non-fatal):', stripeError);
      }
    } else {
      console.warn('Stripe seat +1 skipped: adminUser has no subscriptionId');
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
