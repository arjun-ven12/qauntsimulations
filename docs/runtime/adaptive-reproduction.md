# Adaptive reproduction

Runtime Milestone 6 adds one bounded, deterministic adaptive stage after the initial local or Daytona fleet settles.

It does not add Kimi, Nosana, source-code repair, WebSockets, Redis, or a distributed queue. Runtime Prompt 8 now consumes supported adaptive findings for deterministic minimisation.

## Lifecycle

When adaptive reproduction is enabled and an eligible invariant-backed finding exists, the investigation follows:

```text
RUNNING
→ OBSERVING
→ ADAPTING
→ REPRODUCING
→ OBSERVING
→ MINIMISING
→ OBSERVING
→ COMPLETED
```

If no eligible finding exists, the investigation completes from `OBSERVING` without creating follow-up worlds.

## Eligibility

The first supported category is the duplicate checkout submission finding created from `NO_DUPLICATE_PAYMENT` and `NO_DUPLICATE_ORDER` failures. A finding is eligible only when its stored causal metadata includes a source world and experiment, the source world is an initial failed world, the finding remains `UNCONFIRMED`, and no completed adaptive condition already exists for the finding.

Adaptive-generated worlds are marked with:

```json
{ "origin": "ADAPTIVE_REPRODUCTION" }
```

Those worlds are excluded from starting another adaptive stage.

## Deterministic plan

`AdaptiveReproductionPlanService` creates a JSON-safe plan using stable hashes from the investigation, finding fingerprint, source world, purpose, and changed variables.

The strategy is:

```text
EXACT_AND_CONTROLLED_COMPARISONS
```

The default follow-up worlds are:

1. exact reproduction;
2. bug-flag control;
3. interaction control;
4. reduced-delay comparison;
5. low-delay comparison.

The plan varies only one relevant condition at a time except for the exact reproduction world. Browser, journey, product, email, invariant set, and demo-store version remain fixed.

## Dynamic progress

Follow-up worlds are persisted as normal `World` and `Experiment` rows. The public progress mapper derives `totalWorlds` from current persisted rows, so it can increase:

```text
4 initial worlds → 9 total worlds
```

Initial passed/failed counts are preserved while adaptive worlds are queued and running.

## Execution

Adaptive worlds execute through the same orchestration path as initial worlds:

```text
InvestigationOrchestratorService
→ DaytonaWorkerFleet or local executor
→ WorkerExecutor
→ validated WorkerJob / WorkerResult
→ evidence collection
→ invariant persistence
```

No special adaptive executor exists. Daytona concurrency, retries, cleanup, and orphan handling stay in the Prompt 5 fleet.

## Comparison and confidence

`ReproductionComparisonService` compares the source failure, exact reproduction, bug-flag control, interaction control, and delay comparisons.

It records conservative interpretations such as:

```text
LIKELY_REQUIRED
LIKELY_CONTRIBUTING
INCONCLUSIVE
```

It does not claim an exact threshold. Delay output is a bounded observation range, not a minimised boundary.

`AdaptiveConfidenceService` applies a deterministic policy:

```text
exact reproduction succeeds: +0.08
bug-flag control passes:     +0.04
interaction control passes:  +0.04
lower-delay comparison pass: +0.02
maximum confidence:          ADAPTIVE_CONFIDENCE_MAX
```

The numeric value is stored in finding causal metadata. The public enum confidence is mapped to `POSSIBLE`, `PROBABLE`, or `CONFIRMED`.

## Persistence

No new Prisma model is added in this milestone. Existing models are reused:

- `World` and `Experiment` for follow-up worlds;
- `ExecutionAttempt` for attempts;
- `InvariantEvaluation` and `EvidenceArtifact` for runtime evidence;
- `FindingCondition` for the adaptive plan and completion marker;
- `ReproductionRun` for finding-to-experiment reproduction links;
- `FindingEvidence` for evidence links;
- `Finding.causalConditions` for causal status, confidence explanation, variable comparisons, and failure-region estimate.

Prompt 8 adds separate minimisation run/candidate models after this adaptive stage while continuing to reuse `World`, `Experiment`, `EvidenceArtifact`, `InvariantEvaluation`, and `FindingEvidence`.

## Idempotency

The plan ID, reproduction-run ID, and adaptive world keys are stable. Re-invoking the adaptive stage for the same finding reuses existing adaptive worlds by purpose and skips findings with an `ADAPTIVE_REPRODUCTION_COMPLETED` condition.

Reproduction count is only incremented for a newly persisted exact reproduction run that reproduces the same invariant condition.

## Limits

Implemented environment controls:

```text
ADAPTIVE_REPRODUCTION_ENABLED
ADAPTIVE_MAX_FINDINGS_PER_INVESTIGATION
ADAPTIVE_MAX_FOLLOWUP_WORLDS
ADAPTIVE_MAX_TOTAL_WORLDS
ADAPTIVE_EXACT_REPRODUCTION_ATTEMPTS
ADAPTIVE_CONFIDENCE_INITIAL
ADAPTIVE_CONFIDENCE_MAX
ADAPTIVE_MIN_EVIDENCE_WORLDS
ADAPTIVE_REPRODUCTION_TIMEOUT_SECONDS
```

Only one bounded adaptive stage runs for this milestone.

## Live Daytona test

The live test is guarded and is not part of normal CI:

```bash
WORKER_EXECUTION_PROVIDER=daytona \
DAYTONA_TARGET=eu \
DAYTONA_MAX_CONCURRENT_SANDBOXES=2 \
DAYTONA_MAX_SANDBOXES_PER_INVESTIGATION=2 \
ADAPTIVE_REPRODUCTION_ENABLED=true \
RUN_DAYTONA_ADAPTIVE_INTEGRATION_TESTS=true \
pnpm exec vitest run apps/api/src/modules/execution/__tests__/daytona-adaptive.integration.test.ts
```

It verifies that initial worlds and adaptive worlds run in isolated Daytona sandboxes, evidence is downloaded, the finding is updated, and legacy `taskos`-labelled sandboxes are deleted.

## Prompt 7 handoff

Prompt 7 adds structured AI-generated initial candidate plans. Adaptive reproduction remains deterministic: OpenAI may propose only the initial bounded world set, and this module still owns exact reproduction, controls, comparison worlds, confidence updates, and failure-region estimates. Prompt 8 then performs deterministic minimisation; it does not ask AI to infer causes.
