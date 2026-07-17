import type { Page } from '@playwright/test'; import type { JourneyAction, JourneyStep, WorkerJob } from '@taskos/execution-contracts'; import { JourneyStepError, NavigationError } from '../errors/worker.errors.js'; import type { InteractionFaultController } from '../faults/interaction-faults.js'; import { nowIso } from '../utils/timestamps.js'; import { stepSelector } from './journey.types.js';
export class JourneyStepExecutor {
  constructor(private readonly page: Page, private readonly job: WorkerJob, private readonly interactions: InteractionFaultController) {}
  async execute(step: JourneyStep, stepIndex: number): Promise<JourneyAction> {
    const startedAt = nowIso(); const base = this.job.target.journeyPath ? new URL(this.job.target.journeyPath, this.job.target.baseUrl).toString() : this.job.target.baseUrl;
    try {
      let interactionTimestamps: string[] | undefined; let interactionIntervalMs: number | undefined;
      if (step.type === 'goto') { try { await this.page.goto(new URL(step.path, base).toString(), { waitUntil: 'domcontentloaded' }); } catch (error) { throw new NavigationError(`Unable to navigate to ${step.path}`, { cause: error }); } }
      else if (step.type === 'click' || step.type === 'submitPayment') { const result = await this.interactions.click(this.page.locator(step.selector), step.selector, step.type === 'submitPayment'); interactionTimestamps = result.timestamps; interactionIntervalMs = result.intervalMs; }
      else if (step.type === 'doubleClick') { const first = nowIso(); await this.page.locator(step.selector).dblclick(); interactionTimestamps = [first, nowIso()]; }
      else if (step.type === 'fill') await this.page.locator(step.selector).fill(step.value);
      else if (step.type === 'waitFor') await this.page.locator(step.selector).waitFor({ state: 'visible', ...(step.timeoutMs ? { timeout: step.timeoutMs } : {}) });
      else if (step.type === 'wait') await this.page.waitForTimeout(step.durationMs);
      else if (step.type === 'reload') await this.page.reload({ waitUntil: 'domcontentloaded' });
      else if (step.type === 'assertVisible') await this.page.locator(step.selector).waitFor({ state: 'visible' });
      else if (step.type === 'assertText') { const text = await this.page.locator(step.selector).textContent(); if (!text?.includes(step.expectedText)) throw new Error(`Expected text "${step.expectedText}" but observed "${text ?? ''}"`); }
      return { stepIndex, type: step.type, ...(step.name ? { name: step.name } : {}), ...(stepSelector(step) ? { selector: stepSelector(step) } : {}), startedAt, completedAt: nowIso(), status: 'COMPLETED', ...(interactionTimestamps ? { interactionTimestamps } : {}), ...(interactionIntervalMs !== undefined ? { interactionIntervalMs } : {}) };
    } catch (error) { throw new JourneyStepError(stepIndex, error instanceof Error ? error.message : 'Unknown journey step error', { cause: error }); }
  }
}
