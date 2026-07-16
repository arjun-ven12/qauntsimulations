import { expect, test } from '@playwright/test';

test('serves the direct product route as the SPA', async ({ request }) => {
  const response = await request.get('/products/test-product');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('text/html');
  expect(await response.text()).toContain('<div id="root"></div>');
});

test('serves reset and configuration as JSON contracts', async ({ request }) => {
  const reset = await request.post('/api/test/reset');
  expect(reset.status()).toBe(200);
  expect(reset.headers()['content-type']).toContain('application/json');
  expect(await reset.json()).toMatchObject({ ok: true });

  const config = await request.post('/api/test/config', {
    data: { duplicateSubmissionBug: true, paymentDelayMs: 1200 },
  });
  expect(config.status()).toBe(200);
  expect(await config.json()).toEqual({ duplicateSubmissionBug: true, paymentDelayMs: 1200 });
});

test('API misses and OPTIONS never fall through to index.html', async ({ request }) => {
  const missing = await request.get('/api/not-a-route');
  expect(missing.status()).toBe(404);
  expect(missing.headers()['content-type']).toContain('application/json');
  expect(await missing.json()).toEqual({ error: 'API route not found' });

  const options = await request.fetch('/api/test/reset', { method: 'OPTIONS' });
  expect(options.status()).toBe(204);
  expect(options.headers().allow).toBe('GET, POST, OPTIONS');
  expect(options.headers()['content-type']).toBeUndefined();
});
