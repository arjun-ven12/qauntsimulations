import { userRoleSchema } from '@taskos/shared-types';
import { z } from 'zod';

export const createInvitationSchema = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase()),
    role: userRoleSchema,
  })
  .strict();

export const acceptInvitationSchema = z
  .object({ token: z.string().trim().min(32).max(512) })
  .strict();

export const previewInvitationSchema = z.object({ token: z.string().trim().min(32).max(512) });
