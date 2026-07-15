import type { Page, Request, Route } from '@playwright/test'; import type { AppliedFault, WorkerJob } from '@taskos/execution-contracts'; import { nowIso } from '../utils/timestamps.js';
export const DEFAULT_PAYMENT_PATTERNS = ['/api/payment', '/api/payments', '/api/checkout'];
export const DEFAULT_ORDER_PATTERNS = ['/api/order', '/api/orders'];
export function matchesRequestPattern(url: string, patterns: string[]): boolean { const normalized = url.toLowerCase(); return patterns.some((pattern) => { try { return new RegExp(pattern, 'i').test(url); } catch { return normalized.includes(pattern.toLowerCase()); } }); }
export function paymentPatterns(job: WorkerJob): string[] { return job.world.paymentUrlPatterns ?? DEFAULT_PAYMENT_PATTERNS; }
export function orderPatterns(job: WorkerJob): string[] { return job.world.orderUrlPatterns ?? DEFAULT_ORDER_PATTERNS; }
export class NetworkFaultController {
  private readonly failureCounts = new Map<number, number>(); readonly appliedFaults: AppliedFault[] = [];
  constructor(private readonly job: WorkerJob) {}
  async install(page: Page): Promise<void> {
    const payment = paymentPatterns(this.job); await page.route('**/*', async (route: Route, request: Request) => {
      const failure = this.matchFailure(request); if (failure) { this.appliedFaults.push({ type: 'REQUEST_FAILURE', parameters: { url: request.url(), failureCode: failure.failureCode }, appliedAt: nowIso() }); await route.abort(failure.failureCode); return; }
      const delayMs = matchesRequestPattern(request.url(), payment) ? Math.max(this.job.world.latencyMs, this.job.world.paymentDelayMs ?? 0) : this.job.world.latencyMs;
      if (delayMs > 0) { this.appliedFaults.push({ type: matchesRequestPattern(request.url(), payment) ? 'PAYMENT_LATENCY' : 'NETWORK_LATENCY', parameters: { url: request.url(), delayMs }, appliedAt: nowIso() }); await new Promise((resolve) => setTimeout(resolve, delayMs)); }
      await route.continue();
    });
  }
  private matchFailure(request: Request) { const rules = this.job.world.requestFailures ?? []; for (const [index, rule] of rules.entries()) { const count = this.failureCounts.get(index) ?? 0; if (count >= rule.maxFailures || !matchesRequestPattern(request.url(), rule.urlPatterns) || (rule.resourceTypes && !rule.resourceTypes.includes(request.resourceType()))) continue; this.failureCounts.set(index, count + 1); return rule; } return undefined; }
}
