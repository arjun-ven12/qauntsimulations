import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { appNavigation } from './app-layout.js';

const layoutSource = () => readFileSync(resolve(process.cwd(), 'apps/web/src/layouts/app-layout.tsx'), 'utf8');

describe('Rift authenticated shell', () => {
  it('uses a plain wordmark, grouped navigation, and compact workspace selector', () => {
    const source = layoutSource();

    expect(source).toContain('>RIFT</div>');
    expect(source).toContain('Workspace');
    expect(source).toContain('aria-label="Workspace selector"');
    expect(source).toContain("label: 'Operations'");
    expect(source).toContain("label: 'Manage'");
    expect(source).toContain('lg:grid-cols-[240px_minmax(0,1fr)]');
    expect(source).not.toContain('FlaskConical');
    expect(source).not.toContain('RELIABILITY');
    expect(source).not.toContain('Active organisation');
    expect(source).not.toContain('rift-surface-raised mb-6 rounded-xl p-3');
  });

  it('keeps the investigation route while using the concise navigation label', () => {
    const investigations = appNavigation.find((item) => item.label === 'Investigations');

    expect(investigations?.to).toContain('/investigations/');
    expect(appNavigation.some((item) => item.label === 'Live Investigation')).toBe(false);
  });
});
