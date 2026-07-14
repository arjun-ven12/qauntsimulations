# Worker contracts

`WorkerJob` version `1` carries worker/experiment IDs, a complete `WorldConfig`, browser configuration, deterministic journey plan, faults, invariants, evidence directory, and timeout.

`WorkerResult` carries status, timestamps, invariant violations, evidence manifest, numeric metrics, first divergence, and a safe error shape. Both boundaries are Zod-validated. Exit code `0` means passed, `2` means an invariant failed, `1` means execution/input error, and `64` means CLI usage error.
