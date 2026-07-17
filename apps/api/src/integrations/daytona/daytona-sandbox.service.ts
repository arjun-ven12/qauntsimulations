import type { Sandbox } from '@daytona/sdk';
import { DaytonaClient } from './daytona.client.js';
import { SandboxProviderError } from './daytona.errors.js';
import type {
  CommandResult,
  ProcessHandle,
  ProcessWaitOptions,
  SandboxCommand,
  SandboxDownload,
  SandboxHandle,
  SandboxProvider,
  SandboxSpec,
  SandboxStatus,
  SandboxUpload,
} from './daytona.types.js';

const sleep = (durationMs: number) => new Promise((resolve) => setTimeout(resolve, durationMs));
const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

export function renderSandboxCommand(command: SandboxCommand): string {
  return [command.executable, ...command.args].map(quote).join(' ');
}

export class DaytonaSandboxProvider implements SandboxProvider {
  private readonly sandboxes = new Map<string, Sandbox>();

  constructor(private readonly client: DaytonaClient) {}

  async createSandbox(spec: SandboxSpec): Promise<SandboxHandle> {
    try {
      const sandbox = await this.client.sdk.create(
        {
          name: spec.name,
          user: 'root',
          language: 'javascript',
          envVars: spec.environment,
          labels: spec.labels,
          public: false,
          networkBlockAll: false,
          ephemeral: spec.autoDelete,
          ...(spec.snapshot ? { snapshot: spec.snapshot } : {}),
        },
        { timeout: spec.timeoutSeconds },
      );
      this.sandboxes.set(sandbox.id, sandbox);
      return this.handle(sandbox, 'READY');
    } catch (error) {
      throw new SandboxProviderError('Unable to create Daytona EU sandbox', this.safeError(error));
    }
  }

  async uploadFiles(
    handle: SandboxHandle,
    files: SandboxUpload[],
    timeoutSeconds?: number,
  ): Promise<void> {
    const sandbox = this.sandbox(handle);
    await sandbox.fs.uploadFiles(
      files.map(({ source, destination }) => ({ source, destination })),
      timeoutSeconds,
    );
  }

  async executeCommand(handle: SandboxHandle, command: SandboxCommand): Promise<CommandResult> {
    const response = await this.sandbox(handle).process.executeCommand(
      renderSandboxCommand(command),
      command.cwd,
      command.environment,
      command.timeoutSeconds,
    );
    return { exitCode: response.exitCode, stdout: response.result, stderr: '' };
  }

  async startProcess(handle: SandboxHandle, command: SandboxCommand): Promise<ProcessHandle> {
    const processId = `taskos-${crypto.randomUUID()}`;
    const process = this.sandbox(handle).process;
    await process.createSession(processId);
    const response = await process.executeSessionCommand(
      processId,
      { command: renderSandboxCommand(command), runAsync: true, suppressInputEcho: true },
      command.timeoutSeconds,
    );
    return { processId, commandId: response.cmdId };
  }

  async waitForProcess(
    handle: SandboxHandle,
    processHandle: ProcessHandle,
    options: ProcessWaitOptions,
  ): Promise<CommandResult> {
    const process = this.sandbox(handle).process;
    const deadline = Date.now() + options.timeoutSeconds * 1_000;
    while (Date.now() < deadline) {
      if (await options.isCancelled?.()) {
        await this.stopProcess(handle, processHandle);
        throw new SandboxProviderError('Daytona worker execution was cancelled');
      }
      const command = await process.getSessionCommand(
        processHandle.processId,
        processHandle.commandId,
      );
      if (command.exitCode !== undefined) return this.getProcessLogs(handle, processHandle);
      await sleep(options.pollIntervalMs ?? 250);
    }
    await this.stopProcess(handle, processHandle);
    throw new SandboxProviderError('Daytona sandbox process timed out');
  }

  async getProcessLogs(handle: SandboxHandle, processHandle: ProcessHandle): Promise<CommandResult> {
    const process = this.sandbox(handle).process;
    const [command, logs] = await Promise.all([
      process.getSessionCommand(processHandle.processId, processHandle.commandId),
      process.getSessionCommandLogs(processHandle.processId, processHandle.commandId),
    ]);
    return {
      exitCode: command.exitCode ?? -1,
      stdout: logs.stdout ?? logs.output ?? '',
      stderr: logs.stderr ?? '',
    };
  }

  async downloadFiles(
    handle: SandboxHandle,
    files: SandboxDownload[],
    timeoutSeconds?: number,
  ): Promise<void> {
    const responses = await this.sandbox(handle).fs.downloadFiles(
      files.map(({ source, destination }) => ({ source, destination })),
      timeoutSeconds,
    );
    const failed = responses.filter(({ error }) => error);
    if (failed.length) {
      throw new SandboxProviderError('One or more Daytona evidence downloads failed', {
        failures: failed.map(({ source, error }) => ({ source, error })),
      });
    }
  }

  async stopProcess(handle: SandboxHandle, processHandle: ProcessHandle): Promise<void> {
    await this.sandbox(handle).process.deleteSession(processHandle.processId).catch(() => undefined);
  }

  async deleteSandbox(handle: SandboxHandle): Promise<void> {
    const sandbox = this.sandbox(handle);
    await this.client.sdk.delete(sandbox);
    this.sandboxes.delete(handle.id);
  }

  async getSandboxStatus(handle: SandboxHandle): Promise<SandboxStatus> {
    const sandbox = this.sandbox(handle);
    await sandbox.refreshData();
    if (sandbox.errorReason) return 'FAILED';
    const state = String(sandbox.state ?? '').toLowerCase();
    if (state.includes('start')) return 'READY';
    if (state.includes('stop') || state.includes('archiv')) return 'STOPPED';
    return 'CREATING';
  }

  async *listSandboxes(labels: Record<string, string>): AsyncIterable<SandboxHandle> {
    for await (const sandbox of this.client.sdk.list({ labels })) {
      this.sandboxes.set(sandbox.id, sandbox);
      yield this.handle(sandbox, 'READY');
    }
  }

  private sandbox(handle: SandboxHandle): Sandbox {
    const sandbox = this.sandboxes.get(handle.id);
    if (!sandbox) throw new SandboxProviderError(`Unknown Daytona sandbox ${handle.id}`);
    return sandbox;
  }

  private handle(sandbox: Sandbox, status: SandboxStatus): SandboxHandle {
    return {
      id: sandbox.id,
      name: sandbox.name,
      status,
      target: sandbox.target,
      ...(sandbox.snapshot ? { snapshot: sandbox.snapshot } : {}),
      ...(sandbox.createdAt ? { createdAt: sandbox.createdAt } : {}),
      ...(sandbox.labels ? { labels: sandbox.labels } : {}),
    };
  }

  private safeError(error: unknown): { name: string; message: string } {
    return error instanceof Error
      ? { name: error.name, message: error.message }
      : { name: 'UnknownError', message: 'Unknown Daytona error' };
  }
}

export interface SandboxProviderConfiguration {
  daytonaApiKey: string;
  daytonaApiUrl?: string;
  target: 'eu';
  snapshot?: string;
}

export function createSandboxProvider(config: SandboxProviderConfiguration): SandboxProvider {
  if (!config.daytonaApiKey) throw new SandboxProviderError('DAYTONA_API_KEY is required');
  return new DaytonaSandboxProvider(
    new DaytonaClient({
      apiKey: config.daytonaApiKey,
      target: config.target,
      ...(config.daytonaApiUrl ? { apiUrl: config.daytonaApiUrl } : {}),
      ...(config.snapshot ? { snapshot: config.snapshot } : {}),
    }),
  );
}
