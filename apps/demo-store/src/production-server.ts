import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type ServerResponse } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDemoApiHandler } from './demo-api.js';

const HOST = '0.0.0.0';
const DEFAULT_PORT = 4174;
const serverDirectory = dirname(fileURLToPath(import.meta.url));
const distDirectory = resolve(serverDirectory, '..');
const indexPath = resolve(distDirectory, 'index.html');

const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function parsePort(value: string | undefined): number {
  if (value === undefined || value === '') return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  return port;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function sendFile(response: ServerResponse, path: string, method: string | undefined): void {
  response.statusCode = 200;
  response.setHeader(
    'Content-Type',
    contentTypes[extname(path).toLowerCase()] ?? 'application/octet-stream',
  );
  response.setHeader(
    'Cache-Control',
    path === indexPath ? 'no-cache' : 'public, max-age=31536000, immutable',
  );
  if (method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(path).pipe(response);
}

function resolveStaticPath(pathname: string): string | null {
  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const candidate = resolve(distDirectory, relativePath);
  if (candidate !== distDirectory && !candidate.startsWith(`${distDirectory}${sep}`)) return null;
  return candidate;
}

async function start(): Promise<void> {
  if (!existsSync(indexPath)) {
    throw new Error(`Production assets are missing at ${indexPath}. Run pnpm build first.`);
  }

  const api = createDemoApiHandler();
  const port = parsePort(process.env.PORT);
  const server = createServer(async (request, response) => {
    if (await api.handle(request, response)) return;

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      sendJson(response, 405, { error: 'Method not allowed' });
      return;
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://demo.local').pathname);
    } catch {
      sendJson(response, 400, { error: 'Invalid request path' });
      return;
    }

    const staticPath = resolveStaticPath(pathname);
    if (!staticPath) {
      sendJson(response, 403, { error: 'Invalid request path' });
      return;
    }

    if (existsSync(staticPath) && statSync(staticPath).isFile()) {
      sendFile(response, staticPath, request.method);
      return;
    }

    if (pathname.startsWith('/assets/') || extname(pathname) !== '') {
      sendJson(response, 404, { error: 'Static asset not found' });
      return;
    }

    sendFile(response, indexPath, request.method);
  });

  server.on('clientError', (_error, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
  });

  await new Promise<void>((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => {
      server.off('error', reject);
      resolveListen();
    });
  });
  console.log(`TaskOS demo store listening on http://${HOST}:${port}`);
}

void start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Failed to start demo store');
  process.exitCode = 1;
});
