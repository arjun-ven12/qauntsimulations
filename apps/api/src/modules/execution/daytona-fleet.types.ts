import type { WorkerExecutionProvider, WorkerExecutionResponse } from './worker-executor.types.js';

export type FleetTerminalStatus = 'PASSED' | 'INVARIANT_VIOLATION' | 'EXECUTION_FAILED' | 'CANCELLED';

export interface FleetRetryPolicy {
  maximumAttempts: number;
  baseDelayMs: number;
  maximumDelayMs: number;
  retryableErrorCodes: string[];
}

export interface FleetExecutionOptions {
  investigationId: string;
  maximumConcurrency: number;
  retryPolicy: FleetRetryPolicy;
  maximumTotalSandboxCreations: number;
  maximumDurationMs: number;
  cancellationSignal?: AbortSignal;
  emitEvent?: (event: FleetEvent) => Promise<void>;
}

export interface FleetAttemptContext {
  attemptNumber: number;
  maximumAttempts: number;
  signal: AbortSignal;
  emitEvent(event: FleetEvent): Promise<void>;
}

export interface FleetJob {
  investigationId: string;
  worldId: string;
  experimentId: string;
  workerId?: string;
  creationOrder: number;
  executeAttempt(context: FleetAttemptContext): Promise<WorkerExecutionResponse>;
  cancelUnstarted?(): Promise<void>;
}

export interface FleetEvent {
  phase: string;
  message: string;
  worldId?: string | undefined;
  experimentId?: string | undefined;
  workerId?: string | undefined;
  sandboxId?: string | undefined;
  metadata?: Record<string, unknown>;
}

export interface FleetJobResult {
  investigationId: string;
  worldId: string;
  experimentId: string;
  attempts: number;
  status: FleetTerminalStatus;
  provider: WorkerExecutionProvider;
  cleanupFailed: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface FleetExecutionSummary {
  total: number;
  succeeded: number;
  invariantViolations: number;
  executionFailures: number;
  cancelled: number;
  cleanupFailures: number;
  results: FleetJobResult[];
}

export interface DaytonaFleetSnapshot {
  activeSandboxes: number;
  waitingJobs: number;
  totalStarted: number;
  totalCompleted: number;
  totalRetries: number;
  cleanupFailures: number;
  peakConcurrency: number;
}

export interface ActiveDaytonaExecution {
  investigationId: string;
  worldId: string;
  experimentId: string;
  workerId?: string | undefined;
  sandboxId: string;
  startedAt: Date;
  cancel: () => Promise<void>;
}
