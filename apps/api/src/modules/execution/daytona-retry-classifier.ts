const retryablePatterns: Array<[RegExp, string]> = [
  [/rate.?limit|429/i, 'DAYTONA_RATE_LIMITED'],
  [/create.*sandbox|unable to create|sandbox creation/i, 'DAYTONA_SANDBOX_CREATION_FAILED'],
  [/not ready|readiness timed out|demo-store readiness/i, 'DAYTONA_SANDBOX_NOT_READY'],
  [/upload/i, 'DAYTONA_UPLOAD_FAILED'],
  [/download|evidence/i, 'DAYTONA_ARTIFACT_DOWNLOAD_FAILED'],
  [/transport|socket|econnreset|network|timeout/i, 'DAYTONA_COMMAND_TRANSPORT_ERROR'],
];

const nonRetryablePatterns: Array<[RegExp, string]> = [
  [/invariant/i, 'INVARIANT_VIOLATION'],
  [/invalid worker job/i, 'INVALID_WORKER_JOB'],
  [/invalid worker result|schema|zod/i, 'INVALID_WORKER_RESULT_SCHEMA'],
  [/selector|journey/i, 'JOURNEY_SELECTOR_MISSING'],
  [/demo-store.*contract/i, 'DEMO_STORE_CONTRACT_BROKEN'],
  [/cancel/i, 'CANCELLED'],
  [/unauthor|credential|api key/i, 'UNAUTHORIZED_CONFIGURATION'],
];

export interface RetryClassification {
  code: string;
  retryable: boolean;
  message: string;
}

export function classifyFleetError(error: unknown): RetryClassification {
  const message = error instanceof Error ? error.message : String(error);
  for (const [pattern, code] of nonRetryablePatterns) {
    if (pattern.test(message)) return { code, retryable: false, message };
  }
  for (const [pattern, code] of retryablePatterns) {
    if (pattern.test(message)) return { code, retryable: true, message };
  }
  return { code: 'EXECUTION_FAILED', retryable: false, message };
}

export function retryDelayMs(attemptNumber: number, baseDelayMs: number, maximumDelayMs: number): number {
  const base = Math.max(0, baseDelayMs);
  const maximum = Math.max(0, maximumDelayMs);
  const exponential = base * 2 ** Math.max(0, attemptNumber - 1);
  const jitter = Math.floor(Math.min(base, maximum || base) * 0.1 * Math.random());
  return Math.min(maximum, exponential + jitter);
}

export async function cancellableDelay(durationMs: number, signal?: AbortSignal): Promise<void> {
  if (durationMs <= 0) return;
  if (signal?.aborted) throw new Error('Cancelled during Daytona retry delay');
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(done, durationMs);
    const abort = () => {
      clearTimeout(timeout);
      reject(new Error('Cancelled during Daytona retry delay'));
    };
    function done() {
      signal?.removeEventListener('abort', abort);
      resolve();
    }
    signal?.addEventListener('abort', abort, { once: true });
  });
}
