export type SandboxStatus = 'CREATING' | 'READY' | 'RUNNING' | 'STOPPED' | 'FAILED' | 'DELETED';

export interface SandboxSpec {
  name: string;
  snapshot?: string;
  target: 'eu';
  labels: Record<string, string>;
  environment: Record<string, string>;
  timeoutSeconds: number;
  autoDelete: boolean;
}

export interface SandboxHandle {
  id: string;
  name: string;
  status: SandboxStatus;
  target: string;
  snapshot?: string;
  createdAt?: string;
}

export interface SandboxUpload {
  source: string | Buffer;
  destination: string;
}

export interface SandboxDownload {
  source: string;
  destination: string;
}

export interface SandboxCommand {
  executable: string;
  args: string[];
  cwd?: string;
  environment?: Record<string, string>;
  timeoutSeconds?: number;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface ProcessHandle {
  processId: string;
  commandId: string;
}

export interface ProcessWaitOptions {
  timeoutSeconds: number;
  pollIntervalMs?: number;
  isCancelled?: () => Promise<boolean>;
}

export interface SandboxProvider {
  createSandbox(spec: SandboxSpec): Promise<SandboxHandle>;
  uploadFiles(sandbox: SandboxHandle, files: SandboxUpload[], timeoutSeconds?: number): Promise<void>;
  executeCommand(sandbox: SandboxHandle, command: SandboxCommand): Promise<CommandResult>;
  startProcess(sandbox: SandboxHandle, command: SandboxCommand): Promise<ProcessHandle>;
  waitForProcess(
    sandbox: SandboxHandle,
    process: ProcessHandle,
    options: ProcessWaitOptions,
  ): Promise<CommandResult>;
  getProcessLogs(sandbox: SandboxHandle, process: ProcessHandle): Promise<CommandResult>;
  downloadFiles(
    sandbox: SandboxHandle,
    files: SandboxDownload[],
    timeoutSeconds?: number,
  ): Promise<void>;
  stopProcess(sandbox: SandboxHandle, process: ProcessHandle): Promise<void>;
  deleteSandbox(sandbox: SandboxHandle): Promise<void>;
  getSandboxStatus(sandbox: SandboxHandle): Promise<SandboxStatus>;
}
