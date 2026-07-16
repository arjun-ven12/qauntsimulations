import { createInvestigationInputSchema, type CreateInvestigationInput } from '@taskos/shared-types';
import { ApplicationError } from '../../core/errors/application-error.js';
import type { DeterministicExperimentPlanService } from '../experiments/services/deterministic-experiment-plan.service.js';
import type { InvestigationOrchestratorService } from '../execution/investigation-orchestrator.service.js';
import { mapEvidenceList, mapExperimentList, mapFindingList, mapProgress, mapWorkerList, mapWorldList } from './investigations.mapper.js';
import type { InvestigationRepository } from './investigations.repository.js';

type InvestigationServiceRepository = Pick<InvestigationRepository, 'validateCreationScope' | 'create' | 'progress' | 'listWorlds' | 'listExperiments' | 'listWorkers' | 'listEvidence' | 'listFindings' | 'cancel' | 'orchestrationContext'>;
type InvestigationStarter = Pick<InvestigationOrchestratorService, 'start'>;

export class InvestigationService {
  constructor(
    private readonly repository: InvestigationServiceRepository,
    private readonly planner: DeterministicExperimentPlanService,
    private readonly orchestrator: InvestigationStarter,
  ) {}

  async create(organisationId: string, raw: unknown, projectId?: string) {
    const candidate = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
    const input = createInvestigationInputSchema.parse({ ...candidate, ...(projectId ? { projectId } : {}) });
    const scope = await this.repository.validateCreationScope(organisationId, input);
    if (!scope) throw new ApplicationError('INVALID_INVESTIGATION_SCOPE', 'Project, environment, journey, scenario, or invariant is missing or unavailable to this organisation', 404);
    const plan = this.planner.create(input, scope.scenarioId);
    const id = await this.repository.create(input, scope, plan);
    const progress = await this.get(organisationId, id);
    setImmediate(() => this.orchestrator.start(id));
    return progress;
  }

  async get(organisationId: string, id: string) { return mapProgress(await this.requireProgress(organisationId, id)); }
  async worlds(organisationId: string, id: string) { await this.requireProgress(organisationId, id); return mapWorldList(await this.repository.listWorlds(organisationId, id)); }
  async experiments(organisationId: string, id: string) { await this.requireProgress(organisationId, id); return mapExperimentList(await this.repository.listExperiments(organisationId, id)); }
  async workers(organisationId: string, id: string) { await this.requireProgress(organisationId, id); return mapWorkerList(await this.repository.listWorkers(organisationId, id)); }
  async evidence(organisationId: string, id: string) { await this.requireProgress(organisationId, id); return mapEvidenceList(await this.repository.listEvidence(organisationId, id)); }
  async findings(organisationId: string, id: string) { await this.requireProgress(organisationId, id); return mapFindingList(await this.repository.listFindings(organisationId, id)); }
  async cancel(organisationId: string, id: string) { if (!(await this.repository.cancel(organisationId, id))) throw new ApplicationError('INVESTIGATION_NOT_CANCELLABLE', 'Investigation was not found or is already terminal', 409); return this.get(organisationId, id); }
  async plan(organisationId: string, id: string) { await this.requireProgress(organisationId, id); return (await this.repository.orchestrationContext(id))?.plan ?? null; }

  private async requireProgress(organisationId: string, id: string) {
    const record = await this.repository.progress(organisationId, id);
    if (!record) throw new ApplicationError('INVESTIGATION_NOT_FOUND', 'Investigation was not found', 404);
    return record;
  }
}

export type { CreateInvestigationInput };
