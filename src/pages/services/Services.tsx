import React from 'react';
import { useAuth } from 'shared/hooks';
import { WithSubscription } from 'shared/components';

const Services: React.FC = () => {
  const { dbUser } = useAuth();
  if (!dbUser) {
    return null;
  }

  // Services iframe URL — configure per environment via VITE_SERVICES_URL
  // or determine from the current hostname
  const getServicesUrl = () => {
    const servicesUrl = import.meta.env.VITE_SERVICES_URL;
    if (servicesUrl) {
      return `${servicesUrl}/?__theme=light&token=${dbUser.id}`;
    }

    // Fallback: derive from current hostname
    const hostname = window.location.hostname;
    if (hostname.startsWith('www.') || hostname === 'air-app.com') {
      return `https://prod.hireassist.net:7860/?__theme=light&token=${dbUser.id}`;
    } else if (hostname.startsWith('stage.')) {
      return `https://stage.hireassist.net:7860/?__theme=light&token=${dbUser.id}`;
    }
    return `https://dev.hireassist.net:7860/?__theme=light&token=${dbUser.id}`;
  };

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <iframe
        src={getServicesUrl()}
        frameBorder="0"
        style={{ height: '100%', width: '100%' }}
        allowFullScreen
        title="AIR Services"
      />
    </div>
  );
};

export default WithSubscription(Services);
