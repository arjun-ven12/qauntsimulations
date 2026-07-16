import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const DEFAULT_INVENTORY = 5;
const MAX_PAYMENT_DELAY_MS = 10_000;

export interface DemoConfig {
  duplicateSubmissionBug: boolean;
  paymentDelayMs: number;
}

export interface PaymentRecord {
  paymentId: string;
  cartId: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  status: 'succeeded';
}

export interface OrderRecord {
  orderId: string;
  paymentId: string;
  status: 'confirmed';
  items: number;
  total: number;
}

export interface DemoStoreState {
  cart: { id: string; items: number };
  checkout: { status: 'idle' | 'processing' | 'confirmed' };
  payments: PaymentRecord[];
  orders: OrderRecord[];
  inventory: Record<string, number>;
  config: DemoConfig;
  requestCounters: { payments: number; orders: number };
  idCounters: { payments: number; orders: number };
}

export interface DemoApiHandler {
  handle(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}

function initialState(): DemoStoreState {
  return {
    cart: { id: 'cart_demo_001', items: 0 },
    checkout: { status: 'idle' },
    payments: [],
    orders: [],
    inventory: { 'test-product': DEFAULT_INVENTORY },
    config: { duplicateSubmissionBug: false, paymentDelayMs: 0 },
    requestCounters: { payments: 0, orders: 0 },
    idCounters: { payments: 0, orders: 0 },
  };
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(body));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseConfig(value: unknown): DemoConfig | null {
  if (!isRecord(value)) return null;
  const { duplicateSubmissionBug, paymentDelayMs } = value;
  if (
    typeof duplicateSubmissionBug !== 'boolean' ||
    typeof paymentDelayMs !== 'number' ||
    !Number.isInteger(paymentDelayMs) ||
    paymentDelayMs < 0 ||
    paymentDelayMs > MAX_PAYMENT_DELAY_MS
  ) {
    return null;
  }
  return { duplicateSubmissionBug, paymentDelayMs };
}

function nextId(prefix: string, value: number): string {
  return `${prefix}_${String(value).padStart(3, '0')}`;
}

function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

export function createDemoApiHandler(): DemoApiHandler {
  let state = initialState();

  return {
    async handle(request, response) {
      const url = new URL(request.url ?? '/', 'http://demo.local');
      if (!isApiPath(url.pathname)) return false;

      if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.setHeader('Allow', 'GET, POST, OPTIONS');
        response.setHeader('Cache-Control', 'no-store');
        response.end();
        return true;
      }

      try {
        if (url.pathname === '/api/test/reset' && request.method === 'POST') {
          state = initialState();
          sendJson(response, 200, { ok: true, resetAt: new Date().toISOString() });
          return true;
        }

        if (url.pathname === '/api/test/config' && request.method === 'GET') {
          sendJson(response, 200, state.config);
          return true;
        }

        if (url.pathname === '/api/test/config' && request.method === 'POST') {
          const config = parseConfig(await readJson(request));
          if (!config) {
            sendJson(response, 400, {
              error: `duplicateSubmissionBug must be boolean and paymentDelayMs must be an integer from 0 to ${MAX_PAYMENT_DELAY_MS}`,
            });
            return true;
          }
          state.config = config;
          sendJson(response, 200, config);
          return true;
        }

        if (url.pathname === '/api/test/state' && request.method === 'GET') {
          sendJson(response, 200, state);
          return true;
        }

        if (url.pathname === '/api/payments' && request.method === 'POST') {
          const body = await readJson(request);
          if (
            !isRecord(body) ||
            typeof body.cartId !== 'string' ||
            typeof body.amount !== 'number' ||
            typeof body.currency !== 'string' ||
            typeof body.idempotencyKey !== 'string'
          ) {
            sendJson(response, 400, { error: 'Invalid payment request' });
            return true;
          }

          const requestState = state;
          const requestConfig = { ...requestState.config };
          requestState.requestCounters.payments += 1;
          requestState.checkout.status = 'processing';
          const existing = requestState.payments.find(
            (payment) => payment.idempotencyKey === body.idempotencyKey,
          );
          if (existing && !requestConfig.duplicateSubmissionBug) {
            sendJson(response, 200, existing);
            return true;
          }

          await new Promise((resolve) => setTimeout(resolve, requestConfig.paymentDelayMs));
          if (state !== requestState) {
            sendJson(response, 409, { error: 'Fixture was reset while payment was processing' });
            return true;
          }

          requestState.idCounters.payments += 1;
          const payment: PaymentRecord = {
            paymentId: nextId('pay', requestState.idCounters.payments),
            cartId: body.cartId,
            amount: body.amount,
            currency: body.currency,
            idempotencyKey: body.idempotencyKey,
            status: 'succeeded',
          };
          requestState.payments.push(payment);
          sendJson(response, 200, payment);
          return true;
        }

        if (url.pathname === '/api/orders' && request.method === 'POST') {
          const body = await readJson(request);
          if (!isRecord(body) || typeof body.paymentId !== 'string') {
            sendJson(response, 400, { error: 'Invalid order request' });
            return true;
          }
          const payment = state.payments.find((item) => item.paymentId === body.paymentId);
          if (!payment) {
            sendJson(response, 409, { error: 'Payment has not succeeded' });
            return true;
          }

          state.requestCounters.orders += 1;
          state.idCounters.orders += 1;
          const order: OrderRecord = {
            orderId: nextId('ord', state.idCounters.orders),
            paymentId: payment.paymentId,
            status: 'confirmed',
            items: 1,
            total: payment.amount,
          };
          state.orders.push(order);
          state.inventory['test-product'] =
            (state.inventory['test-product'] ?? DEFAULT_INVENTORY) - 1;
          state.cart.items = 0;
          state.checkout.status = 'confirmed';
          sendJson(response, 200, order);
          return true;
        }
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : 'Invalid request',
        });
        return true;
      }

      sendJson(response, 404, { error: 'API route not found' });
      return true;
    },
  };
}

export function demoApi(): Plugin {
  const api = createDemoApiHandler();

  return {
    name: 'taskos-demo-api',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        void api
          .handle(request, response)
          .then((handled) => {
            if (!handled) next();
          })
          .catch(next);
      });
    },
  };
}
