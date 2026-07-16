import { z } from 'zod';
export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(1).max(100),
  organisationName: z.string().trim().min(1).max(100),
});
export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});
export const switchOrganisationSchema = z
  .object({ organisationId: z.string().trim().min(1) })
  .strict();
