import { expect, test, type Page } from '@playwright/test';

const session = {
  user: {
    id: 'user_owner',
    email: 'owner@taskos.dev',
    displayName: 'Project Owner',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  organisation: {
    id: 'org-1',
    name: 'World Reliability',
    slug: 'world-reliability',
    role: 'OWNER',
  },
  membership: { id: 'membership-owner', role: 'OWNER' },
  memberships: [
    {
      membershipId: 'membership-owner',
      organisation: { id: 'org-1', name: 'World Reliability', slug: 'world-reliability' },
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

const summary = {
  id: 'project-1',
  organisationId: 'org-1',
  name: 'Checkout staging',
  description: 'Safe checkout reliability target',
  applicationUrl: 'https://staging.example.com',
  repositoryUrl: 'https://github.com/taskos/checkout',
  organisation: { id: 'org-1', name: 'World Reliability', slug: 'world-reliability' },
  safety: { configured: true, authorisedHostCount: 2, prohibitedActionCount: 2 },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
};

const safety = {
  id: 'safety-1',
  domainAllowlist: ['api.staging.example.com', 'staging.example.com'],
  prohibitedActions: ['Never access production.', 'Never submit a real payment.'],
  allowedHttpMethods: ['GET'],
  permitCheckoutSubmission: false,
  permitMockPayment: false,
  permitTestOrderCreation: false,
  restrictions: {
    testEnvironmentsOnly: true,
    productionAccess: false,
    realPayments: false,
    destructiveAccountActions: false,
    externalDataExport: false,
    realCustomerChanges: false,
    externalMessaging: false,
    repositoryDeletion: false,
    infrastructureChanges: false,
    crossOrganisationAccess: false,
    unknownDomains: false,
  },
  acknowledgedAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
};

const details = {
  ...summary,
  credentialReferences: [
    {
      id: 'credential-1',
      label: 'Test customer',
      provider: 'vault',
      reference: 'vault://worldlab/checkout/test-customer',
    },
  ],
  apiEndpoints: [{ label: 'Health', url: 'https://api.staging.example.com/health' }],
  webhookEndpoints: [],
  safety,
};

test.beforeEach(async ({ page }) => {
  const templates: Array<Record<string, unknown>> = [];
  let nextTemplateId = 1;
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    });
  });
  await page.route('**/api/templates**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const templateId = url.pathname.match(/\/templates\/([^/]+)$/)?.[1];
    if (request.method() === 'GET' && !templateId) {
      const category = url.searchParams.get('category');
      await json(
        route,
        templates.filter((template) => !category || template.category === category),
      );
      return;
    }
    if (request.method() === 'POST') {
      const input = request.postDataJSON() as Record<string, unknown>;
      const now = new Date().toISOString();
      const template = {
        ...input,
        id: `template-${nextTemplateId++}`,
        source: 'CUSTOM',
        createdAt: now,
        updatedAt: now,
      };
      templates.unshift(template);
      await json(route, template, 201);
      return;
    }
    const index = templates.findIndex((template) => template.id === templateId);
    if (request.method() === 'PUT' && index >= 0) {
      templates[index] = {
        ...templates[index],
        ...(request.postDataJSON() as Record<string, unknown>),
        updatedAt: new Date().toISOString(),
      };
      await json(route, templates[index]);
      return;
    }
    if (request.method() === 'DELETE' && index >= 0) {
      templates.splice(index, 1);
      await route.fulfill({ status: 204 });
      return;
    }
    await json(
      route,
      { error: { code: 'TEMPLATE_NOT_FOUND', message: 'Template not found' } },
      404,
    );
  });
});

test('Projects resolves its loading and empty states', async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/projects', async (route) => {
    await pending;
    await json(route, []);
  });
  await page.goto('/projects');
  await expect(page.getByText('Loading projects…')).toBeVisible();
  release();
  await expect(page.getByTestId('projects-empty-state')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create a project' })).toBeVisible();
});

test('Projects renders organisation-scoped cards and opens New Project', async ({ page }) => {
  await mockList(page);
  await page.goto('/projects');
  await expect(page.getByTestId('project-list')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Checkout staging' })).toBeVisible();
  await expect(page.getByText('Application · staging.example.com')).toBeVisible();
  await expect(page.getByText('Restrictions').first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open project' }).first()).toHaveAttribute(
    'href',
    '/projects/project-1',
  );
  await page.getByRole('link', { name: 'New Project', exact: true }).click();
  await expect(page).toHaveURL(/\/projects\/new$/);
});

test('project requests refresh an expired access session once and retry', async ({ page }) => {
  let projectRequests = 0;
  await page.route('**/api/auth/refresh', async (route) => json(route, session));
  await page.route('**/api/projects', async (route) => {
    projectRequests += 1;
    if (projectRequests === 1) {
      await json(
        route,
        { error: { code: 'INVALID_TOKEN', message: 'Authentication token expired' } },
        401,
      );
    } else await json(route, [summary]);
  });
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Checkout staging' })).toBeVisible();
  expect(projectRequests).toBe(2);
});

test('failed project session refresh clears auth state and redirects to login', async ({
  page,
}) => {
  await page.route('**/api/projects', async (route) => {
    await json(
      route,
      { error: { code: 'INVALID_TOKEN', message: 'Authentication token expired' } },
      401,
    );
  });
  await page.route('**/api/auth/refresh', async (route) => {
    await json(route, { error: { code: 'INVALID_CREDENTIALS', message: 'Session expired' } }, 401);
  });
  await page.route('**/api/auth/logout', async (route) => route.fulfill({ status: 204 }));
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Projects' })).toHaveCount(0);
});

test('New Project validates required fields and rejects unsafe URL schemes', async ({ page }) => {
  await page.goto('/projects/new');
  await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Enter a project name.')).toBeVisible();
  await expect(page.getByText('Enter the application URL.')).toBeVisible();

  await page.getByLabel('Project name').fill('Checkout staging');
  await page.getByLabel('Application URL').fill('file:///tmp/customer-data');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Enter a valid HTTP or HTTPS URL.')).toBeVisible();
  await page.getByLabel('Application URL').fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Enter a valid HTTP or HTTPS URL.')).toBeVisible();
});

test('New Project preserves fields across steps and returns to Projects', async ({ page }) => {
  await mockList(page);
  await page.goto('/projects/new');
  await page.getByLabel('Project name').fill('Checkout staging');
  await page.getByLabel('Application URL').fill('https://staging.example.com');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Access & Environment' })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('Checkout staging');
  await expect(page.getByLabel('Application URL')).toHaveValue('https://staging.example.com');
  await page.getByLabel('Back to Projects').click();
  await expect(page).toHaveURL(/\/projects$/);
});

test('Project custom templates persist and support apply, reset, rename, duplicate, delete, import, and export', async ({
  page,
}) => {
  await page.goto('/projects/new');
  await page.getByLabel('Project name').fill('Reusable checkout');
  await page.getByLabel('Application URL').fill('https://templates.example.test');
  await page.getByLabel('Custom template name').fill('Checkout template');
  await page.getByRole('button', { name: 'Save current' }).click();
  await expect(page.getByText('Saved to Rift', { exact: true })).toBeVisible();

  await page.reload();
  await page.getByLabel('Search templates').fill('Checkout template');
  await expect(page.getByRole('heading', { name: 'Checkout template' })).toBeVisible();
  await page.getByRole('button', { name: 'Apply template' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('Reusable checkout');
  await expect(page.getByLabel('Application URL')).toHaveValue('https://templates.example.test');
  await page.getByLabel('Search templates').fill('');

  await page.getByLabel('Custom template name').fill('checkout TEMPLATE');
  await page.getByRole('button', { name: 'Save current' }).click();
  await expect(
    page.getByText('A template with this name already exists in this category.', { exact: true }),
  ).toBeVisible();

  await page.getByLabel('Project name').fill('Customised checkout');
  await expect(page.getByText('Customised', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset to applied template' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('Reusable checkout');

  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByRole('heading', { name: 'Checkout template copy' })).toBeVisible();
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByRole('dialog').getByLabel('Template name').fill('Checkout template');
  await page.getByRole('dialog').getByRole('button', { name: 'Save name' }).click();
  await expect(
    page.getByText('A template with this name already exists in this category.', { exact: true }),
  ).toBeVisible();
  await page.getByRole('dialog').getByLabel('Template name').fill('Renamed checkout');
  await page.getByRole('dialog').getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('heading', { name: 'Renamed checkout' })).toBeVisible();

  await page.getByLabel('Project name').fill('Updated reusable checkout');
  await page.getByRole('button', { name: 'Update from current' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Update template' }).click();
  await expect(page.getByText(/Template updated from the current configuration/)).toBeVisible();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export JSON' }).click();
  const exported = await download;
  const exportedPath = await exported.path();
  if (!exportedPath) throw new Error('Expected an exported template file.');

  await page.getByLabel('Import template JSON file').setInputFiles({
    name: 'invalid.rift-template.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{invalid'),
  });
  await expect(page.getByRole('alert').filter({ hasText: /./ })).toBeVisible();

  await page.getByLabel('Import template JSON file').setInputFiles({
    name: 'future.rift-template.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        category: 'PROJECT',
        name: 'Future project',
        version: 2,
        payload: {},
      }),
    ),
  });
  await expect(page.getByRole('alert').filter({ hasText: /./ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Future project' })).toHaveCount(0);

  await page.getByLabel('Import template JSON file').setInputFiles({
    name: 'imported.rift-template.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        category: 'PROJECT',
        name: 'Imported project',
        version: 1,
        payload: {
          name: 'Imported checkout',
          description: null,
          applicationUrl: 'https://imported.example.test',
          repositoryUrl: null,
          apiEndpoints: [],
          webhookEndpoints: [],
        },
      }),
    ),
  });
  await expect(page.getByRole('dialog', { name: 'Preview imported template' })).toBeVisible();
  await page.getByRole('dialog').getByRole('button', { name: 'Import template' }).click();
  await expect(page.getByRole('heading', { name: 'Imported project' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete template' }).click();
  await expect(page.getByRole('heading', { name: 'Imported project' })).toHaveCount(0);

  await page.getByLabel('Search templates').fill('Renamed checkout');
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete template' }).click();
  await page.getByLabel('Import template JSON file').setInputFiles(exportedPath);
  await page.getByRole('dialog').getByRole('button', { name: 'Import template' }).click();
  await expect(page.getByRole('heading', { name: 'Renamed checkout' })).toBeVisible();
  await page.getByRole('button', { name: 'Apply template' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('Updated reusable checkout');
  const templateStorageKeys = await page.evaluate(() =>
    Object.keys(localStorage).filter((key) => key.startsWith('rift.templates.')),
  );
  expect(templateStorageKeys).toEqual([]);
});

test('Invariant custom templates persist, restore structured fields, and remain manageable', async ({
  page,
}) => {
  await page.goto('/projects/project-1/invariants/new');
  await page.getByLabel('Name', { exact: true }).fill('No repeated capture');
  await page
    .getByLabel('Plain-language business rule')
    .fill('A checkout must never create more than one successful payment capture.');
  await page.getByLabel('Severity').selectOption('HIGH');
  await page.getByLabel('Request paths').fill('/api/payments\n/api/captures');
  await page.getByRole('checkbox', { name: 'PATCH', exact: true }).check();
  await page.getByLabel('Custom template name').fill('Payment capture rule');
  await page.getByRole('button', { name: 'Save current' }).click();
  await expect(page.getByText('Custom template saved to Rift.')).toBeVisible();

  await page.reload();
  await page.getByLabel('Search templates').fill('Payment capture rule');
  await expect(page.getByRole('heading', { name: 'Payment capture rule' })).toBeVisible();
  await page.getByRole('button', { name: 'Apply template' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('No repeated capture');
  await expect(page.getByLabel('Severity')).toHaveValue('HIGH');
  await expect(page.getByLabel('Request paths')).toHaveValue('/api/payments\n/api/captures');
  await expect(page.getByRole('checkbox', { name: 'PATCH', exact: true })).toBeChecked();
  await expect(page.getByText('DRAFT', { exact: true }).first()).toBeVisible();

  await page.getByLabel('Name', { exact: true }).fill('Changed rule');
  await expect(page.getByText('Customised', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Reset to applied template' }).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('No repeated capture');

  await page.getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByRole('heading', { name: 'Payment capture rule copy' })).toBeVisible();
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.getByRole('dialog').getByLabel('Template name').fill('Renamed payment rule');
  await page.getByRole('dialog').getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByRole('heading', { name: 'Renamed payment rule' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete template' }).click();
  await page.reload();
  await page.getByLabel('Search templates').fill('Renamed payment rule');
  await expect(page.getByText('No templates match this search.')).toBeVisible();
});

test('New Project submits once to the real API contract and redirects with the project id', async ({
  page,
}) => {
  let requests = 0;
  let payload: unknown;
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() === 'POST') {
      requests += 1;
      payload = route.request().postDataJSON();
      await new Promise((resolve) => setTimeout(resolve, 250));
      await json(route, details, 201);
    } else await json(route, [summary]);
  });
  await page.route('**/api/projects/project-1', async (route) => json(route, details));
  await page.goto('/projects/new');
  await fillRequiredProject(page);
  await page.getByLabel(/I confirm that these targets/).check();
  await page
    .getByRole('button', { name: 'Create project' })
    .evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });
  await expect(page.getByRole('button', { name: 'Creating project…' })).toBeDisabled();
  await expect(page).toHaveURL(/\/projects\/project-1\/settings$/);
  expect(requests).toBe(1);
  expect(payload).toMatchObject({
    name: 'Checkout staging',
    applicationUrl: 'https://staging.example.com',
    acknowledgement: true,
  });
  expect(JSON.stringify(payload)).not.toMatch(/organisationId|password|secretValue/);
});

test('New Project keeps entered values after an API error', async ({ page }) => {
  await page.route('**/api/projects', async (route) => {
    await json(
      route,
      {
        error: {
          code: 'PROJECT_NAME_CONFLICT',
          message: 'A project with this name already exists',
        },
      },
      409,
    );
  });
  await page.goto('/projects/new');
  await fillRequiredProject(page);
  await page.getByLabel(/I confirm that these targets/).check();
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('alert').last()).toContainText('already exists');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('Checkout staging');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
});

test('Project Settings loads real values, reports unsaved changes, and saves', async ({ page }) => {
  let savedPayload: unknown;
  await page.route('**/api/projects/project-1', async (route) => {
    if (route.request().method() === 'PATCH') {
      savedPayload = route.request().postDataJSON();
      await json(route, { ...details, name: 'Checkout reliability' });
    } else await json(route, details);
  });
  await page.goto('/projects/project-1/settings');
  await expect(page.getByRole('heading', { name: 'Project Settings' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Credential reference' })).toHaveValue(
    'vault://worldlab/checkout/test-customer',
  );
  await page.getByLabel('Project name').fill('Checkout reliability');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Project settings saved.')).toBeVisible();
  expect(savedPayload).toMatchObject({ name: 'Checkout reliability' });
});

test('Safety Settings adds, removes, acknowledges and persists prohibited actions', async ({
  page,
}) => {
  let storedSafety = structuredClone(safety);
  await page.route('**/api/projects/project-1', async (route) => json(route, details));
  await page.route('**/api/projects/project-1/safety', async (route) => {
    if (route.request().method() === 'PATCH') {
      const input = route.request().postDataJSON() as typeof safety;
      storedSafety = { ...storedSafety, ...input, updatedAt: '2026-03-01T00:00:00.000Z' };
    }
    await json(route, storedSafety);
  });
  await page.goto('/projects/project-1/safety');
  await expect(page.getByLabel('Allowed host 2')).toHaveValue('staging.example.com');
  await page.getByRole('button', { name: 'Add action' }).click();
  await page.getByLabel('Prohibited action 3').fill('Never modify repository settings.');
  await expect(page.getByLabel('Prohibited action 3')).toHaveValue(
    'Never modify repository settings.',
  );
  await page.getByRole('button', { name: 'Remove action row 1' }).click();
  await page.getByRole('button', { name: 'Save safety settings' }).click();
  await expect(page.getByRole('alert')).toContainText('Confirm that these targets');
  await page.getByLabel(/I confirm that these targets/).check();
  await page.getByRole('button', { name: 'Save safety settings' }).click();
  await expect(page.getByText('Safety settings saved.')).toBeVisible();
  await page.reload();
  await expect(page.locator('input[value="Never modify repository settings."]')).toBeVisible();
  await expect(page.locator('input[value="Never access production."]')).toHaveCount(0);
});

test('viewer receives read-only project and safety experiences and backend 403 remains distinct', async ({
  page,
}) => {
  const viewerSession = {
    ...session,
    organisation: { ...session.organisation, role: 'VIEWER' },
    permissions: ['VIEW_ORGANISATION', 'VIEW_PROJECTS'],
  };
  await page.route('**/api/auth/me', async (route) => json(route, viewerSession));
  await mockList(page);
  await page.route('**/api/projects/project-1', async (route) => json(route, details));
  await page.route('**/api/projects/project-1/safety', async (route) => {
    if (route.request().method() === 'PATCH')
      await json(
        route,
        {
          error: { code: 'INSUFFICIENT_PERMISSION', message: 'Project safety permission required' },
        },
        403,
      );
    else await json(route, safety);
  });
  await page.goto('/projects');
  await expect(page.getByRole('link', { name: 'New Project' })).toHaveCount(0);
  await page.goto('/projects/project-1/settings');
  await expect(page.getByText('Project settings restricted')).toBeVisible();
  await page.goto('/projects/project-1/safety');
  await expect(page.getByText('Read-only safety policy')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save safety settings' })).toHaveCount(0);
  const status = await page.evaluate(async () =>
    fetch('http://localhost:4000/api/projects/project-1/safety', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).then((response) => response.status),
  );
  expect(status).toBe(403);
});

test('direct project routes and browser Back/Forward retain the app shell', async ({ page }) => {
  await mockList(page);
  await page.route('**/api/projects/project-1', async (route) => json(route, details));
  await page.route('**/api/projects/project-1/safety', async (route) => json(route, safety));
  await page.goto('/projects/project-1/settings');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Projects' })).toBeVisible();
  await page.goto('/projects/project-1/safety');
  await page.goBack();
  await expect(page).toHaveURL(/\/projects\/project-1\/settings$/);
  await page.goForward();
  await expect(page).toHaveURL(/\/projects\/project-1\/safety$/);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`project setup remains usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockList(page);
    await page.route('**/api/projects/project-1', async (route) => json(route, details));
    await page.route('**/api/projects/project-1/safety', async (route) => json(route, safety));
    for (const path of [
      '/projects',
      '/projects/new',
      '/projects/project-1/settings',
      '/projects/project-1/safety',
    ]) {
      await page.goto(path);
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
    }
    await expect(page.getByRole('button', { name: 'Save safety settings' })).toBeVisible();
  });
}

async function fillRequiredProject(page: Page) {
  await page.getByLabel('Project name').fill('Checkout staging');
  await page.getByLabel('Application URL').fill('https://staging.example.com');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
}

async function mockList(page: Page) {
  await page.route('**/api/projects', async (route) => json(route, [summary]));
}

async function json(
  route: Parameters<Parameters<Page['route']>[1]>[0],
  body: unknown,
  status = 200,
) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
