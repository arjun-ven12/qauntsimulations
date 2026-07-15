import type { BrowserContext } from '@playwright/test'; import { ensureDirectory, safeChildPath } from '../utils/filesystem.js';
export class TraceCollector { readonly path?: string; private readonly directory?: string; constructor(outputDirectory: string, private readonly enabled: boolean) { if (enabled) { this.directory = safeChildPath(outputDirectory, 'trace'); this.path = safeChildPath(outputDirectory, 'trace', 'trace.zip'); } }
  async start(context: BrowserContext): Promise<void> { if (!this.enabled) return; await ensureDirectory(this.directory!); await context.tracing.start({ screenshots: true, snapshots: true, sources: true }); }
  async stop(context: BrowserContext): Promise<void> { if (this.enabled && this.path) await context.tracing.stop({ path: this.path }); }
}
