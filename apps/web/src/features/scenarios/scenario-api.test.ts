import { afterEach, describe, expect, it, vi } from 'vitest';
import { scenarioApi, type ScenarioApiError } from './scenario-api.js';
import { validScenario } from './scenario-test-fixtures.js';

describe('Scenario launch API', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the exact project-scoped preflight payload', async () => {
    const input = validScenario();
    const fetchMock = vi.fn().mockResolvedValue(
      response({
        status: 'READY',
        projectId: 'project-1',
        environmentId: input.environmentId,
        journeyId: input.journeyId,
        invariantIds: input.invariantIds,
        validation: { status: 'READY', warnings: [] },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await scenarioApi.preflight('project-1', input);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/projects/project-1/investigations/preflight'),
      expect.objectContaining({ method: 'POST', body: JSON.stringify(input) }),
    );
  });

  it('launches with the unchanged payload that was preflighted', async () => {
    const input = validScenario();
    const bodies: unknown[] = [];
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)) as unknown);
      return Promise.resolve(
        bodies.length === 1
          ? response({
              status: 'READY',
              projectId: 'project-1',
              environmentId: input.environmentId,
              journeyId: input.journeyId,
              invariantIds: input.invariantIds,
              validation: { status: 'READY', warnings: [] },
            })
          : response({ id: 'investigation-1', status: 'PLANNING' }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    await scenarioApi.preflight('project-1', input);
    await scenarioApi.launch('project-1', input);

    expect(bodies).toEqual([input, input]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves backend error codes and submitted values after launch failure', async () => {
    const input = validScenario();
    const before = structuredClone(input);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        response(
          {
            error: {
              code: 'PROJECT_SAFETY_BLOCKED',
              message: 'Mock payment is not permitted by Project Safety',
            },
          },
          403,
        ),
      ),
    );

    await expect(scenarioApi.launch('project-1', input)).rejects.toEqual(
      expect.objectContaining<Partial<ScenarioApiError>>({
        code: 'PROJECT_SAFETY_BLOCKED',
        message: 'Mock payment is not permitted by Project Safety',
        status: 403,
      }),
    );
    expect(input).toEqual(before);
  });
});

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
