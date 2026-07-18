import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertSafePublicUrl, OxylabsEnvironmentIntelligenceProvider } from '../oxylabs-environment-intelligence.provider.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('OxylabsEnvironmentIntelligenceProvider', () => {
  it('rejects unsafe URLs before provider submission', () => {
    expect(() => assertSafePublicUrl('https://tasks-demo-store.onrender.com', ['tasks-demo-store.onrender.com'])).not.toThrow();
    expect(() => assertSafePublicUrl('http://127.0.0.1:5174', ['127.0.0.1'])).toThrow('Public environment intelligence requires HTTPS targets');
    expect(() => assertSafePublicUrl('https://user:pass@example.com', ['example.com'])).toThrow('Embedded URL credentials');
    expect(() => assertSafePublicUrl('file:///etc/passwd', ['example.com'])).toThrow('Only HTTP and HTTPS');
    expect(() => assertSafePublicUrl('https://169.254.169.254', ['169.254.169.254'])).toThrow('Private, loopback');
    expect(() => assertSafePublicUrl('https://evil.example', ['tasks-demo-store.onrender.com'])).toThrow('outside Project Safety');
  });

  it('posts a bounded Oxylabs request with Basic auth and extracts safe context', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [{
          content: '<html><head><title>Demo Store</title><script>secret()</script></head><body><h1>Products</h1><a href="/products/1?token=secret">View product</a><form method="post" action="/checkout"><input name="csrf_token" type="hidden" value="secret"><input name="email" required><button type="submit">Pay now</button></form></body></html>',
          status_code: 200,
          url: 'https://tasks-demo-store.onrender.com/products?utm=track',
          job_id: 'job_123',
        }],
      }),
    });
    globalThis.fetch = fetchMock;
    const provider = new OxylabsEnvironmentIntelligenceProvider({
      enabled: true,
      required: false,
      username: 'user',
      password: 'password',
      baseUrl: 'https://realtime.oxylabs.io/v1/queries',
      source: 'universal',
      timeoutMs: 10_000,
      renderMode: 'html',
    });

    const result = await provider.retrieve({
      url: 'https://tasks-demo-store.onrender.com',
      allowedHosts: ['tasks-demo-store.onrender.com'],
    });

    expect(fetchMock).toHaveBeenCalledWith('https://realtime.oxylabs.io/v1/queries', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ source: 'universal', url: 'https://tasks-demo-store.onrender.com/', render: 'html' }),
    }));
    const headers = fetchMock.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers.Authorization).toMatch(/^Basic /);
    expect(JSON.stringify(result)).not.toContain('password');
    expect(JSON.stringify(result)).not.toContain('csrf_token');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(result).toMatchObject({
      provider: 'OXYLABS',
      status: 'COMPLETED',
      sourceDomain: 'tasks-demo-store.onrender.com',
      targetStatusCode: 200,
      title: 'Demo Store',
      jobId: 'job_123',
    });
    expect(result.forms).toHaveLength(1);
    expect(result.forms[0]!.inputs).toEqual([{ type: 'text', name: 'email', label: null, required: true }]);
    expect(result.detectedJourneys).toContain('Checkout');
    expect(result.links[0]!.href).toBe('https://tasks-demo-store.onrender.com/products/1');
  });
});
