# Persisted configuration runtime integration

Prompt 13 removes silent fixture substitution from normal authenticated launches.

## Flow

```text
Authenticated user
→ Project-scoped launch route
→ structural request validation
→ ownership and permission checks
→ Environment readiness and Project Safety checks
→ Journey readiness and runtime mapping
→ Invariant readiness and runtime mapping
→ launch Scenario record creation
→ Investigation creation
→ ExperimentPlan with immutable launch snapshot
→ WorkerJob construction from snapshot and world perturbations
```

## Snapshot strategy

No Prisma migration was required. Existing relational fields still store selected IDs:

- `Investigation.projectId`
- `Investigation.environmentId`
- `Investigation.journeyId`
- `Investigation.scenarioId`
- `ExperimentPlan.journeyId`
- `ExperimentPlan.scenarioId`

The immutable launch snapshot is stored inside `ExperimentPlan.plan.launch`. It contains:

- input source: `PERSISTED_CONFIGURATION`;
- actor user ID;
- launch timestamp;
- scenario prompt and controls;
- runtime-safe Environment snapshot;
- Journey runtime mapper output;
- selected Invariant runtime definitions;
- Project Safety decision snapshot.

Orchestration prefers the launch snapshot over mutable Product records.

## Journey mapping

The integration uses the existing Journey mapper:

```ts
toRuntimeJourney(record)
```

from:

```text
apps/api/src/modules/journeys/journeys.mapper.ts
```

The WorkerJob factory converts persisted payment `CLICK` steps whose selector indicates pay,
payment, or submit into the worker’s `submitPayment` action. This preserves the Product
Journey action set while still allowing deterministic repeated-payment interaction faults.

## Invariant mapping

The integration uses:

```ts
mapPersistedInvariantToRuntimeDefinition(record)
```

from:

```text
apps/api/src/modules/invariants/invariants.mapper.ts
```

Unsupported, disabled, archived, or structurally invalid Invariants fail launch. Explicit
selected IDs are never silently dropped.

## Environment mapping

The Environment snapshot includes:

- base URL;
- optional API base URL;
- reset metadata without credentials;
- payment mode metadata without secrets;
- test-data metadata;
- allowed action names.

For the deterministic demo store, WorkerJob setup is emitted only when the persisted
Environment snapshot safely describes the known test endpoints:

- `POST /api/test/reset`
- `POST /api/test/config`

## Project Safety

Project Safety is enforced before Investigation creation. Host allowlist, allowed HTTP
methods, checkout submission, mock payment, test order creation, and prohibited action checks
are fail-closed.

## Fixture fallback policy

Normal persisted launches require snapshots. The WorkerJob factory still supports the old
fixture path only when an explicit fixture path is supplied to the factory and no persisted
snapshot is present. This is for legacy tests and isolated runtime regression helpers.

Persisted launch validation failures never fall back to fixtures.

## Transaction behaviour

The Scenario record and Investigation record are created in one transaction. Planning and
plan persistence happen after Investigation creation. If planning fails, the Investigation is
marked failed through existing failure semantics.

## Known limitations

- Scenario UI is not implemented in this prompt.
- The launch contract uses the existing shared `scenario.prompt` field rather than adding a
  new public `objective` field.
- Only current Journey Builder runtime actions are accepted.
- Only `NO_DUPLICATE_PAYMENT` and `NO_DUPLICATE_ORDER` are accepted.
- Full Daytona execution was not required by this prompt; local/mock construction remains the
  first verification boundary.
