import { resolve, relative, isAbsolute } from 'node:path';
import { workerJobSchema, workerResultSchema, type WorkerJob, type WorkerResult } from '@taskos/execution-contracts';
import { runWorker } from '@taskos/playwright-runner';

export interface WorkerExecutionResponse {
  result: WorkerResult;
  exitCode: number;
}

export interface WorkerExecutor {
  execute(job: WorkerJob): Promise<WorkerExecutionResponse>;
}

export class LocalPlaywrightWorkerExecutor implements WorkerExecutor {
  private readonly evidenceRoot: string;

  constructor(evidenceRoot: string) {
    this.evidenceRoot = resolve(evidenceRoot);
  }

  async execute(input: WorkerJob): Promise<WorkerExecutionResponse> {
    const job = workerJobSchema.parse(input);
    const outputDirectory = resolve(job.evidence.outputDirectory);
    const relativeOutput = relative(this.evidenceRoot, outputDirectory);
    if (relativeOutput.startsWith('..') || isAbsolute(relativeOutput)) throw new Error('Worker evidence path escaped the configured evidence root');
    const result = workerResultSchema.parse(await runWorker(job));
    return { result, exitCode: this.exitCode(result.status) };
  }

  private exitCode(status: WorkerResult['status']): number {
    if (status === 'PASSED') return 0;
    if (status === 'INVARIANT_VIOLATION') return 2;
    if (status === 'FAILED') return 3;
    if (status === 'TIMED_OUT') return 4;
    return 6;
  }
}
