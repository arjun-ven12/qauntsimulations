# Live WorldLab experience

Prompt 12 makes the main investigation overview a runtime operations surface rather than a placeholder dashboard. It is intentionally scoped to runtime visibility and does not add product setup, journey building, invariant building, or global navigation changes.

## Page structure

The Live WorldLab page is organized as:

1. investigation header and phase tracker;
2. runtime progress and terminal summary;
3. world exploration table;
4. real world matrix;
5. worker and attempt panel;
6. grouped runtime event timeline;
7. concise finding summary;
8. evidence availability summary.

The overview uses metadata only. It does not fetch final-report bodies, screenshots, traces, or other heavy evidence content.

## Phase mapping

Runtime status is mapped to user-facing phases:

- `PLANNING` → Planning experiments / Plan active
- `QUEUED`, `PROVISIONING`, `RUNNING`, `OBSERVING` → Explore active
- `ADAPTING`, `REPRODUCING` → Reproduce active
- `MINIMISING` → Minimise active
- `COMPLETED` → Complete
- `FAILED` and `CANCELLED` → stopped at the current phase

Finding-free completed investigations mark reproduction and minimisation as skipped rather than failed.

## Progress semantics

World counters are world-based. Attempts are shown separately in the worker panel and are never counted as worlds. Dynamic totals are safe: if adaptive or minimisation worlds are added while an investigation is active, the denominator can increase without implying regression.

Terminal summaries distinguish:

- completed with findings;
- completed with no findings;
- failed before completion;
- cancelled before completion.

Infrastructure failure copy is kept separate from product finding copy.

## Worker presentation

The worker panel shows active workers first. Completed workers are rendered as compact expandable rows. Each worker row shows provider, related world, final world outcome, attempt count, attempt status, duration, exit code where available, and a cleanup message only when supported by public data.

The public API currently exposes attempt status, timing, exit code, and related world. It does not expose full sandbox lifecycle or cleanup state per worker, so the UI displays “No cleanup warning was reported” instead of claiming all sandboxes were cleaned up.

## World table

The world table includes:

- world ID;
- origin;
- purpose;
- browser;
- viewport;
- network;
- payment delay;
- repeated submission;
- bug mode;
- world status;
- result;
- worker;
- attempt count;
- evidence count;
- created/completed timestamps.

Filters are available for all worlds, initial exploration, adaptive reproduction, failure minimisation, passed, failed, running, and inconclusive. Search covers world ID, world name, purpose, browser, viewport, network, and worker ID. Sorting supports chronology, stage, status, and numeric payment delay.

## Origin and purpose labels

Origins are normalized centrally:

- `INITIAL` → Initial exploration
- `ADAPTIVE_REPRODUCTION` → Adaptive reproduction
- `MINIMISATION` → Failure minimisation
- unknown values → Unknown

Purpose labels are also centralized. Known examples include healthy baseline, exact reproduction, bug-disabled control, single-submit control, delay comparison, remove bug mode, remove repeated submission, normalise user profile, normalise viewport, delay boundary search, and confirm minimal tested set. Unknown values are humanized safely.

## World comparison

Users can select up to two worlds in the table. The comparison panel shows origin, purpose, browser, viewport, network, user profile, payment delay, double-submit flag, click interval, bug mode, outcome, failed-invariant summary, and evidence count. Only actual differences are highlighted.

## Matrix cohort rules

The matrix is derived from actual comparable worlds. Rows are single submit and double submit. Columns are observed payment-delay values sorted numerically.

The default cohort is the most common compatible browser/viewport/network configuration. Worlds outside that cohort are counted as excluded rather than silently mixed. Cells can be pass, fail, running, inconclusive, mixed, or not tested. Mixed cells show pass/fail counts and are not labelled flaky unless the runtime classification says so.

The matrix includes a text alternative for accessibility and cell selection reveals related worlds.

## Event timeline

Events are grouped as planning, world generation, fleet and sandbox, execution, finding discovery, adaptive reproduction, minimisation, final report, or system. Importance is classified as important, normal, or technical.

Important events include finding creation, exact reproduction success, adaptive plan creation, retained/removed minimisation conditions, minimal reproduction found, final report completion, investigation failure, worker failure, and cleanup failure.

Metadata remains collapsed by default. Only selected safe fields are shown, such as provider, attempt, world, purpose, condition, confidence, result, and report ID. Credentials, cookies, authorization headers, local paths, raw commands, and large captured bodies are not rendered.

## Finding callouts

The Live page shows a concise finding card with severity, confidence, causal status, reproduction count, retained condition count, final-report availability, summary, and a link to the finding detail page. Active investigations with an unconfirmed finding use “Possible violation” language rather than claiming confirmation early.

## Polling and partial failures

Polling remains query-based, not WebSockets:

- progress: 2 seconds
- plan: 2 seconds while active
- worlds/experiments/workers: 3 seconds while active
- findings/evidence: 5 seconds while active

Terminal investigations stop polling after the initial query set settles. Panels fail independently: if workers or evidence fail to load, progress/worlds/findings remain usable and expose retry controls where the existing pattern supports them.

## Performance and accessibility

The preserved completed investigation has 13 worlds, 13 workers, 20 recent events, one finding, and 93 evidence artifacts. The page uses memoized world rows and matrix aggregation, renders evidence counts rather than full evidence lists, keeps metadata collapsed by default, and avoids report-body requests.

Accessibility notes:

- phase tracker includes text labels;
- status is not communicated by color alone;
- table row actions are buttons;
- matrix has a text alternative;
- event filters are labelled;
- expandable attempt details use native `details`/`summary`;
- shortened IDs keep full IDs in titles where applicable.

## Product-owner polish handoff

Remaining polish is product-facing presentation work: spacing, visual hierarchy, responsive density, optional dashboard-level navigation, and richer artifact previews. Runtime execution, evidence generation, final-report content access, and finding detail are intentionally unchanged by Prompt 12.
