import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EvidenceArtifactResponse } from '../../services/api/index.js';
import { EvidenceViewer, ReportContent } from './runtime-components.js';

describe('final report viewer', () => {
  it('renders evidence metadata without fetching unopened report content', () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const client = new QueryClient();
    const evidence: EvidenceArtifactResponse[] = [{
      id: 'report-md',
      experimentId: 'experiment',
      type: 'FINAL_REPORT',
      path: 'reports/investigation/finding/final-report.md',
      mimeType: 'text/markdown',
      sizeBytes: 42,
      checksum: 'checksum',
      redacted: true,
      metadata: { filename: 'final-report.md' },
      createdAt: '2026-07-17T00:00:00.000Z',
    }];

    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <EvidenceViewer evidence={evidence} investigationId="investigation" />
      </QueryClientProvider>,
    );

    expect(html).toContain('View report');
    expect(html).toContain('reports/investigation/finding/final-report.md');
    expect(fetch).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('renders Markdown as escaped text and never executes raw HTML', () => {
    const html = renderToStaticMarkup(
      <ReportContent content={{
        evidenceId: 'report-md',
        investigationId: 'investigation',
        type: 'FINAL_REPORT',
        format: 'MARKDOWN',
        filename: 'final-report.md',
        contentType: 'text/markdown',
        sizeBytes: 20,
        content: '# Report\n\n<script>alert("x")</script>',
      }} />,
    );

    expect(html).toContain('Report');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('renders JSON report sections and malformed JSON safely', () => {
    const valid = renderToStaticMarkup(
      <ReportContent content={{
        evidenceId: 'report-json',
        investigationId: 'investigation',
        type: 'FINAL_REPORT',
        format: 'JSON',
        filename: 'final-report.json',
        contentType: 'application/json',
        sizeBytes: 30,
        content: JSON.stringify({ reportVersion: 'v1', summary: 'Runtime summary', reproductionSteps: ['Open', 'Pay'] }),
      }} />,
    );
    expect(valid).toContain('Runtime summary');
    expect(valid).toContain('Reproduction Steps');

    const invalid = renderToStaticMarkup(
      <ReportContent content={{
        evidenceId: 'report-json',
        investigationId: 'investigation',
        type: 'FINAL_REPORT',
        format: 'JSON',
        filename: 'final-report.json',
        contentType: 'application/json',
        sizeBytes: 3,
        content: '{no',
      }} />,
    );
    expect(invalid).toContain('could not be parsed safely');
  });
});

