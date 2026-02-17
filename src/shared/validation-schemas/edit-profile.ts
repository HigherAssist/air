import { z } from 'zod';
import validator from 'validator';

export const editProfileSchema = z.object({
  firstName: z
    .string({ required_error: 'First Name is a required field' })
    .min(1, 'First Name is a required field'),
  lastName: z
    .string({ required_error: 'Last Name is a required field' })
    .min(1, 'Last Name is a required field'),
  companyName: z
    .string({ required_error: 'Company is a required field' })
    .min(1, 'Company is a required field'),
  phoneNumber: z
    .string({ required_error: 'Phone Number is a required field' })
    .min(1, 'Phone Number is a required field')
    .refine(
      (value) => {
        if (value.includes('-')) return false;
        return validator.isMobilePhone(value, 'any', { strictMode: true });
      },
      { message: 'Invalid phone number' }
    ),
});

export type EditProfileType = z.infer<typeof editProfileSchema>;
