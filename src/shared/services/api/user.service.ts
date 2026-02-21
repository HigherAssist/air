import { fetchAuthSession } from 'aws-amplify/auth';
import { Amplify } from 'aws-amplify';
import { execute } from 'shared/utils';
import { CreateInviteUser, User } from 'shared/types/user';

function getApiUrl(): string {
  const config = Amplify.getConfig() as any;
  return config.API?.REST?.AirRestApi?.endpoint || '';
}

async function authFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const session = await fetchAuthSession();
  const token = session.tokens?.idToken?.toString();
  const url = `${getApiUrl()}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: token } : {}),
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response;
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
        inviteToken inviteExpiresAt invitedBy acceptedAt activatedAt
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
    const response = await authFetch('admin/user/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return response.json();
  }

  public static async deleteInvitedUser(username: string): Promise<any> {
    const response = await authFetch('admin/user/remove', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    return response.json();
  }

  public static async getInvitedUser(username: string) {
    const response = await authFetch('admin/user', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    return response.json();
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
