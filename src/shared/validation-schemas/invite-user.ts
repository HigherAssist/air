import { z } from 'zod';

export const inviteUserSchema = z
  .object({
    email: z
      .string({ required_error: 'Email is a required field' })
      .min(1, 'Email is a required field'),
    confirmEmail: z
      .string({ required_error: 'Confirm Email is a required field' })
      .min(1, 'Confirm Email is a required field'),
  })
  .refine(({ email, confirmEmail }) => email === confirmEmail, {
    message: 'Email must be matched',
    path: ['confirmEmail'],
  });

export type InviteUserType = z.infer<typeof inviteUserSchema>;
