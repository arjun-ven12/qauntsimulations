# Invariant Builder

## Manual demo flow

1. Open `/projects/:projectId/invariants` as an Owner or Admin and choose **Create Invariant**.
2. Choose **Use template** on **No duplicate payment**, review the exact
   `NO_DUPLICATE_PAYMENT` definition, and create it.
3. Return to the list, create another Invariant, choose **Use template** on
   **No duplicate order**, review the exact `NO_DUPLICATE_ORDER` definition, and create it.
4. Open either Invariant to validate it or edit its settings.

The templates use the backend-supported names, rules, severities, and configuration.
They create normal database records and do not assume stable seeded IDs.

## Later Scenario integration contract

Selected persisted Invariants must be represented as:

```ts
invariantIds: string[]
```

Scenario and investigation inputs are intentionally unchanged in this frontend.
