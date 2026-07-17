# Runtime-to-UI handoff checkpoint before Prompt 9

Verification date: 2026-07-17

Branch: `arjun`

## Runtime readiness

Prompt 1–8 runtime implementation is present in the repository and the Prompt 8 source was verified from implementation code, tests, migrations, and a preserved local end-to-end investigation.

Readiness by area:

- Local Playwright worker: ready.
- Demo-store integration: ready.
- Local investigation orchestration: ready.
- Daytona fleet orchestration: source and mocked/fake regressions ready; no Prompt 8 live Daytona minimisation sandbox run was performed in this checkpoint.
- Adaptive reproduction: ready.
- AI planner contract and deterministic/fallback path: ready.
- Failure-condition minimisation: ready.
- Final evidence report generation: ready.
- Prompt 9 UI implementation: not started.

Database status:

- Prisma schema validates when the root environment is loaded.
- The Prompt 7 and Prompt 8 migrations were applied non-destructively to the configured development database during this checkpoint.
- `FINAL_REPORT`, `MINIMISING`, minimisation events, `MinimisationRun`, and `MinimisationCandidate` are present.

## Selected completed investigation for Prompt 9

The following preserved investigation is suitable for Prompt 9 UI development. It was created by the real local orchestrator against the deterministic demo store and was not deleted.

```text
investigationId: cmrol9cxh0001rurb8godxnh6
findingId: cmrol9ijr004drurbren30ov6
planId: available from GET /api/investigations/:id/plan
reproductionRunId: repro_run_348dffba4cb420d2ef49
minimisationRunId: min_run_179623b1052669254ba2
finalReportEvidenceId: cmrola2p000fgrurbry3xvnhj
status: COMPLETED
worlds: 13
evidence artifacts: 93
findings: 1
```

World origin counts:

- `INITIAL`: 4
- `ADAPTIVE_REPRODUCTION`: 3
- `MINIMISATION`: 6

Final report evidence:

- JSON: `FINAL_REPORT`, `application/json`, 9,219 bytes
- Markdown: `FINAL_REPORT`, `text/markdown`, 6,234 bytes

The public API evidence `path` values are relative storage keys. Evidence metadata is sanitized so absolute local filesystem paths are not exposed.

## API endpoints for Prompt 9 and Prompt 10

All routes require the existing authenticated API session/JWT.

### `GET /api/investigations/:investigationId`

Returns `InvestigationProgress`.

Main fields:

- `id`
- `status`
- `progress.totalWorlds`
- `progress.queued`
- `progress.running`
- `progress.passed`
- `progress.failed`
- `progress.flaky`
- `recentEvents`
- `findingsCount`

Status values include:

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

`totalWorlds` is dynamic. It increases as adaptive reproduction and minimisation worlds are added.

Empty state: valid progress with zero counters where applicable.

Error state: standard API error envelope.

### `GET /api/investigations/:investigationId/plan`

Returns the persisted experiment plan.

Planner fields available through the plan JSON:

- requested/effective provider data
- planner status when present
- planning explanation
- assumptions and warnings where present
- accepted world definitions
- fallback metadata where present

UI fallback: render unknown or missing planner metadata as “not recorded”.

### `GET /api/investigations/:investigationId/worlds`

Returns an array of world summaries.

Main fields:

- `id`
- `investigationId`
- `name`
- `status`
- `reason`
- `configuration`
- `experimentId`
- `workerId`
- `createdAt`
- optional `startedAt`
- optional `completedAt`

Prompt 9 should read world origin and purpose from `configuration`:

- Initial worlds may omit `origin`; treat missing origin as `INITIAL`.
- Adaptive worlds use `configuration.origin = "ADAPTIVE_REPRODUCTION"`.
- Minimisation worlds use `configuration.origin = "MINIMISATION"` and include a `configuration.minimisation` block.

Dates are ISO strings.

### `GET /api/investigations/:investigationId/experiments`

Returns experiment summaries.

Main fields:

- `id`
- `investigationId`
- `worldId`
- `status`
- `kind`
- `attemptCount`
- optional `latestAttempt`
- `createdAt`
- `updatedAt`

`latestAttempt` includes attempt status, exit code, duration, and timestamps when available.

### `GET /api/investigations/:investigationId/workers`

Returns worker summaries.

Main fields:

- `id`
- `provider`
- `status`
- `attempts`
- `createdAt`
- `updatedAt`

Provider values verified:

- `LOCAL`

The contracts and UI mappers are provider-neutral. `DAYTONA` and unknown provider strings should be rendered as labels rather than treated as fatal values.

Attempt summaries include:

- attempt ID
- status
- optional `startedAt`
- optional `completedAt`
- optional `exitCode`
- optional `durationMs`
- linked experiment/world identifiers

Sandbox lifecycle is currently available through investigation events, not a dedicated sandbox endpoint.

### `GET /api/investigations/:investigationId/evidence`

Returns evidence artifact summaries.

Supported evidence types include:

```text
SCREENSHOT
VIDEO
TRACE
CONSOLE_LOG
NETWORK_LOG
DOM_SNAPSHOT
WORKER_RESULT
ENVIRONMENT_MANIFEST
MINIMAL_REPRODUCTION
FINAL_REPORT
```

Main fields:

- `id`
- `experimentId`
- `type`
- `path`
- `mimeType`
- `sizeBytes`
- `checksum`
- `redacted`
- `metadata`
- `createdAt`

The `path` field is a relative storage key. Public responses must not expose private absolute local paths.

Evidence can be zero, partial, or full. Prompt 9 should group by type and render missing artifact families as unavailable.

### `GET /api/investigations/:investigationId/evidence/:evidenceId/content`

Prompt 10 adds this narrow read-only endpoint for final-report text preview.

Allowed evidence type:

- `FINAL_REPORT`

Allowed content types:

- `application/json`
- `text/json`
- `text/markdown`
- `text/plain`

Main response fields:

- `evidenceId`
- `investigationId`
- `type`
- `format`
- `filename`
- `contentType`
- `sizeBytes`
- `checksum`
- `content`

The response is JSON and does not expose resolved filesystem paths. Unsupported binary artifacts,
cross-investigation evidence, path traversal, malformed JSON reports, and oversized reports are
rejected with the standard API error envelope.

### `GET /api/investigations/:investigationId/findings`

Returns finding summaries.

Main fields:

- `id`
- `investigationId`
- `title`
- `summary`
- `severity`
- `confidence`
- `reproductionCount`
- `causalConditions`
- `createdAt`
- `updatedAt`

Prompt 8 minimisation metadata is available in `causalConditions`.

### `GET /api/investigations/:investigationId/findings/:findingId`

Returns one finding with detail data for Prompt 9.

Main fields:

- all finding summary fields
- `evidence`
- `reproductions`
- `minimalReproduction`

This endpoint is read-only. It does not expose raw Prisma models, raw filesystem paths, or secrets.

Use this endpoint for the final report detail view, retained/removed/inconclusive minimisation conditions, evidence list, and reproduction history.

## Investigation progress and events

Prompt 9 should render the event timeline with a generic fallback for unknown event types. Verified event groups include:

Planning:

- `investigation_created`
- `plan_created`
- `planner_started`
- `planner_completed`
- `planner_output_received`
- `planner_validation_started`
- `planner_validation_failed`
- `planner_plan_accepted`
- `planner_plan_partially_accepted`
- `planner_fallback_used`
- `planner_failed`

Queue/fleet/worker:

- `world_queued`
- `worker_started`
- `worker_completed`
- `worker_failed`
- `evidence_captured`
- `invariant_violated`

Sandbox/Daytona:

- sandbox provisioning, ready, execution, completion, deletion, and cleanup-failure events are event-timeline data. Missing optional timing values should render as “not recorded”.

Adaptive reproduction:

- `adaptive_plan_created`
- `adaptive_world_generated`
- `reproduction_attempt_started`
- `reproduction_attempt_completed`
- `confidence_updated`
- `failure_region_updated`
- `reproduction_completed`

Minimisation:

- `minimisation_started`
- `minimisation_plan_created`
- `minimal_reproduction_candidate_created`
- `minimisation_candidate_queued`
- `minimisation_candidate_completed`
- `minimisation_condition_removed`
- `minimisation_condition_retained`
- `minimisation_range_updated`
- `minimal_reproduction_found`
- `minimisation_completed`
- `minimisation_inconclusive`
- `minimisation_cancelled`

Final report:

- `final_report_started`
- `final_report_artifact_created`
- `final_report_completed`

Unknown event types are valid extensibility points.

## Planner data

Prompt 9 can consume planner data from the plan endpoint and investigation events.

Provider/provenance labels expected:

- `DETERMINISTIC`
- `OPENAI`
- `FALLBACK`
- `MOCK`

Planner status labels expected:

- `PENDING`
- `GENERATING`
- `VALIDATING`
- `ACCEPTED`
- `PARTIALLY_ACCEPTED`
- `REJECTED`
- `FALLBACK_USED`
- `FAILED`

Safe fallbacks:

- Missing explanation: “No planner explanation recorded.”
- Missing assumptions: empty list.
- Missing warnings: empty list.
- Missing rejected items: omit the section.
- Unknown provider/status: render the raw string as an informational label.

## Worlds

Prompt 9 should treat world rows as append-only runtime history:

- Initial worlds are planned before execution.
- Adaptive worlds may be appended after a finding is discovered.
- Minimisation worlds may be appended after adaptive reproduction.
- `InvestigationProgress.totalWorlds` can increase during execution.

World purpose is available in `configuration.origin` plus nested `configuration.adaptive` or `configuration.minimisation` metadata.

## Workers and attempts

Worker and attempt records expose provider-neutral execution summaries.

Render these optional values defensively:

- sandbox setup duration
- worker execution duration
- artifact download duration
- cleanup warning/failure
- retry attempt numbers
- missing sandbox IDs

Do not expose unnecessary sandbox internals. Use sandbox IDs only when needed for debugging/admin views.

## Findings

Finding data supports:

- confidence updates over time
- reproduction count increases
- causal status metadata in `causalConditions`
- multiple linked reproduction runs
- multiple linked evidence artifacts
- final report evidence

Prompt 8 minimisation metadata includes:

- retained conditions
- removed conditions
- inconclusive conditions
- bounded failure range
- final confirmation world
- final confidence
- final report evidence ID
- deterministic reproduction steps

Do not render causal claims as absolute proof. The runtime uses supported/minimal-tested wording.

## Final report

Final reports are stored as evidence artifacts, not database text blobs.

The selected investigation has:

- JSON final report evidence: `cmrola2p000fgrurbry3xvnhj`
- Markdown final report evidence: `cmrola2pf00firurb7yjm6kt6`

The JSON report parses and includes:

- report version
- investigation ID
- finding ID
- retained conditions
- removed conditions
- inconclusive conditions
- bounded range
- reproduction steps
- confidence explanation
- limitations
- evidence references
- planner provenance
- worker provenance

## Nullability and UI fallbacks

Recommended UI fallbacks:

- Missing optional duration: “not recorded”.
- Missing sandbox metadata: hide sandbox row details.
- Missing final report: show finding and evidence, then “final report not generated”.
- Missing `minimalReproduction`: show minimisation metadata from `causalConditions`.
- Unknown event type: humanize the event string.
- Unknown provider: render the raw provider as a neutral label.
- Partial evidence: render available artifacts by type and omit missing sections.

## API gaps

Blocking gaps found and fixed:

- Added read-only finding detail route: `GET /api/investigations/:investigationId/findings/:findingId`.
- Sanitized evidence metadata so public API responses do not expose absolute local filesystem paths.

Non-blocking gaps:

- World `origin` and minimisation/adaptive purpose are nested in `configuration`; Prompt 9 may choose to flatten them in the frontend client.
- Sandbox lifecycle is event-based rather than exposed by a dedicated sandbox summary endpoint.
- The frontend API client does not yet wrap every runtime endpoint; Prompt 9 can add those client methods.

UI-only work remaining:

- Timeline grouping and labels.
- Final report viewer.
- Evidence gallery/download UI.
- Minimisation condition comparison UI.
- Planner/adaptive/minimisation status panels.

## Prompt 9 readiness

Prompt 9 can begin after this checkpoint if repository verification remains green.

Do not start Prompt 9 by changing runtime contracts. Consume the existing read-only endpoints and add frontend API client methods/views only as needed.
