# Local investigation orchestration

Runtime Milestone 3 added a development-only, in-process orchestration path around the existing Playwright worker. It persists all durable state in Neon through Prisma but does not claim to be a production distributed queue. Runtime Milestone 6 can append deterministic adaptive follow-up worlds after the initial fleet. Runtime Milestone 8 can append deterministic minimisation worlds after a supported finding. Repair verification remains excluded.

## Architecture

Authenticated investigation requests are validated with the canonical `createInvestigationInputSchema` from `@taskos/shared-types`. `InvestigationService` validates product scope, persists the `PLANNING` investigation, runs the configured experiment planner, persists the validated executable plan, and schedules `InvestigationOrchestratorService` with `setImmediate` so the HTTP request does not wait for browser execution.

The orchestrator uses:

- `InvestigationPlanningService` for deterministic, OpenAI, or fallback initial planning;
- `DeterministicExperimentPlanService` remains the safe fallback for four bounded initial worlds;
- `ExecutionConcurrencyService` for an in-process worker pool with a server hard maximum of two;
- `WorkerJobFactoryService` to load and validate `demo/fixtures/checkout-journey.json` and convert its approved pay action into the runtime `submitPayment` control;
- `LocalPlaywrightWorkerExecutor` to call the existing validated worker runtime directly;
- `LocalEvidenceMetadataService` to normalize paths, enforce the storage root, calculate SHA-256 checksums, and persist metadata rather than binaries;
- `InvestigationRepository` as the Prisma persistence boundary.

The in-memory active-investigation map is only a duplicate-start guard. Investigation, world, experiment, worker, attempt, result, evaluation, artifact, event, and finding state is stored in PostgreSQL.

## Lifecycle and counters

The normal lifecycle is:

```text
PLANNING → QUEUED → RUNNING → OBSERVING → COMPLETED
```

With adaptive reproduction enabled and an eligible finding, the lifecycle becomes:

```text
PLANNING → QUEUED → RUNNING → OBSERVING → ADAPTING → REPRODUCING → OBSERVING → COMPLETED
```

With minimisation enabled and an eligible supported finding, completion is delayed until:

```text
OBSERVING → MINIMISING → OBSERVING → COMPLETED
```

An orchestration-level fatal error enters `FAILED`. A world-level invariant violation does not fail the investigation; it increments the public `failed` world counter and the investigation can still complete.

Public progress follows the frozen contract:

- `totalWorlds`: persisted worlds/experiments belonging to the investigation;
- `queued`: experiments not yet started;
- `running`: executing experiments;
- `passed`: experiments whose validated worker result is `PASSED`;
- `failed`: invariant-violating, execution-error, or cancelled experiments;
- `flaky`: zero in this milestone.

At normal completion the classified counters equal `totalWorlds`. During adaptive reproduction and minimisation, `totalWorlds` may increase as follow-up worlds are persisted.

## Deterministic worlds

| Order | World | Viewport | Delay | Duplicate mode | Repeated submit | Expected |
|---:|---|---|---:|---|---|---|
| 0 | Baseline checkout | desktop | 0 ms | off | off | pass |
| 1 | Healthy repeated submission protection | desktop | 1200 ms | off | on, 100 ms | pass |
| 2 | Duplicate submission under delayed payment | mobile | 1200 ms | on | on, 100 ms | invariant violation |
| 3 | Duplicate mode with reduced latency | mobile | 600 ms | on | on, 100 ms | observe |

The local demo store has one global reset/configuration state at port 5174. To prevent a baseline worker from overwriting the protected delayed world’s configuration, those incompatible setup worlds are run sequentially. The two duplicate-mode comparison worlds may use the two-worker pool together. The generic concurrency controller is still bounded at two and is separately tested with a fake executor.

## Persistence

Existing Prisma models are reused: `Investigation`, `ExperimentPlan`, `World`, `Experiment`, `Worker`, `ExecutionAttempt`, `EvidenceArtifact`, `InvariantEvaluation`, `Finding`, `FindingEvidence`, and `InvestigationEvent`. Prompt 8 adds `MinimisationRun` and `MinimisationCandidate` as a durable ledger while still using normal worlds and experiments for execution.

Execution attempts store the validated `WorkerResult`, exit code, duration, result and manifest paths, and compact metrics. Evidence rows store relative paths, content type, size, checksum, redaction state, and safe metadata. Screenshots, traces, console logs, network logs, manifests, and result JSON remain on local disk beneath:

```text
storage/evidence/<investigationId>/<worldId>/<experimentId>/attempt-1/
```

Every passing and failing invariant evaluation is persisted with confidence and evidence references.

Final reports are stored as `FINAL_REPORT` evidence artifacts under `storage/evidence/reports/<investigationId>/<findingId>/`.

## Findings

Payment and order invariant failures in the same delayed repeated-submission condition use one deterministic fingerprint and one consolidated finding:

```text
Duplicate checkout submission under delayed payment response
```

The initial severity is `CRITICAL`, confidence classification is `POSSIBLE`, numeric evidence confidence is recorded as `0.75`, causal status is `UNCONFIRMED`, and reproduction count starts at one. A concurrent matching violation increments the same finding through a unique fingerprint. The finding says a customer *may* experience duplicate charging or orders and explicitly records that this is a test-payment environment.

## Events

Persisted events include `investigation_created`, `plan_created`, `world_generated`, `world_queued`, `worker_started`, `worker_completed`, `worker_failed`, `evidence_captured`, `invariant_violated`, `finding_created`, `investigation_completed`, `investigation_failed`, and `investigation_cancelled`. The progress response returns the most recent 20 with ISO timestamps and JSON-safe metadata.

## API

All routes require the existing JWT authentication and organisation context.

```text
POST /api/investigations
POST /api/projects/:projectId/investigations
GET  /api/investigations/:investigationId
GET  /api/investigations/:investigationId/plan
GET  /api/investigations/:investigationId/worlds
GET  /api/investigations/:investigationId/experiments
GET  /api/investigations/:investigationId/workers
GET  /api/investigations/:investigationId/evidence
GET  /api/investigations/:investigationId/findings
POST /api/investigations/:investigationId/cancel
```

Creation and progress responses validate as `InvestigationProgress`. List endpoints return JSON-safe summaries rather than raw Prisma records. Filesystem roots, secrets, stack traces, and binary evidence are not exposed.

## Cancellation and restart behavior

Cancellation atomically marks the investigation cancelled and prevents queued worlds from starting. Completed evidence is retained. Because the executor calls the Playwright runtime in-process, an already-running browser cannot currently be force-terminated through this abstraction and may finish after cancellation. The frozen public status contract has no `CANCELLED` value, so internal cancellation is exposed as terminal `FAILED` progress plus an explicit `investigation_cancelled` event.

An API restart interrupts active in-process workers. Startup cleanup marks local attempts older than ten minutes, their worlds, and their investigations failed. It does not resume a browser journey. A persistent queue with leases and heartbeat-based recovery is required before production use.

## Provider-selectable execution

The orchestrator now depends on the provider-neutral `WorkerExecutor` port. `WORKER_EXECUTION_PROVIDER=local` retains the original in-process `LocalPlaywrightWorkerExecutor` and remains the default. `WORKER_EXECUTION_PROVIDER=daytona` selects the bounded Daytona fleet, which delegates each admitted world attempt to the isolated `DaytonaPlaywrightWorkerExecutor`.

Daytona configuration is loaded lazily, so local development does not require Daytona credentials. Job construction, result validation, persistence, evidence metadata, counters, and API mapping are shared. The Daytona fleet limits are process-local and are not a distributed queue. See [Daytona isolated world execution](./daytona-isolated-world-execution.md) and [Daytona fleet orchestration](./daytona-fleet-orchestration.md) for the verified lifecycle and limitations.
