/** Orchestration ports for dispatching validated WorkerJobs. Runtime implementation is intentionally pending. */
export interface ExecutionDispatcher { dispatch(experimentId: string): Promise<void>; cancel(experimentId: string): Promise<void> }
