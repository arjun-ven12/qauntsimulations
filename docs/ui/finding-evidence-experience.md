# Finding and evidence experience

Prompt 11 turns the runtime finding detail view into a demo-ready result page without changing runtime execution or evidence generation.

## Finding-detail sections

The finding page presents:

1. finding header;
2. executive summary;
3. reproduction confidence;
4. minimal tested condition set;
5. retained, removed, and inconclusive conditions;
6. observed failure boundary;
7. deterministic reproduction steps;
8. experiment history;
9. evidence-supported sequence, when recorded;
10. evidence grouped by runtime stage;
11. final reports;
12. limitations.

The page uses independent query state for the finding, progress, worlds, experiments, and evidence. If a secondary panel fails, the loaded finding remains usable and the panel shows a retry action.

## Condition formatting

Technical runtime keys are formatted centrally in `runtime-normalizers.ts`.

Examples:

- `duplicateSubmissionBug` → `Duplicate-submission mode`
- `doubleSubmit` → `Repeated checkout submission`
- `doubleSubmitIntervalMs` → `Click interval`
- `paymentDelayMs` → `Payment delay`
- `userProfile` → `User profile`
- `networkProfile` → `Network profile`

Boolean duplicate-submission and repeated-submit values render as enabled or disabled. Millisecond values render with an `ms` suffix.

## Minimal tested set language

The UI intentionally says:

- `Minimal tested condition set`
- `Supported`
- `Observed failure boundary`
- `Bounded interval`

The UI intentionally does not say:

- `Proven cause`
- `Globally minimal conditions`
- `Exact universal trigger`

This keeps the product language aligned with the deterministic minimisation evidence actually produced by the runtime.

## Failure-boundary rules

The boundary component accepts:

- a passing bound;
- a failing bound;
- tested points;
- optional target precision.

For the preserved investigation it renders:

```text
Observed stable: ≤ 900 ms
Untested interval
Failure observed: ≥ 1,200 ms
```

The explanatory copy states that values inside the interval were not fully established. One-bound and no-bound cases render safe fallback messages.

## Evidence grouping

Evidence is grouped by structured runtime relationships before fallback grouping:

- Final reports
- Original observation
- Exact reproduction
- Controlled comparisons
- Minimisation trials
- Final confirmation
- Other

The grouping function uses finding source-world metadata, experiment/world relationships, adaptive purpose, minimisation purpose, and evidence type. Filename inference is not preferred over structured metadata.

## Evidence filters and performance

The evidence viewer supports the preserved 93-artifact investigation by:

- keeping most groups collapsed by default;
- opening final reports and source-observation groups first;
- filtering by evidence type;
- searching by filename, world ID, artifact ID, or evidence type;
- rendering only the first page of each group with a `Show more evidence` action;
- fetching final-report bodies only after a user opens a specific report.

No one-request-per-artifact pattern is introduced.

## Final-report rendering

Prompt 10’s secure final-report content endpoint is reused.

Markdown reports render as safe React text with simple heading/list formatting. Raw HTML is escaped because the UI does not use `dangerouslySetInnerHTML`.

JSON reports render structured sections first, with raw JSON collapsed by default.

## Accessibility

The page avoids color-only status by including labels such as `PASS`, `FAIL`, `Retained`, `Removed`, and `Inconclusive`.

Evidence filters are buttons with tab semantics, collapsible groups expose native disclosure state, and shortened IDs retain full values in `title` attributes where useful.

## Limitations

- Binary evidence previews are metadata-only.
- Playwright trace download is not exposed by the public API.
- Console and network log body retrieval is not implemented in this prompt.
- Screenshot thumbnails require a future safe binary evidence endpoint.
- The page presents runtime-supported causal metadata only when recorded; it does not synthesize a causal graph.
- In the preserved Prompt 11 investigation, the final report files contain the 900 ms passing observation, but the persisted minimisation run currently exposes only the 1,200 ms failing bound in read metadata. The finding page therefore shows the failing bound immediately and shows the 900 ms observation after the final report is opened.

## Product-owner polish handoff

Prompt 11 does not modify global navigation, app layout, project setup, environments, journey builder, scenario input, or invariant builder. Product-owner polish can later improve visual storytelling, copy hierarchy, and binary artifact previews without changing the runtime data contract.
