import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Spinner } from 'shared/components';
import useAuth from 'shared/hooks/useAuth';

const MAX_ATTEMPTS = 10;
const POLL_INTERVAL_MS = 3000;

const Success = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('session_id');
  const attemptRef = useRef(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    attemptRef.current = 0;

    const poll = async () => {
      if (cancelledRef.current) return;

      if (attemptRef.current >= MAX_ATTEMPTS) {
        navigate('/account');
        return;
      }

      attemptRef.current += 1;

      await useAuth.getState().refreshUser();

      if (cancelledRef.current) return;

      if (useAuth.getState().dbUser?.stripeCustomerId) {
        navigate('/account');
        return;
      }

      setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();

    return () => {
      cancelledRef.current = true;
    };
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
