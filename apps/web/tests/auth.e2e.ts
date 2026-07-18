import { expect, test, type Page } from '@playwright/test';

const session = {
  user: {
    id: 'user_demo',
    email: 'person@taskos.dev',
    displayName: 'Sam Rivera',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  organisation: {
    id: 'organisation_demo',
    name: 'World Reliability',
    slug: 'world-reliability',
    role: 'OWNER',
  },
  membership: { id: 'membership_owner', role: 'OWNER' },
  memberships: [
    {
      membershipId: 'membership_owner',
      organisation: { id: 'organisation_demo', name: 'World Reliability', slug: 'world-reliability' },
      role: 'OWNER',
    },
  ],
  permissions: [
    'VIEW_ORGANISATION',
    'VIEW_MEMBERS',
    'MANAGE_MEMBERS',
    'VIEW_PROJECTS',
    'CREATE_PROJECTS',
    'EDIT_PROJECTS',
    'MANAGE_PROJECT_SAFETY',
  ],
};

const currentOrganisation = {
  organisation: { id: 'organisation_demo', name: 'World Reliability', slug: 'world-reliability' },
  membership: { id: 'membership_owner', role: 'OWNER', joinedAt: '2026-01-01T00:00:00.000Z' },
  permissions: ['VIEW_ORGANISATION', 'VIEW_MEMBERS', 'MANAGE_MEMBERS'],
};

const members = [
  {
    id: 'membership_owner',
    role: 'OWNER',
    joinedAt: '2026-01-01T00:00:00.000Z',
    user: { id: 'user_demo', displayName: 'Sam Rivera', email: 'person@taskos.dev' },
  },
  {
    id: 'membership_member',
    role: 'MEMBER',
    joinedAt: '2026-02-01T00:00:00.000Z',
    user: { id: 'user_member', displayName: 'Alex Chen', email: 'alex@taskos.dev' },
  },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: unauthorizedBody });
  });
  await page.route('**/api/auth/refresh', async (route) => {
    await route.fulfill({ status: 401, contentType: 'application/json', body: unauthorizedBody });
  });
});

const unauthorizedBody = JSON.stringify({
  error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' },
});

async function fillLogin(page: Page) {
  await page.getByLabel('Email address').fill('person@taskos.dev');
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple');
}

test('direct login and registration routes render accessible forms', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Log in' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Email address')).toHaveAttribute('autocomplete', 'email');
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'autocomplete',
    'current-password',
  );

  await page.goto('/register');
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
  await expect(page.getByLabel('Full name')).toBeVisible();
  await expect(page.getByLabel('Workspace name')).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
    'autocomplete',
    'new-password',
  );
});

test('route switching and browser back restore authentication mode', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Create an account' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.getByRole('link', { name: 'Log in', exact: true }).last().click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();
});

test('switching modes reconfigures multiple shared mosaic tiles', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  const areas = () =>
    page.evaluate(() =>
      Object.fromEntries(
        ['statement', 'count', 'simulation', 'finding'].map((name) => {
          const slotName = name === 'simulation' ? 'abstract' : name;
          const slot = document.querySelector<HTMLElement>(`[data-mosaic-slot="${slotName}"]`);
          return [name, slot ? getComputedStyle(slot).gridArea : 'missing'];
        }),
      ),
    );
  const loginAreas = await areas();
  await page.locator('.auth-atmosphere__ribbon').evaluate((element) => {
    (window as typeof window & { authAuroraNode?: Element }).authAuroraNode = element;
  });
  const loginFormHeight = await page
    .getByTestId('auth-form-viewport')
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).height));
  await page.getByRole('tab', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByTestId('auth-mosaic')).toHaveAttribute('data-layout', 'register');
  expect(
    await page
      .locator('.auth-atmosphere__ribbon')
      .evaluate(
        (element) =>
          (window as typeof window & { authAuroraNode?: Element }).authAuroraNode === element,
      ),
  ).toBe(true);
  expect(await page.locator('[data-layout-moving="true"]').count()).toBeGreaterThanOrEqual(3);
  await page.waitForTimeout(450);
  const registerAreas = await areas();
  const registerFormHeight = await page
    .getByTestId('auth-form-viewport')
    .evaluate((element) => Number.parseFloat(getComputedStyle(element).height));
  expect(registerAreas.statement).not.toBe(loginAreas.statement);
  expect(registerAreas.count).not.toBe(loginAreas.count);
  expect(registerAreas.finding).not.toBe(loginAreas.finding);
  expect(registerFormHeight).toBeGreaterThan(loginFormHeight + 100);
  const reverseMovingCards = await page.evaluate(async () => {
    document.querySelector<HTMLAnchorElement>('.auth-tabs a[href="/login"]')?.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return document.querySelectorAll('[data-layout-moving="true"]').length;
  });
  expect(reverseMovingCards).toBeGreaterThanOrEqual(3);
  await expect(page).toHaveURL(/\/login$/);
});

for (const width of [1440, 1280]) {
  test(`registration status tile stays horizontal at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 800 });
    await page.goto('/register');
    const status = page.locator('[data-mosaic-tile="status"]');
    await expect(status).toBeVisible();
    const fit = await status.evaluate((element) => {
      const styles = getComputedStyle(element);
      const available =
        element.clientWidth -
        Number.parseFloat(styles.paddingLeft) -
        Number.parseFloat(styles.paddingRight);
      const label = element.querySelector('span');
      const value = element.querySelector('strong');
      return {
        available,
        valueText: value?.textContent?.trim(),
        tileWidth: element.getBoundingClientRect().width,
        labelWidth: label?.getBoundingClientRect().width ?? Infinity,
        valueWidth: value?.getBoundingClientRect().width ?? Infinity,
        labelWhiteSpace: label ? getComputedStyle(label).whiteSpace : '',
        valueWhiteSpace: value ? getComputedStyle(value).whiteSpace : '',
      };
    });
    expect(fit.labelWhiteSpace).toBe('nowrap');
    expect(fit.valueWhiteSpace).toBe('nowrap');
    expect(fit.valueText).toBe('Ready');
    expect(fit.tileWidth).toBeGreaterThanOrEqual(112);
    expect(fit.labelWidth).toBeLessThanOrEqual(fit.available + 1);
    expect(fit.valueWidth).toBeLessThanOrEqual(fit.available + 1);
  });
}

test('aurora remains static, non-interactive and identical across auth modes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  const atmosphere = page.locator('.auth-atmosphere');
  expect(await atmosphere.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe(
    'none',
  );
  const backgroundState = () =>
    atmosphere.evaluate((element) =>
      [
        '.auth-atmosphere__ribbon',
        '.auth-aurora__primary',
        '.auth-aurora__refraction',
        '.auth-aurora__reflection',
        '.auth-atmosphere__grain',
      ].map((selector) => {
        const layer = element.querySelector<HTMLElement>(selector);
        const styles = layer ? getComputedStyle(layer) : undefined;
        return {
          selector,
          animationName: styles?.animationName,
          opacity: styles?.opacity,
          transform: styles?.transform,
        };
      }),
    );
  const loginBackground = await backgroundState();
  expect(loginBackground.every((layer) => layer.animationName === 'none')).toBe(true);
  await page.getByRole('tab', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/register$/);
  expect(await backgroundState()).toEqual(loginBackground);

  const indicator = page.locator('.auth-tab-indicator');
  expect(await indicator.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe(
    '0.3s',
  );
});

test('desktop parallax uses a weighted return and settles exactly at rest', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  const stage = page.locator('.world-mosaic-stage');
  const tile = page.locator('[data-mosaic-tile="statement"]');
  const bounds = await stage.boundingBox();
  if (!bounds) throw new Error('Mosaic stage was not rendered');

  await page.mouse.move(bounds.x + bounds.width * 0.78, bounds.y + bounds.height * 0.72);
  await expect(stage).toHaveAttribute('data-pointer-active', 'true');
  expect(await stage.evaluate((element) => element.style.getPropertyValue('--mosaic-x'))).not.toBe(
    '0px',
  );
  expect(await tile.evaluate((element) => element.style.getPropertyValue('--pointer-x'))).not.toBe(
    '0px',
  );

  await page.mouse.move(4, 4);
  await expect(stage).toHaveAttribute('data-pointer-active', 'false');
  expect(await stage.evaluate((element) => element.style.getPropertyValue('--mosaic-x'))).toBe(
    '0px',
  );
  expect(await tile.evaluate((element) => element.style.getPropertyValue('--pointer-x'))).toBe(
    '0px',
  );
  expect(await tile.evaluate((element) => getComputedStyle(element).transitionDuration)).toContain(
    '0.72s',
  );
});

test('reduced motion disables loops and cursor parallax', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  const tile = page.locator('[data-mosaic-tile="statement"]');
  const frame = page.locator('.world-frame--one');
  const aurora = page.locator('.auth-aurora__primary');
  await page.mouse.move(500, 300);
  expect(await tile.evaluate((element) => element.style.getPropertyValue('--pointer-x'))).toBe(
    '0px',
  );
  expect(await frame.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
  expect(await aurora.evaluate((element) => getComputedStyle(element).animationName)).toBe('none');
});

test('login submits the backend payload and redirects', async ({ page }) => {
  let payload: unknown;
  await page.route('**/api/auth/login', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    });
  });
  await page.goto('/login');
  await fillLogin(page);
  await page.getByRole('button', { name: 'Continue to Rift' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  expect(payload).toEqual({
    email: 'person@taskos.dev',
    password: 'correct-horse-battery-staple',
  });
});

test('a protected-route refresh restores the cookie session', async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    });
  });
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
});

test('protected routes wait for restoration and redirect without protected-content flash', async ({
  page,
}) => {
  let resolveMe!: () => void;
  const releaseMe = new Promise<void>((resolve) => {
    resolveMe = resolve;
  });
  await page.route('**/api/auth/me', async (route) => {
    await releaseMe;
    await route.fulfill({ status: 401, contentType: 'application/json', body: unauthorizedBody });
  });

  const navigation = page.goto('/projects');
  await expect(page.getByText('Restoring Rift…')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Projects' })).toHaveCount(0);
  resolveMe();
  await navigation;
  await expect(page).toHaveURL(/\/login$/);
});

test('an authenticated session cannot navigate back to a guest auth route', async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    });
  });
  await page.goto('/login');
  await expect(page).toHaveURL(/\/projects$/);
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
});

test('login returns to the originally requested protected route', async ({ page }) => {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    });
  });
  await mockOrganisation(page);
  await page.goto('/settings/organisation');
  await expect(page).toHaveURL(/\/login$/);
  await fillLogin(page);
  await page.getByRole('button', { name: 'Continue to Rift' }).click();
  await expect(page).toHaveURL(/\/settings\/organisation$/);
  await expect(page.getByRole('heading', { name: 'World Reliability' }).first()).toBeVisible();
});

test('logout clears the client session and browser back cannot restore protected content', async ({
  page,
}) => {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    });
  });
  await page.route('**/api/auth/logout', async (route) => route.fulfill({ status: 204 }));
  await mockOrganisation(page);
  await page.goto('/projects');
  await page.getByRole('link', { name: 'Team' }).click();
  await expect(page).toHaveURL(/\/settings\/organisation$/);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Projects' })).toHaveCount(0);
});

test('organisation owners can inspect their role and tenant member directory', async ({ page }) => {
  await mockAuthenticatedSession(page);
  await mockOrganisation(page);
  await page.goto('/settings/organisation');

  await expect(page.getByTestId('current-role')).toHaveText('OWNER');
  await expect(page.getByTestId('member-row')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'Alex Chen' })).toBeVisible();
  await expect(page.getByText('alex@taskos.dev')).toBeVisible();
});

test('viewer permissions show a clear access-denied state and skip the member request', async ({
  page,
}) => {
  let memberRequests = 0;
  const viewerSession = {
    ...session,
    organisation: { ...session.organisation, role: 'VIEWER' },
    permissions: ['VIEW_ORGANISATION'],
  };
  const viewerOrganisation = {
    ...currentOrganisation,
    membership: { ...currentOrganisation.membership, role: 'VIEWER' },
    permissions: ['VIEW_ORGANISATION'],
  };
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(viewerSession),
    });
  });
  await page.route('**/api/organisations/current', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(viewerOrganisation),
    });
  });
  await page.route('**/api/organisations/current/members', async (route) => {
    memberRequests += 1;
    await route.fulfill({ status: 403, contentType: 'application/json', body: unauthorizedBody });
  });
  await page.goto('/settings/organisation');

  await expect(page.getByTestId('current-role')).toHaveText('VIEWER');
  await expect(page.getByTestId('members-access-denied')).toBeVisible();
  expect(memberRequests).toBe(0);
});

test('an API permission denial is rendered as access denied', async ({ page }) => {
  await mockAuthenticatedSession(page);
  await page.route('**/api/organisations/current', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentOrganisation),
    });
  });
  await page.route('**/api/organisations/current/members', async (route) => {
    await route.fulfill({ status: 403, contentType: 'application/json', body: unauthorizedBody });
  });
  await page.goto('/settings/organisation');
  await expect(page.getByTestId('members-access-denied')).toBeVisible();
});

test('registration submits the existing backend payload', async ({ page }) => {
  let payload: unknown;
  await page.route('**/api/auth/register', async (route) => {
    payload = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify(session),
    });
  });
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Sam Rivera');
  await page.getByLabel('Workspace name').fill('World Reliability');
  await page.getByLabel('Email address').fill('person@taskos.dev');
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/projects$/);
  expect(payload).toEqual({
    displayName: 'Sam Rivera',
    organisationName: 'World Reliability',
    email: 'person@taskos.dev',
    password: 'correct-horse-battery-staple',
  });
});

test('pending state prevents duplicate login requests', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/auth/login', async (route) => {
    requests += 1;
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    });
  });
  await page.goto('/login');
  await fillLogin(page);
  await page
    .getByRole('button', { name: 'Continue to Rift' })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
  await expect(page).toHaveURL(/\/projects$/);
  expect(requests).toBe(1);
});

test('backend errors are presented without losing entered values', async ({ page }) => {
  await page.route('**/api/auth/login', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' },
      }),
    });
  });
  await page.goto('/login');
  await fillLogin(page);
  await page.getByRole('button', { name: 'Continue to Rift' }).click();
  await expect(page.getByRole('alert')).toHaveText('Email or password is incorrect');
  await expect(page.getByLabel('Email address')).toHaveValue('person@taskos.dev');
  await expect(page.getByRole('button', { name: 'Continue to Rift' })).toBeEnabled();
});

test('network errors are presented and allow retrying', async ({ page }) => {
  await page.route('**/api/auth/login', async (route) => route.abort('failed'));
  await page.goto('/login');
  await fillLogin(page);
  await page.getByRole('button', { name: 'Continue to Rift' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Rift could not be reached. Check your connection and try again.',
  );
  await expect(page.getByRole('button', { name: 'Continue to Rift' })).toBeEnabled();
});

test('password visibility control has an accessible changing label', async ({ page }) => {
  await page.goto('/login');
  const password = page.getByLabel('Password', { exact: true });
  await password.fill('secret-value');
  await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
});

test('registration validation is inline and associated with fields', async ({ page }) => {
  await page.goto('/register');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter your full name.')).toBeVisible();
  await expect(page.getByText('Enter a workspace name.')).toBeVisible();
  await expect(page.getByText('Enter your email address.')).toBeVisible();
  await expect(page.getByText('Enter your password.')).toBeVisible();
  await expect(page.getByLabel('Email address')).toHaveAttribute('aria-invalid', 'true');
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`auth layout does not overflow at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/register');
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.getByRole('tab', { name: 'Log in' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create account' })).toBeVisible();
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`organisation membership stays readable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mockAuthenticatedSession(page);
    await mockOrganisation(page);
    await page.goto('/settings/organisation');
    await expect(page.getByTestId('member-row')).toHaveCount(2);
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
    await expect(page.getByText('alex@taskos.dev')).toBeVisible();
  });
}

async function mockAuthenticatedSession(page: Page) {
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    });
  });
}

async function mockOrganisation(page: Page) {
  await page.route('**/api/organisations/current', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(currentOrganisation),
    });
  });
  await page.route('**/api/organisations/current/members', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(members),
    });
  });
}
