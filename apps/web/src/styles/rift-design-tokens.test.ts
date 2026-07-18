import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Rift monochrome design foundation', () => {
  it('defines the approved monochrome tokens and reusable primitives', () => {
    const styles = source('apps/web/src/styles/index.css');
    for (const token of [
      '--rift-bg: #050505',
      '--rift-sidebar: #070707',
      '--rift-surface: #0b0b0b',
      '--rift-surface-raised: #101010',
      '--rift-surface-hover: #171717',
      '--rift-border: #262626',
      '--rift-border-strong: #343434',
      '--rift-text: #f5f5f5',
      '--rift-text-secondary: #a1a1aa',
      '--rift-text-muted: #686868',
      '--rift-primary: #ffffff',
      '--rift-primary-text: #050505',
      '--rift-pass: #34c98f',
      '--rift-warning: #f59e0b',
      '--rift-fail: #ef4444',
      '.rift-button-primary',
      '.rift-button-secondary',
      '.rift-status',
    ]) {
      expect(styles).toContain(token);
    }
  });

  it('applies the shared monochrome shell without changing route composition', () => {
    const layout = source('apps/web/src/layouts/app-layout.tsx');
    expect(layout).toContain('bg-[var(--rift-sidebar)]');
    expect(layout).toContain('rift-surface-raised');
    expect(layout).toContain('<ContextualNavigation />');
  });
});
