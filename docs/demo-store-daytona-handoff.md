# Demo-store Daytona handoff

## Deployment status

- Status: **PUBLIC DEPLOYMENT PENDING**
- Date locally verified: 2026-07-15
- Environment: local Node production server on macOS; Vite development server
- Public deployment credentials/configuration found: none
- Docker availability in the verification environment: unavailable

The service is production- and container-ready, but it is not ready to hand to Daytona until the
manual deployment step below produces a real URL and the remote acceptance suite passes.

## Public URLs

- Demo-store base URL: pending
- API base URL: pending
- Start route: `/products/test-product`

The intended deployment is same-origin:

```text
DEMO_STORE_URL=https://<deployed-domain>
DEMO_API_URL=https://<deployed-domain>
```

No placeholder above is a claimed public URL.

## Endpoints

- Reset: `POST <API_BASE_URL>/api/test/reset`
- Config: `POST <API_BASE_URL>/api/test/config`
- Payment pattern: `**/api/payments`
- Order pattern: `**/api/orders`
- Diagnostic state used by contract tests: `GET <API_BASE_URL>/api/test/state`

Configuration fields:

- `duplicateSubmissionBug` — boolean
- `paymentDelayMs` — integer from 0 through 10,000

Successful reset response:

```json
{ "ok": true, "resetAt": "<ISO timestamp>" }
```

## Selectors

- Success: `[data-testid="order-confirmation"]`
- Order ID: `[data-testid="order-id"]`
- Product page: `[data-testid="product-page"]`
- Add to cart: `[data-testid="add-to-cart"]`
- Open cart: `[data-testid="open-cart"]`
- Cart item: `[data-testid="cart-item"]`
- Checkout: `[data-testid="checkout-button"]`
- Checkout form: `[data-testid="checkout-form"]`
- Email: `[data-testid="email-input"]`
- Pay: `[data-testid="pay-button"]`
- Payment status: `[data-testid="payment-status"]`

The success selector is mounted only after payment and order creation succeed. The order ID selector
contains the final deterministic order ID, starting with `ord_001` after reset.

## Browser-state guarantee

The journey succeeds in a new Playwright browser context with no cookies, `localStorage`, or
`sessionStorage`. It does not use IndexedDB, service workers, persisted cart state, feature-flag
cookies, or pre-existing checkout state. Cart state is freshly initialized by the React page; test
configuration and checkout records are server-side.

The worker sequence is:

1. `POST /api/test/reset`.
2. `POST /api/test/config`.
3. Create a fresh browser context.
4. Open `/products/test-product`.
5. Complete checkout using the frozen selectors.

## CORS

The selected architecture serves UI and API from one origin, so normal browser calls do not require
CORS headers. The server does not enable credentials or a permissive wildcard origin. API `OPTIONS`
requests return 204 with `Allow: GET, POST, OPTIONS`; they never fall through to `index.html`.

If a platform later splits UI and API origins, explicit allowlisted CORS must be added and retested.
The current handoff does not claim cross-origin support because it is unnecessary for the selected
same-origin service.

## State model

The service has one global in-memory state per Node process. Reset clears:

- payment and order records;
- payment and order request counters;
- generated payment and order ID counters;
- inventory;
- cart and checkout server state;
- `duplicateSubmissionBug` and `paymentDelayMs`;
- active artificial fault configuration.

Reset is idempotent. Delayed payment work captures its fixture generation and returns 409 rather than
writing after a reset. Configuration changes apply immediately to subsequent requests without a
restart.

This model is safe for Prompt 4's one worker and one Daytona sandbox. Simultaneous workers against the
same process can reset or configure each other's state and are not isolated. Run remote tests with one
worker.

## Deployment commands

Install and verify:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @taskos/demo-store build
PORT=4174 pnpm --filter @taskos/demo-store start
```

The Node server binds `0.0.0.0`, reads `PORT`, serves built assets from `dist`, supports SPA fallback,
and fails clearly when `dist/index.html` is missing. No database, authentication secret, TaskOS API,
or AI key is required.

Portable Docker deployment from the repository root:

```bash
docker build -f apps/demo-store/Dockerfile -t taskos-demo-store .
docker run --rm -p 4174:4174 -e PORT=4174 taskos-demo-store
```

The remaining manual deployment step is to connect the repository to a container host, select
`apps/demo-store/Dockerfile`, deploy it, and copy the resulting HTTPS domain. Then run:

```bash
export DEMO_STORE_URL=https://<real-deployed-domain>
export DEMO_API_URL="$DEMO_STORE_URL"
pnpm --filter @taskos/demo-store test:remote
curl -i "$DEMO_STORE_URL/products/test-product"
curl -i -X POST "$DEMO_API_URL/api/test/reset"
curl -i -X POST "$DEMO_API_URL/api/test/config" \
  -H "Content-Type: application/json" \
  -d '{"duplicateSubmissionBug":true,"paymentDelayMs":1200}'
```

Replace the pending values in this document only after those commands pass against the real URL.

## Verification

Verified locally on 2026-07-15:

- Vite development suite: passed, 10 tests.
- Production Node server suite: passed, 10 tests.
- Direct `/products/test-product`: 200 HTML.
- Reset: 200 JSON with ISO `resetAt`.
- Config: 200 JSON with applied values; invalid bodies return 400 JSON.
- Unknown API route: 404 JSON, not the SPA.
- API preflight: 204, not the SPA.
- Normal checkout: one payment, one order, confirmation and `ord_001` visible.
- Healthy 1,200 ms checkout with clicks 50 ms apart: one payment and one order.
- Buggy 1,200 ms checkout with clicks 50 ms apart: two payments and two orders.
- Reset after buggy checkout plus a fresh context: one payment, one order, no contamination.
- Fresh browser context: no cookies, local storage, or session storage required.

Not verified:

- Docker build/run, because Docker is unavailable in this environment.
- Public URL or Daytona access, because no deployment configuration or credentials are available.
