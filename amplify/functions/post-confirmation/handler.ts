import type { PostConfirmationTriggerHandler } from 'aws-lambda';
import { Amplify } from 'aws-amplify';
import { generateClient } from 'aws-amplify/api';

const GRAPHQL_ENDPOINT = process.env.AMPLIFY_DATA_GRAPHQL_ENDPOINT;
const API_KEY = process.env.AMPLIFY_DATA_API_KEY;

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
      }
    }
  }
`;

export const handler: PostConfirmationTriggerHandler = async (event) => {
  // Only create DB record for self-service sign-ups, not admin-created users
  if (event.triggerSource !== 'PostConfirmation_ConfirmSignUp') {
    return event;
  }

  const attrs = event.request.userAttributes;
  const email = attrs.email;

  const client = generateClient();

  // Check if user already exists (e.g., invited user)
  const existing: any = await client.graphql({
    query: getUserByEmailQuery,
    variables: { email },
    authMode: 'apiKey',
  });

  if (existing.data.getUserByEmail.items.length > 0) {
    console.log('User already exists in DB, skipping creation');
    return event;
  }

  // Create new User record
  await client.graphql({
    query: createUserMutation,
    variables: {
      input: {
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
      },
    },
    authMode: 'apiKey',
  });

  console.log(`Created DB user for ${email}`);
  return event;
};
