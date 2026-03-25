import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from 'shared/hooks';
import { WithSubscription } from 'shared/components';

const Sourcing: React.FC = () => {
  const { dbUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'close-air') {
        navigate('/account');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [navigate]);

  if (!dbUser) {
    return null;
  }

  // Sourcing chatbot URL — configure per environment via VITE_SOURCING_URL
  const getSourcingUrl = () => {
    const sourcingUrl = import.meta.env.VITE_SOURCING_URL;
    if (sourcingUrl) {
      return `${sourcingUrl}?token=${dbUser.id}`;
    }

    // Fallback: derive from current hostname
    const hostname = window.location.hostname;
    if (hostname.startsWith('www.') || hostname === 'hireassist.net') {
      return `https://sourcing.prod.hireassist.net?token=${dbUser.id}`;
    } else if (hostname.startsWith('stage.')) {
      return `https://sourcing.stage.hireassist.net?token=${dbUser.id}`;
    }
    return `https://sourcing.dev.hireassist.net?token=${dbUser.id}`;
  };

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <iframe
        src={getSourcingUrl()}
        frameBorder="0"
        style={{ height: '100%', width: '100%' }}
        allowFullScreen
        title="AIR Sourcing Assistant"
      />
    </div>
  );
};

export default WithSubscription(Sourcing);
