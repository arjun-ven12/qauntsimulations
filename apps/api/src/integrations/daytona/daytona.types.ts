export type SandboxStatus = 'CREATING' | 'READY' | 'RUNNING' | 'STOPPED' | 'FAILED' | 'DELETED';
export interface SandboxSpec { name: string; snapshot?: string; environment: Record<string, string>; timeoutSeconds: number }
export interface SandboxHandle { id: string; status: SandboxStatus }
export interface CommandResult { exitCode: number; stdout: string; stderr: string }
export interface ProcessHandle { processId: string }
export interface SandboxProvider {
  createSandbox(spec: SandboxSpec): Promise<SandboxHandle>; uploadFiles(sandboxId: string, files: Array<{ localPath: string; remotePath: string }>): Promise<void>;
  executeCommand(sandboxId: string, command: string): Promise<CommandResult>; startProcess(sandboxId: string, command: string): Promise<ProcessHandle>;
  getProcessLogs(sandboxId: string, processId: string): Promise<string>; downloadArtifacts(sandboxId: string, remotePath: string, localPath: string): Promise<void>;
  stopProcess(sandboxId: string, processId: string): Promise<void>; deleteSandbox(sandboxId: string): Promise<void>; getSandboxStatus(sandboxId: string): Promise<SandboxStatus>;
}
