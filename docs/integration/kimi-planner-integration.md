# Kimi experiment-planner integration

## Role and boundary

Kimi is used by Rift only for the initial experiment plan. Persisted Scenario, Environment, Journey, Invariant, controls, and Project Safety context are converted into the existing provider-neutral `PlannerRequest`. Kimi does not evaluate invariants, confirm findings, control adaptive reproduction or minimisation, execute workers, automate browsers, or determine report truth. Runtime evidence remains authoritative.

## Current serving provider

Rift’s current Kimi planner integration uses Kimi K2.7 Code through ai&:

- Serving provider: `ai&`
- Model developer: `Moonshot AI`
- Model: `moonshotai/kimi-k2.7-code`
- Fallback: Rift deterministic planner

The direct Moonshot adapter remains available as an optional alternative provider for compatibility, but the demo Kimi path should use `PLANNER_PROVIDER=AIAND`.

## Configuration

Use exactly this environment format for ai&:

```env
PLANNER_PROVIDER=AIAND
AIAND_API_KEY=<secret>
AIAND_BASE_URL=https://api.aiand.com/v1
AIAND_MODEL=moonshotai/kimi-k2.7-code
AIAND_API_SURFACE=CHAT_COMPLETIONS
AIAND_STREAMING_ENABLED=true
AIAND_REQUEST_TIMEOUT_MS=240000
AIAND_IDLE_TIMEOUT_MS=45000
AIAND_MAX_COMPLETION_TOKENS=6000
AIAND_REASONING_EFFORT=none
AIAND_PLANNER_ENABLED=true
```

`AIAND_API_KEY` belongs only in a deployment secret store or an uncommitted local `.env`. It is passed only to the OpenAI SDK constructor and is never included in planner messages, public configuration, events, logs, or error summaries.

Existing direct Moonshot variables are still optional for the legacy provider:

- `PLANNER_PROVIDER=kimi`
- `MOONSHOT_API_KEY`
- `KIMI_BASE_URL`
- `KIMI_MODEL`
- `KIMI_TIMEOUT_MS`
- `KIMI_MAX_OUTPUT_TOKENS`

## Architecture and request flow

`AiAndExperimentPlanner` implements the same `ExperimentPlanner` contract as `OpenAIExperimentPlanner` and `KimiExperimentPlanner`. `AiAndClient` uses the existing OpenAI Node SDK with a configurable `baseURL` and calls streaming Chat Completions. The server constructs one selected planner adapter at startup; `InvestigationPlanningService` remains the single planning pipeline.

The ai& request uses portable OpenAI-compatible fields:

- `model`
- `messages`
- `max_completion_tokens`
- `reasoning_effort: "none"`
- `stream: true`
- `stream_options: { include_usage: true }`
- `response_format: { type: "json_schema", json_schema: { name: "rift_experiment_strategy", strict: true, ... } }`

It intentionally does not send Moonshot-specific `thinking` or `extra_body` fields. The model only generates a minimal strategy object: summary, hypothesis, selected dimensions, and exactly four compact worlds. RIFT then deterministically maps that output into the existing full experiment-plan shape before Zod and Project Safety validation. If ai& rejects strict JSON Schema for a selected compatible model, the adapter performs one bounded compatibility retry using `response_format: { type: "json_object" }`; the same conservative parser, Zod schema, and Project Safety checks still apply. The compact prompt receives sanitized persisted launch context: objective, invariant, environment origin without URL credentials, allowed dimensions, world count, and brief Project Safety constraints.

The response flow is:

1. require either one JSON object or one exact JSON code fence;
2. parse JSON;
3. validate with `generatedExperimentPlanSchema`;
4. validate allowed dimensions, world limits, baseline, and Project Safety policy in `InvestigationPlanningService`;
5. accept the plan or use the existing deterministic fallback.

Arbitrary prose and mixed prose/JSON are rejected. Model output cannot add Journey actions, evaluators, URLs, commands, credentials, or out-of-policy dimensions.

## Failure handling and fallback

The ai& adapter emits safe categories: `AUTHENTICATION_ERROR`, `RATE_LIMITED`, `TIMEOUT`, `MODEL_UNAVAILABLE`, `PROVIDER_UNAVAILABLE`, `RESPONSE_FORMAT_UNSUPPORTED`, `REFUSAL`, `MALFORMED_RESPONSE`, `PLAN_SCHEMA_INVALID`, and `UNKNOWN_PROVIDER_ERROR`. Empty visible completions include only safe diagnostics such as finish reason, content length, token counts, and reasoning-token counts. Policy rejection is recorded as `PLAN_SAFETY_INVALID`. Raw provider bodies, headers, prompts, hidden reasoning, and stacks are not persisted or exposed.

When fallback is enabled, missing configuration, provider errors, malformed output, schema failure, model unavailability, or safety failure selects the existing deterministic plan. Rift does not automatically switch from ai& to direct Moonshot or OpenAI.

## Provenance

Persisted plan JSON records:

- `requestedProvider: "AIAND"`
- `effectiveProvider: "AIAND"` on success
- `modelProvider: "MOONSHOTAI"`
- `model: "moonshotai/kimi-k2.7-code"`
- `plannerStatus`
- safe `fallbackReason` when relevant
- `generatedAt`
- generation duration
- validation counts
- token usage when supplied

When fallback is used, persisted metadata records `requestedProvider: "AIAND"`, `effectiveProvider: "FALLBACK"`, and a safe fallback reason.

The legacy relational `ExperimentPlan.provider` enum does not currently contain `AIAND`; no Prisma migration is required for this integration because the authoritative public provenance is stored in the existing JSON planner metadata and returned through the Experiment Plan DTO.

Experiment Plan and Live WorldLab display successful ai& plans as “Kimi via ai&”, including model, validation status, fallback state, serving provider, and model developer.

## Local verification

Run mock tests first. A real planner-only check is permitted only when `AIAND_API_KEY` is available and `PLANNER_PROVIDER=AIAND`. Use the configured SDK client to list models, verify `moonshotai/kimi-k2.7-code`, submit sanitized local context, and stop after schema/safety validation and initial-world persistence. Do not run Daytona for this check.
