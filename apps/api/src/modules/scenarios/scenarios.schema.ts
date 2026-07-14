import { z } from 'zod'; export const createScenarioSchema = z.object({ name: z.string().min(1), prompt: z.string().min(10).max(5000), controls: z.record(z.unknown()).default({}) });
