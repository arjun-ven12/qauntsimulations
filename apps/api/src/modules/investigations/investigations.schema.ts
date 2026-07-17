import { createInvestigationInputSchema } from '@taskos/shared-types';

export const createInvestigationSchema = createInvestigationInputSchema;
export const createProjectInvestigationSchema = createInvestigationInputSchema.innerType().omit({ projectId: true });
