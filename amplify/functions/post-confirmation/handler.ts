import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { randomUUID } from 'crypto';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ssmClient = new SSMClient({});

// Cache table name after first SSM lookup (cold start)
let tableName: string | undefined;

async function getTableName(): Promise<string> {
  if (tableName) return tableName;
  const param = await ssmClient.send(
    new GetParameterCommand({ Name: process.env.USER_TABLE_SSM_PARAM! })
  );
  tableName = param.Parameter!.Value!;
  return tableName;
}

export const handler: PostConfirmationTriggerHandler = async (event) => {
  // Only create DB record for self-service sign-ups, not admin-created users
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') {
    return event;
  }

  const attrs = event.request.userAttributes;
  const email = attrs.email;
  const TABLE_NAME = await getTableName();

  // Check if user already exists (e.g., invited user) using the email GSI
  const existing = await ddb.send(
    new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'usersByEmailAndCompanyName',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
      Limit: 1,
    })
  );

  if (existing.Items && existing.Items.length > 0) {
    console.log('User already exists in DB, skipping creation');
    return event;
  }

  const now = new Date().toISOString();

  // Create new User record
  await ddb.send(
    new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        id: randomUUID(),
        __typename: 'User',
        email,
        firstName: attrs['custom:first_name'] || '',
        lastName: attrs['custom:last_name'] || '',
        companyName: attrs['custom:company_name'] || '',
        phoneNumber: attrs.phone_number || '',
        profileRole: 'Admin',
        status: 'Active',
        subscriptionId: '',
        atsname: '',
        apikeytype: '',
        apikey1: '',
        apikey2: '',
        createdAt: now,
        updatedAt: now,
      },
    })
  );

  console.log(`Created DB user for ${email}`);
  return event;
};
