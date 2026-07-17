import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { workerJobSchema } from '@taskos/execution-contracts';
import { createDatabaseClient } from '@taskos/database';
import { demoCreateInvestigationInput } from '@taskos/shared-types';
import { describe, expect, it } from 'vitest';
import { DaytonaClient } from '../../../integrations/daytona/daytona.client.js';
import { DaytonaSandboxProvider } from '../../../integrations/daytona/daytona-sandbox.service.js';
import { LocalEvidenceMetadataService } from '../../evidence/local-evidence-metadata.service.js';
import { InvestigationPlanningService } from '../../experiments/services/investigation-planning.service.js';
import { InvestigationRepository } from '../../investigations/investigations.repository.js';
import { InvestigationService } from '../../investigations/investigations.service.js';
import { DaytonaPlaywrightWorkerExecutor } from '../daytona-worker-executor.service.js';
import { InvestigationOrchestratorService } from '../investigation-orchestrator.service.js';
import { WorkerJobFactoryService } from '../worker-job-factory.service.js';

const repositoryRoot = fileURLToPath(new URL('../../../../../..', import.meta.url));
if (!process.env.DAYTONA_API_KEY && existsSync(resolve(repositoryRoot, '.env'))) loadEnvFile(resolve(repositoryRoot, '.env'));
const enabled = process.env.RUN_DAYTONA_INTEGRATION_TESTS === 'true';
const suite = enabled ? describe : describe.skip;

suite('live Daytona isolated worker execution', () => {
  it('runs one healthy WorkerJob in one EU sandbox and deletes it', { timeout: 360_000 }, async () => {
    if (!process.env.DAYTONA_API_KEY) throw new Error('RUN_DAYTONA_INTEGRATION_TESTS requires DAYTONA_API_KEY');
    const localEvidenceRoot = await mkdtemp(resolve(tmpdir(), 'taskos-daytona-live-'));
    const fixture = workerJobSchema.parse(JSON.parse(await readFile(resolve(repositoryRoot, 'workers/playwright-runner/fixtures/normal-checkout.job.json'), 'utf8')));
    const output = resolve(localEvidenceRoot, 'live-investigation/live-world/live-experiment/attempt-1');
    const client = new DaytonaClient({
      apiKey: process.env.DAYTONA_API_KEY,
      target: 'eu',
      ...(process.env.DAYTONA_API_URL ? { apiUrl: process.env.DAYTONA_API_URL } : {}),
      ...(process.env.DAYTONA_SNAPSHOT ? { snapshot: process.env.DAYTONA_SNAPSHOT } : {}),
    });
    const executor = new DaytonaPlaywrightWorkerExecutor(new DaytonaSandboxProvider(client), {
      target: 'eu',
      autoDelete: true,
      timeoutSeconds: Number(process.env.DAYTONA_SANDBOX_TIMEOUT_SECONDS ?? 300),
      evidenceRoot: localEvidenceRoot,
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
    const events: string[] = [];
    const response = await executor.execute({ ...fixture, workerId: 'daytona-live-worker', experimentId: 'daytona-live-experiment', worldId: 'daytona-live-world', evidence: { ...fixture.evidence, outputDirectory: output } }, {
      investigationId: 'daytona-live-investigation',
      worldId: 'daytona-live-world',
      experimentId: 'daytona-live-experiment',
      workerId: 'daytona-live-worker',
      evidenceDirectory: output,
      emitEvent: async ({ phase }) => { events.push(phase); },
    });
    console.log(JSON.stringify({ providerMetadata: response.providerMetadata, status: response.result.status, exitCode: response.exitCode, metrics: response.result.metrics, evidence: response.result.evidence, events }, null, 2));
    expect(response.exitCode).toBe(0);
    expect(response.result.status).toBe('PASSED');
    expect(response.result.metrics.paymentRequestCount).toBe(1);
    expect(response.result.metrics.orderRequestCount).toBe(1);
    expect(response.result.invariantEvaluations.every(({ passed }) => passed)).toBe(true);
    expect(response.providerMetadata).toMatchObject({ provider: 'DAYTONA', target: 'eu', cleanupOutcome: 'DELETED' });
    expect(existsSync(response.result.evidence.manifestPath)).toBe(true);
    expect(existsSync(response.result.evidence.tracePath!)).toBe(true);
    expect(events).toContain('sandbox_deleted');
  });

  it('persists one real Daytona execution through the existing investigation flow', { timeout: 360_000 }, async () => {
    if (!process.env.DAYTONA_API_KEY) throw new Error('RUN_DAYTONA_INTEGRATION_TESTS requires DAYTONA_API_KEY');
    const database = createDatabaseClient();
    const evidenceRoot = await mkdtemp(resolve(tmpdir(), 'taskos-daytona-persisted-'));
    const repository = new InvestigationRepository(database);
    const client = new DaytonaClient({
      apiKey: process.env.DAYTONA_API_KEY,
      target: 'eu',
      ...(process.env.DAYTONA_API_URL ? { apiUrl: process.env.DAYTONA_API_URL } : {}),
      ...(process.env.DAYTONA_SNAPSHOT ? { snapshot: process.env.DAYTONA_SNAPSHOT } : {}),
    });
    const executor = new DaytonaPlaywrightWorkerExecutor(new DaytonaSandboxProvider(client), {
      target: 'eu', autoDelete: true,
      timeoutSeconds: Number(process.env.DAYTONA_SANDBOX_TIMEOUT_SECONDS ?? 300),
      evidenceRoot,
      demoStoreDistPath: resolve(repositoryRoot, 'apps/demo-store/dist'),
      workerBundlePath: resolve(repositoryRoot, 'workers/playwright-runner/bundle'),
      workspacePath: '/home/daytona/taskos', demoStorePath: '/home/daytona/taskos/demo-store', workerPath: '/home/daytona/taskos/worker', inputPath: '/home/daytona/taskos/input', outputPath: '/home/daytona/taskos/output', demoStorePort: 4174,
      ...(process.env.DAYTONA_SNAPSHOT ? { snapshot: process.env.DAYTONA_SNAPSHOT } : {}),
    });
    const orchestrator = new InvestigationOrchestratorService(repository, executor, new WorkerJobFactoryService(evidenceRoot, resolve(repositoryRoot, 'demo/fixtures/checkout-journey.json')), new LocalEvidenceMetadataService(evidenceRoot));
    const service = new InvestigationService(repository, new InvestigationPlanningService({ requestedProvider: 'deterministic', fallbackEnabled: true, maximumWorlds: 8, maximumVariables: 6, maximumAssumptions: 10, maximumWarnings: 20, timeoutMs: 30_000, maxProviderAttempts: 1, maxOutputTokens: 3_000 }), orchestrator);
    let investigationId: string | undefined; let workerIds: string[] = [];
    try {
      const input = { ...demoCreateInvestigationInput, scenario: { ...demoCreateInvestigationInput.scenario, controls: { ...demoCreateInvestigationInput.scenario.controls, maximumWorlds: 1, maximumConcurrentWorkers: 1 } } };
      const created = await service.create({ userId: 'user_demo_taskos', organisationId: 'organisation_demo_taskos', role: 'OWNER', tokenVersion: 0 }, input); investigationId = created.id;
      const deadline = Date.now() + 240_000; let progress = created;
      while (!['COMPLETED', 'FAILED'].includes(progress.status) && Date.now() < deadline) { await new Promise((resolveWait) => setTimeout(resolveWait, 500)); progress = await service.get('organisation_demo_taskos', created.id); }
      expect(progress.status).toBe('COMPLETED');
      const persisted = await database.investigation.findUniqueOrThrow({ where: { id: created.id }, include: { worlds: true, experiments: { include: { attempts: { include: { worker: true } }, evaluations: true, artifacts: true } }, events: true } });
      const attempt = persisted.experiments[0]?.attempts[0];
      if (!attempt?.worker) throw new Error('Persisted Daytona attempt or worker is missing');
      workerIds = [attempt.worker.id];
      const result = attempt.result as Record<string, unknown>;
      expect(persisted.worlds).toHaveLength(1);
      expect(attempt.provider).toBe('DAYTONA');
      expect(attempt.worker.providerId).toBe('DAYTONA');
      expect(attempt.worker.metadata).toMatchObject({ provider: 'DAYTONA', target: 'eu', cleanupOutcome: 'DELETED' });
      expect(result).toMatchObject({ status: 'PASSED', metrics: { paymentRequestCount: 1, orderRequestCount: 1 } });
      expect(persisted.experiments[0]?.evaluations).toHaveLength(2);
      expect(persisted.experiments[0]?.evaluations.every(({ passed }) => passed)).toBe(true);
      expect(persisted.experiments[0]?.artifacts.length).toBeGreaterThanOrEqual(5);
      expect(persisted.events.some(({ data }) => JSON.stringify(data).includes('sandbox_deleted'))).toBe(true);
      console.log(JSON.stringify({ investigationId: created.id, worldId: persisted.worlds[0]?.id, workerId: attempt.worker.id, sandbox: attempt.worker.metadata, status: progress.status, evidenceCount: persisted.experiments[0]?.artifacts.length }, null, 2));
    } finally {
      if (investigationId) await database.investigation.delete({ where: { id: investigationId } }).catch(() => undefined);
      if (workerIds.length) await database.worker.deleteMany({ where: { id: { in: workerIds } } });
      await database.$disconnect();
    }
  });
});
