import { z } from 'zod';

export const changePasswordSchema = z
  .object({
    password: z
      .string({ required_error: 'Password is a required field' })
      .min(1, 'Password is a required field'),
    newPassword: z
      .string({ required_error: 'New Password is a required field' })
      .min(1, 'New Password is a required field'),
    confirmPassword: z
      .string({ required_error: 'Confirm Password is a required field' })
      .min(1, 'Confirm Password is a required field'),
  })
  .refine(
    ({ newPassword, confirmPassword }) => newPassword === confirmPassword,
    { message: 'Passwords should be matched', path: ['confirmPassword'] }
  );

export type ChangePasswordType = z.infer<typeof changePasswordSchema>;
