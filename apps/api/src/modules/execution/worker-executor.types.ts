import type { WorkerJob, WorkerResult } from '@taskos/execution-contracts';

export type WorkerExecutionProvider = 'LOCAL' | 'DAYTONA';

export interface WorkerExecutionEvent {
  phase: string;
  message: string;
  sandboxId?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkerExecutionContext {
  investigationId: string;
  worldId: string;
  experimentId: string;
  workerId: string;
  evidenceDirectory: string;
  isCancelled?: () => Promise<boolean>;
  emitEvent?: (event: WorkerExecutionEvent) => Promise<void>;
}

export interface WorkerProviderMetadata {
  provider: WorkerExecutionProvider;
  sandboxId?: string;
  sandboxName?: string;
  target?: string;
  snapshot?: string;
  sandboxCreatedAt?: string;
  sandboxCreationDurationMs?: number;
  uploadDurationMs?: number;
  demoStoreSetupDurationMs?: number;
  workerSetupDurationMs?: number;
  workerExecutionDurationMs?: number;
  artifactDownloadDurationMs?: number;
  cleanupOutcome?: 'DELETED' | 'FAILED' | 'NOT_REQUIRED';
  cleanupError?: string;
  nodeVersion?: string;
  playwrightVersion?: string;
  chromiumVersion?: string;
}

export interface WorkerExecutionResponse {
  result: WorkerResult;
  exitCode: number;
  stdoutSummary?: string;
  stderrSummary?: string;
  providerMetadata: WorkerProviderMetadata;
}

export interface WorkerExecutor {
  readonly provider: WorkerExecutionProvider;
  execute(job: WorkerJob, context: WorkerExecutionContext): Promise<WorkerExecutionResponse>;
  cancel?(executionId: string): Promise<void>;
}
