import { DaytonaClient } from './daytona.client.js'; import type { CommandResult, ProcessHandle, SandboxHandle, SandboxProvider, SandboxSpec, SandboxStatus } from './daytona.types.js';
export class DaytonaSandboxProvider implements SandboxProvider {
  constructor(private readonly client: DaytonaClient) { void this.client; }
  private unavailable(): never { throw new Error('Daytona SDK adapter is scaffolded; install and bind the SDK before enabling it'); }
  createSandbox(_spec: SandboxSpec): Promise<SandboxHandle> { return Promise.reject(this.unavailable()); } uploadFiles(_id: string, _files: Array<{ localPath: string; remotePath: string }>): Promise<void> { return Promise.reject(this.unavailable()); }
  executeCommand(_id: string, _command: string): Promise<CommandResult> { return Promise.reject(this.unavailable()); } startProcess(_id: string, _command: string): Promise<ProcessHandle> { return Promise.reject(this.unavailable()); }
  getProcessLogs(_id: string, _pid: string): Promise<string> { return Promise.reject(this.unavailable()); } downloadArtifacts(_id: string, _remote: string, _local: string): Promise<void> { return Promise.reject(this.unavailable()); }
  stopProcess(_id: string, _pid: string): Promise<void> { return Promise.reject(this.unavailable()); } deleteSandbox(_id: string): Promise<void> { return Promise.reject(this.unavailable()); } getSandboxStatus(_id: string): Promise<SandboxStatus> { return Promise.reject(this.unavailable()); }
}
export class MockSandboxProvider implements SandboxProvider {
  async createSandbox(spec: SandboxSpec): Promise<SandboxHandle> { return { id: `mock-${encodeURIComponent(spec.name)}`, status: 'READY' }; }
  async uploadFiles(): Promise<void> {} async executeCommand(): Promise<CommandResult> { return { exitCode: 0, stdout: 'mock command complete', stderr: '' }; }
  async startProcess(): Promise<ProcessHandle> { return { processId: 'mock-process' }; } async getProcessLogs(): Promise<string> { return 'mock process complete'; }
  async downloadArtifacts(): Promise<void> {} async stopProcess(): Promise<void> {} async deleteSandbox(): Promise<void> {} async getSandboxStatus(): Promise<SandboxStatus> { return 'READY'; }
}
export interface SandboxProviderConfiguration { daytonaApiKey?: string; daytonaApiUrl?: string; target?: string; snapshot?: string }
export function createSandboxProvider(config: SandboxProviderConfiguration): SandboxProvider {
  if (!config.daytonaApiKey) return new MockSandboxProvider();
  return new DaytonaSandboxProvider(new DaytonaClient({ apiKey: config.daytonaApiKey, ...(config.daytonaApiUrl ? { apiUrl: config.daytonaApiUrl } : {}), ...(config.target ? { target: config.target } : {}), ...(config.snapshot ? { snapshot: config.snapshot } : {}) }));
}
