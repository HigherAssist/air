import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input } from '@aws-amplify/ui-react';
import { updatePassword, signOut } from 'aws-amplify/auth';
import { ErrorMessage, WithSubscription } from 'shared/components';
import { isError, isErrorMessage } from 'shared/utils';
import {
  changePasswordSchema,
  ChangePasswordType,
} from 'shared/validation-schemas/change-password';
import toast from 'react-hot-toast';

const ChangePassword = () => {
  const {
    control,
    formState: { errors, touchedFields, isSubmitting },
    handleSubmit,
  } = useForm<ChangePasswordType>({
    resolver: zodResolver(changePasswordSchema),
    mode: 'all',
  });

  const handleOnSubmit = async (values: ChangePasswordType) => {
    try {
      await updatePassword({
        oldPassword: values.password,
        newPassword: values.newPassword,
      });
      toast.success('Password changed successfully! Please sign in again.');
      await signOut();
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Failed to change password.');
    }
  };

  return (
    <div className="max-w-md mx-auto my-10 p-6 border rounded-lg shadow-sm">
      <h2 className="text-xl font-bold text-BlueLagoon text-center mb-6">
        Change Password
      </h2>
      <form onSubmit={handleSubmit(handleOnSubmit)} className="space-y-4">
        <div>
          <label>Current Password</label>
          <Controller
            control={control}
            name="password"
            render={({ field }) => (
              <Input
                type="password"
                placeholder="Current Password"
                hasError={isError('password', errors, touchedFields)}
                {...field}
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('password', errors)} />
        </div>
        <div>
          <label>New Password</label>
          <Controller
            control={control}
            name="newPassword"
            render={({ field }) => (
              <Input
                type="password"
                placeholder="New Password"
                hasError={isError('newPassword', errors, touchedFields)}
                {...field}
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('newPassword', errors)} />
        </div>
        <div>
          <label>Confirm New Password</label>
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field }) => (
              <Input
                type="password"
                placeholder="Confirm New Password"
                hasError={isError('confirmPassword', errors, touchedFields)}
                {...field}
              />
            )}
          />
          <ErrorMessage
            message={isErrorMessage('confirmPassword', errors)}
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-BlueLagoon text-white py-2 rounded-md hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
  );
};

export default WithSubscription(ChangePassword);
