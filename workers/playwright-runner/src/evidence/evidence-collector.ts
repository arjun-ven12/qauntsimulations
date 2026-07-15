import type { BrowserContext, Page } from '@playwright/test'; import type { WorkerJob } from '@taskos/execution-contracts'; import { fileSize, safeChildPath, ensureDirectory } from '../utils/filesystem.js'; import { ConsoleCollector } from './console-collector.js'; import { NetworkCollector } from './network-collector.js'; import { ScreenshotCollector } from './screenshot-collector.js'; import { TraceCollector } from './trace-collector.js';
export interface EvidenceArtifacts { artifacts: Array<{ type: string; path: string; mimeType?: string; sizeBytes?: number }>; screenshotPaths: string[]; tracePath?: string; consoleLogPath?: string; networkLogPath?: string; videoPath?: string; evidenceErrors: string[] }
export class EvidenceCollector {
  readonly console: ConsoleCollector; readonly network: NetworkCollector; readonly screenshots: ScreenshotCollector; readonly trace: TraceCollector; readonly evidenceErrors: string[] = [];
  private readonly consolePath: string; private readonly networkPath: string;
  constructor(private readonly job: WorkerJob) { this.console = new ConsoleCollector(); this.network = new NetworkCollector(job); this.screenshots = new ScreenshotCollector(job.evidence.outputDirectory, job.evidence.screenshots); this.trace = new TraceCollector(job.evidence.outputDirectory, job.evidence.trace); this.consolePath = safeChildPath(job.evidence.outputDirectory, 'console', 'console.json'); this.networkPath = safeChildPath(job.evidence.outputDirectory, 'network', 'network.json'); }
  async start(context: BrowserContext, page: Page): Promise<void> { await ensureDirectory(this.job.evidence.outputDirectory); await this.screenshots.initialize(); if (this.job.evidence.console) this.console.attach(page); if (this.job.evidence.network) this.network.attach(page); try { await this.trace.start(context); } catch (error) { this.evidenceErrors.push(`Trace start failed: ${error instanceof Error ? error.message : 'unknown error'}`); } }
  async finish(context: BrowserContext, page: Page): Promise<EvidenceArtifacts> {
    try { await this.trace.stop(context); } catch (error) { this.evidenceErrors.push(`Trace save failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
    if (this.job.evidence.console) try { await this.console.write(this.consolePath); } catch (error) { this.evidenceErrors.push(`Console evidence failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
    if (this.job.evidence.network) try { await this.network.write(this.networkPath); } catch (error) { this.evidenceErrors.push(`Network evidence failed: ${error instanceof Error ? error.message : 'unknown error'}`); }
    const artifacts: EvidenceArtifacts['artifacts'] = []; for (const path of this.screenshots.paths) artifacts.push(await this.artifact('SCREENSHOT', path, 'image/png'));
    if (this.trace.path && !this.evidenceErrors.some((error) => error.startsWith('Trace save'))) artifacts.push(await this.artifact('TRACE', this.trace.path, 'application/zip'));
    if (this.job.evidence.console) artifacts.push(await this.artifact('CONSOLE_LOG', this.consolePath, 'application/json'));
    if (this.job.evidence.network) artifacts.push(await this.artifact('NETWORK_LOG', this.networkPath, 'application/json'));
    void page;
    return { artifacts, screenshotPaths: [...this.screenshots.paths], ...(this.trace.path ? { tracePath: this.trace.path } : {}), ...(this.job.evidence.console ? { consoleLogPath: this.consolePath } : {}), ...(this.job.evidence.network ? { networkLogPath: this.networkPath } : {}), evidenceErrors: [...this.evidenceErrors] };
  }
  private async safeSize(path: string): Promise<number | undefined> { try { return await fileSize(path); } catch { return undefined; } }
  private async artifact(type: string, path: string, mimeType: string): Promise<EvidenceArtifacts['artifacts'][number]> { const sizeBytes = await this.safeSize(path); return { type, path, mimeType, ...(sizeBytes !== undefined ? { sizeBytes } : {}) }; }
}
