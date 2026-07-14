# Investigation lifecycle

The supported state flow is:

`DRAFT → PLANNING → PLAN_READY → QUEUED → PROVISIONING → RUNNING → OBSERVING`

Observation may lead to `ADAPTING`, `REPRODUCING`, and `MINIMISING`, with controlled transitions back to execution. Terminal states are `COMPLETED`, `PARTIALLY_COMPLETED`, `FAILED`, and `CANCELLED`.

The orchestration contract covers safety validation, planning, initial worlds, queuing, sandbox provisioning, Playwright execution, evidence capture, invariant evaluation, adaptive selection, reproduction, confidence, minimisation, persistence, and cleanup. Only planning persistence and deterministic rule selection are implemented in this foundation; remote orchestration remains scaffolded.
