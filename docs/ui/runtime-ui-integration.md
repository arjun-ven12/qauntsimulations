# Runtime UI integration

Prompt 9 connects the existing Rift web app to the real runtime investigation API.

## Pages integrated

- `/investigations/:investigationId`
- `/investigations/:investigationId/live`
- `/investigations/:investigationId/worlds`
- `/investigations/:investigationId/plan`
- `/investigations/:investigationId/findings`
- `/investigations/:investigationId/findings/:findingId`

The selected development investigation is:

```text
cmrol9cxh0001rurb8godxnh6
```

This ID is used only as a demo navigation shortcut through `VITE_DEMO_INVESTIGATION_ID`; route components read the investigation ID from the URL.

## API endpoints consumed

The frontend API abstraction now supports:

- `getInvestigation`
- `getExperimentPlan`
- `getWorlds`
- `getExperiments`
- `getWorkers`
- `getEvidence`
- `listFindings`
- `getFindingDetail`

`HttpInvestigationApi` consumes the confirmed backend routes under `/api`. `MockInvestigationApi` remains available for tests and local mock development with sanitized real-shape data.

## Error handling

HTTP, network, invalid JSON, schema mismatch, timeout, and not-found failures are represented with `InvestigationApiError`.

Major panels load independently. If evidence or workers fail while progress loads, the page still renders the loaded panels and shows a panel-level retry action.

## Polling

Polling uses TanStack Query:

- Progress: 2 seconds
- Worlds: 3 seconds
- Experiments: 3 seconds
- Workers: 3 seconds
- Findings: 5 seconds
- Evidence: 5 seconds

Polling stops once the investigation status is terminal:

- `COMPLETED`
- `FAILED`
- `CANCELLED`

## World-origin normalization

World classification is centralized in `apps/web/src/features/runtime/runtime-normalizers.ts`.

Supported origins:

- `INITIAL`
- `ADAPTIVE_REPRODUCTION`
- `MINIMISATION`
- `UNKNOWN`

Missing `configuration.origin` is treated as `INITIAL`, matching the runtime handoff. Unknown values render safely as `UNKNOWN`.

The same utility extracts:

- adaptive purpose
- minimisation purpose
- browser
- viewport
- payment delay
- repeated-submit state
- duplicate-submission bug mode
- result
- status
- evidence count

## Evidence handling

Investigation-level evidence is grouped by runtime stage on the finding detail page:

1. Final reports
2. Original observation
3. Exact reproduction
4. Controlled comparisons
5. Minimisation trials
6. Final confirmation
7. Other

Evidence cards also support type filtering, search, group counts, and show-more pagination so the preserved
93-artifact investigation does not render every artifact body or card at once.

The UI does not assume artifact bodies are browser-fetchable. It renders metadata and a clear unavailable-preview message when no safe artifact body endpoint exists.

Evidence paths are validated as relative storage keys. Absolute local filesystem paths are rejected or redacted before rendering.

Supported evidence types include:

- `SCREENSHOT`
- `TRACE`
- `CONSOLE_LOG`
- `NETWORK_LOG`
- `WORKER_RESULT`
- `ENVIRONMENT_MANIFEST`
- `FINAL_REPORT`

## Finding detail

Finding detail now renders:

- finding header with severity, confidence, causal status, reproduction count, and final-report availability
- executive summary, business impact, original observation, source world, and failed invariants
- reproduction confidence panel
- minimal tested condition set
- retained, removed, and inconclusive conditions
- observed failure boundary with tested points
- deterministic reproduction steps
- experiment history across initial, adaptive, and minimisation worlds
- evidence-supported sequence when runtime metadata exists
- grouped evidence with lazy report body loading
- limitations

The UI uses careful language:

- “Supported”
- “Observed bounded range”
- “Minimal tested condition set”

It does not say:

- “Proven”
- “Exact causal threshold”
- “Globally minimal”

## Final reports

Final-report JSON and Markdown artifacts are identifiable through evidence metadata. Prompt 10 adds a
safe, read-only text endpoint for final-report content, so the UI now fetches report bodies lazily only
after a user opens an individual final-report artifact.

## Optional-field fallbacks

The UI handles:

- no plan yet
- no worlds yet
- no workers yet
- no findings
- no evidence
- no minimisation metadata
- no bounded range
- no final report
- unknown event types
- missing optional timings
- unknown worker providers

## Known limitations

- No WebSockets; polling is used.
- No authentication work was added.
- No project setup UI was added.
- No environment setup UI was added.
- No journey builder was added.
- No invariant builder was added.
- No repair verification runtime was added.
- No Nosana UI was added.
- Kimi initial-planner provenance is displayed through the existing Experiment Plan and Live WorldLab plan panel; Kimi has no runtime-evaluator or worker UI role.
- Binary evidence body retrieval remains metadata-only. Final-report Markdown and JSON can be
  previewed through the safe report-content endpoint.
- The visual design is intentionally functional and ready for product-owner polish, not a full redesign.

## Product-owner handoff

The product owner can now polish:

- scenario creation
- project setup
- environment setup
- journey builder
- invariant builder
- navigation
- experiment-plan presentation
- Live WorldLab visual polish
- findings visual polish
- demo storytelling

## Prompt 12 Live WorldLab overview

The main Live WorldLab page now provides a runtime-oriented investigation overview: phase tracker, world-based progress, terminal summary, worker/attempt visibility, searchable/sortable world table, two-world comparison, actual-world matrix, grouped event timeline, finding summary, and evidence availability counts. It intentionally does not fetch final-report bodies on the overview page. See `docs/ui/live-worldlab-experience.md` for phase mappings, matrix cohort rules, polling semantics, partial-failure behavior, and accessibility notes.
