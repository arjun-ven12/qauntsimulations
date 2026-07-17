# Journey Builder Phase 1 contract

## Persistence discovered

`Journey` is the existing project-owned model. It persists `id`, `projectId`, `name`, nullable
`description`, `createdAt`, `updatedAt`, nullable `deletedAt`, and relational `steps`. Names are
unique per project and soft deletion already exists.

`JourneyStep` is relational (not a Journey JSON array). It persists `id`, `journeyId`, unique
zero-based `order`, string `action`, nullable `selector`, nullable `value`, and JSON `metadata`.
It has no per-step timestamps. There is no Environment relation on Journey.

Phase 1 uses a namespaced `taskosJourney` object in the first step's existing `metadata` column to
persist `environmentId`, `startPath`, `state`, `completionCondition`, and `validationStatus`. The
repository always replaces the complete step set transactionally, so the envelope remains attached
to order zero. This is an adapter over the existing Journey model, not a second Journey model. A
future first-class schema should add these fields and a real Environment relation; no Prisma or
shared-contract file is changed in Phase 1.

The Project Safety persistence boundary retains the older `permitOrderCreation` configuration key
and maps it to canonical `permitTestOrderCreation` for API DTOs and domain services. Frontend,
Environment, and Journey code consume only the canonical name; both names never appear together in
an API DTO or domain configuration.

## API action contract

The builder accepts only `GOTO`, `CLICK`, `FILL`, `WAIT_FOR`, `ASSERT_VISIBLE`, and `SCREENSHOT`.
Persistence uses these values. Runtime conversion is exact:

| Builder | Worker step |
| --- | --- |
| `GOTO` with `value` | `{ type: "goto", path }` |
| `CLICK` with `selector` | `{ type: "click", selector }` |
| `FILL` with `selector` and `value` | `{ type: "fill", selector, value }` |
| `WAIT_FOR` with `selector` and `metadata.timeoutMs` | `{ type: "waitFor", selector, timeoutMs }` |
| `ASSERT_VISIBLE` with `selector` | `{ type: "assertVisible", selector }` |
| `SCREENSHOT` | compiled onto the preceding step as `screenshotCheckpoint: true`; its checkpoint name becomes the runtime step `name` |

Selectors are plain Playwright locator strings. Completion conditions map to the worker's existing
`successCondition`: `VISIBLE` becomes `{ type: "visible", selector }`; `TEXT` becomes
`{ type: "text", selector, expectedText }`. Runtime screenshot checkpoints already exist as step
metadata. No standalone screenshot runtime action and no other completion mechanism exists.

Legacy seeded records use `NAVIGATE` and `WAIT`; response mapping reads those as `GOTO` and
`WAIT_FOR`. They remain readable, but require recreation with an Environment before Builder
mutation because they have no persisted builder configuration.
