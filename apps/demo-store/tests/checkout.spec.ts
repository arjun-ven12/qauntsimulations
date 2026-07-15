import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

interface DemoState {
  payments: unknown[];
  orders: unknown[];
  config: { duplicateSubmissionBug: boolean; paymentDelayMs: number };
  requestCounters: { payments: number; orders: number };
}

async function reset(request: APIRequestContext): Promise<void> {
  const response = await request.post('/api/test/reset');
  expect(response.ok()).toBe(true);
}

async function configure(
  request: APIRequestContext,
  duplicateSubmissionBug: boolean,
  paymentDelayMs: number,
): Promise<void> {
  const response = await request.post('/api/test/config', {
    data: { duplicateSubmissionBug, paymentDelayMs },
  });
  expect(response.ok()).toBe(true);
}

async function state(request: APIRequestContext): Promise<DemoState> {
  return (await (await request.get('/api/test/state')).json()) as DemoState;
}

async function openCheckout(page: Page): Promise<void> {
  await page.goto('/products/test-product');
  await expect(page.getByTestId('product-page')).toBeVisible();
  await page.getByTestId('add-to-cart').click();
  await page.getByTestId('open-cart').click();
  await expect(page.getByTestId('cart-item')).toBeVisible();
  const configLoaded = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/test/config') && response.request().method() === 'GET',
  );
  await page.getByTestId('checkout-button').click();
  await configLoaded;
  await expect(page.getByTestId('checkout-form')).toBeVisible();
  await page.getByTestId('email-input').fill('test@taskos.dev');
}

test.beforeEach(async ({ request }) => {
  await reset(request);
});

test('reset clears payments and orders and restores defaults', async ({ request }) => {
  await configure(request, true, 0);
  const payment = await request.post('/api/payments', {
    data: {
      cartId: 'cart_demo_001',
      amount: 12_900,
      currency: 'SGD',
      idempotencyKey: 'seed_attempt',
    },
  });
  const { paymentId } = (await payment.json()) as { paymentId: string };
  await request.post('/api/orders', { data: { paymentId } });

  await reset(request);
  const clean = await state(request);
  expect(clean.payments).toHaveLength(0);
  expect(clean.orders).toHaveLength(0);
  expect(clean.config).toEqual({ duplicateSubmissionBug: false, paymentDelayMs: 0 });
  expect(clean.requestCounters).toEqual({ payments: 0, orders: 0 });
});

test('configuration updates active flags and rejects invalid input', async ({ request }) => {
  const applied = await request.post('/api/test/config', {
    data: { duplicateSubmissionBug: true, paymentDelayMs: 1200 },
  });
  expect(applied.ok()).toBe(true);
  expect(await applied.json()).toEqual({ duplicateSubmissionBug: true, paymentDelayMs: 1200 });
  expect((await state(request)).config).toEqual({
    duplicateSubmissionBug: true,
    paymentDelayMs: 1200,
  });

  for (const invalid of [
    { duplicateSubmissionBug: 'true', paymentDelayMs: 0 },
    { duplicateSubmissionBug: false, paymentDelayMs: -1 },
    { duplicateSubmissionBug: false, paymentDelayMs: 10_001 },
    { duplicateSubmissionBug: false, paymentDelayMs: 1.5 },
  ]) {
    expect((await request.post('/api/test/config', { data: invalid })).status()).toBe(400);
  }
});

test('healthy checkout exposes the stable selectors and creates one payment and order', async ({
  page,
  request,
}) => {
  await configure(request, false, 0);
  await openCheckout(page);
  await expect(page.getByTestId('payment-status')).toHaveText('Ready to pay');
  await page.getByTestId('pay-button').click();
  await expect(page.getByTestId('order-confirmation')).toBeVisible();
  await expect(page.getByTestId('order-id')).toHaveText('ord_001');

  const result = await state(request);
  expect(result.payments).toHaveLength(1);
  expect(result.orders).toHaveLength(1);
});

test('healthy rapid double-click creates exactly one payment and order', async ({
  page,
  request,
}) => {
  await configure(request, false, 200);
  await openCheckout(page);
  await page.getByTestId('pay-button').evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByTestId('order-confirmation')).toBeVisible();

  const result = await state(request);
  expect(result.requestCounters).toEqual({ payments: 1, orders: 1 });
  expect(result.payments).toHaveLength(1);
  expect(result.orders).toHaveLength(1);
});

test('buggy delayed double-click creates two payments and two orders', async ({
  page,
  request,
}) => {
  await configure(request, true, 1200);
  await openCheckout(page);
  await page.getByTestId('pay-button').evaluate((button: HTMLButtonElement) => {
    button.click();
    button.click();
  });
  await expect(page.getByTestId('pay-button')).toBeEnabled();
  await expect(page.getByTestId('order-confirmation')).toBeVisible();
  await expect
    .poll(async () => {
      const result = await state(request);
      return {
        payments: result.payments.length,
        orders: result.orders.length,
        paymentRequests: result.requestCounters.payments,
      };
    })
    .toEqual({ payments: 2, orders: 2, paymentRequests: 2 });
});
