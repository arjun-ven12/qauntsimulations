import { expect, test, type Page } from '@playwright/test';

const session = sessionFor('org-home', 'Home World', 'OWNER');
session.memberships.push({
  membershipId: 'membership-joined',
  organisation: { id: 'org-joined', name: 'Joined World', slug: 'joined-world' },
  role: 'MEMBER',
});

const invitation = {
  id: 'invitation-1',
  organisation: { id: 'org-joined', name: 'Joined World', slug: 'joined-world' },
  role: 'MEMBER',
  status: 'PENDING',
  inviter: { id: 'owner-joined', displayName: 'Saranya Owner' },
  createdAt: '2026-07-16T00:00:00.000Z',
  expiresAt: '2026-07-23T00:00:00.000Z',
};
const rawToken = 'secure-invitation-token-with-more-than-thirty-two-characters';

test('invitation link shows a safe preview and login preserves the raw-link route', async ({
  page,
}) => {
  await page.route('**/api/auth/me', async (route) =>
    json(route, { error: { code: 'AUTH_REQUIRED', message: 'Authentication required' } }, 401),
  );
  await page.route('**/api/auth/refresh', async (route) =>
    json(route, { error: { code: 'REFRESH_REQUIRED', message: 'Refresh required' } }, 401),
  );
  await page.route('**/api/invitations/preview?*', async (route) =>
    json(route, {
      invitationId: 'invitation-1',
      state: 'PENDING',
      organisation: { name: 'Joined World' },
      role: 'MEMBER',
      expiresAt: invitation.expiresAt,
      recipient: 'm***@taskos.test',
    }),
  );
  await page.route('**/api/auth/login', async (route) => json(route, session));
  await page.goto(`/invitations/accept?token=${rawToken}`);
  await expect(page.getByRole('heading', { name: 'Joined World' })).toBeVisible();
  await expect(page.getByText('m***@taskos.test')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log in' })).toBeVisible();
  await page.getByRole('link', { name: 'Log in' }).click();
  await page.getByLabel('Email address').fill('mira.member@taskos.test');
  await page.getByLabel('Password', { exact: true }).fill('test-password-value');
  await page.getByRole('button', { name: 'Continue to WorldLab' }).click();
  await expect(page).toHaveURL(new RegExp(`/invitations/accept\\?token=${rawToken}$`));
});

test('matching recipient inbox accepts and offers secure organisation switching', async ({
  page,
}) => {
  let accepted = false;
  await mockSession(page, session);
  await page.route('**/api/invitations', async (route) =>
    json(route, accepted ? [{ ...invitation, status: 'ACCEPTED' }] : [invitation]),
  );
  await page.route('**/api/invitations/invitation-1/accept', async (route) => {
    accepted = true;
    await json(route, { accepted: true, idempotent: false, organisation: invitation.organisation });
  });
  await page.goto('/invitations');
  await expect(
    page.getByRole('button', { name: 'Accept invitation to Joined World' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Accept invitation to Joined World' }).click();
  await expect(
    page.getByText('Invitation accepted. Your organisation membership is ready.'),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Switch to Joined World' })).toBeVisible();
});

test('recipient can decline and resolved invitations have no active controls', async ({ page }) => {
  let declined = false;
  await mockSession(page, session);
  await page.route('**/api/invitations', async (route) =>
    json(route, [{ ...invitation, status: declined ? 'DECLINED' : 'PENDING' }]),
  );
  await page.route('**/api/invitations/invitation-1/decline', async (route) => {
    declined = true;
    await json(route, { ...invitation, status: 'DECLINED' });
  });
  await page.goto('/invitations');
  await page.getByRole('button', { name: 'Decline invitation to Joined World' }).click();
  await expect(page.getByText('Invitation declined.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accept invitation to Joined World' })).toHaveCount(
    0,
  );
});

test('organisation switcher calls the session API and removes stale projects', async ({ page }) => {
  let active = session;
  const joined = sessionFor('org-joined', 'Joined World', 'MEMBER');
  joined.memberships = session.memberships;
  await page.route('**/api/auth/me', async (route) => json(route, active));
  await page.route('**/api/auth/switch-organisation', async (route) => {
    active = joined;
    await json(route, joined);
  });
  await page.route('**/api/invitations', async (route) => json(route, []));
  await page.route('**/api/projects', async (route) =>
    json(
      route,
      active.organisation.id === 'org-home'
        ? [project('home-project', 'Home checkout', 'org-home', 'Home World')]
        : [project('joined-project', 'Joined commerce', 'org-joined', 'Joined World')],
    ),
  );
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Home checkout' })).toBeVisible();
  await page.getByLabel('Active organisation').selectOption('org-joined');
  await expect(page.getByRole('heading', { name: 'Joined commerce' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Home checkout' })).toHaveCount(0);
  await expect(page.getByLabel('Active organisation')).toHaveValue('org-joined');
});

test('failed organisation switch remains visible and does not change active context', async ({
  page,
}) => {
  await mockSession(page, session);
  await page.route('**/api/auth/switch-organisation', async (route) =>
    json(
      route,
      {
        error: {
          code: 'ORGANISATION_ACCESS_DENIED',
          message: 'You do not have access to that organisation',
        },
      },
      403,
    ),
  );
  await page.route('**/api/invitations', async (route) => json(route, []));
  await page.route('**/api/projects', async (route) => json(route, []));
  await page.goto('/projects');
  await page.getByLabel('Active organisation').selectOption('org-joined');
  await expect(page.getByRole('alert')).toContainText('do not have access');
  await expect(page.getByLabel('Active organisation')).toHaveValue('org-home');
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 1024, height: 768 },
  { width: 768, height: 1024 },
  { width: 390, height: 844 },
]) {
  test(`invitation pages and switcher fit ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await mockSession(page, session);
    await page.route('**/api/invitations', async (route) => json(route, [invitation]));
    await page.route('**/api/invitations/preview?*', async (route) =>
      json(route, {
        invitationId: 'invitation-1',
        state: 'PENDING',
        organisation: { name: 'Joined World' },
        role: 'MEMBER',
        expiresAt: invitation.expiresAt,
        recipient: 'm***@taskos.test',
      }),
    );
    for (const path of ['/invitations', `/invitations/accept?token=${rawToken}`]) {
      await page.goto(path);
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
    }
    await expect(page.getByRole('button', { name: 'Accept invitation' })).toBeVisible();
  });
}

function sessionFor(id: string, name: string, role: 'OWNER' | 'MEMBER') {
  const permissions =
    role === 'OWNER'
      ? [
          'VIEW_ORGANISATION',
          'VIEW_MEMBERS',
          'MANAGE_MEMBERS',
          'VIEW_PROJECTS',
          'CREATE_PROJECTS',
          'EDIT_PROJECTS',
          'MANAGE_PROJECT_SAFETY',
        ]
      : ['VIEW_ORGANISATION', 'VIEW_MEMBERS', 'VIEW_PROJECTS', 'CREATE_PROJECTS', 'EDIT_PROJECTS'];
  return {
    user: {
      id: 'mira',
      email: 'mira.member@taskos.test',
      displayName: 'Mira Member',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    organisation: { id, name, slug: id, role },
    membership: { id: `membership-${id}`, role },
    memberships: [{ membershipId: `membership-${id}`, organisation: { id, name, slug: id }, role }],
    permissions,
  };
}
function project(id: string, name: string, organisationId: string, organisationName: string) {
  return {
    id,
    organisationId,
    name,
    description: null,
    applicationUrl: 'https://staging.example.com',
    repositoryUrl: null,
    organisation: { id: organisationId, name: organisationName, slug: organisationId },
    safety: { configured: true, authorisedHostCount: 1, prohibitedActionCount: 1 },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}
async function mockSession(page: Page, value: unknown) {
  await page.route('**/api/auth/me', async (route) => json(route, value));
}
async function json(
  route: Parameters<Parameters<Page['route']>[1]>[0],
  body: unknown,
  status = 200,
) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
