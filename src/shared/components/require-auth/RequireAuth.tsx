import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from 'shared/hooks';
import { Spinner } from 'shared/components';

const RequireAuth = () => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <Spinner />;
  }

  return isAuthenticated ? <Outlet /> : <Navigate to="/sign-in" />;
};

export default RequireAuth;
