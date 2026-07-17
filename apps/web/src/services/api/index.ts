import type { InvestigationApi } from './investigation-api.js';
import { HttpInvestigationApi } from './http-investigation-api.js';
import { MockInvestigationApi } from './mock-investigation-api.js';
export const investigationApi: InvestigationApi =
  import.meta.env.VITE_USE_MOCK_API === 'false'
    ? new HttpInvestigationApi(import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api')
    : new MockInvestigationApi();
export type {
  CreateInvestigationInput,
  EvidenceArtifactResponse,
  EvidenceTextContentResponse,
  ExperimentPlanResponse,
  FindingDetail,
  InvestigationApi,
  InvestigationExperiment,
  InvestigationWorker,
  InvestigationWorld,
  PublicBusinessOutcome,
  PublicWorldExecutionState,
} from './investigation-api.js';
export { InvestigationApiError } from './investigation-api.js';
