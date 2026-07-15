# Local worker and demo-store integration

This milestone connects the standalone Playwright worker to the deterministic demo-store contract at `http://localhost:5174`. It uses the demo store's same-origin in-memory test API and does not require the Express API, Prisma, Neon, Daytona, or an AI provider.

## Start the local services

Install the Chromium runtime once:

```bash
pnpm install
pnpm --filter @taskos/playwright-runner exec playwright install chromium
```

Start the demo store from the repository root and keep it running:

```bash
pnpm dev:demo
```

The checkout fixture and test API are both served on `http://localhost:5174`. The Express API is not used by this contract. If it is needed for other development, start it separately with:

```bash
pnpm dev:api
```

## Run the fixtures

Run these commands from the repository root:

```bash
pnpm --filter @taskos/playwright-runner start -- --job fixtures/normal-checkout.job.json
pnpm --filter @taskos/playwright-runner start -- --job fixtures/healthy-double-submit.job.json
pnpm --filter @taskos/playwright-runner start -- --job fixtures/duplicate-submission.job.json
```

| Fixture | Expected exit | Payments | Orders | Expected status |
|---|---:|---:|---:|---|
| `normal-checkout.job.json` | 0 | 1 | 1 | `PASSED` |
| `healthy-double-submit.job.json` | 0 | 1 | 1 | `PASSED` |
| `duplicate-submission.job.json` | 2 | 2 | 2 | `INVARIANT_VIOLATION` |

The package manager reports the final fixture as a recursive-run failure because exit code 2 is intentional and means the browser journey completed with an invariant violation.

## Setup and checkout contract

Each fixture performs `POST /api/test/reset`, then applies an exact configuration through `POST /api/test/config`, before launching the browser. The manifest records response status and the redacted response for both operations. Setup paths are schema-constrained and cannot point outside the target API origin.

The journey starts at `/products/test-product`, uses only selectors from `docs/demo-store-runtime-contract.md`, and considers `[data-testid="order-confirmation"]` the success state. The `submitPayment` step performs two recorded interactions only when `userProfile` is `impatient` and `doubleSubmit` is enabled.

## Evidence locations

Evidence is written beneath `workers/playwright-runner/artifacts/demo-store/`:

```text
normal-checkout/
healthy-double-submit/
duplicate-submission/
```

Each directory contains:

```text
manifest.json
worker-result.json
screenshots/
trace/trace.zip
console/console.json
network/network.json
```

Network records include payment/order classification, method, timestamps, response status and duration, safe request/response fields, and correlation keys. Secret-like fields are redacted. Worker metrics distinguish checkout interactions, request counts, and successful response counts.

## Browser support and limitations

The worker supports Chromium, Firefox, and WebKit. The real demo-store acceptance runs use Chromium; Firefox and WebKit were not part of this milestone's live matrix. The repeated interaction uses Playwright's bounded click API, including a forced second interaction so a healthy UI-disabled button is observed as a suppressed submission instead of blocking the journey.

The setup API is provided only by the Vite development server and is intentionally absent from a production build. State is in memory and is reset before every fixture. No Daytona adapter has been introduced; sandbox execution remains the next runtime milestone after this local contract is accepted.
