import { z } from 'zod';
export const createInvestigationSchema = z.object({ name: z.string().min(1), environmentId: z.string().min(1), journeyId: z.string().min(1), scenarioId: z.string().min(1), safetyPolicyId: z.string().min(1).optional(), objective: z.string().min(10).max(5000), invariantIds: z.array(z.string()).default([]), worldPack: z.string().default('commerce') });
