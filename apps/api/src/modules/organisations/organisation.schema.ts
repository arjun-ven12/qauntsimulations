import { userRoleSchema } from '@taskos/shared-types';
import { z } from 'zod';

export const addOrganisationMemberSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email('Enter a valid email address')
      .transform((value) => value.toLowerCase()),
    role: userRoleSchema,
  })
  .strict();

export const updateOrganisationMemberSchema = z.object({ role: userRoleSchema }).strict();
