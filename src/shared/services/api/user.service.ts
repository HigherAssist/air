import { post } from 'aws-amplify/api';
import { fetchAuthSession } from 'aws-amplify/auth';
import { execute } from 'shared/utils';
import { CreateInviteUser, User } from 'shared/types/user';

const REST_API_NAME = 'AirRestApi';

async function authHeaders(): Promise<Record<string, string>> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  return token ? { Authorization: token } : {};
}

const updateUserMutation = /* GraphQL */ `
  mutation UpdateUser($input: UpdateUserInput!) {
    updateUser(input: $input) {
      id firstName lastName phoneNumber email companyName
      profileRole status subscriptionId stripeCustomerId
      atsname apikeytype apikey1 apikey2
    }
  }
`;

const getUserByEmailQuery = /* GraphQL */ `
  query GetUserByEmail($email: String!) {
    getUserByEmail(email: $email) {
      items {
        id firstName lastName phoneNumber email companyName
        profileRole status subscriptionId stripeCustomerId
        atsname apikeytype apikey1 apikey2
      }
    }
  }
`;

const listUsersQuery = /* GraphQL */ `
  query ListUsers($filter: ModelUserFilterInput, $limit: Int, $nextToken: String) {
    listUsers(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id firstName lastName phoneNumber email companyName
        profileRole status subscriptionId stripeCustomerId
        atsname apikeytype apikey1 apikey2
      }
      nextToken
    }
  }
`;

export class UserService {
  public static async createInvitedUser(
    payload: CreateInviteUser
  ): Promise<any> {
    const response = await post({
      apiName: REST_API_NAME,
      path: 'admin/user/create',
      options: { body: payload as any, headers: await authHeaders() },
    }).response;
    return response.body.json();
  }

  public static async deleteInvitedUser(username: string): Promise<any> {
    const response = await post({
      apiName: REST_API_NAME,
      path: 'admin/user/remove',
      options: { body: { username } as any, headers: await authHeaders() },
    }).response;
    return response.body.json();
  }

  public static async getInvitedUser(username: string) {
    const response = await post({
      apiName: REST_API_NAME,
      path: 'admin/user',
      options: { body: { username } as any, headers: await authHeaders() },
    }).response;
    return response.body.json();
  }

  public static async updateDbUser(data: Record<string, any>) {
    const user = await execute(
      {
        statement: updateUserMutation,
        name: 'updateUser',
      },
      {
        input: data,
      }
    );
    return user;
  }

  public static async getDbInvitedUser(email: string) {
    const userItems = await execute(
      {
        statement: getUserByEmailQuery,
        name: 'getUserByEmail',
      },
      { email }
    );
    return userItems.items[0] as User;
  }

  public static async getDbUserBySubscriptionId(subscriptionId: string) {
    const userItems = await execute(
      {
        statement: listUsersQuery,
        name: 'listUsers',
      },
      {
        filter: {
          subscriptionId: { eq: subscriptionId },
        },
      }
    );
    return userItems.items as User[];
  }
}
