import type { Page } from '@playwright/test'; import { writeJson } from '../utils/filesystem.js'; import { nowIso } from '../utils/timestamps.js'; import { redactUnknown } from './network-collector.js';
export interface ConsoleEvent { timestamp: string; type: 'log' | 'warning' | 'error' | 'pageerror'; text: string; location?: { url: string; lineNumber: number; columnNumber: number } }
export class ConsoleCollector {
  readonly events: ConsoleEvent[] = [];
  attach(page: Page): void { page.on('console', (message) => { const rawType = message.type(); const type: ConsoleEvent['type'] = rawType === 'warning' || rawType === 'error' ? rawType : 'log'; const location = message.location(); this.events.push({ timestamp: nowIso(), type, text: String(redactUnknown(message.text())), ...(location.url ? { location } : {}) }); }); page.on('pageerror', (error) => this.events.push({ timestamp: nowIso(), type: 'pageerror', text: String(redactUnknown(error.message)) })); }
  errorCount(): number { return this.events.filter((event) => event.type === 'error' || event.type === 'pageerror').length; }
  write(path: string): Promise<void> { return writeJson(path, this.events); }
}
