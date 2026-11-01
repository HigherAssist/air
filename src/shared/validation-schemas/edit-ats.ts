import { z } from 'zod';

export const editATSSchema = z.object({
  atsname: z
    .string({ required_error: 'ATS Name is a required field' })
    .min(1, 'ATS Name is a required field'),
  apikeytype: z
    .string({ required_error: 'API Key Type is a required field' })
    .min(1, 'API Key Type is a required field'),
  apikey1: z
    .string({ required_error: 'API Key 1 is a required field' })
    .min(1, 'API Key 1 is a required field'),
  apikey2: z
    .string({ required_error: 'API Key 2 is a required field' })
    .min(1, 'API Key 2 is a required field'),
});

export type EditATSType = z.infer<typeof editATSSchema>;
