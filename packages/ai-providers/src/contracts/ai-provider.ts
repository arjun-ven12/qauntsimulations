import type { ExperimentPlan, WorldConfig } from '@taskos/shared-types';
import type { EvidenceBackedExplanation, EvidenceSummaryRequest, FindingExplanationRequest } from './explanation.types.js';
import type { FollowUpRequest, PlanningRequest } from './planner.types.js';

export interface CompiledInvariant { name: string; assertion: Record<string, unknown>; explanation: string }
export interface AIProvider {
  readonly name: 'OPENAI' | 'KIMI' | 'MOCK';
  generateExperimentPlan(request: PlanningRequest): Promise<ExperimentPlan>;
  compileInvariant(description: string): Promise<CompiledInvariant>;
  explainFinding(request: FindingExplanationRequest): Promise<EvidenceBackedExplanation>;
  generateFollowUpExperiments(request: FollowUpRequest): Promise<WorldConfig[]>;
  summariseEvidence(request: EvidenceSummaryRequest): Promise<EvidenceBackedExplanation>;
}
