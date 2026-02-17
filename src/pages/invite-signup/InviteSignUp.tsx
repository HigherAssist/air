import { useEffect, useState } from 'react';
import {
  Button,
  CheckboxField,
  Input,
  PhoneNumberField,
} from '@aws-amplify/ui-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Link, LinkProps, useNavigate, useSearchParams } from 'react-router-dom';
import { ErrorMessage } from 'shared/components';
import { isError, isErrorMessage } from 'shared/utils';
import {
  InviteSignInType,
  inviteSignInSchema,
} from 'shared/validation-schemas/invite-signin';
import ReCAPTCHA from 'react-google-recaptcha';
import { UserService } from 'shared/services';
import { signIn, confirmSignIn, getCurrentUser } from 'aws-amplify/auth';
import { useAuth } from 'shared/hooks';
import { User } from 'shared/types/user';

const StyledLink = (props: LinkProps) => {
  return (
    <Link
      {...props}
      target="__blank"
      className="text-blue-500 cursor-pointer"
    />
  );
};

const InviteSignUp = () => {
  const [dbUser, setDbUser] = useState<User | null>(null);
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const email = params.get('email');
  const {
    control,
    setValue,
    formState: { errors, touchedFields, isSubmitting },
    handleSubmit,
  } = useForm<InviteSignInType>({
    resolver: zodResolver(inviteSignInSchema),
    mode: 'all',
    reValidateMode: 'onChange',
    defaultValues: {},
  });

  useEffect(() => {
    if (email) {
      UserService.getDbInvitedUser(email)
        .then((user) => {
          setDbUser(user);
          if (user.status !== 'Invited') {
            navigate('/');
          }
        })
        .catch((error) => {
          console.error(error);
        });
    } else {
      navigate('/');
    }
  }, [email, navigate]);

  const handleOnSubmit = async (values: InviteSignInType) => {
    try {
      const signInResult = await signIn({
        username: email!,
        password: values.oldPassword,
      });

      if (signInResult.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        await confirmSignIn({ challengeResponse: values.newPassword });
        const user = await getCurrentUser();
        await UserService.updateDbUser({
          id: dbUser!.id,
          firstName: values.firstName,
          lastName: values.lastName,
          phoneNumber: `${values.phoneCode}${values.phoneNumber}`,
          status: 'SignedUp',
        });
        setUser(user);
        navigate('/account');
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handlePhoneDialCodeChange = (event: any) => {
    setValue('phoneCode', event.target.value);
  };

  const handlePrivacyCheckbox = (event: any) => {
    setValue('acknowledge', event.target.checked);
  };

  const privacyLabelCustomElement = (
    <div>
      I agree with{' '}
      <StyledLink to="/privacy-policy">privacy policy</StyledLink> and{' '}
      <StyledLink to="/terms-condition">terms & conditions</StyledLink> of this
      site
    </div>
  );

  return (
    <div className="max-w-md w-full mx-auto my-10 shadow-md p-5 border border-solid border-gray-400">
      <h2 className="text-lg text-BlueLagoon text-center font-semibold">
        User Sign-in
      </h2>
      <form className="mt-8" onSubmit={handleSubmit(handleOnSubmit)}>
        <div>
          <label>Your First Name</label>
          <Controller
            control={control}
            name="firstName"
            render={({ field }) => (
              <Input
                type="text"
                className="mt-2"
                placeholder="First Name"
                hasError={isError('firstName', errors, touchedFields)}
                {...field}
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('firstName', errors)} />
        </div>
        <div className="mb-4" />
        <div>
          <label>Your Last Name</label>
          <Controller
            control={control}
            name="lastName"
            render={({ field }) => (
              <Input
                type="text"
                placeholder="Last Name"
                className="mt-2"
                hasError={isError('lastName', errors, touchedFields)}
                {...field}
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('lastName', errors)} />
        </div>
        <div className="mb-4" />
        <Controller
          control={control}
          name="phoneNumber"
          render={({ field }) => (
            <PhoneNumberField
              defaultDialCode="+1"
              label="Phone Number"
              placeholder="Enter Phone Number"
              hasError={isError('phoneNumber', errors, touchedFields)}
              {...field}
              onDialCodeChange={handlePhoneDialCodeChange}
            />
          )}
        />
        <ErrorMessage message={isErrorMessage('phoneNumber', errors)} />
        <div className="mb-4" />
        <div>
          <label>Old Password</label>
          <Controller
            control={control}
            name="oldPassword"
            render={({ field }) => (
              <Input
                type="password"
                placeholder="Old Password"
                className="mt-2"
                hasError={isError('oldPassword', errors, touchedFields)}
                {...field}
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('oldPassword', errors)} />
        </div>
        <div className="mb-4" />
        <div>
          <label>New Password</label>
          <Controller
            control={control}
            name="newPassword"
            render={({ field }) => (
              <Input
                type="password"
                placeholder="New Password"
                className="mt-2"
                hasError={isError('newPassword', errors, touchedFields)}
                {...field}
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('newPassword', errors)} />
        </div>
        <div className="mb-4" />
        <CheckboxField
          hasError={!!errors['acknowledge']}
          name="custom:acknowledgement"
          value="yes"
          label={privacyLabelCustomElement}
          onChange={handlePrivacyCheckbox}
        />
        <div className="flex my-2 flex-row justify-center">
          <ReCAPTCHA
            sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || ''}
          />
        </div>
        <Button
          isLoading={isSubmitting}
          className="my-4"
          type="submit"
          variation="primary"
          isFullWidth
        >
          Sign In
        </Button>
      </form>
    </div>
  );
};

export default InviteSignUp;
