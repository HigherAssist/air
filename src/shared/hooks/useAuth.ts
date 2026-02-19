import { create } from 'zustand';
import { fetchUserAttributes, signOut, AuthUser } from 'aws-amplify/auth';
import { execute } from 'shared/utils';
import { User } from 'shared/types/user';

// This query matches the Gen 2 auto-generated getUserByEmail
const getUserByEmail = /* GraphQL */ `
  query GetUserByEmail($email: String!) {
    getUserByEmail(email: $email) {
      items {
        id
        firstName
        lastName
        phoneNumber
        email
        companyName
        profileRole
        status
        subscriptionId
        stripeCustomerId
        atsname
        apikeytype
        apikey1
        apikey2
        createdAt
        updatedAt
      }
    }
  }
`;

interface AuthStore {
  dbUser: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  error: string | null;
  setUser: (user: AuthUser | null) => void;
  setError: (error: string) => void;
  setIsLoading: (isLoading: boolean) => void;
  refreshUser: () => Promise<void>;
}

const useAuth = create<AuthStore>((set) => ({
  isLoading: true,
  dbUser: null,
  user: null,
  error: null,
  isAuthenticated: false,
  setIsLoading: (isLoading: boolean) =>
    set({
      isLoading,
    }),
  setUser: async (user: AuthUser | null) => {
    try {
      set({ isLoading: true });

      // In Amplify v6, get user attributes separately
      const attributes = await fetchUserAttributes();

      const userItems = await execute(
        {
          statement: getUserByEmail,
          name: 'getUserByEmail',
        },
        {
          email: attributes.email,
        }
      );
      const dbUser = userItems.items[0] as User;
      if (!dbUser) {
        throw new Error('You are not logged in');
      }

      set({
        isAuthenticated: true,
        user,
        dbUser,
        isLoading: false,
      });
    } catch (error: any) {
      console.error(error);
      await signOut();
      set({
        isLoading: false,
        user: null,
        dbUser: null,
        isAuthenticated: false,
        error: error?.message || 'Something went wrong',
      });
    }
  },
  setError: (error: string) => set({ error }),
  refreshUser: async () => {
    try {
      const attributes = await fetchUserAttributes();
      const userItems = await execute(
        { statement: getUserByEmail, name: 'getUserByEmail' },
        { email: attributes.email }
      );
      const dbUser = userItems.items[0] as User;
      if (dbUser) {
        set({ dbUser });
      }
    } catch (error) {
      console.error('Failed to refresh user:', error);
    }
  },
}));

export default useAuth;
