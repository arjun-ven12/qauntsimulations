import type { BrowserContext, Page, Route } from '@playwright/test'; import type { FaultInjectionConfig } from '@taskos/execution-contracts';
export async function applyFaults(context: BrowserContext, page: Page, config: FaultInjectionConfig): Promise<void> {
  for (const fault of config.faults) {
    if (fault.type === 'OFFLINE') await context.setOffline(true);
    if (fault.type === 'NETWORK_LATENCY' || fault.type === 'PAYMENT_DELAY') { const delay = Number(fault.parameters.delayMs ?? 0); await page.route('**/*', async (route: Route) => { await new Promise((resolve) => setTimeout(resolve, delay)); await route.continue(); }); }
  }
}
