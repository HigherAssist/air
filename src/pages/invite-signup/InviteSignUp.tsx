import { useEffect, useState, type ChangeEvent } from 'react';
import { Link, LinkProps, useNavigate, useSearchParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { signIn, signOut, confirmSignIn, getCurrentUser } from 'aws-amplify/auth';
import { PhoneNumberField } from '@aws-amplify/ui-react';
import { Turnstile } from '@marsidev/react-turnstile';
import toast from 'react-hot-toast';
import { ErrorMessage } from 'shared/components';
import { isErrorMessage } from 'shared/utils';
import { inviteSignInSchema, InviteSignInType } from 'shared/validation-schemas/invite-signin';
import { UserService } from 'shared/services';
import { useAuth } from 'shared/hooks';
import { User } from 'shared/types/user';

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';

const StyledLink = (props: LinkProps) => (
  <Link {...props} target="_blank" className="text-blue-500 cursor-pointer" />
);

type InviteState = 'loading' | 'invalid' | 'ready' | 'submitting';

const InviteSignUp = () => {
  const [params] = useSearchParams();
  const email = params.get('email') || '';
  const token = params.get('token') || '';
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const [inviteState, setInviteState] = useState<InviteState>('loading');
  const [dbUser, setDbUser] = useState<User | null>(null);
  const [dialCode, setDialCode] = useState('+1');

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<InviteSignInType>({
    resolver: zodResolver(inviteSignInSchema),
    mode: 'all',
    defaultValues: { acknowledge: false },
  });

  useEffect(() => {
    if (!email || !token) {
      navigate('/');
      return;
    }

    const verifyInvite = async () => {
      try {
        const user = await UserService.getDbInvitedUser(email);

        if (!user) {
          toast.error('Invitation not found.');
          navigate('/');
          return;
        }

        if (user.status !== 'Invited' && user.status !== 'Accepted') {
          toast.error('This invitation has already been used or is no longer valid.');
          navigate('/');
          return;
        }

        if (user.inviteToken !== token) {
          toast.error('Invalid invitation link.');
          navigate('/');
          return;
        }

        if (user.inviteExpiresAt && new Date(user.inviteExpiresAt) < new Date()) {
          toast.error('This invitation link has expired. Please ask your admin to re-invite you.');
          navigate('/');
          return;
        }

        // Mark as Accepted if not already
        if (user.status === 'Invited') {
          await UserService.updateDbUser({
            id: user.id,
            status: 'Accepted',
            acceptedAt: new Date().toISOString(),
          });
        }

        setDbUser(user);
        setInviteState('ready');
      } catch (error) {
        console.error(error);
        toast.error('Unable to verify invitation. Please try again.');
        navigate('/');
      }
    };

    verifyInvite();
  }, [email, token, navigate]);

  const handleOnSubmit = async (values: InviteSignInType) => {
    if (!dbUser) return;
    try {
      // Sign out any existing session before signing in with invite token
      try { await signOut(); } catch (_) { /* ignore if no session */ }

      // Sign in with invite token as temp password (invisible to user)
      const signInResult = await signIn({ username: email, password: dbUser.inviteToken! });

      if (signInResult.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        await confirmSignIn({ challengeResponse: values.password });
      }

      // Update DB user with form data and mark Active
      await UserService.updateDbUser({
        id: dbUser.id,
        firstName: values.firstName,
        lastName: values.lastName,
        phoneNumber: `${dialCode}${values.phoneNumber.replace(/\D/g, '')}`,
        companyName: values.companyName,
        status: 'Active',
        activatedAt: new Date().toISOString(),
      });

      const currentUser = await getCurrentUser();
      await setUser(currentUser);
      navigate('/account');
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || 'There was an error completing your registration. Please try again.');
    }
  };

  if (inviteState === 'loading') {
    return (
      <div className="flex justify-center items-center my-20">
        <p className="text-gray-500">Verifying your invitation…</p>
      </div>
    );
  }

  return (
    <div className="max-w-md w-full mx-auto my-10 shadow-md p-6 border border-solid border-gray-300 rounded-md">
      <h2 className="text-xl font-semibold text-center mb-1">Create Account</h2>
      <p className="text-sm text-center text-gray-500 mb-6">
        You've been invited to join HireAssist AIR.
      </p>

      <form onSubmit={handleSubmit(handleOnSubmit)} className="space-y-4">
        {/* Email — pre-filled and locked */}
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full border border-gray-300 rounded-md px-3 py-2 bg-gray-100 text-gray-500 text-sm"
          />
        </div>

        {/* Company Name — pre-filled, editable */}
        <div>
          <label className="block text-sm font-medium mb-1">Company Name</label>
          <Controller
            control={control}
            name="companyName"
            defaultValue={dbUser?.companyName || ''}
            render={({ field }) => (
              <input
                {...field}
                type="text"
                placeholder="Company Name"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('companyName', errors)} />
        </div>

        {/* First Name */}
        <div>
          <label className="block text-sm font-medium mb-1">First Name</label>
          <Controller
            control={control}
            name="firstName"
            render={({ field }) => (
              <input
                {...field}
                type="text"
                placeholder="First Name"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('firstName', errors)} />
        </div>

        {/* Last Name */}
        <div>
          <label className="block text-sm font-medium mb-1">Last Name</label>
          <Controller
            control={control}
            name="lastName"
            render={({ field }) => (
              <input
                {...field}
                type="text"
                placeholder="Last Name"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('lastName', errors)} />
        </div>

        {/* Phone Number */}
        <div>
          <Controller
            control={control}
            name="phoneNumber"
            render={({ field }) => (
              <PhoneNumberField
                label="Phone Number"
                defaultDialCode="+1"
                placeholder="555 000 0000"
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                onDialCodeChange={(e: ChangeEvent<HTMLSelectElement>) => setDialCode(e.target.value)}
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('phoneNumber', errors)} />
        </div>

        {/* Password */}
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <input
                {...field}
                type="password"
                placeholder="Create a password"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('password', errors)} />
        </div>

        {/* Confirm Password */}
        <div>
          <label className="block text-sm font-medium mb-1">Confirm Password</label>
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field }) => (
              <input
                {...field}
                type="password"
                placeholder="Confirm your password"
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('confirmPassword', errors)} />
        </div>

        {/* Privacy / Terms */}
        <div className="flex items-start gap-2">
          <Controller
            control={control}
            name="acknowledge"
            render={({ field }) => (
              <input
                type="checkbox"
                id="acknowledge"
                checked={field.value}
                onChange={field.onChange}
                className="mt-1"
              />
            )}
          />
          <label htmlFor="acknowledge" className="text-sm text-gray-600">
            I agree with the{' '}
            <StyledLink to="/privacy-policy">privacy policy</StyledLink> and{' '}
            <StyledLink to="/terms-condition">terms &amp; conditions</StyledLink>
          </label>
        </div>
        <ErrorMessage message={isErrorMessage('acknowledge', errors)} />

        {/* Turnstile */}
        <div className="flex justify-center">
          <Turnstile siteKey={TURNSTILE_SITE_KEY} />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-blue-600 text-white py-2 rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Creating Account…' : 'Create Account'}
        </button>
      </form>
    </div>
  );
};

export default InviteSignUp;
