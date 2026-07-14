export interface WorkerRegistry { heartbeat(workerId: string): Promise<void> }
