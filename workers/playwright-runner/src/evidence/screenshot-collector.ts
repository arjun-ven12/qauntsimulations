import type { Page } from '@playwright/test'; import { safeChildPath, ensureDirectory } from '../utils/filesystem.js';
const slug = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'step';
export class ScreenshotCollector {
  readonly paths: string[] = []; private readonly directory: string;
  constructor(outputDirectory: string, private readonly enabled: boolean) { this.directory = safeChildPath(outputDirectory, 'screenshots'); }
  async initialize(): Promise<void> { if (this.enabled) await ensureDirectory(this.directory); }
  captureInitial(page: Page): Promise<void> { return this.capture(page, '001-initial.png'); }
  captureCheckpoint(page: Page, sequence: number, name: string): Promise<void> { return this.capture(page, `${String(sequence).padStart(3, '0')}-${slug(name)}.png`); }
  captureFailure(page: Page): Promise<void> { return this.capture(page, '999-failure.png'); }
  captureFinal(page: Page): Promise<void> { return this.capture(page, '998-final.png'); }
  private async capture(page: Page, filename: string): Promise<void> { if (!this.enabled) return; const path = safeChildPath(this.directory, filename); await page.screenshot({ path, fullPage: true }); this.paths.push(path); }
}
