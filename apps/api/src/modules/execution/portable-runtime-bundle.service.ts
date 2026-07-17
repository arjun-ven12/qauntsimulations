import { lstat, readdir } from 'node:fs/promises';
import { basename, join, relative, resolve } from 'node:path';
import type { WorkerJob } from '@taskos/execution-contracts';
import type { SandboxUpload } from '../../integrations/daytona/daytona.types.js';

export interface PortableBundleConfiguration {
  demoStoreDistPath: string;
  workerBundlePath: string;
  remoteDemoStorePath: string;
  remoteWorkerPath: string;
  remoteInputPath: string;
}

export interface PortableUploadManifest {
  demoStore: SandboxUpload[];
  worker: SandboxUpload[];
  input: SandboxUpload[];
}

export class PortableRuntimeBundleService {
  constructor(private readonly config: PortableBundleConfiguration) {}

  async createUploadManifest(job: WorkerJob): Promise<PortableUploadManifest> {
    const [demoStore, worker] = await Promise.all([
      this.files(this.config.demoStoreDistPath, `${this.config.remoteDemoStorePath}/dist`),
      this.files(this.config.workerBundlePath, this.config.remoteWorkerPath),
    ]);
    if (!demoStore.some(({ destination }) => destination.endsWith('/server/production-server.js'))) {
      throw new Error('Demo-store production bundle is missing production-server.js');
    }
    if (!worker.some(({ destination }) => destination.endsWith('/worker.mjs'))) {
      throw new Error('Playwright worker portable bundle is missing worker.mjs');
    }
    demoStore.push({
      source: Buffer.from('{"name":"taskos-demo-store-bundle","private":true,"type":"module"}\n'),
      destination: `${this.config.remoteDemoStorePath}/package.json`,
    });
    return {
      demoStore,
      worker,
      input: [{
        source: Buffer.from(`${JSON.stringify(job, null, 2)}\n`),
        destination: `${this.config.remoteInputPath}/worker-job.json`,
      }],
    };
  }

  private async files(localRootInput: string, remoteRoot: string): Promise<SandboxUpload[]> {
    const localRoot = resolve(localRootInput);
    const rootDetails = await lstat(localRoot).catch(() => null);
    if (!rootDetails?.isDirectory()) throw new Error(`Portable runtime bundle does not exist: ${localRoot}`);
    const entries = await readdir(localRoot, { recursive: true, withFileTypes: true });
    const uploads: SandboxUpload[] = [];
    for (const entry of entries) {
      const localPath = resolve(entry.parentPath, entry.name);
      const details = await lstat(localPath);
      if (details.isSymbolicLink()) throw new Error(`Portable runtime bundle cannot contain symlinks: ${localPath}`);
      if (!details.isFile()) continue;
      const relativePath = relative(localRoot, localPath).split('/').join('/');
      if (relativePath.includes('..') || basename(relativePath).startsWith('.env')) {
        throw new Error(`Unsafe portable runtime file: ${localPath}`);
      }
      uploads.push({ source: localPath, destination: join(remoteRoot, relativePath).split('\\').join('/') });
    }
    return uploads.sort((left, right) => left.destination.localeCompare(right.destination));
  }
}
