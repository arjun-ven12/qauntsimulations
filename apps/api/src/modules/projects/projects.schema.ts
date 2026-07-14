import { z } from 'zod';
export const createProjectSchema = z.object({ name: z.string().min(1).max(100), description: z.string().max(1000).nullable().default(null), repositoryUrl: z.string().url().nullable().default(null) });
