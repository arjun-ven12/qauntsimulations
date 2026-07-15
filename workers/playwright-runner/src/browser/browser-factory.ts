import { chromium, firefox, webkit, type Browser, type BrowserType } from '@playwright/test'; import type { WorkerJob } from '@taskos/execution-contracts'; import { BrowserLaunchError, UnsupportedBrowserError } from '../errors/worker.errors.js';
export interface ResolvedViewport { width: number; height: number }
export const VIEWPORT_PRESETS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;
export function resolveViewport(viewport: WorkerJob['browser']['viewport']): ResolvedViewport { return typeof viewport === 'string' ? { ...VIEWPORT_PRESETS[viewport] } : viewport; }
function browserType(engine: WorkerJob['browser']['engine']): BrowserType { if (engine === 'chromium') return chromium; if (engine === 'firefox') return firefox; if (engine === 'webkit') return webkit; throw new UnsupportedBrowserError(engine); }
export async function launchBrowser(config: WorkerJob['browser']): Promise<Browser> { try { return await browserType(config.engine).launch({ headless: config.headless }); } catch (error) { throw new BrowserLaunchError(`Failed to launch ${config.engine}. Run "pnpm exec playwright install ${config.engine}".`, { cause: error }); } }
