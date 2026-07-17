# Kimi experiment-planner integration

## Role and boundary

Kimi is an optional provider for TaskOS's initial experiment plan only. Persisted Scenario, Environment, Journey, Invariant, control, and Project Safety context is converted to the existing provider-neutral `PlannerRequest`. Kimi does not evaluate invariants, confirm findings, control adaptive reproduction or minimisation, execute workers, automate browsers, or determine report truth. Runtime evidence remains authoritative.

## Configuration

- `PLANNER_PROVIDER=kimi` explicitly selects Kimi. A Moonshot key alone never changes the provider.
- `MOONSHOT_API_KEY` supplies the server-only bearer credential.
- `KIMI_BASE_URL` defaults to `https://api.moonshot.cn/v1`.
- `KIMI_MODEL` defaults to `kimi-k2.6` and accepts sponsor-specific model identifiers.
- `KIMI_TIMEOUT_MS` defaults to 60000 and is bounded from 1000 through 120000 milliseconds.
- `KIMI_MAX_OUTPUT_TOKENS` defaults to 3000 and is bounded from 500 through 10000 tokens.
- `PLANNER_FALLBACK_ENABLED` retains the established deterministic fallback policy.

Secrets belong in the deployment secret store or an uncommitted local environment file. They are passed only to the OpenAI SDK constructor and are never included in planner messages, public configuration, events, logs, or error summaries.

## Architecture and request flow

`KimiExperimentPlanner` implements the same `ExperimentPlanner` contract as `OpenAIExperimentPlanner`. `KimiClient` uses the existing OpenAI Node SDK with a configurable `baseURL` and calls Chat Completions. The server constructs one selected planner adapter at startup; the investigation planning service remains the single planning pipeline.

The request uses the configured model, temperature zero, bounded output tokens, JSON-object response mode, one request, and the configured timeout. The shared planning prompt is reused and receives sanitized persisted launch context: environment origin without URL credentials, capabilities, Journey steps without fill values, action types, selected Invariants, maximum worlds, supported dimensions and faults, and Project Safety constraints.

The response flow is:

1. require either one JSON object or one exact JSON code fence;
2. parse JSON;
3. validate with `generatedExperimentPlanSchema`;
4. validate allowed dimensions, world limits, baseline, and Project Safety policy in `InvestigationPlanningService`;
5. accept the plan or use the existing deterministic fallback.

Arbitrary prose and mixed prose/JSON are rejected. Model output cannot add Journey actions, evaluators, URLs, commands, credentials, or out-of-policy dimensions.

## Failure handling and fallback

The Kimi adapter emits safe categories: `AUTHENTICATION_ERROR`, `RATE_LIMITED`, `TIMEOUT`, `PROVIDER_UNAVAILABLE`, `MALFORMED_RESPONSE`, `PLAN_SCHEMA_INVALID`, and `UNKNOWN_PROVIDER_ERROR`. Policy rejection is recorded as `PLAN_SAFETY_INVALID`. Raw provider bodies, headers, prompts, and stacks are not persisted or exposed.

Prompt 14 makes one Kimi request and configures SDK retries to zero. When fallback is enabled, missing configuration, provider errors, malformed output, schema failure, or safety failure selects the existing deterministic plan. It does not automatically try OpenAI. OpenAI selection and its existing retry settings remain unchanged.

## Provenance

Persisted plan JSON records `requestedProvider`, `effectiveProvider`, `plannerStatus`, configured `model`, safe `fallbackReason` when relevant, `generatedAt`, durations, validation counts, and token usage when supplied. The relational `ExperimentPlan.provider` uses the existing `KIMI` enum value for accepted Kimi plans; no Prisma migration is required.

Experiment Plan and Live WorldLab display Kimi as “Kimi AI”, the model, validation status, whether fallback was used, and the deterministic fallback source. Final reports already consume the persisted planner object, so Kimi provenance follows the existing report path without report-generation changes.

## Local verification

Run the mock tests first. A real planner-only check is permitted only when both `MOONSHOT_API_KEY` is available and `PLANNER_PROVIDER=kimi`. Use the configured SDK client, verify model access, submit sanitized local context, and stop after schema and safety validation. Do not launch an investigation or Daytona for this check.

## Known limitations

- Kimi-specific thinking mode is omitted because the installed OpenAI SDK does not expose the documented extra-body shape with sufficiently narrow TypeScript types. The planner uses deterministic temperature settings instead.
- Kimi JSON Schema structured outputs are not assumed; TaskOS uses JSON-object mode followed by its own authoritative Zod validation.
- Availability, sponsor model access, and rate limits remain provider-account concerns.
