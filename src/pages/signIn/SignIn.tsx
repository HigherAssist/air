import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Authenticator } from '@aws-amplify/ui-react';
import { signUp, SignUpInput } from 'aws-amplify/auth';
import { Turnstile, TurnstileInstance } from '@marsidev/react-turnstile';
import { useAuth } from 'shared/hooks';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

const SignIn = () => {
  const navigate = useNavigate();
  const { isAuthenticated, setUser } = useAuth();
  const turnstileRef = useRef<TurnstileInstance | null>(null);
  const turnstileTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/account');
    }
  }, [isAuthenticated, navigate]);

  const services = {
    async handleSignUp(input: SignUpInput) {
      const token = turnstileTokenRef.current;
      return signUp({
        username: input.username,
        password: input.password,
        options: {
          userAttributes: input.options?.userAttributes ?? {},
          validationData: {
            turnstileToken: token || '',
          },
        },
      });
    },
  };

  return (
    <div className="flex justify-center my-10">
      <Authenticator
        signUpAttributes={['email']}
        services={services}
        components={{
          SignUp: {
            Footer() {
              return (
                <div className="flex justify-center mb-4">
                  <Turnstile
                    ref={turnstileRef}
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={(token) => {
                      turnstileTokenRef.current = token;
                    }}
                    onExpire={() => {
                      turnstileTokenRef.current = null;
                      turnstileRef.current?.reset();
                    }}
                  />
                </div>
              );
            },
          },
          ConfirmSignIn: {
            Footer() {
              return (
                <div className="flex justify-center mb-4">
                  <Turnstile
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={(token) => {
                      turnstileTokenRef.current = token;
                    }}
                  />
                </div>
              );
            },
          },
        }}
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
