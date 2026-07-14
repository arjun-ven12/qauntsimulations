import { z } from 'zod';
export const registerSchema = z.object({ email: z.string().email().transform((value) => value.toLowerCase()), password: z.string().min(12).max(128), displayName: z.string().min(1).max(100), organisationName: z.string().min(1).max(100) });
export const loginSchema = z.object({ email: z.string().email().transform((value) => value.toLowerCase()), password: z.string().min(1).max(128) });
