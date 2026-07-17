import { existsSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';
import { createDatabaseClient } from '@taskos/database';
import { demoCreateInvestigationInput } from '@taskos/shared-types';
import { afterEach, describe, expect, it } from 'vitest';
import { createSandboxProvider } from '../../../integrations/daytona/daytona-sandbox.service.js';
import { LocalEvidenceMetadataService } from '../../evidence/local-evidence-metadata.service.js';
import { InvestigationPlanningService } from '../../experiments/services/investigation-planning.service.js';
import { InvestigationRepository } from '../../investigations/investigations.repository.js';
import { InvestigationService } from '../../investigations/investigations.service.js';
import { DaytonaFleetCapacityManager } from '../daytona-fleet-capacity-manager.js';
import { DaytonaPlaywrightWorkerExecutor } from '../daytona-worker-executor.service.js';
import { DaytonaWorkerFleet } from '../daytona-worker-fleet.service.js';
import { InvestigationOrchestratorService } from '../investigation-orchestrator.service.js';
import { WorkerJobFactoryService } from '../worker-job-factory.service.js';

const repositoryRoot = fileURLToPath(new URL('../../../../../..', import.meta.url));
if (!process.env.DAYTONA_API_KEY && existsSync(resolve(repositoryRoot, '.env'))) loadEnvFile(resolve(repositoryRoot, '.env'));
const enabled = process.env.RUN_DAYTONA_ADAPTIVE_INTEGRATION_TESTS === 'true';
const suite = enabled ? describe : describe.skip;

suite('live Daytona adaptive reproduction', () => {
  let investigationId: string | undefined;
  const database = createDatabaseClient();

  afterEach(async () => {
    if (investigationId) await database.investigation.delete({ where: { id: investigationId } }).catch(() => undefined);
    await database.$disconnect();
  });

  it('runs initial worlds, appends adaptive worlds, updates finding, and deletes all sandboxes', { timeout: 720_000 }, async () => {
    if (!process.env.DAYTONA_API_KEY) throw new Error('RUN_DAYTONA_ADAPTIVE_INTEGRATION_TESTS requires DAYTONA_API_KEY');
    const provider = createSandboxProvider({
      daytonaApiKey: process.env.DAYTONA_API_KEY,
      target: 'eu',
      ...(process.env.DAYTONA_API_URL ? { daytonaApiUrl: process.env.DAYTONA_API_URL } : {}),
      ...(process.env.DAYTONA_SNAPSHOT ? { snapshot: process.env.DAYTONA_SNAPSHOT } : {}),
    });
    expect(await taskosSandboxIds(provider)).toHaveLength(0);

    const evidenceRoot = await mkdtemp(resolve(tmpdir(), 'taskos-daytona-adaptive-'));
    const repository = new InvestigationRepository(database);
    const fleet = new DaytonaWorkerFleet(new DaytonaFleetCapacityManager(2));
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
        maximumTotalSandboxCreations: 12,
        maximumInvestigationDurationSeconds: 1_200,
      },
      {
        enabled: true,
        maximumFindingsPerInvestigation: 1,
        maximumFollowupWorlds: 5,
        maximumTotalWorlds: 12,
        exactReproductionAttempts: 1,
        confidenceInitial: 0.75,
        confidenceMaximum: 0.95,
        minimumEvidenceWorlds: 2,
        timeoutSeconds: 900,
      },
    );
    const service = new InvestigationService(repository, new InvestigationPlanningService({ requestedProvider: 'deterministic', fallbackEnabled: true, maximumWorlds: 8, maximumVariables: 6, maximumAssumptions: 10, maximumWarnings: 20, timeoutMs: 30_000, maxProviderAttempts: 1, maxOutputTokens: 3_000 }), orchestrator);
    const created = await service.create('organisation_demo_taskos', demoCreateInvestigationInput);
    investigationId = created.id;

    let progress = created;
    const deadline = Date.now() + 690_000;
    while (!['COMPLETED', 'FAILED'].includes(progress.status) && Date.now() < deadline) {
      await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
      progress = await service.get('organisation_demo_taskos', created.id);
    }
    expect(progress.status).toBe('COMPLETED');
    expect(progress.progress.totalWorlds).toBe(9);
    expect(progress.progress.queued).toBe(0);
    expect(progress.progress.running).toBe(0);
    expect(fleet.getSnapshot().peakConcurrency).toBeLessThanOrEqual(2);

    const persisted = await database.investigation.findUniqueOrThrow({
      where: { id: created.id },
      include: {
        worlds: true,
        experiments: { include: { attempts: { include: { worker: true } }, evaluations: true, artifacts: true } },
        findings: true,
        events: true,
      },
    });
    const finding = persisted.findings[0];
    expect(persisted.worlds).toHaveLength(9);
    expect(finding).toBeTruthy();
    const causal = finding?.causalConditions && typeof finding.causalConditions === 'object' && !Array.isArray(finding.causalConditions) ? finding.causalConditions as Record<string, unknown> : {};
    expect(causal.causalStatus).toMatch(/REPRODUCED|SUPPORTED|INCONCLUSIVE/);
    expect(finding?.reproductionCount).toBeGreaterThanOrEqual(1);
    expect(persisted.experiments.flatMap((experiment) => experiment.artifacts).length).toBeGreaterThan(0);

    const remainingSandboxes = await waitForNoTaskosSandboxes(provider);
    console.log(JSON.stringify({
      investigationId: created.id,
      worldCount: persisted.worlds.length,
      adaptiveWorlds: persisted.worlds.filter((world) => {
        const configuration = world.configuration;
        return configuration && typeof configuration === 'object' && !Array.isArray(configuration) && (configuration as Record<string, unknown>).origin === 'ADAPTIVE_REPRODUCTION';
      }).map(({ id }) => id),
      workerIds: persisted.experiments.flatMap((experiment) => experiment.attempts.map((attempt) => attempt.workerId).filter(Boolean)),
      attemptIds: persisted.experiments.flatMap((experiment) => experiment.attempts.map(({ id }) => id)),
      sandboxIds: persisted.experiments.flatMap((experiment) => experiment.attempts.flatMap((attempt) => {
        const metadata = attempt.worker?.metadata;
        return metadata && typeof metadata === 'object' && !Array.isArray(metadata) && typeof metadata.sandboxId === 'string' ? [metadata.sandboxId] : [];
      })),
      progress: progress.progress,
      finding: { id: finding?.id, confidence: finding?.confidence, reproductionCount: finding?.reproductionCount, causalConditions: causal },
      peakConcurrency: fleet.getSnapshot().peakConcurrency,
      remainingSandboxes,
    }, null, 2));
    expect(remainingSandboxes).toHaveLength(0);
  });
});

async function taskosSandboxIds(provider: ReturnType<typeof createSandboxProvider>): Promise<string[]> {
  const ids: string[] = [];
  if (provider.listSandboxes) {
    for await (const sandbox of provider.listSandboxes({ project: 'taskos-worldlab', purpose: 'isolated-playwright-world' })) ids.push(sandbox.id);
  }
  return ids;
}

async function waitForNoTaskosSandboxes(provider: ReturnType<typeof createSandboxProvider>): Promise<string[]> {
  const deadline = Date.now() + 30_000;
  let remaining: string[] = [];
  do {
    remaining = await taskosSandboxIds(provider);
    if (remaining.length === 0) return remaining;
    await new Promise((resolveWait) => setTimeout(resolveWait, 2_000));
  } while (Date.now() < deadline);
  return remaining;
}
