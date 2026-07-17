import { afterEach, describe, expect, it, vi } from 'vitest';
import { journeyApi } from './journey-api.js';
import type { JourneyApiError } from './journey-api.js';
import { checkoutTemplate, toJourneyInput } from './journey-form.model.js';

describe('Journey API client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('submits a create request exactly once', async () => {
    const input = toJourneyInput(checkoutTemplate('environment-1'));
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        ...input,
        id: 'journey-1',
        projectId: 'project-1',
        validationStatus: 'DRAFT',
        steps: input.steps.map((step, index) => ({ ...step, id: `step-${index + 1}` })),
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await journeyApi.create('project-1', input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/projects/project-1/journeys'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    );
  });

  it('returns the exact backend failure while preserving submitted values', async () => {
    const form = checkoutTemplate('environment-1');
    const before = structuredClone(form);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          {
            error: {
              code: 'JOURNEY_SAFETY_CONFLICT',
              message: 'Checkout submission is disabled by Project Safety.',
              details: { checks: [{ status: 'FAILED' }] },
            },
          },
          403,
        ),
      ),
    );

    await expect(journeyApi.create('project-1', toJourneyInput(form))).rejects.toEqual(
      expect.objectContaining<Partial<JourneyApiError>>({
        code: 'JOURNEY_SAFETY_CONFLICT',
        message: 'Checkout submission is disabled by Project Safety.',
        status: 403,
      }),
    );
    expect(form).toEqual(before);
  });
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
