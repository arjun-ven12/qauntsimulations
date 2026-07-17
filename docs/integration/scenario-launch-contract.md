# Scenario launch contract

Prompt 13 connects persisted Product configuration to the WorldLab runtime launch path.

## Route

Authenticated launch:

```http
POST /api/projects/:projectId/investigations
```

Preflight validation:

```http
POST /api/projects/:projectId/investigations/preflight
```

Both routes require an authenticated organisation context. `OWNER`, `ADMIN`, and `MEMBER`
roles may launch because launch currently follows the existing `EDIT_PROJECTS` permission.
`VIEWER` cannot launch.

## Request body

The project ID is taken from the route. Do not send or trust `organisationId`.

```json
{
  "environmentId": "environment_ready",
  "journeyId": "journey_checkout",
  "invariantIds": ["invariant_payment", "invariant_order"],
  "scenario": {
    "prompt": "Verify checkout under delayed payment and repeated user interaction.",
    "controls": {
      "browsers": ["chromium"],
      "viewports": ["desktop-1440x900", "mobile-390x844"],
      "networkProfiles": ["normal", "delayed-payment"],
      "maximumWorlds": 4,
      "maximumConcurrentWorkers": 2
    }
  }
}
```

`invariantIds` are de-duplicated by the shared request schema. Explicit invalid selections are
not silently dropped.

## Launch response

The create route returns the existing investigation progress response. The `id` is the
Investigation ID to open in Live WorldLab.

```json
{
  "id": "cm...",
  "status": "PLANNING",
  "progress": {
    "totalWorlds": 0,
    "queued": 0,
    "running": 0,
    "completed": 0,
    "failed": 0
  },
  "recentEvents": [],
  "findingCount": 0
}
```

Frontend redirect target:

```text
/worldlab/investigations/:investigationId
```

## Preflight response

Preflight uses the same validator as launch and does not create an Investigation or start
orchestration.

```json
{
  "status": "READY",
  "projectId": "project_ready",
  "environmentId": "environment_ready",
  "journeyId": "journey_checkout",
  "invariantIds": ["invariant_payment", "invariant_order"],
  "validation": {
    "status": "READY",
    "warnings": []
  }
}
```

## Validation and errors

Cross-organisation and cross-project records are concealed as not found through the existing
API error envelope.

Important launch-blocking codes:

- `INVALID_INVESTIGATION_SCOPE`
- `INSUFFICIENT_PERMISSION`
- `ENVIRONMENT_NOT_READY`
- `JOURNEY_DISABLED`
- `JOURNEY_NOT_READY`
- `JOURNEY_ENVIRONMENT_MISMATCH`
- `JOURNEY_ACTION_UNSUPPORTED`
- `INVARIANT_DISABLED`
- `INVARIANT_NOT_READY`
- `PROJECT_SAFETY_BLOCKED`

## Supported Journey actions

Persisted Journey Builder actions accepted by launch:

- `GOTO`
- `CLICK`
- `FILL`
- `WAIT_FOR`
- `ASSERT_VISIBLE`

Legacy aliases `NAVIGATE`, `WAIT`, and `ASSERT` are accepted only through the existing Journey
runtime mapper.

## Supported Invariant identifiers

- `NO_DUPLICATE_PAYMENT`
- `NO_DUPLICATE_ORDER`

The runtime uses `mapPersistedInvariantToRuntimeDefinition` from
`apps/api/src/modules/invariants/invariants.mapper.ts`.

## Safety behaviour

Launch fails before runtime execution when:

- the Environment host is outside Project Safety allowlist;
- reset HTTP method is not allowed;
- checkout submission is not permitted;
- mock payment is not permitted;
- test order creation is not permitted;
- Journey selectors or names conflict with prohibited checkout/payment/order actions.

Credential references remain references only. Raw credential values are not returned.

## Scenario frontend adapter example

```ts
await api.createProjectInvestigation(projectId, {
  environmentId,
  journeyId,
  invariantIds,
  scenario: {
    prompt: objective,
    controls: {
      browsers,
      viewports,
      networkProfiles,
      maximumWorlds,
      maximumConcurrentWorkers,
    },
  },
});
```

Use preflight for Scenario review screens, then call launch only when preflight returns
`READY`.
