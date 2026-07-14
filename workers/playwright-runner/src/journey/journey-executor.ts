import type { Page } from '@playwright/test'; import type { JourneyExecutionPlan } from '@taskos/execution-contracts';
export async function executeJourney(page: Page, journey: JourneyExecutionPlan): Promise<void> {
  for (const step of journey.steps) {
    if (step.action === 'NAVIGATE') await page.goto(new URL(step.value ?? '/', journey.baseUrl).toString());
    else if (step.action === 'CLICK' && step.selector) await page.locator(step.selector).click();
    else if (step.action === 'FILL' && step.selector) await page.locator(step.selector).fill(step.value ?? '');
    else if (step.action === 'SELECT' && step.selector) await page.locator(step.selector).selectOption(step.value ?? '');
    else if (step.action === 'WAIT') await page.waitForTimeout(Number(step.value ?? '100'));
    else if (step.action === 'ASSERT' && step.selector) await page.locator(step.selector).waitFor({ state: 'visible' });
  }
}
