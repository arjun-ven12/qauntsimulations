import { afterEach, describe, expect, it, vi } from 'vitest';
import { invariantApi, type Invariant, type InvariantApiError } from './invariant-api.js';
import { invariantTemplates, templateValue, toInvariantInput } from './invariant-form.model.js';

describe('Invariant API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits a create request exactly once', async () => {
    const input = toInvariantInput(templateValue(invariantTemplates[0]!));
    const fetchMock = vi.fn().mockResolvedValue(response(invariant({ ...input })));
    vi.stubGlobal('fetch', fetchMock);

    await invariantApi.create('project-1', input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/projects/project-1/invariants'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    );
  });

  it('returns an exact backend failure while submitted form values remain unchanged', async () => {
    const form = templateValue(invariantTemplates[1]!);
    const before = structuredClone(form);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          {
            error: {
              code: 'INVARIANT_NAME_CONFLICT',
              message: 'An Invariant with this name already exists in the Project',
            },
          },
          409,
        ),
      ),
    );

    await expect(invariantApi.create('project-1', toInvariantInput(form))).rejects.toEqual(
      expect.objectContaining<Partial<InvariantApiError>>({
        code: 'INVARIANT_NAME_CONFLICT',
        message: 'An Invariant with this name already exists in the Project',
        status: 409,
      }),
    );
    expect(form).toEqual(before);
  });

  it('uses the duplicate action endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response(invariant({ name: 'Copy', enabled: false })));
    vi.stubGlobal('fetch', fetchMock);
    await invariantApi.duplicate('project-1', 'invariant-1');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/invariants/invariant-1/duplicate'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('uses the archive action endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await invariantApi.remove('project-1', 'invariant-1');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/invariants/invariant-1'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});

function invariant(overrides: Partial<Invariant> = {}): Invariant {
  return {
    id: 'invariant-1',
    projectId: 'project-1',
    name: 'No duplicate payment',
    description: 'A customer must never be charged twice for one checkout.',
    type: 'NO_DUPLICATE_PAYMENT',
    configuration: { requestPatterns: ['/api/payments'], methods: ['POST'] },
    severity: 'CRITICAL',
    enabled: true,
    validationStatus: 'READY',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
