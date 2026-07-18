import { environmentIntelligenceContextSchema, type EnvironmentIntelligenceContextShape } from './environment-intelligence.schema.js';

export interface OxylabsEnvironmentIntelligenceOptions {
  enabled: boolean;
  required: boolean;
  username?: string;
  password?: string;
  baseUrl: string;
  source: string;
  timeoutMs: number;
  renderMode: 'html';
}

export interface OxylabsRetrieveInput {
  url: string;
  allowedHosts: string[];
}

const MAX_HTML_BYTES = 1_000_000;
const METADATA_HOSTS = new Set(['169.254.169.254', 'metadata.google.internal']);

export class OxylabsEnvironmentIntelligenceProvider {
  constructor(private readonly options: OxylabsEnvironmentIntelligenceOptions) {}

  async retrieve(input: OxylabsRetrieveInput): Promise<EnvironmentIntelligenceContextShape> {
    const started = Date.now();
    const safeUrl = assertSafePublicUrl(input.url, input.allowedHosts);
    if (!this.options.enabled) return unavailable(safeUrl, started, 'OXYLABS_DISABLED');
    if (!this.options.username || !this.options.password) return unavailable(safeUrl, started, 'OXYLABS_CREDENTIALS_MISSING');

    const response = await this.queryOxylabs(safeUrl);
    const result = response.results[0];
    if (!result?.content) throw new OxylabsEnvironmentIntelligenceError('EMPTY_RESULTS', 'Oxylabs returned no rendered content.');
    if (result.status_code < 200 || result.status_code >= 400) throw new OxylabsEnvironmentIntelligenceError('TARGET_STATUS_FAILED', 'Oxylabs retrieved a non-success target status.');
    const finalUrl = assertSafePublicUrl(result.url ?? safeUrl.toString(), input.allowedHosts);
    const contentBytes = Buffer.byteLength(result.content, 'utf8');
    if (contentBytes > MAX_HTML_BYTES) throw new OxylabsEnvironmentIntelligenceError('OVERSIZED_HTML', 'Oxylabs rendered HTML exceeded the safe extraction limit.');
    const extracted = extractEnvironmentContext(result.content, finalUrl);
    return environmentIntelligenceContextSchema.parse({
      provider: 'OXYLABS',
      status: 'COMPLETED',
      sourceUrl: safeUrl.toString(),
      finalUrl: finalUrl.toString(),
      sourceDomain: finalUrl.hostname,
      targetStatusCode: result.status_code,
      rendered: true,
      ...extracted,
      jobId: result.job_id ?? null,
      durationMs: Date.now() - started,
      retrievedAt: new Date().toISOString(),
      usedByPlanner: false,
    });
  }

  private async queryOxylabs(url: URL): Promise<OxylabsResponse> {
    let lastError: unknown;
    for (const attempt of [1, 2]) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
      try {
        const response = await fetch(this.options.baseUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${this.options.username}:${this.options.password}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ source: this.options.source, url: url.toString(), render: this.options.renderMode }),
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as unknown;
        if (!response.ok) {
          if (attempt === 1 && [429, 502, 503, 504].includes(response.status)) {
            lastError = new OxylabsEnvironmentIntelligenceError(`HTTP_${response.status}`, 'Oxylabs request failed with a retryable status.');
            continue;
          }
          throw new OxylabsEnvironmentIntelligenceError(response.status === 401 || response.status === 403 ? 'AUTHENTICATION_ERROR' : `HTTP_${response.status}`, 'Oxylabs request failed.');
        }
        return parseOxylabsResponse(payload);
      } catch (error) {
        lastError = error;
        const name = error instanceof Error ? error.name : '';
        if (attempt === 1 && name !== 'AbortError') continue;
        if (name === 'AbortError') throw new OxylabsEnvironmentIntelligenceError('TIMEOUT', 'Oxylabs request timed out.');
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
    throw lastError instanceof Error ? lastError : new OxylabsEnvironmentIntelligenceError('UNKNOWN_PROVIDER_ERROR', 'Oxylabs request failed.');
  }
}

export class OxylabsEnvironmentIntelligenceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'OxylabsEnvironmentIntelligenceError';
  }
}

interface OxylabsResponse {
  results: Array<{
    content?: string;
    status_code: number;
    url?: string;
    job_id?: string;
  }>;
}

function parseOxylabsResponse(value: unknown): OxylabsResponse {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { results?: unknown }).results)) {
    throw new OxylabsEnvironmentIntelligenceError('MALFORMED_RESPONSE', 'Oxylabs response shape was invalid.');
  }
  return value as OxylabsResponse;
}

export function assertSafePublicUrl(value: string, allowedHosts: string[]): URL {
  const url = new URL(value);
  const allowed = new Set(allowedHosts.map((host) => host.toLowerCase()));
  const hostname = url.hostname.toLowerCase();
  if (!['https:', 'http:'].includes(url.protocol)) throw new OxylabsEnvironmentIntelligenceError('UNSAFE_URL', 'Only HTTP and HTTPS URLs are supported.');
  if (url.username || url.password) throw new OxylabsEnvironmentIntelligenceError('UNSAFE_URL', 'Embedded URL credentials are not supported.');
  if (!allowed.has(hostname)) throw new OxylabsEnvironmentIntelligenceError('HOST_NOT_ALLOWED', 'Target host is outside Project Safety.');
  if (url.protocol === 'http:' && hostname !== 'localhost') throw new OxylabsEnvironmentIntelligenceError('UNSAFE_URL', 'Public environment intelligence requires HTTPS targets.');
  if (isUnsafeHost(hostname)) throw new OxylabsEnvironmentIntelligenceError('UNSAFE_URL', 'Private, loopback, link-local, and metadata hosts are blocked.');
  if (url.port && !['80', '443'].includes(url.port)) throw new OxylabsEnvironmentIntelligenceError('UNSAFE_URL', 'Unsupported target port.');
  return url;
}

function isUnsafeHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1' || METADATA_HOSTS.has(hostname)) return true;
  const ipv4 = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(hostname);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
}

function unavailable(url: URL, started: number, errorCategory: string): EnvironmentIntelligenceContextShape {
  return environmentIntelligenceContextSchema.parse({
    provider: 'OXYLABS',
    status: 'UNAVAILABLE',
    sourceUrl: url.toString(),
    finalUrl: url.toString(),
    sourceDomain: url.hostname,
    targetStatusCode: 0,
    rendered: false,
    title: null,
    headings: [],
    forms: [],
    buttons: [],
    links: [],
    visibleTextSummary: '',
    detectedJourneys: [],
    jobId: null,
    durationMs: Date.now() - started,
    retrievedAt: new Date().toISOString(),
    usedByPlanner: false,
    errorCategory,
  });
}

function extractEnvironmentContext(html: string, finalUrl: URL) {
  const cleaned = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  const title = text(matchFirst(cleaned, /<title\b[^>]*>([\s\S]*?)<\/title>/i)) || null;
  const headings = [...cleaned.matchAll(/<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi)].map((match) => text(match[1])).filter(Boolean).slice(0, 20);
  const forms = [...cleaned.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)].slice(0, 10).map((match) => {
    const attrs = attrsOf(match[1] ?? '');
    const body = match[2] ?? '';
    return {
      method: attrValue(attrs, 'method')?.toUpperCase() ?? null,
      action: sanitizeHref(attrValue(attrs, 'action'), finalUrl),
      inputs: [...body.matchAll(/<(input|select|textarea)\b([^>]*)>/gi)].map((input) => {
        const inputAttrs = attrsOf(input[2] ?? '');
        const type = input[1]?.toLowerCase() === 'input' ? attrValue(inputAttrs, 'type') ?? 'text' : input[1]?.toLowerCase() ?? null;
        return {
          type: sanitizeInputType(type),
          name: sanitizeInputName(attrValue(inputAttrs, 'name') ?? attrValue(inputAttrs, 'id')),
          label: null,
          required: /\srequired(?:\s|>|=)/i.test(input[0] ?? ''),
        };
      }).filter((input) => input.type !== null).slice(0, 20),
    };
  });
  const buttons = [...cleaned.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)]
    .map((match) => ({ text: text(match[2]).slice(0, 160), type: attrValue(attrsOf(match[1] ?? ''), 'type') ?? null }))
    .filter((button) => button.text)
    .slice(0, 30);
  const links = [...cleaned.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
    .map((match) => ({ text: text(match[2]).slice(0, 160), href: sanitizeHref(attrValue(attrsOf(match[1] ?? ''), 'href'), finalUrl) }))
    .filter((link) => link.text)
    .slice(0, 40);
  const visibleTextSummary = text(cleaned.replace(/<[^>]+>/g, ' ')).slice(0, 3000);
  return {
    title,
    headings,
    forms,
    buttons,
    links,
    visibleTextSummary,
    detectedJourneys: detectJourneys([title ?? '', ...headings, ...buttons.map((button) => button.text), ...links.map((link) => link.text), visibleTextSummary].join(' ')),
  };
}

function detectJourneys(value: string): string[] {
  const textValue = value.toLowerCase();
  const checks: Array<[string, RegExp]> = [
    ['Browse products', /product|catalog|shop|store/],
    ['Search catalogue', /search/],
    ['View product', /view product|details|product/],
    ['Add to cart', /add to cart|cart/],
    ['Checkout', /checkout|payment|pay\b/],
    ['Sign in', /sign in|login|log in/],
    ['Register', /register|sign up|create account/],
    ['Submit form', /submit|send/],
    ['Contact support', /contact|support|help/],
    ['Book appointment', /book|appointment|schedule/],
  ];
  return checks.filter(([, pattern]) => pattern.test(textValue)).map(([label]) => label).slice(0, 10);
}

function matchFirst(value: string, pattern: RegExp): string | undefined {
  return pattern.exec(value)?.[1];
}

function attrsOf(value: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of value.matchAll(/([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    attrs[match[1]!.toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

function attrValue(attrs: Record<string, string>, key: string): string | undefined {
  const value = attrs[key.toLowerCase()]?.trim();
  return value || undefined;
}

function text(value: string | undefined): string {
  return decodeEntities((value ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function sanitizeHref(value: string | undefined, base: URL): string | null {
  if (!value || /^(javascript|data|file):/i.test(value)) return null;
  try {
    const url = new URL(value, base);
    url.search = '';
    url.hash = '';
    return url.toString().slice(0, 500);
  } catch {
    return null;
  }
}

function sanitizeInputType(value: string | null): string | null {
  if (!value) return null;
  return value.toLowerCase() === 'password' || value.toLowerCase() === 'hidden' ? null : value.slice(0, 80);
}

function sanitizeInputName(value: string | undefined): string | null {
  if (!value) return null;
  return /token|secret|password|cookie|authorization/i.test(value) ? null : value.slice(0, 120);
}
