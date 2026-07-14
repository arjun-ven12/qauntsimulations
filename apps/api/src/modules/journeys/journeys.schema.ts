import { z } from 'zod';
export const journeyStepInputSchema = z.object({ order: z.number().int().nonnegative(), action: z.enum(['NAVIGATE', 'CLICK', 'FILL', 'SELECT', 'WAIT', 'ASSERT', 'CUSTOM']), selector: z.string().nullable().default(null), value: z.string().nullable().default(null), metadata: z.record(z.unknown()).default({}) });
export const createJourneySchema = z.object({ name: z.string().min(1), description: z.string().nullable().default(null), steps: z.array(journeyStepInputSchema).min(1) });
