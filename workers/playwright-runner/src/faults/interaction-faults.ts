import type { Locator } from '@playwright/test'; import type { AppliedFault, WorkerJob } from '@taskos/execution-contracts'; import { nowIso } from '../utils/timestamps.js';
export interface InteractionResult { timestamps: string[]; intervalMs?: number }
export class InteractionFaultController {
  readonly appliedFaults: AppliedFault[] = []; constructor(private readonly job: WorkerJob) {}
  shouldRepeatPayment(): boolean { return this.job.world.userProfile === 'impatient' && this.job.world.doubleSubmit; }
  async click(locator: Locator, selector: string, paymentSubmission = false): Promise<InteractionResult> { const first = nowIso(); await locator.click(); if (!paymentSubmission || !this.shouldRepeatPayment()) return { timestamps: [first] }; const configuredIntervalMs = this.job.world.doubleSubmitIntervalMs; if (configuredIntervalMs > 0) await new Promise((resolve) => setTimeout(resolve, configuredIntervalMs)); const second = nowIso(); await locator.click({ force: true }); const actualIntervalMs = new Date(second).getTime() - new Date(first).getTime(); this.appliedFaults.push({ type: 'REPEATED_SUBMISSION', parameters: { selector, firstClickAt: first, secondClickAt: second, configuredIntervalMs, actualIntervalMs }, appliedAt: second }); return { timestamps: [first, second], intervalMs: actualIntervalMs }; }
}
