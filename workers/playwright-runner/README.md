# TaskOS Playwright Runner

Standalone deterministic browser worker for one validated commerce world. It imports execution contracts only; it has no Express, Prisma, Neon, Daytona, or AI dependency.

## Setup

From the repository root:

```bash
pnpm install
pnpm --filter @taskos/playwright-runner exec playwright install chromium firefox webkit
pnpm --filter @taskos/playwright-runner build
```

## Run

Start the target application, then run from `workers/playwright-runner`:

```bash
pnpm start -- --job ./fixtures/normal-checkout.job.json
pnpm start -- --job ./fixtures/healthy-double-submit.job.json
pnpm start -- --job ./fixtures/duplicate-submission.job.json --headed --debug
```

Override a fixture target without editing JSON:

```bash
TASKOS_TARGET_BASE_URL=http://127.0.0.1:5174 pnpm start -- --job ./fixtures/normal-checkout.job.json
```

## Contracts

`WorkerJob`, journey steps, network events, invariant results, manifests, and `WorkerResult` are defined and Zod-validated in `@taskos/execution-contracts`. Jobs contain only known selector-based actions; arbitrary JavaScript and shell commands are not accepted.

Supported journey actions: `goto`, `click`, `submitPayment`, `doubleClick`, `fill`, `waitFor`, `wait`, `reload`, `assertVisible`, and `assertText`. `submitPayment` performs one click normally and a bounded repeated click only for an impatient, double-submit world. Desktop resolves to 1440×900; mobile resolves to 390×844. Chromium, Firefox, and WebKit are supported.

Demo-store fixtures can declare only two test setup operations: `POST /api/test/reset` and `POST /api/test/config`. Both stay on the target origin (or an explicit trusted `target.apiBaseUrl`), are validated before browser launch, and are recorded in the evidence manifest. No arbitrary setup URL, script, JavaScript, or shell command is accepted.

## Evidence

```text
<outputDirectory>/
├── manifest.json
├── worker-result.json
├── screenshots/
├── trace/trace.zip
├── console/console.json
├── network/network.json
└── video/                 # when enabled
```

Network evidence records timing, status/failure, resource type, payment/order classification, safe commerce fields, response identifiers, and safe correlation or idempotency keys. Authorization, cookie, API-key, password, secret, credential, and token-like values are redacted. Raw headers, cookies, and unrestricted request bodies are never stored. Evidence collector failure is reported in the manifest and does not erase the main result.

## Faults and invariants

- General and payment-specific latency through request routing
- Pattern/resource-type bounded request aborts
- Step-triggered offline interruption
- Explicit repeated submit for impatient users
- Cookie/storage clearing and step-triggered session expiry
- Low-bandwidth configuration is recorded, but exact byte throttling is not available through a stable cross-engine Playwright API
- `NO_DUPLICATE_PAYMENT`
- `NO_DUPLICATE_ORDER` with network and optional DOM identifier evidence

## Exit codes

| Code | Meaning |
|---:|---|
| 0 | Completed; invariants passed |
| 2 | Invariant violation |
| 3 | Journey failed |
| 4 | Timed out |
| 5 | Invalid job or CLI arguments |
| 6 | Internal runner error |

## Known limitations

Offline mode uses `BrowserContext.setOffline`, the most consistent shared Playwright API, but browser engines may surface different native error text. Low-bandwidth profiles are recorded rather than byte-throttled. Payment/order detection depends on configured URL patterns and mutation methods. Response JSON is captured only for matching payment/order responses and is recursively redacted.

Inside Daytona, the compiled worker, browser runtime, and one job file can be copied into a sandbox and invoked with the same CLI. No architectural adapter is required; Daytona integration is intentionally outside this milestone.
