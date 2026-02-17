import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useSubscriptions } from 'shared/hooks';
import { PaymentService } from 'shared/services';
import { Spinner } from 'shared/components';

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
          if (!dbUser?.stripeCustomerId) {
            navigate('/subscribe');
            return;
          }

          const { subscriptions, customer } =
            await PaymentService.getUserSubscriptions(
              dbUser.stripeCustomerId
            );

          if (!subscriptions || subscriptions.length === 0) {
            navigate('/subscribe');
            return;
          }

          setSubscriptions(subscriptions);
          setCustomer(customer);
          setLoading(false);
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
