import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner } from 'shared/components';

const Success = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');

  useEffect(() => {
    // After successful Stripe checkout, redirect to account page
    // The webhook will have already created the subscription in DynamoDB
    const timer = setTimeout(() => {
      navigate('/account');
    }, 3000);

    return () => clearTimeout(timer);
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh]">
      <div className="bg-green-100 text-green-700 p-8 rounded-lg text-center max-w-md">
        <h2 className="text-2xl font-bold mb-4">Subscription Successful!</h2>
        <p className="mb-4">
          Thank you for subscribing. Your account is being set up.
        </p>
        {sessionId && (
          <p className="text-sm text-gray-500 mb-4">
            Session: {sessionId.substring(0, 20)}...
          </p>
        )}
        <p className="text-sm text-gray-500">
          Redirecting to your account...
        </p>
        <Spinner />
      </div>
    </div>
  );
};

export default Success;
