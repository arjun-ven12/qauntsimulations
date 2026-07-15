import type { Browser, BrowserContext } from '@playwright/test'; import type { WorkerJob } from '@taskos/execution-contracts'; import { safeChildPath, ensureDirectory } from '../utils/filesystem.js'; import { resolveViewport } from './browser-factory.js';
export interface BrowserContextResources { context: BrowserContext; viewport: { width: number; height: number }; videoDirectory?: string }
export async function createBrowserContext(browser: Browser, job: WorkerJob): Promise<BrowserContextResources> {
  const viewport = resolveViewport(job.browser.viewport); const videoDirectory = job.evidence.video ? safeChildPath(job.evidence.outputDirectory, 'video') : undefined;
  if (videoDirectory) await ensureDirectory(videoDirectory);
  const context = await browser.newContext({ viewport, ...(videoDirectory ? { recordVideo: { dir: videoDirectory, size: viewport } } : {}) });
  if (job.world.clearStorageBeforeRun) await context.clearCookies();
  return { context, viewport, ...(videoDirectory ? { videoDirectory } : {}) };
}
