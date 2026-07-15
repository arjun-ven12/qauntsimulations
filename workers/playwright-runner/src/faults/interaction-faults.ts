import type { Locator } from '@playwright/test'; import type { AppliedFault, WorkerJob } from '@taskos/execution-contracts'; import { nowIso } from '../utils/timestamps.js';
export interface InteractionResult { timestamps: string[]; intervalMs?: number }
export class InteractionFaultController {
  readonly appliedFaults: AppliedFault[] = []; constructor(private readonly job: WorkerJob) {}
  shouldRepeat(selector: string): boolean { if (this.job.world.userProfile !== 'impatient' || !this.job.world.doubleSubmit) return false; return this.job.world.submitSelector ? selector === this.job.world.submitSelector : /submit|place-order|pay|checkout/i.test(selector); }
  async click(locator: Locator, selector: string): Promise<InteractionResult> { const first = nowIso(); await locator.click(); if (!this.shouldRepeat(selector)) return { timestamps: [first] }; const intervalMs = this.job.world.retryIntervalMs ?? 0; if (intervalMs > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs)); const second = nowIso(); await locator.click(); this.appliedFaults.push({ type: 'REPEATED_SUBMISSION', parameters: { selector, intervalMs }, appliedAt: second }); return { timestamps: [first, second], intervalMs: new Date(second).getTime() - new Date(first).getTime() }; }
}
