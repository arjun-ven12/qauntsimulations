export class WorkerError extends Error {
  constructor(readonly code: string, message: string, options?: ErrorOptions) { super(message, options); this.name = new.target.name; }
}
export class InvalidJobError extends WorkerError { constructor(message: string, options?: ErrorOptions) { super('INVALID_JOB', message, options); } }
export class UnsupportedBrowserError extends WorkerError { constructor(engine: string) { super('UNSUPPORTED_BROWSER', `Unsupported browser engine: ${engine}`); } }
export class BrowserLaunchError extends WorkerError { constructor(message: string, options?: ErrorOptions) { super('BROWSER_LAUNCH_FAILED', message, options); } }
export class NavigationError extends WorkerError { constructor(message: string, options?: ErrorOptions) { super('NAVIGATION_FAILED', message, options); } }
export class JourneyStepError extends WorkerError { constructor(readonly stepIndex: number, message: string, options?: ErrorOptions) { super('JOURNEY_STEP_FAILED', message, options); } }
export class EvidenceWriteError extends WorkerError { constructor(message: string, options?: ErrorOptions) { super('EVIDENCE_WRITE_FAILED', message, options); } }
export class InvariantEvaluationError extends WorkerError { constructor(message: string, options?: ErrorOptions) { super('INVARIANT_EVALUATION_FAILED', message, options); } }
export class WorkerTimeoutError extends WorkerError { constructor(timeoutMs: number) { super('WORKER_TIMED_OUT', `Worker exceeded its ${timeoutMs} ms timeout`); } }
export class ResultValidationError extends WorkerError { constructor(message: string, options?: ErrorOptions) { super('RESULT_VALIDATION_FAILED', message, options); } }
export class TestSetupError extends WorkerError { constructor(message: string, options?: ErrorOptions) { super('TEST_SETUP_FAILED', message, options); } }
