import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '@taskos/database';
import { demoCreateInvestigationInput, investigationProgressSchema } from '@taskos/shared-types';
import { afterEach, describe, expect, it } from 'vitest';
import { createSandboxProvider } from '../../../integrations/daytona/daytona-sandbox.service.js';
import { LocalEvidenceMetadataService } from '../../evidence/local-evidence-metadata.service.js';
import { DeterministicExperimentPlanService } from '../../experiments/services/deterministic-experiment-plan.service.js';
import { InvestigationRepository } from '../../investigations/investigations.repository.js';
import { InvestigationService } from '../../investigations/investigations.service.js';
import { DaytonaFleetCapacityManager } from '../daytona-fleet-capacity-manager.js';
import { DaytonaPlaywrightWorkerExecutor } from '../daytona-worker-executor.service.js';
import { DaytonaWorkerFleet } from '../daytona-worker-fleet.service.js';
import { InvestigationOrchestratorService } from '../investigation-orchestrator.service.js';
import { WorkerJobFactoryService } from '../worker-job-factory.service.js';

const repositoryRoot = fileURLToPath(new URL('../../../../../..', import.meta.url));
if (!process.env.DAYTONA_API_KEY && existsSync(resolve(repositoryRoot, '.env'))) loadEnvFile(resolve(repositoryRoot, '.env'));
const enabled = process.env.RUN_DAYTONA_FLEET_INTEGRATION_TESTS === 'true';
const suite = enabled ? describe : describe.skip;

suite('live Daytona fleet orchestration', () => {
  let investigationId: string | undefined;
  let workerIds: string[] = [];
  const database = createDatabaseClient();

  afterEach(async () => {
    if (investigationId) await database.investigation.delete({ where: { id: investigationId } }).catch(() => undefined);
    if (workerIds.length) await database.worker.deleteMany({ where: { id: { in: workerIds } } }).catch(() => undefined);
    await database.$disconnect();
  });

  it('runs four worlds with at most two active Daytona sandboxes and deletes all sandboxes', { timeout: 420_000 }, async () => {
    if (!process.env.DAYTONA_API_KEY) throw new Error('RUN_DAYTONA_FLEET_INTEGRATION_TESTS requires DAYTONA_API_KEY');
    expect(Number(process.env.DAYTONA_MAX_CONCURRENT_SANDBOXES ?? 2)).toBe(2);
    expect(Number(process.env.DAYTONA_MAX_SANDBOXES_PER_INVESTIGATION ?? 2)).toBe(2);

    const provider = createSandboxProvider({
      daytonaApiKey: process.env.DAYTONA_API_KEY,
      target: 'eu',
      ...(process.env.DAYTONA_API_URL ? { daytonaApiUrl: process.env.DAYTONA_API_URL } : {}),
      ...(process.env.DAYTONA_SNAPSHOT ? { snapshot: process.env.DAYTONA_SNAPSHOT } : {}),
    });
    const initialSandboxes = [];
    if (provider.listSandboxes) {
      for await (const sandbox of provider.listSandboxes({ project: 'taskos-worldlab', purpose: 'isolated-playwright-world' })) initialSandboxes.push(sandbox.id);
    }
    expect(initialSandboxes).toHaveLength(0);

    const evidenceRoot = await mkdtemp(resolve(tmpdir(), 'taskos-daytona-fleet-'));
    const repository = new InvestigationRepository(database);
    const executor = new DaytonaPlaywrightWorkerExecutor(provider, {
      target: 'eu',
      autoDelete: true,
      timeoutSeconds: Number(process.env.DAYTONA_SANDBOX_TIMEOUT_SECONDS ?? 300),
      evidenceRoot,
      demoStoreDistPath: resolve(repositoryRoot, 'apps/demo-store/dist'),
      workerBundlePath: resolve(repositoryRoot, 'workers/playwright-runner/bundle'),
      workspacePath: '/home/daytona/taskos',
      demoStorePath: '/home/daytona/taskos/demo-store',
      workerPath: '/home/daytona/taskos/worker',
      inputPath: '/home/daytona/taskos/input',
      outputPath: '/home/daytona/taskos/output',
      demoStorePort: 4174,
      ...(process.env.DAYTONA_SNAPSHOT ? { snapshot: process.env.DAYTONA_SNAPSHOT } : {}),
    });
    const fleet = new DaytonaWorkerFleet(new DaytonaFleetCapacityManager(2));
    const orchestrator = new InvestigationOrchestratorService(
      repository,
      executor,
      new WorkerJobFactoryService(evidenceRoot, resolve(repositoryRoot, 'demo/fixtures/checkout-journey.json')),
      new LocalEvidenceMetadataService(evidenceRoot),
      undefined,
      fleet,
      {
        perInvestigationLimit: 2,
        serverWideLimit: 2,
        maximumAttempts: 2,
        retryBaseDelayMs: 1_000,
        retryMaximumDelayMs: 10_000,
        maximumTotalSandboxCreations: 8,
        maximumInvestigationDurationSeconds: 1_200,
      },
    );
    const service = new InvestigationService(repository, new DeterministicExperimentPlanService(2), orchestrator);
    const created = await service.create('organisation_demo_taskos', demoCreateInvestigationInput);
    investigationId = created.id;
    const deadline = Date.now() + 390_000;
    let progress = created;
    while (!['COMPLETED', 'FAILED'].includes(progress.status) && Date.now() < deadline) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
      progress = await service.get('organisation_demo_taskos', created.id);
    }
    expect(investigationProgressSchema.parse(progress)).toEqual(progress);
    expect(progress.status).toBe('COMPLETED');
    expect(progress.progress).toMatchObject({ totalWorlds: 4, queued: 0, running: 0, flaky: 0 });
    expect(progress.progress.passed).toBeGreaterThanOrEqual(2);
    expect(progress.progress.failed).toBeGreaterThanOrEqual(1);

    const persisted = await database.investigation.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        worlds: true,
        experiments: { include: { attempts: { include: { worker: true } }, evaluations: true, artifacts: true } },
        findings: true,
        events: true,
      },
    });
    workerIds = persisted.experiments.flatMap((experiment) => experiment.attempts.map((attempt) => attempt.workerId).filter((id): id is string => Boolean(id)));
    const attempts = persisted.experiments.flatMap((experiment) => experiment.attempts);
    const executionSummaries = attempts.map((attempt) => {
      const result = attempt.result;
      const metrics = result && typeof result === 'object' && !Array.isArray(result) && 'metrics' in result && result.metrics && typeof result.metrics === 'object' && !Array.isArray(result.metrics) ? result.metrics : {};
      return {
        attemptId: attempt.id,
        workerId: attempt.workerId,
        status: result && typeof result === 'object' && !Array.isArray(result) && 'status' in result ? result.status : attempt.status,
        durationMs: result && typeof result === 'object' && !Array.isArray(result) && 'durationMs' in result ? result.durationMs : attempt.durationMs,
        paymentRequestCount: 'paymentRequestCount' in metrics ? metrics.paymentRequestCount : undefined,
        orderRequestCount: 'orderRequestCount' in metrics ? metrics.orderRequestCount : undefined,
        consoleErrorCount: 'consoleErrorCount' in metrics ? metrics.consoleErrorCount : undefined,
      };
    });
    const sandboxIds = attempts.flatMap((attempt) => {
      const metadata = attempt.worker?.metadata;
      return metadata && typeof metadata === 'object' && !Array.isArray(metadata) && typeof metadata.sandboxId === 'string' ? [metadata.sandboxId] : [];
    });
    expect(persisted.worlds).toHaveLength(4);
    expect(persisted.experiments).toHaveLength(4);
    expect(attempts.length).toBeGreaterThanOrEqual(4);
    expect(persisted.experiments.flatMap((experiment) => experiment.artifacts).length).toBeGreaterThan(0);
    expect(persisted.findings.length).toBeGreaterThanOrEqual(1);
    expect(fleet.getSnapshot().peakConcurrency).toBeLessThanOrEqual(2);

    const remainingSandboxes = await waitForNoTaskosSandboxes(provider);
    console.log(JSON.stringify({ investigationId: created.id, worldIds: persisted.worlds.map(({ id }) => id), workerIds, attemptIds: attempts.map(({ id }) => id), sandboxIds, peakConcurrency: fleet.getSnapshot().peakConcurrency, counters: progress.progress, executionSummaries, findingCount: persisted.findings.length, remainingSandboxes }, null, 2));
    expect(remainingSandboxes).toHaveLength(0);
  });
});

async function waitForNoTaskosSandboxes(provider: ReturnType<typeof createSandboxProvider>): Promise<string[]> {
  const deadline = Date.now() + 30_000;
  let remaining: string[] = [];
  do {
    remaining = [];
    if (provider.listSandboxes) {
      for await (const sandbox of provider.listSandboxes({ project: 'taskos-worldlab', purpose: 'isolated-playwright-world' })) remaining.push(sandbox.id);
    }
    if (remaining.length === 0) return remaining;
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
  } while (Date.now() < deadline);
  return remaining;
}
