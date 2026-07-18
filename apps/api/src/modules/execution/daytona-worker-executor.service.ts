import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import {
  evidenceManifestSchema,
  workerJobSchema,
  workerResultSchema,
  type EvidenceManifest,
  type WorkerJob,
  type WorkerResult,
} from '@taskos/execution-contracts';
import type {
  ProcessHandle,
  SandboxCommand,
  SandboxHandle,
  SandboxProvider,
} from '../../integrations/daytona/daytona.types.js';
import { assertRemoteChild, localArtifactPath, sanitizeSandboxName } from './daytona-paths.js';
import { PortableRuntimeBundleService } from './portable-runtime-bundle.service.js';
import type {
  WorkerExecutionContext,
  WorkerExecutionResponse,
  WorkerExecutor,
  WorkerProviderMetadata,
} from './worker-executor.types.js';

const MAX_LOG_LENGTH = 8_000;
const now = () => Date.now();
const duration = (startedAt: number) => Date.now() - startedAt;

export interface DaytonaWorkerExecutorConfiguration {
  target: 'eu';
  snapshot?: string;
  autoDelete: boolean;
  timeoutSeconds: number;
  evidenceRoot: string;
  demoStoreDistPath: string;
  workerBundlePath: string;
  workspacePath: string;
  demoStorePath: string;
  workerPath: string;
  inputPath: string;
  outputPath: string;
  demoStorePort: number;
  demoStoreReadinessTimeoutMs?: number;
}

export function sandboxEnvironment(config: DaytonaWorkerExecutorConfiguration): Record<string, string> {
  return {
    NODE_ENV: 'production',
    TASKOS_WORKER_MODE: 'daytona',
    PORT: String(config.demoStorePort),
    HOST: '0.0.0.0',
    DEMO_STORE_URL: `http://127.0.0.1:${config.demoStorePort}`,
    DEMO_API_URL: `http://127.0.0.1:${config.demoStorePort}`,
    NODE_OPTIONS: '--dns-result-order=ipv4first',
    PLAYWRIGHT_BROWSERS_PATH: '/home/daytona/.cache/ms-playwright',
  };
}

export function isLocalSandboxTarget(target: WorkerJob['target']): boolean {
  const hostname = new URL(target.baseUrl).hostname.toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

export function sandboxWorkerJob(input: WorkerJob, outputPath: string, port: number): WorkerJob {
  const baseUrl = `http://127.0.0.1:${port}`;
  return workerJobSchema.parse({
    ...input,
    target: { ...input.target, baseUrl, apiBaseUrl: baseUrl },
    evidence: { ...input.evidence, outputDirectory: outputPath },
  });
}

export function daytonaWorkerJob(input: WorkerJob, outputPath: string, port: number): WorkerJob {
  const parsed = workerJobSchema.parse(input);
  if (isLocalSandboxTarget(parsed.target)) return sandboxWorkerJob(parsed, outputPath, port);
  return workerJobSchema.parse({
    ...parsed,
    evidence: { ...parsed.evidence, outputDirectory: outputPath },
  });
}

export function demoStoreCommand(config: DaytonaWorkerExecutorConfiguration): SandboxCommand {
  return {
    executable: 'node',
    args: [`${config.demoStorePath}/dist/server/production-server.js`],
    cwd: config.demoStorePath,
    environment: sandboxEnvironment(config),
  };
}

export function workerCommand(config: DaytonaWorkerExecutorConfiguration): SandboxCommand {
  return {
    executable: 'node',
    args: [`${config.workerPath}/worker.mjs`, '--job', `${config.inputPath}/worker-job.json`],
    cwd: config.workerPath,
    environment: sandboxEnvironment(config),
  };
}

export class DaytonaPlaywrightWorkerExecutor implements WorkerExecutor {
  readonly provider = 'DAYTONA' as const;
  private readonly evidenceRoot: string;
  private readonly bundles: PortableRuntimeBundleService;

  constructor(
    private readonly sandboxProvider: SandboxProvider,
    private readonly config: DaytonaWorkerExecutorConfiguration,
  ) {
    this.evidenceRoot = resolve(config.evidenceRoot);
    this.bundles = new PortableRuntimeBundleService({
      demoStoreDistPath: config.demoStoreDistPath,
      workerBundlePath: config.workerBundlePath,
      remoteDemoStorePath: config.demoStorePath,
      remoteWorkerPath: config.workerPath,
      remoteInputPath: config.inputPath,
    });
  }

  async execute(input: WorkerJob, context: WorkerExecutionContext): Promise<WorkerExecutionResponse> {
    const lifecycleStartedAt = now();
    const deadline = lifecycleStartedAt + this.config.timeoutSeconds * 1_000;
    const localOutput = resolve(context.evidenceDirectory);
    this.assertLocalOutput(localOutput);
    const parsedInput = workerJobSchema.parse(input);
    const usesSandboxDemoStore = isLocalSandboxTarget(parsedInput.target);
    const job = daytonaWorkerJob(parsedInput, this.config.outputPath, this.config.demoStorePort);
    const metadata: WorkerProviderMetadata = { provider: this.provider };
    let sandbox: SandboxHandle | undefined;
    let demoProcess: ProcessHandle | undefined;
    let workerProcess: ProcessHandle | undefined;
    let response: WorkerExecutionResponse | undefined;
    let primaryError: unknown;

    try {
      await this.assertNotCancelled(context);
      await this.event(context, 'sandbox_requested', 'Daytona EU sandbox requested.');
      const createStartedAt = now();
      sandbox = await this.sandboxProvider.createSandbox({
        name: sanitizeSandboxName(context.investigationId, context.worldId),
        target: this.config.target,
        labels: {
          project: 'taskos-worldlab',
          purpose: 'isolated-playwright-world',
          investigationId: context.investigationId,
          worldId: context.worldId,
          experimentId: context.experimentId,
        },
        environment: sandboxEnvironment(this.config),
        timeoutSeconds: this.remainingSeconds(deadline),
        autoDelete: this.config.autoDelete,
        ...(this.config.snapshot ? { snapshot: this.config.snapshot } : {}),
      });
      Object.assign(metadata, {
        sandboxId: sandbox.id,
        sandboxName: sandbox.name,
        target: sandbox.target,
        ...(sandbox.snapshot ? { snapshot: sandbox.snapshot } : {}),
        ...(sandbox.createdAt ? { sandboxCreatedAt: sandbox.createdAt } : {}),
        sandboxCreationDurationMs: duration(createStartedAt),
      });
      await this.event(context, 'sandbox_ready', 'Daytona EU sandbox is ready.', sandbox.id);

      await this.requireCommand(sandbox, {
        executable: 'mkdir',
        args: ['-p', this.config.demoStorePath, this.config.workerPath, this.config.inputPath, `${this.config.workspacePath}/logs`, this.config.outputPath],
      }, deadline, 'Sandbox directory creation');

      const uploads = await this.bundles.createUploadManifest(job);
      const uploadStartedAt = now();
      if (usesSandboxDemoStore) {
        await this.event(context, 'demo_store_upload_started', 'Uploading demo-store production bundle.', sandbox.id);
        await this.sandboxProvider.uploadFiles(sandbox, uploads.demoStore, this.remainingSeconds(deadline));
        await this.event(context, 'demo_store_upload_completed', 'Demo-store production bundle uploaded.', sandbox.id, { fileCount: uploads.demoStore.length });
      }
      await this.event(context, 'worker_upload_started', 'Uploading Playwright worker bundle.', sandbox.id);
      await this.sandboxProvider.uploadFiles(sandbox, [...uploads.worker, ...uploads.input], this.remainingSeconds(deadline));
      metadata.uploadDurationMs = duration(uploadStartedAt);
      await this.event(context, 'worker_upload_completed', 'Playwright worker and WorkerJob uploaded.', sandbox.id, { fileCount: uploads.worker.length + uploads.input.length });

      const setupStartedAt = now();
      await this.event(context, 'worker_setup_started', 'Installing sandbox Playwright runtime.', sandbox.id);
      const node = await this.requireCommand(sandbox, { executable: 'node', args: ['--version'] }, deadline, 'Node version check');
      metadata.nodeVersion = node.stdout.trim();
      await this.requireCommand(sandbox, { executable: 'npm', args: ['install', '--omit=dev', '--ignore-scripts'], cwd: this.config.workerPath }, deadline, 'Worker dependency installation');
      await this.requireCommand(sandbox, { executable: 'npx', args: ['playwright', 'install', 'chromium'], cwd: this.config.workerPath, environment: sandboxEnvironment(this.config) }, deadline, 'Chromium installation');
      const playwright = await this.requireCommand(sandbox, { executable: 'node', args: ['-p', "require('@playwright/test/package.json').version"], cwd: this.config.workerPath }, deadline, 'Playwright version check');
      metadata.playwrightVersion = playwright.stdout.trim();
      metadata.workerSetupDurationMs = duration(setupStartedAt);
      await this.event(context, 'worker_setup_completed', 'Sandbox Playwright runtime installed.', sandbox.id, { nodeVersion: metadata.nodeVersion, playwrightVersion: metadata.playwrightVersion });

      const demoStartedAt = now();
      if (usesSandboxDemoStore) {
        await this.event(context, 'demo_store_starting', 'Starting isolated demo store.', sandbox.id);
        demoProcess = await this.sandboxProvider.startProcess(sandbox, demoStoreCommand(this.config));
        await this.waitForDemoStore(sandbox, deadline);
        await this.event(context, 'demo_store_ready', 'Isolated demo store passed readiness, reset, and configuration checks.', sandbox.id);
      } else {
        await this.event(context, 'hosted_target_check_started', 'Checking hosted target from Daytona sandbox.', sandbox.id, { baseUrl: job.target.baseUrl });
        await this.waitForHostedTarget(sandbox, job, deadline);
        await this.event(context, 'hosted_target_ready', 'Hosted target passed readiness, reset, and configuration checks.', sandbox.id, { baseUrl: job.target.baseUrl });
      }
      metadata.demoStoreSetupDurationMs = duration(demoStartedAt);

      await this.assertNotCancelled(context);
      const workerStartedAt = now();
      await this.event(context, 'worker_execution_started', 'Starting Playwright worker inside Daytona.', sandbox.id);
      workerProcess = await this.sandboxProvider.startProcess(sandbox, workerCommand(this.config));
      const commandResult = await this.sandboxProvider.waitForProcess(sandbox, workerProcess, {
        timeoutSeconds: Math.min(Math.ceil(job.limits.timeoutMs / 1_000) + 30, this.remainingSeconds(deadline)),
        ...(context.isCancelled ? { isCancelled: context.isCancelled } : {}),
      });
      metadata.workerExecutionDurationMs = duration(workerStartedAt);
      if (![0, 2, 3, 4, 6].includes(commandResult.exitCode)) {
        throw new Error(`Daytona worker exited with unsupported code ${commandResult.exitCode}: ${this.bound(commandResult.stderr || commandResult.stdout)}`);
      }
      await this.event(context, 'worker_execution_completed', 'Playwright worker completed inside Daytona.', sandbox.id, { exitCode: commandResult.exitCode });

      const downloadStartedAt = now();
      await this.event(context, 'evidence_download_started', 'Downloading validated worker evidence.', sandbox.id);
      const downloaded = await this.downloadEvidence(sandbox, localOutput, deadline);
      metadata.artifactDownloadDurationMs = duration(downloadStartedAt);
      metadata.chromiumVersion = downloaded.manifest.browser.version;
      await this.event(context, 'evidence_download_completed', 'WorkerResult and evidence downloaded.', sandbox.id, { artifactCount: downloaded.manifest.artifacts.length });
      response = {
        result: downloaded.result,
        exitCode: commandResult.exitCode,
        stdoutSummary: this.bound(commandResult.stdout),
        stderrSummary: this.bound(commandResult.stderr),
        providerMetadata: metadata,
      };
    } catch (error) {
      primaryError = error;
    } finally {
      if (sandbox) {
        await this.event(context, 'sandbox_cleanup_started', 'Cleaning up Daytona sandbox.', sandbox.id).catch(() => undefined);
        if (workerProcess) await this.sandboxProvider.stopProcess(sandbox, workerProcess).catch(() => undefined);
        if (demoProcess) await this.sandboxProvider.stopProcess(sandbox, demoProcess).catch(() => undefined);
        try {
          await this.sandboxProvider.deleteSandbox(sandbox);
          metadata.cleanupOutcome = 'DELETED';
          await this.event(context, 'sandbox_deleted', 'Daytona sandbox deleted.', sandbox.id).catch(() => undefined);
        } catch (cleanupError) {
          metadata.cleanupOutcome = 'FAILED';
          metadata.cleanupError = cleanupError instanceof Error ? cleanupError.message : 'Unknown sandbox cleanup error';
          await this.event(context, 'sandbox_cleanup_failed', 'Daytona sandbox cleanup failed.', sandbox.id, { error: metadata.cleanupError }).catch(() => undefined);
          if (!response && !primaryError) primaryError = cleanupError;
        }
      }
    }

    if (response) return response;
    if (primaryError instanceof Error && metadata.sandboxId && metadata.cleanupOutcome === 'FAILED') {
      throw new Error(`${primaryError.message}; orphaned Daytona sandbox: ${metadata.sandboxId}`, { cause: primaryError });
    }
    throw primaryError ?? new Error('Daytona execution failed without an error');
  }

  private async waitForDemoStore(sandbox: SandboxHandle, deadline: number): Promise<void> {
    const baseUrl = `http://127.0.0.1:${this.config.demoStorePort}`;
    const readyDeadline = Math.min(deadline, Date.now() + (this.config.demoStoreReadinessTimeoutMs ?? 30_000));
    let lastError = 'No readiness response';
    while (Date.now() < readyDeadline) {
      const result = await this.sandboxProvider.executeCommand(sandbox, {
        executable: 'node',
        args: ['-e', `fetch('${baseUrl}/products/test-product').then(r=>{if(r.status!==200)throw new Error('status '+r.status)}).catch(e=>{console.error(e.message);process.exit(1)})`],
        timeoutSeconds: Math.min(10, this.remainingSeconds(deadline)),
      });
      if (result.exitCode === 0) {
        await this.requireCommand(sandbox, { executable: 'node', args: ['-e', `fetch('${baseUrl}/api/test/reset',{method:'POST'}).then(async r=>{if(!r.ok)throw new Error('status '+r.status);JSON.parse(await r.text())}).catch(e=>{console.error(e.message);process.exit(1)})`] }, deadline, 'Demo-store reset');
        await this.requireCommand(sandbox, { executable: 'node', args: ['-e', `fetch('${baseUrl}/api/test/config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({duplicateSubmissionBug:false,paymentDelayMs:0})}).then(async r=>{if(!r.ok)throw new Error('status '+r.status);JSON.parse(await r.text())}).catch(e=>{console.error(e.message);process.exit(1)})`] }, deadline, 'Demo-store configuration');
        return;
      }
      lastError = this.bound(result.stderr || result.stdout);
      await new Promise((resolveWait) => setTimeout(resolveWait, 500));
    }
    throw new Error(`Demo-store readiness timed out: ${lastError}`);
  }

  private async waitForHostedTarget(sandbox: SandboxHandle, job: WorkerJob, deadline: number): Promise<void> {
    const productUrl = new URL(job.target.journeyPath ?? '/products/test-product', job.target.baseUrl).toString();
    const apiBaseUrl = job.target.apiBaseUrl ?? job.target.baseUrl;
    const command = `
const productUrl = ${JSON.stringify(productUrl)};
const apiBaseUrl = ${JSON.stringify(apiBaseUrl)};
const resetUrl = new URL('/api/test/reset', apiBaseUrl).toString();
const configUrl = new URL('/api/test/config', apiBaseUrl).toString();
const assert = (condition, message) => { if (!condition) throw new Error(message); };
(async () => {
  const product = await fetch(productUrl);
  assert(product.status === 200, 'product status ' + product.status);
  const reset = await fetch(resetUrl, { method: 'POST' });
  assert(reset.ok, 'reset status ' + reset.status);
  const resetBody = await reset.json();
  assert(resetBody && resetBody.ok === true, 'reset body invalid');
  const config = await fetch(configUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ duplicateSubmissionBug: false, paymentDelayMs: 0 }),
  });
  assert(config.ok, 'config status ' + config.status);
  const configBody = await config.json();
  assert(configBody.duplicateSubmissionBug === false && configBody.paymentDelayMs === 0, 'config body invalid');
})().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
`;
    await this.requireCommand(sandbox, {
      executable: 'node',
      args: ['-e', command],
      environment: sandboxEnvironment(this.config),
      timeoutSeconds: Math.min(30, this.remainingSeconds(deadline)),
    }, deadline, 'Hosted target readiness');
  }

  private async downloadEvidence(
    sandbox: SandboxHandle,
    localOutput: string,
    deadline: number,
  ): Promise<{ result: WorkerResult; manifest: EvidenceManifest }> {
    await mkdir(localOutput, { recursive: true });
    const remoteResult = `${this.config.outputPath}/worker-result.json`;
    const remoteManifest = `${this.config.outputPath}/manifest.json`;
    const localResult = localArtifactPath(localOutput, this.config.outputPath, remoteResult);
    const localManifest = localArtifactPath(localOutput, this.config.outputPath, remoteManifest);
    await this.sandboxProvider.downloadFiles(sandbox, [
      { source: remoteResult, destination: localResult },
      { source: remoteManifest, destination: localManifest },
    ], this.remainingSeconds(deadline));
    const [parsedResult, parsedManifest] = await Promise.all([
      readFile(localResult, 'utf8').then((value) => workerResultSchema.parse(JSON.parse(value))),
      readFile(localManifest, 'utf8').then((value) => evidenceManifestSchema.parse(JSON.parse(value))),
    ]);
    const remotePaths = new Set<string>([
      ...parsedManifest.artifacts.map(({ path }) => path),
      parsedResult.evidence.manifestPath,
      ...parsedResult.evidence.screenshotPaths,
      ...[parsedResult.evidence.tracePath, parsedResult.evidence.videoPath, parsedResult.evidence.consoleLogPath, parsedResult.evidence.networkLogPath].filter((path): path is string => Boolean(path)),
    ]);
    const downloads = [...remotePaths]
      .map((source) => ({ source: assertRemoteChild(this.config.outputPath, source), destination: localArtifactPath(localOutput, this.config.outputPath, source) }))
      .filter(({ source }) => source !== remoteResult && source !== remoteManifest);
    await Promise.all(downloads.map(({ destination }) => mkdir(dirname(destination), { recursive: true })));
    if (downloads.length) await this.sandboxProvider.downloadFiles(sandbox, downloads, this.remainingSeconds(deadline));
    const mapPath = (path: string) => localArtifactPath(localOutput, this.config.outputPath, path);
    const result = workerResultSchema.parse({
      ...parsedResult,
      evidence: {
        manifestPath: localManifest,
        screenshotPaths: parsedResult.evidence.screenshotPaths.map(mapPath),
        ...(parsedResult.evidence.tracePath ? { tracePath: mapPath(parsedResult.evidence.tracePath) } : {}),
        ...(parsedResult.evidence.videoPath ? { videoPath: mapPath(parsedResult.evidence.videoPath) } : {}),
        ...(parsedResult.evidence.consoleLogPath ? { consoleLogPath: mapPath(parsedResult.evidence.consoleLogPath) } : {}),
        ...(parsedResult.evidence.networkLogPath ? { networkLogPath: mapPath(parsedResult.evidence.networkLogPath) } : {}),
      },
    });
    const manifest = evidenceManifestSchema.parse({
      ...parsedManifest,
      artifacts: parsedManifest.artifacts.map((artifact) => ({ ...artifact, path: mapPath(artifact.path) })),
    });
    await Promise.all([
      writeFile(localResult, `${JSON.stringify(result, null, 2)}\n`),
      writeFile(localManifest, `${JSON.stringify(manifest, null, 2)}\n`),
    ]);
    return { result, manifest };
  }

  private async requireCommand(
    sandbox: SandboxHandle,
    command: SandboxCommand,
    deadline: number,
    label: string,
  ) {
    const result = await this.sandboxProvider.executeCommand(sandbox, {
      ...command,
      timeoutSeconds: Math.min(command.timeoutSeconds ?? this.remainingSeconds(deadline), this.remainingSeconds(deadline)),
    });
    if (result.exitCode !== 0) throw new Error(`${label} failed: ${this.bound(result.stderr || result.stdout)}`);
    return result;
  }

  private async assertNotCancelled(context: WorkerExecutionContext): Promise<void> {
    if (await context.isCancelled?.()) throw new Error('Investigation was cancelled before Daytona execution');
  }

  private assertLocalOutput(output: string): void {
    const child = relative(this.evidenceRoot, output);
    if (child.startsWith('..') || isAbsolute(child)) throw new Error('Daytona evidence path escaped configured local storage');
  }

  private remainingSeconds(deadline: number): number {
    const remaining = Math.ceil((deadline - Date.now()) / 1_000);
    if (remaining <= 0) throw new Error('Daytona sandbox lifecycle timed out');
    return remaining;
  }

  private bound(value: string): string {
    return value.length <= MAX_LOG_LENGTH ? value : `${value.slice(0, MAX_LOG_LENGTH)}\n[truncated]`;
  }

  private async event(
    context: WorkerExecutionContext,
    phase: string,
    message: string,
    sandboxId?: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    await context.emitEvent?.({ phase, message, ...(sandboxId ? { sandboxId } : {}), ...(metadata ? { metadata } : {}) });
  }
}
