import { z } from 'zod';
import { faultTypeSchema } from '@taskos/shared-types';

export const worldPackManifestSchema = z.object({
  identifier: z.string(), version: z.string(), name: z.string(), description: z.string(),
  supportedJourneys: z.array(z.object({ id: z.string(), name: z.string(), steps: z.array(z.record(z.unknown())) })),
  scenarioTemplates: z.array(z.object({ id: z.string(), name: z.string(), prompt: z.string(), controls: z.record(z.unknown()) })),
  supportedActors: z.array(z.object({ id: z.string(), name: z.string(), behaviour: z.record(z.unknown()) })),
  supportedFaultTypes: z.array(faultTypeSchema),
  supportedInvariants: z.array(z.object({ id: z.string(), name: z.string(), description: z.string(), assertion: z.record(z.unknown()) })),
  safetyConstraints: z.array(z.object({ type: z.string(), value: z.unknown(), description: z.string() })),
  evidenceRequirements: z.array(z.string()), defaultExperimentVariables: z.record(z.array(z.unknown())),
});
export type WorldPackManifest = z.infer<typeof worldPackManifestSchema>;

export interface WorldPack { manifest: WorldPackManifest }
