import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { workerJobSchema, type WorkerJob, type WorkerResult } from '@taskos/execution-contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type {
  CommandResult,
  ProcessHandle,
  ProcessWaitOptions,
  SandboxCommand,
  SandboxDownload,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
  SandboxUpload,
} from '../../../integrations/daytona/daytona.types.js';
import { assertRemoteChild, localArtifactPath, sanitizeSandboxName } from '../daytona-paths.js';
import {
  DaytonaPlaywrightWorkerExecutor,
  daytonaWorkerJob,
  demoStoreCommand,
  sandboxEnvironment,
  sandboxWorkerJob,
  workerCommand,
  type DaytonaWorkerExecutorConfiguration,
} from '../daytona-worker-executor.service.js';
import { LocalPlaywrightWorkerExecutor } from '../local-worker-executor.service.js';
import { PortableRuntimeBundleService } from '../portable-runtime-bundle.service.js';
import { WorkerExecutorFactory } from '../worker-executor.factory.js';
import type { WorkerExecutor } from '../worker-executor.types.js';

const remoteOutput = '/workspace/taskos/output';
const iso = '2026-07-16T00:00:00.000Z';

function job(outputDirectory: string): WorkerJob {
  return workerJobSchema.parse({
    workerId: 'worker_test', experimentId: 'experiment_test', worldId: 'world_test',
    target: { baseUrl: 'http://localhost:5174', journeyPath: '/products/test-product' },
    testSetup: { reset: { method: 'POST', path: '/api/test/reset' }, configuration: { method: 'POST', path: '/api/test/config', body: { duplicateSubmissionBug: false, paymentDelayMs: 0 } } },
    browser: { engine: 'chromium', viewport: 'desktop', headless: true },
    journey: { id: 'checkout', name: 'Checkout', steps: [{ type: 'goto', path: '/products/test-product' }], successCondition: { type: 'visible', selector: '[data-testid="order-confirmation"]' } },
    world: { userProfile: 'normal', networkProfile: 'normal', latencyMs: 0, doubleSubmit: false, doubleSubmitIntervalMs: 100, randomSeed: 1, reason: 'test' },
    invariants: [{ id: 'payment', type: 'NO_DUPLICATE_PAYMENT', severity: 'CRITICAL' }, { id: 'order', type: 'NO_DUPLICATE_ORDER', severity: 'CRITICAL' }],
    evidence: { outputDirectory, screenshots: true, trace: true, console: true, network: true, video: false },
    limits: { timeoutMs: 10_000 },
  });
}

function result(status: WorkerResult['status']): WorkerResult {
  const failed = status === 'INVARIANT_VIOLATION';
  return {
    workerId: 'worker_test', experimentId: 'experiment_test', worldId: 'world_test', status,
    startedAt: iso, completedAt: iso, durationMs: 10,
    journey: { completed: true, completedSteps: 1, totalSteps: 1 },
    invariantEvaluations: [
      { invariantId: 'payment', type: 'NO_DUPLICATE_PAYMENT', passed: !failed, expected: { maximumPaymentRequests: 1 }, observed: { paymentRequests: failed ? 2 : 1 }, confidence: 1, evidenceReferences: ['network/network.json'], explanation: 'test' },
      { invariantId: 'order', type: 'NO_DUPLICATE_ORDER', passed: !failed, expected: { maximumOrders: 1 }, observed: { orderRequests: failed ? 2 : 1 }, confidence: 1, evidenceReferences: ['network/network.json'], explanation: 'test' },
    ],
    metrics: { requestCount: failed ? 4 : 2, failedRequestCount: 0, checkoutInteractionCount: 1, paymentRequestCount: failed ? 2 : 1, successfulPaymentResponseCount: failed ? 2 : 1, orderRequestCount: failed ? 2 : 1, successfulOrderResponseCount: failed ? 2 : 1, consoleErrorCount: 0 },
    evidence: { manifestPath: `${remoteOutput}/manifest.json`, tracePath: `${remoteOutput}/trace/trace.zip`, screenshotPaths: [`${remoteOutput}/screenshots/001.png`], consoleLogPath: `${remoteOutput}/console/console.json`, networkLogPath: `${remoteOutput}/network/network.json` },
    appliedFaults: [],
  };
}

class FakeSandboxProvider implements SandboxProvider {
  readonly handle: SandboxHandle = { id: 'sandbox-real-123', name: 'taskos-test', status: 'READY', target: 'eu', snapshot: 'default' };
  uploads: SandboxUpload[] = [];
  deleted = false;
  stopped = 0;
  exitCode = 0;
  readiness = true;
  failSetup = false;
  failDelete = false;
  commands: SandboxCommand[] = [];

  async createSandbox(_spec: SandboxSpec) { return this.handle; }
  async uploadFiles(_sandbox: SandboxHandle, files: SandboxUpload[]) { this.uploads.push(...files); }
  async executeCommand(_sandbox: SandboxHandle, command: SandboxCommand): Promise<CommandResult> {
    this.commands.push(command);
    if (this.failSetup && command.executable === 'npm') return { exitCode: 1, stdout: '', stderr: 'setup failed' };
    if (command.args.some((value) => value.includes('/products/test-product')) && !this.readiness) return { exitCode: 1, stdout: '', stderr: 'not ready' };
    if (command.args.includes('--version')) return { exitCode: 0, stdout: 'v22.18.0\n', stderr: '' };
    if (command.args.includes("require('@playwright/test/package.json').version")) return { exitCode: 0, stdout: '1.61.1\n', stderr: '' };
    return { exitCode: 0, stdout: 'ok', stderr: '' };
  }
  async startProcess(_sandbox: SandboxHandle): Promise<ProcessHandle> { const value = `process-${this.stopped}-${crypto.randomUUID()}`; return { processId: value, commandId: value }; }
  async waitForProcess(_sandbox: SandboxHandle, _process: ProcessHandle, _options: ProcessWaitOptions) { return { exitCode: this.exitCode, stdout: 'worker complete', stderr: '' }; }
  async getProcessLogs() { return { exitCode: 0, stdout: 'logs', stderr: '' }; }
  async downloadFiles(_sandbox: SandboxHandle, files: SandboxDownload[]) {
    const workerResult = result(this.exitCode === 2 ? 'INVARIANT_VIOLATION' : 'PASSED');
    const manifest = {
      workerId: workerResult.workerId, worldId: workerResult.worldId, experimentId: workerResult.experimentId,
      startedAt: iso, completedAt: iso,
      browser: { playwrightVersion: '1.61.1', engine: 'chromium', version: 'Chrome/140', viewport: { width: 1440, height: 900 }, headless: true },
      world: job('/tmp').world, randomSeed: 1, appliedFaults: [], setupOperations: [], journeyStepsAttempted: [],
      artifacts: [
        { type: 'WORKER_RESULT', path: `${remoteOutput}/worker-result.json`, mimeType: 'application/json' },
        { type: 'TRACE', path: `${remoteOutput}/trace/trace.zip`, mimeType: 'application/zip' },
        { type: 'SCREENSHOT', path: `${remoteOutput}/screenshots/001.png`, mimeType: 'image/png' },
        { type: 'CONSOLE_LOG', path: `${remoteOutput}/console/console.json`, mimeType: 'application/json' },
        { type: 'NETWORK_LOG', path: `${remoteOutput}/network/network.json`, mimeType: 'application/json' },
      ], outcome: workerResult.status, evidenceErrors: [],
    };
    for (const file of files) {
      await mkdir(dirname(file.destination), { recursive: true });
      const content = file.source.endsWith('worker-result.json') ? JSON.stringify(workerResult) : file.source.endsWith('manifest.json') ? JSON.stringify(manifest) : 'artifact';
      await writeFile(file.destination, content);
    }
  }
  async stopProcess() { this.stopped++; }
  async deleteSandbox() { if (this.failDelete) throw new Error('cleanup unavailable'); this.deleted = true; }
  async getSandboxStatus() { return 'READY' as const; }
}

async function fixture() {
  const root = await mkdtemp(resolve(tmpdir(), 'taskos-daytona-unit-'));
  const demoDist = resolve(root, 'demo-dist'); const workerBundle = resolve(root, 'worker-bundle'); const evidence = resolve(root, 'evidence');
  await Promise.all([
    mkdir(resolve(demoDist, 'server'), { recursive: true }),
    mkdir(workerBundle, { recursive: true }),
    mkdir(evidence, { recursive: true }),
  ]);
  await Promise.all([
    writeFile(resolve(demoDist, 'index.html'), '<html></html>'),
    writeFile(resolve(demoDist, 'server/production-server.js'), 'console.log("demo")'),
    writeFile(resolve(workerBundle, 'worker.mjs'), 'console.log("worker")'),
    writeFile(resolve(workerBundle, 'package.json'), '{"type":"module"}'),
  ]);
  const config: DaytonaWorkerExecutorConfiguration = {
    target: 'eu', autoDelete: true, timeoutSeconds: 60, evidenceRoot: evidence,
    demoStoreDistPath: demoDist, workerBundlePath: workerBundle,
    workspacePath: '/workspace/taskos', demoStorePath: '/workspace/taskos/demo-store', workerPath: '/workspace/taskos/worker', inputPath: '/workspace/taskos/input', outputPath: remoteOutput, demoStorePort: 4174,
  };
  return { root, evidence, config };
}

describe('Daytona worker execution primitives', () => {
  it('sanitizes names, transforms only sandbox-local URLs, and constructs fixed commands', async () => {
    const { config } = await fixture();
    expect(sanitizeSandboxName('INVESTIGATION_ABC', 'WORLD/ABC')).toMatch(/^taskos-[a-z0-9-]+$/);
    const transformed = sandboxWorkerJob(job('/tmp/local'), remoteOutput, 4174);
    expect(transformed.target).toMatchObject({ baseUrl: 'http://127.0.0.1:4174', apiBaseUrl: 'http://127.0.0.1:4174' });
    expect(transformed.evidence.outputDirectory).toBe(remoteOutput);
    expect(workerCommand(config).args).toEqual(['/workspace/taskos/worker/worker.mjs', '--job', '/workspace/taskos/input/worker-job.json']);
    expect(demoStoreCommand(config).args).toEqual(['/workspace/taskos/demo-store/dist/server/production-server.js']);
  });

  it('preserves hosted worker targets while still rewriting evidence output', async () => {
    const hosted = {
      ...job('/tmp/local'),
      target: {
        baseUrl: 'https://tasks-demo-store.onrender.com',
        apiBaseUrl: 'https://tasks-demo-store.onrender.com/api',
        journeyPath: '/products/test-product',
      },
    };
    const transformed = daytonaWorkerJob(hosted, remoteOutput, 4174);
    expect(transformed.target).toEqual(hosted.target);
    expect(transformed.evidence.outputDirectory).toBe(remoteOutput);
  });

  it('rejects remote and local path traversal', async () => {
    const { evidence } = await fixture();
    expect(() => assertRemoteChild(remoteOutput, '/workspace/taskos/other/secret')).toThrow('escapes');
    expect(() => localArtifactPath(evidence, remoteOutput, `${remoteOutput}/../secret`)).toThrow('escapes');
  });

  it('builds narrow demo-store, worker, and input upload manifests', async () => {
    const { config } = await fixture();
    const manifest = await new PortableRuntimeBundleService({ demoStoreDistPath: config.demoStoreDistPath, workerBundlePath: config.workerBundlePath, remoteDemoStorePath: config.demoStorePath, remoteWorkerPath: config.workerPath, remoteInputPath: config.inputPath }).createUploadManifest(job('/tmp/local'));
    expect(manifest.demoStore.some(({ destination }) => destination.endsWith('/dist/server/production-server.js'))).toBe(true);
    expect(manifest.worker.some(({ destination }) => destination.endsWith('/worker.mjs'))).toBe(true);
    expect(manifest.input).toHaveLength(1);
    expect(manifest.demoStore.every(({ destination }) => !destination.includes('.env'))).toBe(true);
  });

  it('excludes host secrets from the sandbox environment', async () => {
    const { config } = await fixture();
    expect(Object.keys(sandboxEnvironment(config))).toEqual(['NODE_ENV', 'TASKOS_WORKER_MODE', 'PORT', 'HOST', 'DEMO_STORE_URL', 'DEMO_API_URL', 'NODE_OPTIONS', 'PLAYWRIGHT_BROWSERS_PATH']);
    expect(sandboxEnvironment(config).NODE_OPTIONS).toBe('--dns-result-order=ipv4first');
    expect(JSON.stringify(sandboxEnvironment(config))).not.toMatch(/DATABASE_URL|DAYTONA_API_KEY|JWT|OPENAI|KIMI|NOSANA/);
  });

  it('selects local lazily without constructing Daytona and selects Daytona when requested', async () => {
    const { evidence } = await fixture();
    const local = new LocalPlaywrightWorkerExecutor(evidence);
    const daytona = { provider: 'DAYTONA', execute: async () => { throw new Error('unused'); } } satisfies WorkerExecutor;
    let created = 0;
    const factory = new WorkerExecutorFactory(local, () => { created++; return daytona; });
    expect(factory.create('local')).toBe(local); expect(created).toBe(0);
    expect(factory.create('daytona')).toBe(daytona); expect(created).toBe(1);
  });
});

describe('DaytonaPlaywrightWorkerExecutor lifecycle', () => {
  let provider: FakeSandboxProvider;
  beforeEach(() => { provider = new FakeSandboxProvider(); });

  async function execute(overrides: Partial<DaytonaWorkerExecutorConfiguration> = {}) {
    const { evidence, config } = await fixture();
    const output = resolve(evidence, 'investigation/world/experiment/attempt-1');
    const events: string[] = [];
    const response = await new DaytonaPlaywrightWorkerExecutor(provider, { ...config, ...overrides }).execute(job(output), {
      investigationId: 'investigation', worldId: 'world', experimentId: 'experiment', workerId: 'worker', evidenceDirectory: output,
      emitEvent: async ({ phase }) => { events.push(phase); },
    });
    return { response, output, events };
  }

  it('downloads and validates a healthy result and always deletes the sandbox', async () => {
    const { response, output, events } = await execute();
    expect(response.exitCode).toBe(0); expect(response.result.status).toBe('PASSED');
    expect(response.result.evidence.manifestPath).toBe(resolve(output, 'manifest.json'));
    expect(provider.deleted).toBe(true); expect(provider.stopped).toBe(2);
    expect(response.providerMetadata).toMatchObject({ provider: 'DAYTONA', sandboxId: 'sandbox-real-123', target: 'eu', cleanupOutcome: 'DELETED', playwrightVersion: '1.61.1', chromiumVersion: 'Chrome/140' });
    expect(events).toContain('evidence_download_completed'); expect(events).toContain('sandbox_deleted');
    expect(JSON.parse(await readFile(resolve(output, 'worker-result.json'), 'utf8')).status).toBe('PASSED');
  });

  it('uses hosted target readiness and skips sandbox demo process for external URLs', async () => {
    const { evidence, config } = await fixture();
    const output = resolve(evidence, 'investigation/world/experiment/attempt-1');
    const events: string[] = [];
    const hosted = {
      ...job(output),
      target: {
        baseUrl: 'https://tasks-demo-store.onrender.com',
        apiBaseUrl: 'https://tasks-demo-store.onrender.com/api',
        journeyPath: '/products/test-product',
      },
    };
    const response = await new DaytonaPlaywrightWorkerExecutor(provider, config).execute(hosted, {
      investigationId: 'investigation',
      worldId: 'world',
      experimentId: 'experiment',
      workerId: 'worker',
      evidenceDirectory: output,
      emitEvent: async ({ phase }) => { events.push(phase); },
    });
    expect(response.result.status).toBe('PASSED');
    expect(provider.stopped).toBe(1);
    expect(provider.uploads.some(({ destination }) => destination.includes('/demo-store/'))).toBe(false);
    expect(provider.commands.find((command) => command.args.some((arg) => arg.includes('productUrl')))?.environment?.NODE_OPTIONS).toBe('--dns-result-order=ipv4first');
    expect(events).toContain('hosted_target_ready');
    expect(events).not.toContain('demo_store_ready');
  });

  it('treats invariant exit code 2 as a valid result and deletes the sandbox', async () => {
    provider.exitCode = 2;
    const { response } = await execute();
    expect(response.result.status).toBe('INVARIANT_VIOLATION'); expect(response.exitCode).toBe(2);
    expect(response.result.invariantEvaluations.every(({ passed }) => !passed)).toBe(true);
    expect(provider.deleted).toBe(true);
  });

  it('cleans up after dependency setup failure', async () => {
    provider.failSetup = true;
    await expect(execute()).rejects.toThrow('Worker dependency installation failed');
    expect(provider.deleted).toBe(true);
  });

  it('times out readiness and cleans up without running the worker', async () => {
    provider.readiness = false;
    await expect(execute({ demoStoreReadinessTimeoutMs: 5 })).rejects.toThrow('readiness timed out');
    expect(provider.deleted).toBe(true);
  });

  it('preserves a valid result when sandbox deletion fails', async () => {
    provider.failDelete = true;
    const { response } = await execute();
    expect(response.result.status).toBe('PASSED');
    expect(response.providerMetadata).toMatchObject({ cleanupOutcome: 'FAILED', cleanupError: 'cleanup unavailable' });
    expect(provider.deleted).toBe(false);
  });
});
