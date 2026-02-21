import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useSubscriptions } from 'shared/hooks';
import { PaymentService } from 'shared/services';
import { execute } from 'shared/utils';
import { Spinner } from 'shared/components';

const getUserSubscriptionBySubscriptionIdQuery = /* GraphQL */ `
  query GetUserSubscriptionBySubscriptionId($subscriptionId: String!) {
    getUserSubscriptionBySubscriptionId(subscriptionId: $subscriptionId) {
      items { id subscriptionId state }
    }
  }
`;

const WithSubscription = <P extends object>(
  WrappedComponent: React.ComponentType<P>
) => {
  const ComponentWithSubscription = (props: P) => {
    const navigate = useNavigate();
    const { dbUser } = useAuth();
    const { setSubscriptions, setCustomer } = useSubscriptions();
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      const fetchSubscriptions = async () => {
        try {
          // Admin path: has their own Stripe customer ID
          if (dbUser?.stripeCustomerId) {
            const { subscriptions, customer } =
              await PaymentService.getUserSubscriptions(dbUser.stripeCustomerId);

            if (!subscriptions || subscriptions.length === 0) {
              navigate('/subscribe');
              return;
            }
            setSubscriptions(subscriptions);
            setCustomer(customer);
            setLoading(false);
            return;
          }

          // Invited user path: no stripeCustomerId, verify via subscriptionId
          if (dbUser?.subscriptionId && dbUser?.status === 'Active') {
            const result = await execute(
              {
                statement: getUserSubscriptionBySubscriptionIdQuery,
                name: 'getUserSubscriptionBySubscriptionId',
              },
              { subscriptionId: dbUser.subscriptionId }
            );
            const subRecords = result.items as any[];
            const activeSub = subRecords?.find(
              (s: any) => s.state === 'active' || s.state === 'trialing'
            );
            if (activeSub) {
              setLoading(false);
              return;
            }
          }

          navigate('/subscribe');
        } catch (error) {
          console.error(error);
          navigate('/subscribe');
        }
      };

      if (dbUser) {
        fetchSubscriptions();
      }
    }, [dbUser, navigate, setSubscriptions, setCustomer]);

    if (loading) {
      return <Spinner />;
    }

    return <WrappedComponent {...props} />;
  };

  return ComponentWithSubscription;
};

export default WithSubscription;
