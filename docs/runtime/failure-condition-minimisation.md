# Failure-condition minimisation

Runtime Milestone 8 adds deterministic minimisation after adaptive reproduction has produced a supported duplicate-checkout finding.

## Eligibility

Minimisation runs only for reproduced or supported findings with:

- source world and experiment metadata;
- at least one reproduced `ReproductionRun`;
- linked evidence;
- structured causal/failure-region metadata;
- non-cancelled investigation state;
- no completed minimisation marker for the finding;
- remaining world and trial budget.

Unconfirmed initial failures, infrastructure-only failures, malformed worker results, cancelled worlds, and minimisation-origin worlds are not eligible.

## Lifecycle

The expected lifecycle is:

```text
OBSERVING → MINIMISING → OBSERVING → COMPLETED
```

When adaptive reproduction runs first, the full path is:

```text
RUNNING → OBSERVING → ADAPTING → REPRODUCING → OBSERVING → MINIMISING → OBSERVING → COMPLETED
```

`MINIMISING` is never mapped to `FAILED`. Fatal orchestration errors may still move the investigation to `FAILED`.

## Strategy

The implemented strategy is `duplicate-checkout-greedy-v1`.

It starts from the exact reproduced failing checkout world, then tries one condition change at a time in stable priority order:

1. `duplicateSubmissionBug`
2. `doubleSubmit`
3. `paymentDelayMs`
4. `doubleSubmitIntervalMs`
5. `userProfile`
6. `viewport`
7. `networkProfile`
8. `browser`

For categorical or boolean values, a neutral value is tested while every other condition remains fixed. If the invariant still reproduces, that source condition is removed from the minimal tested set. If the invariant stops reproducing, the condition is retained. Inconclusive or infrastructure failures do not increase confidence.

For `paymentDelayMs`, the runtime uses a bounded midpoint search only when one passing and one failing bound are known. It stops at configured precision or trial limits and reports a range, not an exact threshold.

## Candidate worlds

Minimisation candidates are normal persisted `World` and `Experiment` rows with:

```json
{ "origin": "MINIMISATION" }
```

They execute through the existing local or Daytona worker/fleet path. There is no separate minimisation executor. Progress totals therefore include initial, adaptive, and minimisation worlds.

## Persistence and idempotency

Prompt 8 adds:

- `MinimisationRun`
- `MinimisationCandidate`

The run ID and candidate IDs are deterministic. One run exists for a finding and strategy version. Candidate sequences are unique per run, and completed runs are not duplicated. Candidate evidence remains in the existing `EvidenceArtifact`, `InvariantEvaluation`, and `FindingEvidence` models.

## Confidence

Confidence updates are bounded and deterministic:

- retained condition: `+0.005`
- removed condition: `+0.005`
- bounded delay range: `+0.01`
- final confirmation reproduces: `+0.02`
- maximum: `MINIMISATION_CONFIDENCE_MAX`

The runtime does not introduce `PROVEN`; causal metadata uses `SUPPORTED` plus `minimisationStatus`.

## Final confirmation

When `MINIMISATION_CONFIRM_FINAL_SET=true`, the runtime runs one confirmation world for the resulting minimal tested condition set. If it reproduces, the set is marked confirmed. If it does not, the minimisation is marked inconclusive and the original reproduced finding remains valid.

## Configuration

```text
MINIMISATION_ENABLED=true
MINIMISATION_MAX_FINDINGS_PER_INVESTIGATION=1
MINIMISATION_MAX_TRIALS=8
MINIMISATION_MAX_TOTAL_WORLDS=20
MINIMISATION_MAX_DURATION_SECONDS=1200
MINIMISATION_MAX_DELAY_TRIALS=4
MINIMISATION_DELAY_TARGET_PRECISION_MS=100
MINIMISATION_CONFIRM_FINAL_SET=true
MINIMISATION_CONFIDENCE_MAX=0.97
FINAL_REPORT_ENABLED=true
```

## Limitations

- Greedy single-variable removal is not exhaustive.
- Interacting variables may hide a smaller global combination.
- Delay output is bounded, not exact.
- The process-local fleet limit is not a distributed queue.
- Cancellation prevents new candidate admission and relies on existing fleet cancellation for running work.
- No source-code repair, repair verification, Kimi, or Nosana integration is included.

## Live Daytona test

The live Daytona minimisation test is opt-in:

```bash
WORKER_EXECUTION_PROVIDER=daytona \
DAYTONA_TARGET=eu \
DAYTONA_MAX_CONCURRENT_SANDBOXES=2 \
MINIMISATION_ENABLED=true \
FINAL_REPORT_ENABLED=true \
RUN_DAYTONA_MINIMISATION_INTEGRATION_TESTS=true \
pnpm runtime:minimisation:daytona:test
```

It must not be treated as passed unless real sandbox execution and cleanup are observed.

## UI handoff

The frontend can read minimisation data from existing investigation, world, experiment, evidence, and finding endpoints. Finding causal metadata now includes retained conditions, removed conditions, inconclusive conditions, bounded delay range, final reproduction steps, confidence explanation, final report evidence IDs, and `minimisationStatus`.
