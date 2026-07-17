import { describe, expect, it, vi } from 'vitest';
import { HttpInvestigationApi } from '../http-investigation-api.js';
import { InvestigationApiError } from '../investigation-api.js';

const response = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

describe('HttpInvestigationApi runtime routes', () => {
  it('uses the confirmed read-only investigation routes', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      if (url.endsWith('/plan')) return response(null);
      if (url.endsWith('/evidence/evidence-1/content')) return response({ evidenceId: 'evidence-1', investigationId: 'investigation-1', type: 'FINAL_REPORT', format: 'MARKDOWN', filename: 'final-report.md', contentType: 'text/markdown', sizeBytes: 12, content: '# Report' });
      if (url.endsWith('/worlds') || url.endsWith('/experiments') || url.endsWith('/workers') || url.endsWith('/evidence') || url.endsWith('/findings')) return response([]);
      if (url.endsWith('/findings/finding-1')) return response({ id: 'finding-1', investigationId: 'investigation-1', title: 'Finding', summary: 'Summary', severity: 'HIGH', confidence: 'CONFIRMED', reproductionCount: 1, causalConditions: {}, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', evidence: [], reproductions: [], minimalReproduction: null });
      return response({ id: 'investigation-1', status: 'COMPLETED', progress: { totalWorlds: 0, queued: 0, running: 0, passed: 0, failed: 0, flaky: 0 }, recentEvents: [], findingsCount: 0 });
    }));
    const api = new HttpInvestigationApi('http://localhost:4000/api');
    await api.getInvestigation('investigation-1');
    await api.getExperimentPlan('investigation-1');
    await api.getWorlds('investigation-1');
    await api.getExperiments('investigation-1');
    await api.getWorkers('investigation-1');
    await api.getEvidence('investigation-1');
    await api.getEvidenceTextContent('investigation-1', 'evidence-1');
    await api.listFindings('investigation-1');
    await api.getFindingDetail('investigation-1', 'finding-1');
    expect(calls.map((url) => url.replace('http://localhost:4000/api', ''))).toEqual([
      '/investigations/investigation-1',
      '/investigations/investigation-1/plan',
      '/investigations/investigation-1/worlds',
      '/investigations/investigation-1/experiments',
      '/investigations/investigation-1/workers',
      '/investigations/investigation-1/evidence',
      '/investigations/investigation-1/evidence/evidence-1/content',
      '/investigations/investigation-1/findings',
      '/investigations/investigation-1/findings/finding-1',
    ]);
    vi.unstubAllGlobals();
  });

  it('converts non-2xx and invalid payloads into typed errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ error: { message: 'Missing' } }, { status: 404 })));
    const api = new HttpInvestigationApi('http://localhost:4000/api');
    await expect(api.getInvestigation('missing')).rejects.toMatchObject({ kind: 'NOT_FOUND', status: 404 });

    vi.stubGlobal('fetch', vi.fn(async () => response({ invalid: true })));
    await expect(api.getInvestigation('bad')).rejects.toBeInstanceOf(InvestigationApiError);
    await expect(api.getInvestigation('bad')).rejects.toMatchObject({ kind: 'SCHEMA_MISMATCH' });

    vi.stubGlobal('fetch', vi.fn(async () => response({ error: { code: 'EVIDENCE_CONTENT_TOO_LARGE', message: 'Too large' } }, { status: 413 })));
    await expect(api.getEvidenceTextContent('investigation-1', 'evidence-1')).rejects.toMatchObject({ kind: 'CONTENT_TOO_LARGE', status: 413 });

    vi.stubGlobal('fetch', vi.fn(async () => response({ error: { code: 'EVIDENCE_CONTENT_UNSUPPORTED', message: 'Unsupported' } }, { status: 400 })));
    await expect(api.getEvidenceTextContent('investigation-1', 'evidence-1')).rejects.toMatchObject({ kind: 'UNSUPPORTED_CONTENT', status: 400 });
    vi.unstubAllGlobals();
  });

  it('rejects evidence paths that expose absolute local filesystem paths', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response([{ id: 'evidence-1', experimentId: 'experiment-1', type: 'FINAL_REPORT', path: '/Users/test/report.md', mimeType: 'text/markdown', sizeBytes: 10, redacted: true, createdAt: '2026-01-01T00:00:00.000Z' }])));
    const api = new HttpInvestigationApi('http://localhost:4000/api');
    await expect(api.getEvidence('investigation-1')).rejects.toMatchObject({ kind: 'SCHEMA_MISMATCH' });
    vi.unstubAllGlobals();
  });

  it('rejects report-content responses that expose local paths', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ evidenceId: 'evidence-1', investigationId: 'investigation-1', type: 'FINAL_REPORT', format: 'MARKDOWN', filename: 'final-report.md', contentType: 'text/markdown', sizeBytes: 10, content: '/Users/test/final-report.md' })));
    const api = new HttpInvestigationApi('http://localhost:4000/api');
    await expect(api.getEvidenceTextContent('investigation-1', 'evidence-1')).rejects.toMatchObject({ kind: 'SCHEMA_MISMATCH' });
    vi.unstubAllGlobals();
  });
});
