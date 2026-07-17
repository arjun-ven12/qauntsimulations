# Investigation runtime contract

This document freezes the product-owned contract required by local multi-world orchestration. The
canonical Zod schemas and inferred TypeScript types are exported by `@taskos/shared-types`.

## Public lifecycle and progress

The public `InvestigationStatus` values are exactly:

```text
PLANNING
QUEUED
PROVISIONING
RUNNING
OBSERVING
ADAPTING
REPRODUCING
MINIMISING
COMPLETED
FAILED
```

The baseline execution path may run:

```text
PLANNING → QUEUED → RUNNING → OBSERVING → COMPLETED
```

When deterministic adaptive reproduction is enabled, the same public contract also supports:

```text
PLANNING → QUEUED → RUNNING → OBSERVING → ADAPTING → REPRODUCING → OBSERVING → COMPLETED
```

When deterministic minimisation is enabled after a supported finding, completion may include:

```text
OBSERVING → MINIMISING → OBSERVING → COMPLETED
```

`InvestigationProgress` contains `id`, `status`, `progress`, `recentEvents`, and `findingsCount`.

Runtime Prompt 7 allows initial planning provenance to be `DETERMINISTIC`, `OPENAI`, or `FALLBACK`. Planner status metadata may include `PENDING`, `GENERATING`, `VALIDATING`, `ACCEPTED`, `PARTIALLY_ACCEPTED`, `REJECTED`, `FALLBACK_USED`, or `FAILED`. Model output is never converted directly into `WorkerJob`; it is schema-validated, policy-validated, normalized, persisted as planner metadata, and then converted into runtime-owned world definitions.
Events use ISO-8601 `createdAt` strings, extensible string event types, human-readable messages,
optional world IDs, and optional JSON-safe metadata.

Counter semantics:

- `totalWorlds`: all worlds currently belonging to the investigation.
- `queued`: worlds created but not yet executing.
- `running`: worlds currently executing.
- `passed`: completed worlds whose `WorkerResult` passed every evaluated invariant.
- `failed`: completed worlds whose `WorkerResult` contains a confirmed invariant violation.
- `flaky`: worlds classified as inconsistent after repeated execution.

The consistency rule is:

```text
queued + running + passed + failed + flaky <= totalWorlds
```

Once all currently generated worlds exist, the sum should normally equal `totalWorlds`. Runtime may append deterministic adaptive and minimisation follow-up worlds after the initial fleet, so `totalWorlds` is not immutable and may increase during execution.

## Creation request

`CreateInvestigationInput` contains the product scope (`projectId`, `environmentId`, `journeyId`),
the scenario prompt and bounded controls, and one or more invariant IDs. The schema limits a request
to 100 worlds and 20 concurrent workers, requires concurrency not to exceed the world count, and
normalizes duplicate string-array values by retaining their first occurrence.

The deterministic valid example is exported as `demoCreateInvestigationInput`.

## Deterministic product records

Run:

```bash
pnpm db:seed
```

The seed uses idempotent upserts and preserves unrelated data. It creates or updates:

- Project `project_demo_checkout`
- Environment `environment_demo_local`
- Journey `journey_checkout`
- Scenario `scenario_duplicate_submission`
- Invariant `invariant_single_checkout_submission`

The environment points to `http://localhost:5174`. The machine-readable journey is
`demo/fixtures/checkout-journey.json` and uses the existing `@taskos/execution-contracts` journey
step and success-condition schemas. No execution-contract extension is required.

## Checkout contract

- Base URL: `http://localhost:5174`
- Start route: `/products/test-product`
- Reset: `POST /api/test/reset`
- Configuration: `POST /api/test/config`
- Feature flag: `duplicateSubmissionBug`
- Delay: `paymentDelayMs`
- Payment observation: `POST **/api/payments`
- Order observation: `POST **/api/orders`
- Success: `[data-testid="order-confirmation"]` becomes visible
- Order ID: `[data-testid="order-id"]`

Repeated clicking, artificial latency, browser and viewport selection, and network conditions are
world controls. They are intentionally not permanent checkout journey steps.

## Ownership

Product owner:

- public request and response schemas
- public status names and counter semantics
- deterministic product fixture records and IDs
- stable checkout journey definition
- frontend `InvestigationApi`, HTTP adapter, and mock adapter
- product-facing contract documentation

Runtime owner:

- investigation creation execution and deterministic world generation
- worker queues, concurrency enforcement, worker execution, and failure handling
- `WorkerResult`, event, and progress persistence
- counter updates, findings, runtime-specific database models, and orchestration loops

The existing Prisma schema supports product fixture records, initial worlds, deterministic adaptive follow-up worlds, and deterministic minimisation worlds. Existing `WorkerJob`, `WorkerResult`, evidence, and runtime execution contracts remain owned by the runtime developer. Prompt 8 stores final evidence reports as `FINAL_REPORT` artifacts and does not add repair verification.
