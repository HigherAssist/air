import { Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from 'shared/hooks';
import { Spinner } from 'shared/components';
import Navigation from './navigation/Navigation';
import { Modal } from 'antd';
import { signOut } from 'aws-amplify/auth';

const Layout = () => {
  const navigate = useNavigate();
  const { isLoading, sessionRevoked } = useAuth();

  if (isLoading) {
    return <Spinner />;
  }

  const handleRevokedDismiss = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <>
      <Navigation />
      <Outlet />
      <Modal
        open={sessionRevoked}
        closable={false}
        maskClosable={false}
        footer={null}
        centered
      >
        <div className="text-center py-4">
          <p className="text-lg font-semibold mb-6">
            Your HireAssist AIR subscription has been cancelled.
          </p>
          <button
            onClick={handleRevokedDismiss}
            className="w-full bg-BlueLagoon text-white py-2 rounded-md hover:opacity-90"
          >
            Go to Home
          </button>
        </div>
      </Modal>
    </>
  );
};

export default Layout;
