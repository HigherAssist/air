import { z } from 'zod';
import validator from 'validator';

export const inviteSignInSchema = z
  .object({
    firstName: z
      .string({ required_error: 'First Name is a required field' })
      .min(1, 'First Name is a required field'),
    lastName: z
      .string({ required_error: 'Last Name is a required field' })
      .min(1, 'Last Name is a required field'),
    oldPassword: z
      .string({ required_error: 'Old Password is a required field' })
      .min(1, 'Old Password is a required field'),
    newPassword: z
      .string({ required_error: 'New Password is a required field' })
      .min(1, 'New Password is a required field'),
    phoneCode: z
      .string({ required_error: 'Dial code is a required field' })
      .min(1, 'Dial code is a required field')
      .default('+1'),
    phoneNumber: z
      .string({ required_error: 'Phone Number is a required field' })
      .min(1, 'Phone Number is a required field'),
    acknowledge: z
      .boolean()
      .default(false)
      .refine((value) => value === true, { path: ['acknowledge'] }),
  })
  .refine(
    ({ phoneNumber, phoneCode }) => {
      if (phoneNumber.includes('-')) return false;
      return validator.isMobilePhone(`${phoneCode}${phoneNumber}`, 'any', {
        strictMode: true,
      });
    },
    { message: 'Invalid phone number' }
  );

export type InviteSignInType = z.infer<typeof inviteSignInSchema>;
