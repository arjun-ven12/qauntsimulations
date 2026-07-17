import { expect, test, type Page } from '@playwright/test';

const ownerSession = {
  user: {
    id: 'user-owner',
    email: 'owner@taskos.dev',
    displayName: 'Owner Rivera',
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

const currentOrganisation = {
  organisation: { id: 'org-1', name: 'World Reliability', slug: 'world-reliability' },
  membership: { id: 'membership-owner', role: 'OWNER', joinedAt: '2026-01-01T00:00:00.000Z' },
  permissions: ownerSession.permissions,
};

const project = {
  id: 'project-1',
  organisationId: 'org-1',
  name: 'Checkout staging',
  description: null,
  applicationUrl: 'https://staging.example.com',
  repositoryUrl: null,
  organisation: { id: 'org-1', name: 'World Reliability', slug: 'world-reliability' },
  credentialReferences: [],
  apiEndpoints: [],
  webhookEndpoints: [],
  safety: {},
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const initialSafety = {
  id: 'safety-1',
  domainAllowlist: ['staging.example.com', 'hooks.example.com'],
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
  updatedAt: '2026-01-01T00:00:00.000Z',
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/auth/me', async (route) => json(route, ownerSession));
});

test('Owner edits hosts, methods, toggles and prohibited actions and persists after refresh', async ({
  page,
}) => {
  let stored = structuredClone(initialSafety);
  let payload: Record<string, unknown> | undefined;
  await mockProject(page);
  await page.route('**/api/projects/project-1/safety', async (route) => {
    if (route.request().method() === 'PATCH') {
      payload = route.request().postDataJSON() as Record<string, unknown>;
      stored = { ...stored, ...payload, updatedAt: '2026-02-01T00:00:00.000Z' };
    }
    await json(route, stored);
  });

  await page.goto('/projects/project-1/safety');
  await page
    .getByLabel('Allowed host 1')
    .fill(' https://TASKOS-DEMO-STORE.onrender.com/checkout?test=1 ');
  await page.getByRole('button', { name: 'Remove host row 2' }).click();
  await page.getByRole('button', { name: 'Add host' }).click();
  await page.getByLabel('Allowed host 2').fill('127.0.0.1');
  await page.getByLabel('POST').check();
  await page.getByLabel('OPTIONS').check();
  await page.getByLabel('Permit checkout submission').check();
  await page.getByLabel('Permit mock payment').check();
  await page.getByLabel('Permit test order creation').check();
  await page.getByLabel('Prohibited action 1').fill('Never alter production inventory');
  await page.getByRole('button', { name: 'Remove action row 2' }).click();
  await page.getByRole('button', { name: 'Add action' }).click();
  await page.getByLabel('Prohibited action 2').fill('Never export customer data');
  await expect(page.getByText('Unsaved changes')).toBeVisible();

  await page.getByRole('button', { name: 'Save safety settings' }).click();
  await expect(page.getByRole('alert')).toContainText('Confirm that these targets');
  await page.getByLabel(/I confirm that these targets/).check();
  await page.getByRole('button', { name: 'Save safety settings' }).click();
  await expect(page.getByText('Safety settings saved.')).toBeVisible();
  await expect(page.getByText('Unsaved changes')).toHaveCount(0);
  expect(payload).toMatchObject({
    domainAllowlist: ['taskos-demo-store.onrender.com', '127.0.0.1'],
    allowedHttpMethods: ['GET', 'POST', 'OPTIONS'],
    permitCheckoutSubmission: true,
    permitMockPayment: true,
    permitTestOrderCreation: true,
    prohibitedActions: ['Never alter production inventory', 'Never export customer data'],
    acknowledgement: true,
  });

  await page.reload();
  await expect(page.getByLabel('Allowed host 1')).toHaveValue('taskos-demo-store.onrender.com');
  await expect(page.getByLabel('Allowed host 2')).toHaveValue('127.0.0.1');
  await expect(page.getByLabel('OPTIONS')).toBeChecked();
  await expect(page.getByLabel('Permit mock payment')).toBeChecked();
  await expect(page.getByLabel('Prohibited action 2')).toHaveValue('Never export customer data');
});

test('Safety editor shows row-level host and action validation and requires one method', async ({
  page,
}) => {
  let patchRequests = 0;
  await mockProject(page);
  await page.route('**/api/projects/project-1/safety', async (route) => {
    if (route.request().method() === 'PATCH') patchRequests += 1;
    await json(route, initialSafety);
  });
  await page.goto('/projects/project-1/safety');
  await page.getByRole('button', { name: 'Add host' }).click();
  await page.getByLabel(/I confirm that these targets/).check();
  await page.getByRole('button', { name: 'Save safety settings' }).click();
  await expect(page.getByText('Allowed hosts cannot be blank.')).toBeVisible();
  await page.getByLabel('Allowed host 3').fill('hooks.example.com/path');
  await page.getByRole('button', { name: 'Save safety settings' }).click();
  await expect(page.getByText('Enter a hostname without a path or query string.')).toBeVisible();
  await page.getByLabel('Allowed host 3').fill('https://HOOKS.EXAMPLE.COM/path');
  await page.getByRole('button', { name: 'Save safety settings' }).click();
  await expect(page.getByText(/host is duplicated/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Remove host row 3' }).click();

  await page.getByRole('button', { name: 'Add action' }).click();
  await page.getByRole('button', { name: 'Save safety settings' }).click();
  await expect(page.getByText('Prohibited actions cannot be blank.')).toBeVisible();
  await page.getByLabel('Prohibited action 3').fill('never access production');
  await page.getByRole('button', { name: 'Save safety settings' }).click();
  await expect(page.getByText('This prohibited action is duplicated.').first()).toBeVisible();
  await page.getByRole('button', { name: 'Remove action row 3' }).click();
  for (const method of ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE']) {
    const checkbox = page.getByLabel(method, { exact: true });
    if (await checkbox.isChecked()) await checkbox.uncheck();
  }
  await page.getByRole('button', { name: 'Save safety settings' }).click();
  await expect(page.getByRole('alert')).toContainText('Select at least one allowed HTTP method');
  expect(patchRequests).toBe(0);
});

test('Member sees read-only safety values and a direct PATCH receives 403', async ({ page }) => {
  const memberSession = {
    ...ownerSession,
    user: { ...ownerSession.user, id: 'user-member' },
    organisation: { ...ownerSession.organisation, role: 'MEMBER' },
    permissions: [
      'VIEW_ORGANISATION',
      'VIEW_MEMBERS',
      'VIEW_PROJECTS',
      'CREATE_PROJECTS',
      'EDIT_PROJECTS',
    ],
  };
  await page.route('**/api/auth/me', async (route) => json(route, memberSession));
  await mockProject(page);
  await page.route('**/api/projects/project-1/safety', async (route) => {
    if (route.request().method() === 'PATCH')
      await json(
        route,
        { error: { code: 'INSUFFICIENT_PERMISSION', message: 'Safety permission required' } },
        403,
      );
    else await json(route, initialSafety);
  });
  await page.goto('/projects/project-1/safety');
  await expect(page.getByText('Read-only safety policy')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add host' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save safety settings' })).toHaveCount(0);
  const status = await page.evaluate(() =>
    fetch('http://localhost:4000/api/projects/project-1/safety', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).then((response) => response.status),
  );
  expect(status).toBe(403);
});

test('Owner creates a pending invitation, changes a role, and removes a member', async ({
  page,
}) => {
  let storedMembers = [
    {
      id: 'membership-owner',
      role: 'OWNER',
      joinedAt: '2026-01-01T00:00:00.000Z',
      user: { id: 'user-owner', displayName: 'Owner Rivera', email: 'owner@taskos.dev' },
    },
    {
      id: 'membership-member',
      role: 'MEMBER',
      joinedAt: '2026-01-02T00:00:00.000Z',
      user: { id: 'user-member', displayName: 'Alex Chen', email: 'alex@taskos.dev' },
    },
  ];
  await mockCurrentOrganisation(page);
  await page.route('**/api/organisations/current/members', async (route) => {
    await json(route, storedMembers);
  });
  let invitations: Array<Record<string, unknown>> = [];
  await page.route('**/api/organisations/current/invitations', async (route) => {
    if (route.request().method() === 'POST') {
      const input = route.request().postDataJSON() as { email: string; role: string };
      const invitation = {
        id: 'invitation-new',
        ...input,
        status: 'PENDING',
        inviter: { id: 'user-owner', displayName: 'Owner Rivera' },
        createdAt: '2026-07-16T00:00:00.000Z',
        expiresAt: '2026-07-23T00:00:00.000Z',
        acceptedAt: null,
        declinedAt: null,
        revokedAt: null,
        delivery: 'LINK_ONLY',
      };
      invitations = [invitation];
      await json(
        route,
        {
          invitation,
          invitationUrl:
            'http://localhost:5173/invitations/accept?token=secure-test-token-with-at-least-thirty-two-chars',
          delivery: { method: 'LINK_ONLY', message: 'Share link' },
        },
        201,
      );
    } else await json(route, invitations);
  });
  await page.route('**/api/organisations/current/members/*', async (route) => {
    const membershipId = route.request().url().split('/').at(-1)!;
    if (route.request().method() === 'PATCH') {
      const { role } = route.request().postDataJSON() as { role: 'ADMIN' };
      storedMembers = storedMembers.map((member) =>
        member.id === membershipId ? { ...member, role } : member,
      );
      await json(
        route,
        storedMembers.find((member) => member.id === membershipId),
      );
    } else {
      storedMembers = storedMembers.filter((member) => member.id !== membershipId);
      await route.fulfill({ status: 204 });
    }
  });

  await page.goto('/settings/organisation');
  await expect(page.getByTestId('current-role')).toHaveText('OWNER');
  await expect(page.getByRole('button', { name: 'Invite member' })).toBeVisible();
  await page.getByRole('button', { name: 'Invite member' }).click();
  await expect(
    page.getByText('External email delivery is not configured', { exact: false }).first(),
  ).toBeVisible();
  await page.getByLabel('Recipient email').fill('taylor@taskos.dev');
  await page.getByLabel('New member role').selectOption('VIEWER');
  await page.getByRole('button', { name: 'Create invitation' }).click();
  await expect(page.getByText('taylor@taskos.dev')).toBeVisible();
  await expect(page.getByTestId('pending-invitations').getByText('PENDING')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy invitation link' })).toBeVisible();
  await page.getByLabel('Role for Alex Chen').selectOption('ADMIN');
  await expect(page.getByText('Member role updated.')).toBeVisible();
  await expect(page.getByLabel('Role for Alex Chen')).toHaveValue('ADMIN');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Remove Alex Chen' }).click();
  await expect(page.getByRole('heading', { name: 'Alex Chen' })).toHaveCount(0);
  await expect(page.getByText('Member removed.')).toBeVisible();
});

test('Team validates add errors, preserves values, and keeps current-user actions protected', async ({
  page,
}) => {
  await mockCurrentOrganisation(page);
  const team = [
    {
      id: 'membership-owner',
      role: 'OWNER',
      joinedAt: '2026-01-01T00:00:00.000Z',
      user: { id: 'user-owner', displayName: 'Owner Rivera', email: 'owner@taskos.dev' },
    },
  ];
  await page.route('**/api/organisations/current/members', async (route) => {
    await json(route, team);
  });
  await page.route('**/api/organisations/current/invitations', async (route) => {
    if (route.request().method() === 'POST')
      await json(
        route,
        {
          error: {
            code: 'INVITATION_CONFLICT',
            message: 'A pending invitation already exists for that email',
          },
        },
        409,
      );
    else await json(route, []);
  });
  await page.goto('/settings/organisation');
  await page.getByRole('button', { name: 'Invite member' }).click();
  await page.getByLabel('Recipient email').fill('invalid');
  await page.getByRole('button', { name: 'Create invitation' }).click();
  await expect(page.getByText('Enter a valid email address.')).toBeVisible();
  await page.getByLabel('Recipient email').fill('pending@taskos.dev');
  await page.getByRole('button', { name: 'Create invitation' }).click();
  await expect(page.getByRole('alert')).toContainText('pending invitation already exists');
  await expect(page.getByLabel('Recipient email')).toHaveValue('pending@taskos.dev');
  await expect(page.getByRole('button', { name: 'Remove Owner Rivera' })).toHaveCount(0);
});

test('Member Team page is read-only and a direct mutation receives 403', async ({ page }) => {
  const memberSession = {
    ...ownerSession,
    user: { ...ownerSession.user, id: 'user-member' },
    organisation: { ...ownerSession.organisation, role: 'MEMBER' },
    permissions: [
      'VIEW_ORGANISATION',
      'VIEW_MEMBERS',
      'VIEW_PROJECTS',
      'CREATE_PROJECTS',
      'EDIT_PROJECTS',
    ],
  };
  await page.route('**/api/auth/me', async (route) => json(route, memberSession));
  await page.route('**/api/organisations/current', async (route) =>
    json(route, {
      ...currentOrganisation,
      membership: { ...currentOrganisation.membership, id: 'membership-member', role: 'MEMBER' },
      permissions: memberSession.permissions,
    }),
  );
  await page.route('**/api/organisations/current/members', async (route) => {
    if (route.request().method() === 'POST')
      await json(
        route,
        {
          error: {
            code: 'INSUFFICIENT_PERMISSION',
            message: 'Member management permission required',
          },
        },
        403,
      );
    else
      await json(route, [
        {
          id: 'membership-member',
          role: 'MEMBER',
          joinedAt: '2026-01-01T00:00:00.000Z',
          user: { id: 'user-member', displayName: 'Alex Chen', email: 'alex@taskos.dev' },
        },
      ]);
  });
  await page.goto('/settings/organisation');
  await expect(page.getByText('cannot change organisation memberships')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Invite member' })).toHaveCount(0);
  const status = await page.evaluate(() =>
    fetch('http://localhost:4000/api/organisations/current/members', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new@example.com', role: 'MEMBER' }),
    }).then((response) => response.status),
  );
  expect(status).toBe(403);
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`Safety and Team controls remain usable at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mockProject(page);
    await page.route('**/api/projects/project-1/safety', async (route) =>
      json(route, initialSafety),
    );
    await mockCurrentOrganisation(page);
    await page.route('**/api/organisations/current/members', async (route) =>
      json(route, [
        {
          id: 'membership-owner',
          role: 'OWNER',
          joinedAt: '2026-01-01T00:00:00.000Z',
          user: { id: 'user-owner', displayName: 'Owner Rivera', email: 'owner@taskos.dev' },
        },
      ]),
    );
    await page.route('**/api/organisations/current/invitations', async (route) => json(route, []));
    for (const path of ['/projects/project-1/safety', '/settings/organisation']) {
      await page.goto(path);
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
    }
    await page.getByRole('button', { name: 'Invite member' }).click();
    await expect(page.getByLabel('Recipient email')).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      content: document.documentElement.scrollWidth,
    }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
  });
}

async function mockProject(page: Page) {
  await page.route('**/api/projects/project-1', async (route) =>
    json(route, { ...project, safety: initialSafety }),
  );
}

async function mockCurrentOrganisation(page: Page) {
  await page.route('**/api/organisations/current', async (route) =>
    json(route, currentOrganisation),
  );
}

async function json(
  route: Parameters<Parameters<Page['route']>[1]>[0],
  body: unknown,
  status = 200,
) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
