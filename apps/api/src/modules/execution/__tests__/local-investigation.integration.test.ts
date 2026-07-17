import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvFile } from 'node:process';
import { createDatabaseClient } from '@taskos/database';
import { demoCreateInvestigationInput, investigationProgressSchema } from '@taskos/shared-types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalEvidenceMetadataService } from '../../evidence/local-evidence-metadata.service.js';
import { InvestigationPlanningService } from '../../experiments/services/investigation-planning.service.js';
import { InvestigationRepository } from '../../investigations/investigations.repository.js';
import { InvestigationService } from '../../investigations/investigations.service.js';
import { InvestigationOrchestratorService } from '../investigation-orchestrator.service.js';
import { LocalPlaywrightWorkerExecutor } from '../local-worker-executor.service.js';
import { WorkerJobFactoryService } from '../worker-job-factory.service.js';

const repositoryRoot = fileURLToPath(new URL('../../../../../..', import.meta.url));
const enabled = process.env.RUN_LOCAL_INVESTIGATION_INTEGRATION === '1';
const suite = enabled ? describe : describe.skip;
let demoStore: ChildProcess | undefined;

async function demoReady(): Promise<boolean> { try { return (await fetch('http://localhost:5174/api/test/config')).ok; } catch { return false; } }
async function waitForDemo(): Promise<void> { const deadline = Date.now() + 20_000; while (Date.now() < deadline) { if (await demoReady()) return; await new Promise((resolveWait) => setTimeout(resolveWait, 100)); } throw new Error('Demo store did not start'); }

suite('full local investigation orchestration', () => {
  beforeAll(async () => { if (await demoReady()) return; demoStore = spawn('pnpm', ['dev:demo'], { cwd: repositoryRoot, stdio: 'ignore' }); await waitForDemo(); });
  afterAll(() => demoStore?.kill('SIGTERM'));

  it('persists four real worker executions, evidence, evaluations, and one grouped finding', { timeout: 90_000 }, async () => {
    if (!process.env.DATABASE_URL) loadEnvFile(resolve(repositoryRoot, '.env'));
    const database = createDatabaseClient(); const evidenceRoot = await mkdtemp(resolve(tmpdir(), 'taskos-investigation-')); const repository = new InvestigationRepository(database);
    const orchestrator = new InvestigationOrchestratorService(repository, new LocalPlaywrightWorkerExecutor(evidenceRoot), new WorkerJobFactoryService(evidenceRoot, resolve(repositoryRoot, 'demo/fixtures/checkout-journey.json')), new LocalEvidenceMetadataService(evidenceRoot));
    const service = new InvestigationService(repository, new InvestigationPlanningService({ requestedProvider: 'deterministic', fallbackEnabled: true, maximumWorlds: 8, maximumVariables: 6, maximumAssumptions: 10, maximumWarnings: 20, timeoutMs: 30_000, maxProviderAttempts: 1, maxOutputTokens: 3_000 }), orchestrator);
    let investigationId: string | undefined; let workerIds: string[] = [];
    try {
      const created = await service.create('organisation_demo_taskos', demoCreateInvestigationInput); investigationId = created.id;
      const deadline = Date.now() + 75_000; let progress = created;
      while (!['COMPLETED', 'FAILED'].includes(progress.status) && Date.now() < deadline) { await new Promise((resolveWait) => setTimeout(resolveWait, 200)); progress = await service.get('organisation_demo_taskos', created.id); }
      expect(investigationProgressSchema.parse(progress)).toEqual(progress);
      expect(progress.status).toBe('COMPLETED');
      expect(progress.progress).toMatchObject({ totalWorlds: 4, queued: 0, running: 0 });
      expect(progress.progress.passed).toBeGreaterThanOrEqual(2);
      expect(progress.progress.failed).toBeGreaterThanOrEqual(1);
      expect((await service.worlds('organisation_demo_taskos', created.id))).toHaveLength(4);
      expect((await service.experiments('organisation_demo_taskos', created.id))).toHaveLength(4);
      const workers = await service.workers('organisation_demo_taskos', created.id); workerIds = workers.map(({ id }) => id);
      expect(workers).toHaveLength(4);
      expect((await service.evidence('organisation_demo_taskos', created.id)).length).toBeGreaterThan(0);
      expect((await service.findings('organisation_demo_taskos', created.id))).toHaveLength(1);
      const persisted = await database.investigation.findUniqueOrThrow({ where: { id: created.id }, include: { plans: true, worlds: true, experiments: { include: { attempts: true, evaluations: true, artifacts: true } }, events: { orderBy: { occurredAt: 'asc' } }, findings: true } });
      expect(persisted.plans).toHaveLength(1);
      expect(persisted.worlds).toHaveLength(4);
      expect(persisted.experiments).toHaveLength(4);
      expect(persisted.experiments.every((experiment) => experiment.attempts[0]?.result !== null)).toBe(true);
      expect(persisted.experiments.flatMap((experiment) => experiment.evaluations)).toHaveLength(8);
      expect(persisted.experiments.flatMap((experiment) => experiment.artifacts).length).toBeGreaterThan(0);
      expect(persisted.events.every((event, index) => index === 0 || event.occurredAt >= persisted.events[index - 1]!.occurredAt)).toBe(true);
      expect(persisted.findings).toHaveLength(1);
      expect(persisted.findings[0]?.reproductionCount).toBe(2);
    } finally {
      if (investigationId) await database.investigation.delete({ where: { id: investigationId } }).catch(() => undefined);
      if (workerIds.length) await database.worker.deleteMany({ where: { id: { in: workerIds } } });
      await database.$disconnect();
    }
  });
});
