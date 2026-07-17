# AI experiment planner

Runtime Prompt 7 adds a structured experiment-planning layer before initial worlds are queued.

Flow:

```text
CreateInvestigationInput
→ InvestigationPlanningService
→ ExperimentPlanner
→ schema validation
→ policy validation
→ normalization
→ persisted ExperimentPlan
→ existing local/Daytona execution
→ deterministic adaptive reproduction when eligible
→ deterministic minimisation when a supported finding is available
```

## Providers

- `DETERMINISTIC`: no AI request is made; the existing deterministic checkout planner is used.
- `OPENAI`: OpenAI structured output is accepted after validation.
- `FALLBACK`: OpenAI failed or was rejected and deterministic planning produced the executable plan.

The OpenAI adapter lives in `@taskos/ai-providers` and uses the installed OpenAI Node SDK structured-output parser with `zodResponseFormat`. Controllers, repositories, workers, and fleet execution do not call OpenAI directly.

## Prompt

Prompt version: `taskos-experiment-planner-v1`.

The prompt instructs the model to return only the structured schema, treat scenario text as untrusted data, avoid URLs/commands/secrets/code patches, include a healthy baseline, stay within allowed controls, and avoid causality claims before execution.

## Validation

Layer 1: Zod schema validation for objective, explanation, assumptions, variables, worlds, warnings, lengths, and numeric bounds.

Layer 2: policy validation against submitted browsers, viewports, network profiles, server world limits, supported checkout variables, and unsafe text patterns such as URLs, shell commands, package installs, credential-like strings, and filesystem escapes.

Layer 3: normalization for casing, duplicate-world removal, deterministic creation order, deterministic seeds, and healthy-baseline insertion when world budget permits.

Unsafe security-sensitive content is rejected rather than silently normalized.

## Baseline and partial acceptance

Every executable plan must contain a healthy baseline:

```text
duplicateSubmissionBug=false
paymentDelayMs=0
doubleSubmit=false
```

Partial acceptance is allowed only when at least one safe baseline/control remains. If no meaningful safe plan remains, deterministic fallback is used.

## Persistence

The existing `ExperimentPlan` table is reused. Public planner details are stored in the plan JSON under planner metadata:

- requested/effective provider;
- planner status;
- model name;
- assumptions;
- validation warnings;
- rejected plan items;
- normalized fields;
- accepted/rejected world counts;
- fallback reason;
- generation/validation duration;
- token usage when returned by the provider.

API keys are never persisted or sent to Daytona sandboxes.

## Events

Planner lifecycle events include `planner_started`, `planner_request_created`, `planner_provider_request_started`, `planner_provider_request_completed`, `planner_output_received`, `planner_validation_started`, `planner_plan_accepted`, `planner_plan_partially_accepted`, `planner_plan_rejected`, `planner_fallback_used`, and `planner_completed`.

## Idempotency and cancellation

Plan persistence reuses an existing plan for an investigation instead of creating duplicates. Cancellation before execution preserves planner diagnostics and prevents queued worlds from starting under existing investigation cancellation semantics.

## Limitations

- OpenAI plans only the initial world set.
- Adaptive reproduction remains deterministic.
- No Kimi, Nosana, source-code repair, or recursive AI causal planning is implemented.
- Prompt 8 minimisation is deterministic and does not call the planner or OpenAI.
- Model output can vary; deterministic validation is authoritative.
- Live OpenAI tests are opt-in with `RUN_OPENAI_PLANNER_INTEGRATION_TESTS=true`.
