# Demo-store Daytona handoff

## Deployment status

* Status: **PUBLIC DEPLOYMENT LIVE — DAYTONA EU CONNECTIVITY BLOCKED**
* Date locally verified: 2026-07-15
* Public deployment: `https://tasks-demo-store.onrender.com`
* Local production verification: passed
* Mac/browser verification: passed
* Daytona EU DNS resolution: passed
* Daytona EU HTTPS connection: failed
* Failure: connection reset during TLS handshake
* Daytona US region availability: unavailable for this organization
* Selected Prompt 4 execution model: demo store and Playwright worker inside the same Daytona sandbox

The public Render deployment is healthy from the developer machine. However, the available Daytona EU sandbox cannot complete a TLS handshake with the Render/Cloudflare endpoint.

Because the organization cannot create `us` container sandboxes, Runtime Prompt 4 must not depend on the public Render URL.

Instead, each Daytona sandbox will run:

```text
Daytona sandbox
├── Demo-store production server
│   └── http://127.0.0.1:4174
└── Playwright worker
    └── targets http://127.0.0.1:4174
```

This also provides isolated demo-store state for each sandbox.

## Public URLs

These remain available for manual verification and normal browser access:

* Demo-store base URL: `https://tasks-demo-store.onrender.com`
* API base URL: `https://tasks-demo-store.onrender.com`
* Product URL: `https://tasks-demo-store.onrender.com/products/test-product`
* Start route: `/products/test-product`

The public deployment is not the execution target for Runtime Prompt 4 because the available Daytona EU sandbox cannot currently reach it.

## Daytona-local URLs

Runtime Prompt 4 must use:

```text
DEMO_STORE_URL=http://127.0.0.1:4174
DEMO_API_URL=http://127.0.0.1:4174
```

Product route:

```text
http://127.0.0.1:4174/products/test-product
```

Reset endpoint:

```text
POST http://127.0.0.1:4174/api/test/reset
```

Configuration endpoint:

```text
POST http://127.0.0.1:4174/api/test/config
```

Diagnostic state endpoint:

```text
GET http://127.0.0.1:4174/api/test/state
```

## Endpoints

* Reset: `POST /api/test/reset`
* Config: `POST /api/test/config`
* Payment: `POST /api/payments`
* Order: `POST /api/orders`
* Diagnostic state: `GET /api/test/state`
* Payment observation pattern: `**/api/payments`
* Order observation pattern: `**/api/orders`

Configuration fields:

* `duplicateSubmissionBug` — boolean
* `paymentDelayMs` — integer from 0 through 10,000

Successful reset response:

```json
{
  "ok": true,
  "resetAt": "<ISO timestamp>"
}
```

Healthy configuration:

```json
{
  "duplicateSubmissionBug": false,
  "paymentDelayMs": 0
}
```

Defective delayed configuration:

```json
{
  "duplicateSubmissionBug": true,
  "paymentDelayMs": 1200
}
```

## Selectors

The following selectors are frozen and must not be renamed:

* Product page: `[data-testid="product-page"]`
* Add to cart: `[data-testid="add-to-cart"]`
* Open cart: `[data-testid="open-cart"]`
* Cart item: `[data-testid="cart-item"]`
* Checkout button: `[data-testid="checkout-button"]`
* Checkout form: `[data-testid="checkout-form"]`
* Email input: `[data-testid="email-input"]`
* Pay button: `[data-testid="pay-button"]`
* Payment status: `[data-testid="payment-status"]`
* Order confirmation: `[data-testid="order-confirmation"]`
* Order ID: `[data-testid="order-id"]`

Success condition:

```text
[data-testid="order-confirmation"]
```

The success selector becomes visible only after payment and order creation succeed.

The order ID selector exposes the deterministic final order ID, beginning with `ord_001` after reset.

## Browser-state guarantee

The checkout journey succeeds in a fresh Playwright browser context with no pre-existing:

* cookies
* `localStorage`
* `sessionStorage`
* IndexedDB
* service-worker cache
* cart state
* checkout state
* feature-flag cookies

Cart state is initialized by the React application.

Test configuration, payment records and order records are maintained by the demo-store server.

The required worker sequence is:

1. Start the production demo-store server.
2. Wait until `/products/test-product` responds.
3. Call `POST /api/test/reset`.
4. Call `POST /api/test/config`.
5. Create a fresh browser context.
6. Open `/products/test-product`.
7. Complete checkout using the frozen selectors.
8. Observe payment and order requests.
9. Capture evidence.
10. Evaluate invariants.

## CORS

The Daytona execution model is same-origin and localhost-based.

The browser and API use:

```text
http://127.0.0.1:4174
```

Normal browser calls therefore do not require cross-origin CORS configuration.

The server:

* does not require credentials
* does not use wildcard CORS with credentials
* returns API responses before SPA fallback
* returns 204 for supported API `OPTIONS` requests
* does not return `index.html` for API preflight or API errors

## State model

The demo-store service has one global in-memory state per Node process.

Reset clears:

* payment records
* order records
* payment request counters
* order request counters
* generated payment ID counters
* generated order ID counters
* inventory
* cart-related server state
* checkout-related server state
* `duplicateSubmissionBug`
* `paymentDelayMs`
* active artificial fault configuration

Reset is idempotent.

Configuration changes apply immediately to subsequent requests without restarting the server.

For Runtime Prompt 4, one demo-store process and one Playwright worker run inside one sandbox.

This means the global in-memory state is isolated to that sandbox.

For later multi-world execution, each sandbox should run its own demo-store process to avoid cross-worker resets or configuration interference.

## Demo-store production commands

From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @taskos/demo-store build
PORT=4174 HOST=0.0.0.0 pnpm --filter @taskos/demo-store start
```

The production server must:

* bind to `0.0.0.0`
* read `PORT`
* serve built Vite assets
* support SPA fallback
* serve API routes before SPA fallback
* return JSON for API errors
* fail clearly when `dist/index.html` is missing

No database, authentication secret, TaskOS API, OpenAI key or Daytona key is required by the demo store.

## Container deployment

Portable Docker deployment from the repository root:

```bash
docker build -f apps/demo-store/Dockerfile -t taskos-demo-store .
docker run --rm -p 4174:4174 -e PORT=4174 taskos-demo-store
```

Docker was not available in the original local verification environment.

Runtime Prompt 4 does not require Docker if the production demo-store build can be uploaded and started directly inside Daytona.

## Daytona sandbox configuration

Use:

```text
Region: eu
Public HTTP Preview: off
Block All Network Access: off
Ephemeral: optional
```

Safe sandbox environment variables:

```env
NODE_ENV=production
TASKOS_WORKER_MODE=daytona
DEMO_STORE_URL=http://127.0.0.1:4174
DEMO_API_URL=http://127.0.0.1:4174
PORT=4174
HOST=0.0.0.0
PLAYWRIGHT_BROWSERS_PATH=/home/daytona/.cache/ms-playwright
```

Do not place the following inside the sandbox:

```text
DAYTONA_API_KEY
DATABASE_URL
DIRECT_URL
JWT_SECRET
OPENAI_API_KEY
KIMI_API_KEY
NOSANA_API_KEY
GITHUB_TOKEN
```

The TaskOS API outside the sandbox uses `DAYTONA_API_KEY` to create and manage the sandbox.

The sandbox itself does not need that key.

## Required sandbox filesystem layout

Recommended layout:

```text
/workspace/taskos/
├── demo-store/
│   ├── dist/
│   ├── server/
│   └── package.json
├── worker/
│   ├── worker.cjs
│   └── package.json
├── input/
│   └── worker-job.json
├── logs/
│   └── demo-store.log
└── output/
    ├── worker-result.json
    ├── manifest.json
    ├── screenshots/
    ├── trace/
    ├── console/
    ├── network/
    └── video/
```

## Daytona-local acceptance checks

After starting the demo store inside the sandbox:

```bash
curl -i --max-time 20 \
  http://127.0.0.1:4174/products/test-product
```

```bash
curl -i --max-time 20 \
  -X POST http://127.0.0.1:4174/api/test/reset
```

```bash
curl -i --max-time 20 \
  -X POST http://127.0.0.1:4174/api/test/config \
  -H "Content-Type: application/json" \
  -d '{"duplicateSubmissionBug":false,"paymentDelayMs":0}'
```

All three must succeed before the Playwright worker begins.

## Expected scenarios

### Healthy checkout

Configuration:

```json
{
  "duplicateSubmissionBug": false,
  "paymentDelayMs": 0
}
```

Expected:

* one payment request
* one order request
* confirmation visible
* order ID visible
* invariants pass

### Healthy delayed double-click

Configuration:

```json
{
  "duplicateSubmissionBug": false,
  "paymentDelayMs": 1200
}
```

Expected:

* one payment request
* one order request
* confirmation visible
* no duplicate-submission violation

### Defective delayed double-click

Configuration:

```json
{
  "duplicateSubmissionBug": true,
  "paymentDelayMs": 1200
}
```

Expected:

* two payment requests
* two order requests
* confirmation visible
* duplicate-payment invariant fails
* duplicate-order invariant fails

## Verification completed

Verified locally on 2026-07-15:

* Vite development suite: passed
* Production Node server suite: passed
* Direct `/products/test-product`: 200 HTML
* Reset: 200 JSON
* Config: 200 JSON
* Invalid config: 400 JSON
* Unknown API route: 404 JSON
* API preflight: 204
* Normal checkout: one payment and one order
* Healthy delayed double-click: one payment and one order
* Defective delayed double-click: two payments and two orders
* Reset isolation: passed
* Fresh browser context: passed
* Public Render URL from Mac/browser: passed
* Daytona EU DNS resolution for Render URL: passed
* Daytona EU TLS connection to Render URL: failed
* Daytona US container region: unavailable for this organization
* Playwright installation in Daytona default snapshot: passed
* Chromium launch in Daytona default snapshot: passed

## Runtime Prompt 4 verification

Verified in a real Daytona EU sandbox on 2026-07-16:

* demo-store and portable worker bundles uploaded successfully
* demo-store started at sandbox localhost and the product route returned HTTP 200
* reset and healthy configuration returned valid JSON
* Chromium launched and the existing checkout WorkerJob completed
* WorkerResult validated with one payment, one order, and both invariants passing
* manifest, trace, screenshots, console, and network evidence downloaded
* the successful sandbox was deleted

The live toolbox runs as the `daytona` user, and `/workspace` is not writable in the default snapshot. Runtime Prompt 4 therefore uses `/home/daytona/taskos` while preserving the planned directory structure. The defective live scenario remains optional and has not been claimed. Full implementation and observed version/timing details are in `docs/runtime/daytona-isolated-world-execution.md`.

## Runtime-owner handoff

Runtime Prompt 4 may rely on:

```text
Local Daytona target:
http://127.0.0.1:4174

Start route:
/products/test-product

Reset:
POST /api/test/reset

Config:
POST /api/test/config

Payment pattern:
**/api/payments

Order pattern:
**/api/orders

Success selector:
[data-testid="order-confirmation"]

Order ID selector:
[data-testid="order-id"]
```

Runtime Prompt 4 must upload and start the demo store before running the Playwright worker.

The public Render deployment must not be used as the required Daytona execution target until the TLS connectivity issue is resolved.
