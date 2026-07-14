import { mkdir, stat, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; import type { Page } from '@playwright/test'; import type { EvidenceManifest } from '@taskos/execution-contracts';
export class EvidenceRecorder {
  private readonly artifacts: EvidenceManifest['artifacts'] = []; private readonly consoleLines: string[] = []; private readonly networkLines: string[] = [];
  constructor(private readonly directory: string) {}
  async start(page: Page): Promise<void> { await mkdir(this.directory, { recursive: true }); page.on('console', (message) => this.consoleLines.push(`${message.type()} ${message.text()}`)); page.on('response', (response) => this.networkLines.push(`${response.status()} ${response.url()}`)); }
  async screenshot(page: Page, name = 'final.png'): Promise<void> { const path = join(this.directory, name); await page.screenshot({ path, fullPage: true }); await this.add('SCREENSHOT', path, 'image/png'); }
  async finish(): Promise<EvidenceManifest> { const consolePath = join(this.directory, 'console.log'); const networkPath = join(this.directory, 'network.log'); await writeFile(consolePath, this.consoleLines.join('\n')); await writeFile(networkPath, this.networkLines.join('\n')); await this.add('CONSOLE_LOG', consolePath, 'text/plain'); await this.add('NETWORK_LOG', networkPath, 'text/plain'); return { outputDirectory: this.directory, artifacts: this.artifacts }; }
  private async add(type: EvidenceManifest['artifacts'][number]['type'], path: string, mimeType: string): Promise<void> { this.artifacts.push({ type, path, mimeType, sizeBytes: (await stat(path)).size }); }
}
