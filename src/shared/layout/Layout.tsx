import { Outlet } from 'react-router-dom';
import { useAuth } from 'shared/hooks';
import { Spinner } from 'shared/components';
import Navigation from './navigation/Navigation';

const Layout = () => {
  const { isLoading } = useAuth();

  if (isLoading) {
    return <Spinner />;
  }

  return (
    <>
      <Navigation />
      <Outlet />
    </>
  );
};

export default Layout;
