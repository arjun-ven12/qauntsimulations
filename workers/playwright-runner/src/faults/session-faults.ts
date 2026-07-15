import type { BrowserContext, Page } from '@playwright/test'; import type { AppliedFault, WorkerJob } from '@taskos/execution-contracts'; import { nowIso } from '../utils/timestamps.js';
export class SessionFaultController { readonly appliedFaults: AppliedFault[] = []; constructor(private readonly context: BrowserContext, private readonly page: Page, private readonly job: WorkerJob) {}
  async beforeStep(stepIndex: number): Promise<void> { if (this.job.world.expireSessionAtStep !== stepIndex) return; await this.context.clearCookies(); await this.page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); }); this.appliedFaults.push({ type: 'SESSION_EXPIRATION', parameters: { stepIndex }, appliedAt: nowIso() }); }
}
