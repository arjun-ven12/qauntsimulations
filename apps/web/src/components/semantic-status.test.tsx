import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SemanticBadge, SemanticStatus } from './semantic-status.js';

describe('semantic status primitives', () => {
  it('renders stable tone and accessible text', () => {
    const html = renderToStaticMarkup(<SemanticBadge label="Failed" tone="fail" />);
    expect(html).toContain('data-tone="fail"');
    expect(html).toContain('aria-label="Failed status"');
    expect(html).toContain('Failed');
  });

  it('only pulses active running indicators', () => {
    const running = renderToStaticMarkup(<SemanticStatus label="Currently running" tone="running" />);
    const pending = renderToStaticMarkup(<SemanticStatus label="Queued" tone="pending" />);
    expect(running).toContain('rift-semantic-dot--pulse');
    expect(pending).not.toContain('rift-semantic-dot--pulse');
  });
});
