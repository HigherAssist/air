import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import { useAuth } from 'shared/hooks';

const SignIn = () => {
  const navigate = useNavigate();
  const { isAuthenticated, setUser } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/account');
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="flex justify-center my-10">
      <Authenticator
        signUpAttributes={['email']}
        formFields={{
          signUp: {
            email: {
              order: 1,
              placeholder: 'Enter your email',
              label: 'Email',
              isRequired: true,
            },
            password: {
              order: 2,
              placeholder: 'Enter your password',
              label: 'Password',
              isRequired: true,
            },
            confirm_password: {
              order: 3,
              placeholder: 'Confirm your password',
              label: 'Confirm Password',
              isRequired: true,
            },
            'custom:company_name': {
              order: 4,
              placeholder: 'Enter your company name',
              label: 'Company Name',
              isRequired: true,
            },
            'custom:first_name': {
              order: 5,
              placeholder: 'Enter your first name',
              label: 'First Name',
              isRequired: true,
            },
            'custom:last_name': {
              order: 6,
              placeholder: 'Enter your last name',
              label: 'Last Name',
              isRequired: true,
            },
            'custom:registration_code': {
              order: 7,
              placeholder: 'Enter your registration code',
              label: 'Registration Code',
              isRequired: true,
            },
          },
        }}
      >
        {({ user }) => {
          if (user) {
            setUser(user as any);
          }
          return <></>;
        }}
      </Authenticator>
    </div>
  );
};

export default SignIn;
