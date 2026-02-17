import type { APIGatewayProxyHandler } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';

const sesClient = new SESClient();
const cognitoClient = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION,
});

// These env vars are auto-populated by Amplify Gen 2
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

const createUserMutation = /* GraphQL */ `
  mutation CreateUser($input: CreateUserInput!) {
    createUser(input: $input) {
      id
      firstName
      lastName
      email
      companyName
      profileRole
      status
      subscriptionId
    }
  }
`;

const getUserByEmailQuery = /* GraphQL */ `
  query GetUserByEmail($email: String!) {
    getUserByEmail(email: $email) {
      items {
        id
        firstName
        lastName
        email
        companyName
        profileRole
        status
        subscriptionId
        atsname
        apikeytype
        apikey1
        apikey2
      }
    }
  }
`;

export const handler: APIGatewayProxyHandler = async (event) => {
  console.log(`EVENT: ${JSON.stringify(event)}`);
  const body = JSON.parse(event.body || '{}');
  const companyName = body.companyName;

  try {
    const tempPassword = `${companyName}A23S123`;

    // Get admin user to inherit ATS config
    const client = generateClient();
    const adminResult: any = await client.graphql({
      query: getUserByEmailQuery,
      variables: { email: body.adminEmail },
      authMode: 'apiKey',
    });
    const adminUser = adminResult.data.getUserByEmail.items[0];
    console.log(`Admin user: ${JSON.stringify(adminUser)}`);

    // Create Cognito user
    const command = new AdminCreateUserCommand({
      Username: body.username,
      MessageAction: 'SUPPRESS',
      UserPoolId: USER_POOL_ID,
      UserAttributes: [
        { Name: 'email', Value: body.username },
        { Name: 'email_verified', Value: 'true' },
      ],
      TemporaryPassword: tempPassword,
      DesiredDeliveryMediums: ['EMAIL'],
    });
    const response = await cognitoClient.send(command);

    // Create DB user record
    await client.graphql({
      query: createUserMutation,
      variables: {
        input: {
          companyName,
          email: body.username,
          firstName: '',
          lastName: '',
          phoneNumber: '',
          profileRole: 'User',
          status: 'Invited',
          subscriptionId: adminUser?.subscriptionId || body.subscriptionId,
          atsname: adminUser?.atsname || '',
          apikeytype: adminUser?.apikeytype || '',
          apikey1: adminUser?.apikey1 || '',
          apikey2: adminUser?.apikey2 || '',
        },
      },
      authMode: 'apiKey',
    });

    // Send invite email
    const domain = process.env.AMPLIFY_APP_ORIGIN || 'http://localhost:5173';
    const inviteLink = `${domain}/invite-signup?email=${body.username}`;
    const sendEmailCommand = new SendEmailCommand({
      Source: process.env.SES_EMAIL,
      Destination: { ToAddresses: [body.username] },
      Message: {
        Subject: {
          Data: `${body.adminFirstName} ${body.adminLastName} at ${companyName} has invited you to sign up for AIR`,
        },
        Body: {
          Html: {
            Data: `<!DOCTYPE html>
            <html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head>
            <body>
              <p>Your temporary password is ${tempPassword}. Please use this link to sign in:</p>
              <div style="padding:20px;">
                <a href='${inviteLink}'>${inviteLink}</a>
              </div>
            </body></html>`,
          },
        },
      },
    });
    await sesClient.send(sendEmailCommand);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify(response),
    };
  } catch (error: any) {
    console.error(error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*',
      },
      body: JSON.stringify(
        'There was an error creating the user. Please try again.'
      ),
    };
  }
};
