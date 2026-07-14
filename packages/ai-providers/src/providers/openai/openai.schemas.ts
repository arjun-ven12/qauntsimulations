import { experimentPlanSchema } from '@taskos/shared-types';
import { z } from 'zod';

export const openAIPlanSchema = experimentPlanSchema;
export const explanationOutputSchema = z.object({ summary: z.string(), supportingEvidence: z.array(z.string()), limitations: z.array(z.string()) });
export const compiledInvariantSchema = z.object({ name: z.string(), assertion: z.record(z.unknown()), explanation: z.string() });
