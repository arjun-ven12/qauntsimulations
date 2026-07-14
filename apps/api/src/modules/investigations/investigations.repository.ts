import type { DatabaseClient, Prisma } from '@taskos/database';
import type { CreateWithPlanInput, InvestigationSnapshot } from './investigations.types.js';

export class InvestigationRepository {
  constructor(private readonly database: DatabaseClient) {}
  async validateScope(organisationId: string, projectId: string, input: { environmentId: string; journeyId: string; scenarioId: string }): Promise<boolean> {
    const [project, environment, journey, scenario] = await Promise.all([
      this.database.project.findFirst({ where: { id: projectId, organisationId, deletedAt: null }, select: { id: true } }),
      this.database.environment.findFirst({ where: { id: input.environmentId, projectId, deletedAt: null }, select: { id: true } }),
      this.database.journey.findFirst({ where: { id: input.journeyId, projectId, deletedAt: null }, select: { id: true } }),
      this.database.scenario.findFirst({ where: { id: input.scenarioId, projectId, deletedAt: null }, select: { id: true } }),
    ]); return Boolean(project && environment && journey && scenario);
  }
  async createWithPlan(input: CreateWithPlanInput): Promise<string> {
    return this.database.$transaction(async (transaction: Prisma.TransactionClient) => {
      const investigation = await transaction.investigation.create({ data: { organisationId: input.organisationId, projectId: input.projectId, environmentId: input.environmentId, journeyId: input.journeyId, scenarioId: input.scenarioId, ...(input.safetyPolicyId ? { safetyPolicyId: input.safetyPolicyId } : {}), name: input.name, status: 'PLANNING', startedAt: new Date() } });
      const plan = await transaction.experimentPlan.create({ data: { investigationId: investigation.id, journeyId: input.journeyId, scenarioId: input.scenarioId, provider: input.plan.aiProvider, plan: input.plan as unknown as Prisma.InputJsonValue, planningExplanation: input.plan.planningExplanation, estimatedComputeUnits: input.plan.estimatedComputeUnits } });
      await transaction.world.createMany({ data: input.plan.worlds.map((world) => ({ investigationId: investigation.id, experimentPlanId: plan.id, configuration: world as unknown as Prisma.InputJsonValue, reason: world.reason, randomSeed: world.randomSeed })) });
      await transaction.investigationEvent.createMany({ data: [{ investigationId: investigation.id, type: 'plan_created', data: { provider: input.plan.aiProvider } }, ...input.plan.worlds.map((world) => ({ investigationId: investigation.id, type: 'world_generated' as const, data: { worldId: world.worldId, reason: world.reason } }))] });
      await transaction.investigation.update({ where: { id: investigation.id }, data: { status: 'PLAN_READY' } }); return investigation.id;
    });
  }
  find(organisationId: string, id: string): Promise<InvestigationSnapshot | null> { return this.database.investigation.findFirst({ where: { id, organisationId }, include: { plans: { orderBy: { version: 'desc' }, take: 1, select: { plan: true } }, worlds: { orderBy: { createdAt: 'asc' }, select: { id: true, status: true, configuration: true, createdAt: true, updatedAt: true } }, events: { orderBy: { occurredAt: 'desc' }, take: 20 }, findings: { orderBy: { createdAt: 'desc' } }, experiments: { select: { status: true } } } }) as Promise<InvestigationSnapshot | null>; }
  async cancel(organisationId: string, id: string): Promise<boolean> { const result = await this.database.investigation.updateMany({ where: { id, organisationId, status: { notIn: ['COMPLETED', 'PARTIALLY_COMPLETED', 'FAILED', 'CANCELLED'] } }, data: { status: 'CANCELLED', completedAt: new Date() } }); return result.count > 0; }
}
