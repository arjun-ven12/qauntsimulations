# Invariant Builder contract

## Persisted model

`Invariant` is a relational Prisma model with these existing fields:

- `id`, `organisationId`, `projectId`
- `name`, `description`, `assertion`
- `createdAt`, `updatedAt`, `deletedAt`

`assertion` is the existing declarative JSON field. The Product API stores one strict
runtime-aligned object in it:

```ts
{
  type: 'NO_DUPLICATE_PAYMENT' | 'NO_DUPLICATE_ORDER';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  enabled: boolean;
  config: SupportedEvaluatorConfiguration;
}
```

This is one source of truth for evaluator type, severity, enabled state, and
configuration. There are no separate Prisma columns for those values. Validation
status is computed from persisted data and is not stored. Soft deletion uses
`deletedAt`; active queries exclude archived records. Prisma enforces unique names
with `@@unique([projectId, name])`.

Legacy assertion JSON that does not match the strict supported schema is returned as
`INVALID`. It cannot be updated or mapped to runtime and must be recreated. No Prisma
change is required for the supported Product Builder fields because `assertion` is
already the intended declarative assertion payload.

## Supported evaluators and templates

Only the evaluator identifiers currently registered by the Playwright runtime are
accepted:

- `NO_DUPLICATE_PAYMENT`: **No duplicate payment** — "A customer must never be
  charged twice for one checkout." Suggested severity `CRITICAL`.
- `NO_DUPLICATE_ORDER`: **No duplicate order** — "A checkout must never create more
  than one order." Suggested severity `HIGH`.

Payment configuration accepts only `requestPatterns` and HTTP `methods`. Order
configuration accepts those fields and an optional `orderIdSelector`. Schemas reject
unknown properties, unsupported methods, unsafe path patterns, executable content,
and unsupported selectors. Template definitions are exported from
`invariants.templates.ts`.

The runtime evaluators consume captured network request/response observations. The
payment evaluator also correlates `submitPayment` journey-action timestamps. The
order evaluator can derive an order ID from response evidence and optionally from a
DOM selector/screenshot evidence path. Observation collection, evaluation, evidence,
and Finding generation remain runtime-owned.

## Product DTO and validation

The Product-facing DTO contains only `id`, `projectId`, `name`, `description`,
`type`, `configuration`, `severity`, `enabled`, computed `validationStatus`, and
timestamps. It does not expose raw assertion JSON, organisation metadata, secrets,
or evaluator source.

Supported runtime severities are exactly `LOW`, `MEDIUM`, `HIGH`, and `CRITICAL`.
Enabled invariants remain visible and can map to runtime. Disabled invariants remain
persisted and visible but cannot map to a runtime definition. Archived invariants are
excluded from normal reads and cannot map to runtime.

`POST .../:invariantId/validate` is static and non-executing. It checks the name,
plain-language description, registered evaluator, severity, strict configuration,
enabled state, and runtime mapping compatibility. It does not launch a worker or
investigation, call an AI provider, inspect live evidence, or create Findings.
Checks use `PASSED`, `WARNING`, and `FAILED`; the overall status uses `DRAFT`, `READY`,
and `INVALID` (the current checks return `READY` or `INVALID`).

## Runtime mapper

- Path: `apps/api/src/modules/invariants/invariants.mapper.ts`
- Export: `mapPersistedInvariantToRuntimeDefinition`
- Input: an organisation/project-scoped persisted `InvariantRecord`
- Output: the existing `WorkerJob['invariants'][number]` shape:

```ts
{
  id: string;
  type: 'NO_DUPLICATE_PAYMENT' | 'NO_DUPLICATE_ORDER';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  config: Record<string, unknown>;
}
```

The mapper is re-exported from `index.ts`. It rejects archived, disabled, malformed,
and unsupported invariants and does not resolve secrets or translate evaluator names.

## Permissions and tenancy

All operations require an authenticated user, active organisation membership, and a
project in the active organisation. Reads require `VIEW_PROJECTS`. Mutations,
including validation, require both `EDIT_PROJECTS` and an `OWNER` or `ADMIN` role;
`MEMBER` and `VIEWER` are read-only. Every invariant lookup includes organisation,
project, and active-record constraints, concealing cross-organisation and
cross-project resources with `404` responses.

## Shared integration requirements

The module deliberately does not edit shared route registration. To mount it, the API
composition owner must replace the current not-implemented invariant router in
`apps/api/src/routes/index.ts` with:

```ts
router.use(
  '/projects/:projectId/invariants',
  createInvariantRouter(controllers.invariants),
);
```

That file must also import `createInvariantRouter`, add an `InvariantController` to
`ProtectedControllers`, and `apps/api/src/server.ts` must compose that controller from
`InvariantService` and `InvariantRepository`.

Investigations currently accept `invariantIds` and validate that the referenced
records belong to the active organisation/project. When runtime job construction is
connected to persisted selections, it must exclude disabled/archived invariants and
map each remaining record exclusively through
`mapPersistedInvariantToRuntimeDefinition`. No WorkerJob, shared-contract, evaluator,
or Prisma change is required for that integration.
