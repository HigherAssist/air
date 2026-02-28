import { useNavigate } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Input, PhoneNumberField } from '@aws-amplify/ui-react';
import { updateUserAttributes } from 'aws-amplify/auth';
import { WithSubscription } from 'shared/components';
import useAuth from 'shared/hooks/useAuth';
import { UserService } from 'shared/services';
import { ErrorMessage } from 'shared/components';
import { isError, isErrorMessage } from 'shared/utils';
import {
  editProfileSchema,
  EditProfileType,
} from 'shared/validation-schemas/edit-profile';
import toast from 'react-hot-toast';

const EditProfile = () => {
  const navigate = useNavigate();
  const { dbUser, refreshUser } = useAuth();

  const {
    control,
    formState: { errors, touchedFields, isSubmitting },
    handleSubmit,
  } = useForm<EditProfileType>({
    resolver: zodResolver(editProfileSchema),
    mode: 'all',
    defaultValues: {
      firstName: dbUser?.firstName || '',
      lastName: dbUser?.lastName || '',
      companyName: dbUser?.companyName || '',
      phoneNumber: dbUser?.phoneNumber || '',
    },
  });

  const handleOnSubmit = async (values: EditProfileType) => {
    try {
      // Update Cognito attributes
      await updateUserAttributes({
        userAttributes: {
          'custom:first_name': values.firstName,
          'custom:last_name': values.lastName,
          'custom:company_name': values.companyName,
          phone_number: values.phoneNumber,
        },
      });

      // Update DB user
      await UserService.updateDbUser({
        id: dbUser!.id,
        firstName: values.firstName,
        lastName: values.lastName,
        companyName: values.companyName,
        phoneNumber: values.phoneNumber,
      });

      // Refresh Zustand store so Profile page shows updated values immediately
      await refreshUser();

      toast.success('Profile updated successfully!');
      navigate('/profile');
    } catch (error: any) {
      console.error(error);
      toast.error(error?.message || 'Failed to update profile.');
    }
  };

  return (
    <div className="max-w-md mx-auto my-10 p-6 border rounded-lg shadow-sm">
      <h2 className="text-xl font-bold text-BlueLagoon text-center mb-6">
        Edit Profile
      </h2>
      <form onSubmit={handleSubmit(handleOnSubmit)} className="space-y-4">
        <div>
          <label>First Name</label>
          <Controller
            control={control}
            name="firstName"
            render={({ field }) => (
              <Input
                type="text"
                placeholder="First Name"
                hasError={isError('firstName', errors, touchedFields)}
                {...field}
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('firstName', errors)} />
        </div>
        <div>
          <label>Last Name</label>
          <Controller
            control={control}
            name="lastName"
            render={({ field }) => (
              <Input
                type="text"
                placeholder="Last Name"
                hasError={isError('lastName', errors, touchedFields)}
                {...field}
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('lastName', errors)} />
        </div>
        <div>
          <label>Company</label>
          <Controller
            control={control}
            name="companyName"
            render={({ field }) => (
              <Input
                type="text"
                placeholder="Company Name"
                hasError={isError('companyName', errors, touchedFields)}
                {...field}
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('companyName', errors)} />
        </div>
        <div>
          <label>Phone Number</label>
          <Controller
            control={control}
            name="phoneNumber"
            render={({ field }) => (
              <Input
                type="tel"
                placeholder="Phone Number"
                hasError={isError('phoneNumber', errors, touchedFields)}
                {...field}
              />
            )}
          />
          <ErrorMessage message={isErrorMessage('phoneNumber', errors)} />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-BlueLagoon text-white py-2 rounded-md hover:opacity-90 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving...' : 'Save Changes'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="w-full border border-gray-300 text-gray-700 py-2 rounded-md hover:bg-gray-50"
        >
          Cancel
        </button>
      </form>
    </div>
  );
};

export default WithSubscription(EditProfile);
