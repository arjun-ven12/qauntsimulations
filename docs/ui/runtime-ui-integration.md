# Runtime UI integration

Prompt 9 connects the existing TaskOS web app to the real runtime investigation API.

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

Evidence is grouped by:

1. Final reports
2. Screenshots
3. Traces
4. Logs
5. Worker outputs
6. Other

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

Finding detail renders:

- summary
- severity
- confidence
- reproduction count
- causal status
- source world and experiment
- failed invariants
- retained conditions
- removed conditions
- inconclusive conditions
- bounded failure range
- reproduction steps
- linked evidence
- final-report artifacts

The UI uses careful language:

- “Supported”
- “Observed bounded range”
- “Minimal tested condition set”

It does not say:

- “Proven”
- “Exact causal threshold”
- “Globally minimal”

## Final reports

Final-report JSON and Markdown artifacts are identifiable through evidence metadata. The current API does not expose safe report body retrieval, so the UI shows artifact metadata and availability state rather than inventing file URLs.

If a safe artifact-content endpoint is added later, the final-report viewer can lazily fetch and render Markdown or structured JSON on demand.

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
- No Kimi UI was added.
- Evidence body retrieval is metadata-only until a safe artifact content endpoint exists.
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

