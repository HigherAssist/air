import { z } from 'zod';

export const inviteSignInSchema = z
  .object({
    companyName: z
      .string({ required_error: 'Company Name is required' })
      .min(1, 'Company Name is required'),
    firstName: z
      .string({ required_error: 'First Name is required' })
      .min(1, 'First Name is required'),
    lastName: z
      .string({ required_error: 'Last Name is required' })
      .min(1, 'Last Name is required'),
    phoneNumber: z
      .string({ required_error: 'Phone Number is required' })
      .min(7, 'Please enter a valid phone number'),
    password: z
      .string({ required_error: 'Password is required' })
      .min(8, 'Password must be at least 8 characters'),
    confirmPassword: z
      .string({ required_error: 'Confirm Password is required' })
      .min(1, 'Confirm Password is required'),
    acknowledge: z
      .boolean()
      .default(false)
      .refine((val) => val === true, {
        message: 'You must agree to the privacy policy and terms',
      }),
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type InviteSignInType = z.infer<typeof inviteSignInSchema>;
