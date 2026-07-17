import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { workerJobSchema, type WorkerJob, type WorkerResult } from '@taskos/execution-contracts';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runWorker } from '../../src/runner.js';

const baseUrl = 'http://localhost:5174';
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const fixtureDirectory = fileURLToPath(new URL('../../fixtures', import.meta.url));
let demoStore: ChildProcess | undefined;

async function isDemoStoreReady(): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/test/config`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForDemoStore(): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (await isDemoStoreReady()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Demo store did not become ready on port 5174');
}

async function loadJob(name: string, outputDirectory: string): Promise<WorkerJob> {
  const raw = JSON.parse(await readFile(join(fixtureDirectory, `${name}.job.json`), 'utf8')) as unknown;
  const job = workerJobSchema.parse(raw);
  return { ...job, evidence: { ...job.evidence, outputDirectory } };
}

async function assertArtifacts(result: WorkerResult, outputDirectory: string): Promise<void> {
  for (const path of [
    join(outputDirectory, 'manifest.json'),
    join(outputDirectory, 'worker-result.json'),
    join(outputDirectory, 'trace', 'trace.zip'),
    join(outputDirectory, 'console', 'console.json'),
    join(outputDirectory, 'network', 'network.json'),
  ]) expect(existsSync(path), path).toBe(true);
  expect(result.evidence.screenshotPaths.length).toBeGreaterThanOrEqual(5);
}

describe('real demo-store worker integration', () => {
  const runnable = existsSync(chromium.executablePath()) ? it : it.skip;

  beforeAll(async () => {
    if (await isDemoStoreReady()) return;
    demoStore = spawn('pnpm', ['--filter', '@taskos/demo-store', 'dev'], {
      cwd: repositoryRoot,
      env: process.env,
      stdio: 'ignore',
    });
    await waitForDemoStore();
  });

  afterAll(() => {
    demoStore?.kill('SIGTERM');
  });

  runnable('proves reset isolation and healthy and defective checkout outcomes', { timeout: 60_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'taskos-demo-integration-'));

    const normalOutput = join(root, 'normal-checkout');
    const normal = await runWorker(await loadJob('normal-checkout', normalOutput));
    expect(normal.status).toBe('PASSED');
    expect(normal.journey.completed).toBe(true);
    expect(normal.metrics).toMatchObject({ paymentRequestCount: 1, orderRequestCount: 1 });
    expect(normal.invariantEvaluations.every((evaluation) => evaluation.passed)).toBe(true);
    await assertArtifacts(normal, normalOutput);

    const normalManifest = JSON.parse(await readFile(join(normalOutput, 'manifest.json'), 'utf8')) as { setupOperations: Array<{ succeeded: boolean }> };
    expect(normalManifest.setupOperations).toHaveLength(2);
    expect(normalManifest.setupOperations.every((operation) => operation.succeeded)).toBe(true);

    const healthyOutput = join(root, 'healthy-double-submit');
    const healthy = await runWorker(await loadJob('healthy-double-submit', healthyOutput));
    expect(healthy.status).toBe('PASSED');
    expect(healthy.journey.completed).toBe(true);
    expect(healthy.metrics).toMatchObject({ checkoutInteractionCount: 2, paymentRequestCount: 1, orderRequestCount: 1 });
    await assertArtifacts(healthy, healthyOutput);

    const healthyState = await fetch(`${baseUrl}/api/test/state`).then(async (response) => response.json()) as { requestCounters: { payments: number; orders: number } };
    expect(healthyState.requestCounters).toEqual({ payments: 1, orders: 1 });

    const defectiveOutput = join(root, 'duplicate-submission');
    const defective = await runWorker(await loadJob('duplicate-submission', defectiveOutput));
    expect(defective.status).toBe('INVARIANT_VIOLATION');
    expect(defective.journey.completed).toBe(true);
    expect(defective.metrics).toMatchObject({ checkoutInteractionCount: 2, paymentRequestCount: 2, orderRequestCount: 2 });
    expect(defective.invariantEvaluations).toHaveLength(2);
    expect(defective.invariantEvaluations.every((evaluation) => !evaluation.passed)).toBe(true);
    await assertArtifacts(defective, defectiveOutput);

    const defectiveState = await fetch(`${baseUrl}/api/test/state`).then(async (response) => response.json()) as { requestCounters: { payments: number; orders: number } };
    expect(defectiveState.requestCounters).toEqual({ payments: 2, orders: 2 });
  });
});
