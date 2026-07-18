import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const source = (path: string) => readFileSync(resolve(repositoryRoot, path), 'utf8');

describe('Template category integration', () => {
  it.each([
    ['PROJECT', 'apps/web/src/features/projects/project-form.tsx'],
    ['ENVIRONMENT', 'apps/web/src/features/environments/environment-form.tsx'],
    ['PROJECT_SAFETY', 'apps/web/src/features/projects/safety-settings.page.tsx'],
    ['JOURNEY', 'apps/web/src/features/journeys/journey-form.tsx'],
    ['INVARIANT', 'apps/web/src/features/invariants/invariant-form.tsx'],
    ['SCENARIO', 'apps/web/src/features/scenarios/scenario-form.tsx'],
  ] as const)('integrates %s without changing routes or API clients', (category, path) => {
    const contents = source(path);
    expect(contents).toContain('<TemplateManager');
    expect(contents).toContain(`category="${category}"`);
  });

  it('keeps Templates out of excluded investigation and account experiences', () => {
    for (const path of [
      'apps/web/src/features/live-worldlab/live-worldlab.page.tsx',
      'apps/web/src/features/findings/investigation-findings.page.tsx',
      'apps/web/src/features/organisation/invitations.page.tsx',
      'apps/web/src/features/auth/login.page.tsx',
    ]) {
      expect(source(path)).not.toContain('TemplateManager');
    }
  });
});
