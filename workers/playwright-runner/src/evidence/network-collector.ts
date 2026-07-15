import type { Page, Request, Response } from '@playwright/test'; import type { NetworkEvent, WorkerJob } from '@taskos/execution-contracts'; import { nowIso } from '../utils/timestamps.js'; import { matchesRequestPattern, orderPatterns, paymentPatterns } from '../faults/network-faults.js'; import { writeJson } from '../utils/filesystem.js';
const SENSITIVE_KEY = /authorization|cookie|set-cookie|x-api-key|password|passwd|secret|token|credential/i;
export function redactHeaders(headers: Record<string, string>): Record<string, string> { return Object.fromEntries(Object.entries(headers).map(([key, value]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : value])); }
export function redactUnknown(value: unknown): unknown { if (Array.isArray(value)) return value.map(redactUnknown); if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : redactUnknown(item)])); if (typeof value === 'string') return value.replace(/(bearer\s+)[a-z0-9._~+/-]+/gi, '$1[REDACTED]').replace(/((?:password|token|secret|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]'); return value; }
export interface CapturedNetworkEvent extends NetworkEvent { responseBody?: unknown }
export class NetworkCollector {
  readonly events: CapturedNetworkEvent[] = []; private readonly pending = new Map<Request, CapturedNetworkEvent>();
  constructor(private readonly job: WorkerJob) {}
  attach(page: Page): void {
    page.on('request', (request) => { const event: CapturedNetworkEvent = { id: crypto.randomUUID(), url: request.url(), method: request.method(), requestTimestamp: nowIso(), resourceType: request.resourceType(), isPaymentRequest: matchesRequestPattern(request.url(), paymentPatterns(this.job)), isOrderRequest: matchesRequestPattern(request.url(), orderPatterns(this.job)) }; this.events.push(event); this.pending.set(request, event); });
    page.on('response', (response) => void this.recordResponse(response));
    page.on('requestfailed', (request) => { const event = this.pending.get(request); if (!event) return; event.failureReason = request.failure()?.errorText ?? 'Request failed'; this.complete(event); });
  }
  private async recordResponse(response: Response): Promise<void> { const event = this.pending.get(response.request()); if (!event) return; event.statusCode = response.status(); event.responseTimestamp = nowIso(); event.durationMs = new Date(event.responseTimestamp).getTime() - new Date(event.requestTimestamp).getTime(); if (event.isPaymentRequest || event.isOrderRequest) { const contentType = response.headers()['content-type'] ?? ''; if (contentType.includes('application/json')) { try { event.responseBody = redactUnknown(await response.json()); } catch { /* response bodies are optional evidence */ } } } this.pending.delete(response.request()); }
  private complete(event: CapturedNetworkEvent): void { event.responseTimestamp = nowIso(); event.durationMs = new Date(event.responseTimestamp).getTime() - new Date(event.requestTimestamp).getTime(); }
  write(path: string): Promise<void> { return writeJson(path, this.events); }
}
