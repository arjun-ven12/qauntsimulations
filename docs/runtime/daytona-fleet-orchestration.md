# Daytona fleet orchestration

Runtime Milestone 5 extends the single-sandbox Daytona executor into a bounded, process-local fleet. The fleet does not call the Daytona SDK directly. It admits work through a capacity manager, then delegates each attempt to the existing `DaytonaPlaywrightWorkerExecutor`, which still creates one fresh sandbox, starts one isolated demo store, runs one Playwright worker, downloads evidence, and deletes the sandbox in `finally`.

## Architecture

```text
InvestigationOrchestratorService
  -> DaytonaWorkerFleet
  -> DaytonaFleetCapacityManager
  -> DaytonaPlaywrightWorkerExecutor
  -> SandboxProvider
  -> Daytona SDK
```

Local execution remains on `LocalPlaywrightWorkerExecutor` and the existing local concurrency service. Daytona fleet mode is selected only when `WORKER_EXECUTION_PROVIDER=daytona`.

## Queue flow

All initial worlds are persisted before execution begins. The orchestrator preserves deterministic `creationOrder`, builds one fleet job per world, and asks the fleet to execute them with bounded concurrency. A four-world investigation with an effective concurrency of two starts two worlds, then admits the next queued world as soon as a slot is released.

The effective Daytona concurrency is:

```text
min(
  submitted maximumConcurrentWorkers,
  DAYTONA_MAX_SANDBOXES_PER_INVESTIGATION,
  DAYTONA_MAX_CONCURRENT_SANDBOXES,
  queued world count
)
```

`DAYTONA_FLEET_HARD_LIMIT` is enforced by the process-local capacity manager across simultaneous investigations. This is not distributed and is not safe across multiple API replicas.

## Attempts and progress

The existing Prisma `ExecutionAttempt` model is reused. Every retry creates a new attempt number for the same experiment/world, while progress remains world-based. Retry attempts do not create extra worlds and do not inflate `totalWorlds`, `queued`, `running`, `passed`, `failed`, or `flaky`.

Attempt-specific details such as provider metadata, sandbox ID, timing, cleanup result, retry classification, and error message are stored in existing attempt JSON fields and worker metadata. No Prisma migration is required for this milestone.

## Retry policy

Default Daytona retry policy:

```text
maximum attempts: 2
base delay: 1000 ms
maximum delay: 10000 ms
```

Retryable infrastructure classifications include sandbox creation, sandbox readiness, upload, transport/network, artifact download, and rate-limit failures. Invariant violations, invalid worker jobs/results, selector failures, broken demo-store contracts, cancellation, and unauthorized configuration are not retried.

Retry delay uses bounded exponential backoff with small jitter. Cancellation interrupts capacity waiting and retry delay.

## Partial failure

One failed world does not stop the fleet. A mixed investigation can complete with passed worlds, invariant violations, and exhausted infrastructure failures. The investigation is marked `FAILED` only for orchestration-level fatal conditions such as invalid configuration, database failure, or every world failing before a processable result exists.

## Cancellation

Cancellation is best effort. The fleet stops admitting new work, interrupts retry delay and capacity waiting, signals running attempts through the existing executor cancellation hook, and waits for executor cleanup to settle. Completed evidence is preserved.

## Cleanup and orphans

Each executor attempt still deletes its sandbox in `finally` after pass, invariant violation, setup failure, timeout, cancellation, evidence download failure, invalid output, or unexpected error. Cleanup failure preserves valid results/evidence, emits `sandbox_cleanup_failed`, records provider metadata, and increments fleet diagnostics.

`DaytonaOrphanCleanupService` can list TaskOS-owned sandboxes with:

```text
project=taskos-worldlab
purpose=isolated-playwright-world
```

It skips active in-process sandboxes, only selects stale candidates, supports dry-run, and never deletes unrelated sandboxes.

Commands:

```bash
pnpm runtime:daytona:cleanup:dry-run
pnpm runtime:daytona:cleanup
```

## Cost controls

Implemented controls:

```text
DAYTONA_MAX_CONCURRENT_SANDBOXES
DAYTONA_MAX_SANDBOXES_PER_INVESTIGATION
DAYTONA_FLEET_HARD_LIMIT
DAYTONA_MAX_RETRY_ATTEMPTS
DAYTONA_MAX_TOTAL_SANDBOX_CREATIONS_PER_INVESTIGATION
DAYTONA_MAX_INVESTIGATION_DURATION_SECONDS
DAYTONA_SANDBOX_TIMEOUT_SECONDS
```

The fleet tracks active sandboxes, waiting jobs, total started, total completed, total retries, cleanup failures, and peak concurrency. It does not calculate billing costs.

## Live test procedure

Live Daytona fleet tests are guarded and are not part of normal test runs:

```bash
pnpm build
pnpm runtime:daytona:cleanup:dry-run
WORKER_EXECUTION_PROVIDER=daytona \
DAYTONA_TARGET=eu \
DAYTONA_MAX_CONCURRENT_SANDBOXES=2 \
DAYTONA_MAX_SANDBOXES_PER_INVESTIGATION=2 \
RUN_DAYTONA_FLEET_INTEGRATION_TESTS=true \
pnpm exec vitest run apps/api/src/modules/execution/__tests__/daytona-fleet.integration.test.ts
```

The test must query TaskOS-labelled sandboxes afterward. Expected final TaskOS sandbox count is zero.

## Adaptive reproduction

Runtime Milestone 6 adds adaptive world generation above this fleet. Adaptive follow-up worlds are normal fleet jobs: one sandbox, one demo store, one Playwright worker, one evidence directory, and one cleanup lifecycle per world. The fleet remains process-local and does not become a distributed queue.

The public `InvestigationProgress.totalWorlds` may increase after the initial fleet if adaptive follow-up worlds are appended. The fleet itself remains unaware of why a world was generated.
