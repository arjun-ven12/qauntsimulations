import type { ExperimentPlan, WorldConfig } from '@taskos/shared-types';
import type { AIProvider, CompiledInvariant } from '../../contracts/ai-provider.js';
import type { EvidenceBackedExplanation, EvidenceSummaryRequest, FindingExplanationRequest } from '../../contracts/explanation.types.js';
import type { FollowUpRequest, PlanningRequest } from '../../contracts/planner.types.js';
import type { KimiClient } from './kimi.client.js';

export class KimiProvider implements AIProvider {
  readonly name = 'KIMI' as const;
  constructor(private readonly client: KimiClient) { void this.client; }
  private unavailable(): never { throw new Error('Kimi provider adapter is scaffolded but not implemented'); }
  generateExperimentPlan(_request: PlanningRequest): Promise<ExperimentPlan> { return Promise.reject(this.unavailable()); }
  compileInvariant(_description: string): Promise<CompiledInvariant> { return Promise.reject(this.unavailable()); }
  explainFinding(_request: FindingExplanationRequest): Promise<EvidenceBackedExplanation> { return Promise.reject(this.unavailable()); }
  generateFollowUpExperiments(_request: FollowUpRequest): Promise<WorldConfig[]> { return Promise.reject(this.unavailable()); }
  summariseEvidence(_request: EvidenceSummaryRequest): Promise<EvidenceBackedExplanation> { return Promise.reject(this.unavailable()); }
}
