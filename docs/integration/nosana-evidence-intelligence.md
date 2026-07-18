# Nosana GPU Visual Evidence Intelligence

Nosana is integrated as a supplemental evidence provider for TaskOS Findings. It runs after deterministic evidence has been persisted and only for failed or inconclusive worlds with screenshot evidence.

Nosana never replaces:

- Daytona execution;
- Playwright browser automation;
- deterministic invariant evaluation;
- Investigation lifecycle;
- Kimi planning;
- adaptive reproduction;
- minimisation;
- Repair Verification truth.

## Runtime role

Authoritative TaskOS flow:

```text
WorkerResult persisted
→ deterministic invariant result creates/updates Finding
→ Investigation completes
→ optional Nosana analysis runs non-blocking
→ validated supplemental Evidence is attached
```

If Nosana fails, TaskOS keeps the core Finding and evidence. `NOSANA_REQUIRED=false` is the default and all provider failures are non-fatal.

## Configuration

```dotenv
NOSANA_EVIDENCE_INTELLIGENCE_ENABLED=false
NOSANA_DEPLOYMENT_ID=
NOSANA_DEPLOYMENT_ENDPOINT=
NOSANA_REQUEST_TIMEOUT_MS=60000
NOSANA_MAX_SCREENSHOTS=3
NOSANA_MAX_IMAGE_BYTES=5242880
NOSANA_REQUIRED=false
```

TaskOS runtime does not require a Nosana wallet, `NOSANA_KEY_PATH`, market selection, or CLI job submission. `NOSANA_DEPLOYMENT_ENDPOINT` points to the custom port-8000 Nosana deployment and is never exposed to frontend DTOs.

## Evidence contract

The provider-neutral request includes:

- Investigation, world, and optional Finding IDs;
- invariant type and expected behavior;
- observed outcome: `FAIL` or `INCONCLUSIVE`;
- one to three sanitized screenshot references;
- optional console/accessibility summaries;
- bounded world dimensions.

The deployment request is `multipart/form-data`:

- `manifest`: JSON string containing only invariant type, expected behavior, observed outcome, sanitized world dimensions, and screenshot evidence IDs/roles;
- `images`: one to three PNG/JPEG/WebP files read from TaskOS-owned evidence artifacts.

No filesystem paths, public screenshot URLs, signed URLs, cookies, or authorization headers are sent in the manifest.

The result includes:

- provider `NOSANA`;
- provider job ID;
- status: `COMPLETED`, `FAILED`, or `TIMED_OUT`;
- summary;
- visual changes with 0–1 confidence;
- likely failure mechanism;
- source evidence IDs;
- model, duration, and safe error category.

Provider text is treated as data, not trusted HTML.

## Persistence

The current Prisma artifact enum has no dedicated supplemental-analysis type. To avoid a schema migration, TaskOS stores the Nosana JSON as an existing `WORKER_RESULT` artifact with explicit metadata:

```json
{
  "provider": "NOSANA",
  "role": "SUPPLEMENTAL",
  "authoritative": false
}
```

The Finding page renders these artifacts in a small “GPU Evidence Analysis” section and labels them non-authoritative.

## Deployment

The workload lives under `infra/nosana/workload` as a FastAPI service:

- `GET /health`
- `POST /analyze`

The intended image is:

```text
ghcr.io/arjun-ven12/taskos-nosana-evidence:v1
```

The current pushed immutable digest is:

```text
ghcr.io/arjun-ven12/taskos-nosana-evidence@sha256:9da4c11a58fefab89fb8e08b0534703550c3801ae31facc1f070937342b18346
```

Use the immutable digest in `infra/nosana/evidence-api.deployment.json`.

## Current proof status

The repository contains the deployment API client and container workload. The image has been built, smoke-tested locally, pushed to GHCR, anonymously pulled for `linux/amd64`, and referenced by immutable digest in the Nosana job definition. A real Nosana deployment proof still requires creating or reusing the custom port-8000 deployment and configuring `NOSANA_DEPLOYMENT_ENDPOINT` locally without committing secrets.

Manual deployment values:

```text
Deployment name: taskos-nosana-evidence-api
GPU: NVIDIA 4060
Replicas: 1
Strategy: infinite
Container timeout: 6 hours
Job definition: infra/nosana/evidence-api.deployment.json
Image: ghcr.io/arjun-ven12/taskos-nosana-evidence@sha256:9da4c11a58fefab89fb8e08b0534703550c3801ae31facc1f070937342b18346
Exposed port: 8000
```
