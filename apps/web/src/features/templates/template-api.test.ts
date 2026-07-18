import { afterEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../../services/auth-api.js';
import { templateApi } from './template-api.js';
import type { TemplateApiError } from './template-api.js';

const template = {
  id: 'template-1',
  category: 'PROJECT',
  source: 'CUSTOM',
  name: 'Checkout',
  schemaVersion: 1,
  payload: { name: 'Checkout' },
  createdAt: '2026-07-18T00:00:00.000Z',
  updatedAt: '2026-07-18T00:00:00.000Z',
};

describe('Template API client', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uses authenticated backend CRUD contracts', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response([template]))
      .mockResolvedValueOnce(response(template))
      .mockResolvedValueOnce(response(template, 201))
      .mockResolvedValueOnce(response({ ...template, name: 'Renamed' }))
      .mockResolvedValueOnce(response(undefined, 204));
    vi.stubGlobal('fetch', fetch);

    await expect(templateApi.list('PROJECT')).resolves.toHaveLength(1);
    await expect(templateApi.get('template-1')).resolves.toMatchObject({ id: 'template-1' });
    await templateApi.create({ category: 'PROJECT', name: 'Checkout', payload: template.payload });
    await templateApi.update('template-1', { name: 'Renamed' });
    await templateApi.remove('template-1');

    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([
      'http://localhost:4000/api/templates?category=PROJECT',
      'http://localhost:4000/api/templates/template-1',
      'http://localhost:4000/api/templates',
      'http://localhost:4000/api/templates/template-1',
      'http://localhost:4000/api/templates/template-1',
    ]);
    expect(fetch.mock.calls[0]?.[1]).toMatchObject({ credentials: 'include' });
  });

  it('surfaces backend errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          response(
            { error: { code: 'TEMPLATE_NAME_CONFLICT', message: 'Name already exists' } },
            409,
          ),
        ),
    );
    await expect(templateApi.list('PROJECT')).rejects.toMatchObject({
      status: 409,
      code: 'TEMPLATE_NAME_CONFLICT',
    } satisfies Partial<TemplateApiError>);
  });

  it('refreshes an expired session once and retries the request', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response({ error: { code: 'UNAUTHENTICATED' } }, 401))
      .mockResolvedValueOnce(response([template]));
    vi.stubGlobal('fetch', fetch);
    const refresh = vi.spyOn(authApi, 'refresh').mockResolvedValue({} as never);

    await expect(templateApi.list('PROJECT')).resolves.toHaveLength(1);

    expect(refresh).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

function response(body: unknown, status = 200) {
  return new Response(body === undefined ? undefined : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
