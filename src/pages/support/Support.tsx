import React from 'react';
import { WithSubscription } from 'shared/components';

const Support: React.FC = () => {
  // Support portal URL — update to your actual support portal
  const supportUrl =
    import.meta.env.VITE_SUPPORT_URL ||
    'https://support.example.com/servicedesk/customer/portal/2';

  return (
    <div style={{ height: '100vh', width: '100%' }}>
      <iframe
        src={supportUrl}
        frameBorder="0"
        style={{ height: '100%', width: '100%' }}
        allowFullScreen
        title="AIR Support"
      />
    </div>
  );
};

export default WithSubscription(Support);
