import { afterEach, describe, expect, it, vi } from 'vitest';
import { journeyApi, serializeJourneyInput } from './journey-api.js';
import type { JourneyApiError, JourneyInput, JourneyStepInput } from './journey-api.js';
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
      expect.objectContaining({ method: 'POST', body: JSON.stringify(serializeJourneyInput(input)) }),
    );
  });

  it.each([
    { label: 'POST', request: (input: JourneyInput) => journeyApi.create('project-1', input) },
    {
      label: 'PATCH',
      request: (input: JourneyInput) => journeyApi.update('project-1', 'journey-1', input),
    },
  ])(
    'strips persisted fields from all twelve steps at the $label request boundary',
    async ({ label, request }) => {
      const input = persistedJourneyInput();
      const before = structuredClone(input);
      const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as JourneyInput;
        return Promise.resolve(response(journeyResponse(body)));
      });
      vi.stubGlobal('fetch', fetchMock);

      await request(input);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
      expect(init.method).toBe(label);
      const body = JSON.parse(String(init.body)) as JourneyInput;
      expect(body.steps).toHaveLength(12);
      body.steps.forEach((step, index) => {
        expect(step).toEqual({
          order: index,
          action: input.steps[index]!.action,
          selector: input.steps[index]!.selector,
          value: input.steps[index]!.value,
          metadata: input.steps[index]!.metadata,
        });
        expect(Object.keys(step).sort()).toEqual([
          'action',
          'metadata',
          'order',
          'selector',
          'value',
        ]);
        expect(step).not.toHaveProperty('id');
        expect(step).not.toHaveProperty('journeyId');
        expect(step).not.toHaveProperty('createdAt');
        expect(step).not.toHaveProperty('updatedAt');
      });
      expect(input).toEqual(before);
      expect(input.steps[0]).toHaveProperty('id', 'persisted-step-1');
    },
  );

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

function persistedJourneyInput(): JourneyInput {
  const input = toJourneyInput(checkoutTemplate('environment-1'));
  return {
    ...input,
    steps: input.steps.map((step, index) =>
      ({
        ...step,
        id: `persisted-step-${index + 1}`,
        journeyId: 'journey-1',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      }) satisfies JourneyStepInput & {
        id: string;
        journeyId: string;
        createdAt: string;
        updatedAt: string;
      },
    ),
  };
}

function journeyResponse(input: JourneyInput) {
  return {
    ...input,
    id: 'journey-1',
    projectId: 'project-1',
    validationStatus: 'READY',
    steps: input.steps.map((step, index) => ({ ...step, id: `step-${index + 1}` })),
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-02T00:00:00.000Z',
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
