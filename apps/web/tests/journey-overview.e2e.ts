import { expect, test, type Route } from '@playwright/test';

const now = '2026-01-01T00:00:00.000Z';
const session = {
  user: {
    id: 'user-owner',
    email: 'owner@taskos.dev',
    displayName: 'Project Owner',
    createdAt: now,
    updatedAt: now,
  },
  organisation: {
    id: 'org-1',
    name: 'World Reliability',
    slug: 'world-reliability',
    role: 'OWNER',
  },
  membership: { id: 'membership-owner', role: 'OWNER' },
  memberships: [],
  permissions: [],
};

const steps = [
  journeyStep(0, 'GOTO', null, '/products/test-product'),
  journeyStep(1, 'ASSERT_VISIBLE', '[data-testid="product-page"]'),
  journeyStep(2, 'CLICK', '[data-testid="add-to-cart"]'),
  journeyStep(3, 'ASSERT_VISIBLE', '[data-testid="cart-item"]'),
  journeyStep(4, 'CLICK', '[data-testid="open-cart"]'),
  journeyStep(5, 'CLICK', '[data-testid="checkout-button"]'),
  journeyStep(6, 'ASSERT_VISIBLE', '[data-testid="checkout-form"]'),
  journeyStep(7, 'FILL', '[data-testid="email-input"]', 'customer@example.test'),
  journeyStep(8, 'CLICK', '[data-testid="pay-button"]'),
  journeyStep(9, 'WAIT_FOR', '[data-testid="payment-status"]', null, { timeoutMs: 30000 }),
  journeyStep(10, 'WAIT_FOR', '[data-testid="order-confirmation"]', null, { timeoutMs: 30000 }),
  journeyStep(11, 'ASSERT_VISIBLE', '[data-testid="order-id"]'),
];

const journey = {
  id: 'journey-1',
  projectId: 'project-1',
  name: 'Checkout Purchase Flow',
  description: 'Completes a controlled checkout and confirms the order.',
  environmentId: 'environment-1',
  startPath: '/products/test-product',
  state: 'ENABLED',
  validationStatus: 'READY',
  completionCondition: { type: 'VISIBLE', selector: '[data-testid="order-id"]' },
  steps,
  createdAt: now,
  updatedAt: now,
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', (route) => json(route, session));
  await page.route('**/api/invitations', (route) => json(route, []));
  await page.route('**/api/projects/project-1/environments', (route) =>
    json(route, [{ id: 'environment-1', name: 'Local Demo Store' }]),
  );
  await page.route('**/api/projects/project-1/journeys/journey-1', (route) => json(route, journey));
});

test('Journey Overview is compact, accessible, and responsive', async ({ page }) => {
  const browserErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('pageerror', (error) => browserErrors.push(error.message));
  await page.goto('/projects/project-1/journeys/journey-1');
  await expect(page.getByRole('heading', { name: 'Checkout Purchase Flow' })).toBeVisible();
  const map = page.getByLabel('High-level journey map');
  for (const stage of ['Product', 'Cart', 'Checkout', 'Payment', 'Confirmation'])
    await expect(map.getByText(stage, { exact: true })).toBeVisible();

  const product = page.getByRole('button', { name: /Product/ });
  await expect(product).toHaveAttribute('aria-expanded', 'false');
  await product.focus();
  await page.keyboard.press('Enter');
  await expect(product).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Open product page')).toBeVisible();
  await expect(page.getByText('[data-testid="product-page"]')).toBeVisible();
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(product).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByText('Submit payment')).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 800 },
    { width: 768, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const hasPageOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(hasPageOverflow).toBe(false);
  }
  expect(browserErrors).toEqual([]);
});

test('validation prevents duplicate requests and exposes warning and failure details', async ({
  page,
}) => {
  let release!: () => void;
  let requests = 0;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/projects/project-1/journeys/journey-1/validate', async (route) => {
    requests += 1;
    await pending;
    await json(route, {
      status: 'INVALID',
      journey: { ...journey, validationStatus: 'INVALID' },
      checks: [
        {
          key: 'cart-selector',
          status: 'WARNING',
          message: 'Selector matched more than one element.',
          stepOrder: 3,
        },
        {
          key: 'payment-selector',
          status: 'FAILED',
          message: 'No matching element found before timeout.',
          stepOrder: 8,
        },
        { key: 'safety', status: 'PASSED', message: 'Project safety checks passed.' },
      ],
    });
  });

  await page.goto('/projects/project-1/journeys/journey-1');
  const validate = page.getByRole('button', { name: 'Validate Journey' });
  await validate.click();
  await expect(page.getByRole('button', { name: /Validating/ })).toBeDisabled();
  expect(requests).toBe(1);
  release();

  await expect(page.getByText('1 passed · 1 warning · 1 failed')).toBeVisible();
  await expect(page.getByText('No matching element found before timeout.')).toBeVisible();
  await expect(page.getByText('Selector matched more than one element.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Cart/ })).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('button', { name: /Payment/ })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

function journeyStep(
  order: number,
  action: string,
  selector: string | null,
  value: string | null = null,
  metadata: Record<string, unknown> = {},
) {
  return { id: `step-${order + 1}`, order, action, selector, value, metadata };
}
