# TaskOS Nosana persistent evidence API

TaskOS uses a persistent Nosana GPU deployment, not wallet-signed one-off jobs at runtime.

Runtime flow:

1. TaskOS finishes deterministic execution and persists core evidence.
2. TaskOS selects at most one failed/inconclusive Finding with screenshot evidence.
3. TaskOS reads owned screenshot bytes from its evidence store.
4. TaskOS sends `multipart/form-data` to the custom deployment:
   - `manifest`: sanitized JSON string
   - `images`: one to three PNG/JPEG/WebP files
5. The deployment returns strict JSON.
6. TaskOS validates and stores one non-authoritative supplemental Evidence artifact.

Nosana does not decide PASS, FAIL, Finding severity, minimisation, or Repair Verification truth.

## Build

```bash
docker build \
  --platform linux/amd64 \
  -t ghcr.io/arjun-ven12/taskos-nosana-evidence:v1 \
  infra/nosana/workload
```

## Local smoke test

```bash
docker run --rm -p 8000:8000 ghcr.io/arjun-ven12/taskos-nosana-evidence:v1
curl -fsS http://localhost:8000/health
```

Expected shape:

```json
{
  "status": "ok",
  "provider": "NOSANA",
  "gpuAvailable": true,
  "gpuName": "NVIDIA ..."
}
```

CPU fallback is allowed for local smoke tests, but the Nosana deployment health check should report `gpuAvailable=true`.

## Push

```bash
docker push ghcr.io/arjun-ven12/taskos-nosana-evidence:v1
docker inspect --format='{{index .RepoDigests 0}}' ghcr.io/arjun-ven12/taskos-nosana-evidence:v1
```

Use the immutable digest in `infra/nosana/evidence-api.deployment.json`.

Current immutable image:

```text
ghcr.io/arjun-ven12/taskos-nosana-evidence@sha256:9da4c11a58fefab89fb8e08b0534703550c3801ae31facc1f070937342b18346
```

Anonymous `linux/amd64` pull verification:

```bash
docker logout ghcr.io || true
docker pull --platform linux/amd64 \
  ghcr.io/arjun-ven12/taskos-nosana-evidence@sha256:9da4c11a58fefab89fb8e08b0534703550c3801ae31facc1f070937342b18346
```

## Persistent Nosana deployment handoff

Use this deployment instead of one-off Nosana CLI jobs.

```text
Deployment name: taskos-nosana-evidence-api
GPU: NVIDIA 4060
Replicas: 1
Strategy: infinite
Container timeout: 6 hours
Job definition: infra/nosana/evidence-api.deployment.json
Image: ghcr.io/arjun-ven12/taskos-nosana-evidence@sha256:9da4c11a58fefab89fb8e08b0534703550c3801ae31facc1f070937342b18346
Exposed port: 8000
Health endpoint: /health
Analysis endpoint: /analyze
```

The installed Nosana CLI currently validates the job definition but does not expose a persistent deployment-management command in this repository environment. If no authenticated deployment API is configured, create or reuse the deployment through the Nosana dashboard, then set `NOSANA_DEPLOYMENT_ID` and `NOSANA_DEPLOYMENT_ENDPOINT` locally.

## Runtime configuration

```dotenv
NOSANA_EVIDENCE_INTELLIGENCE_ENABLED=true
NOSANA_REQUIRED=false
NOSANA_DEPLOYMENT_ID=<custom deployment id>
NOSANA_DEPLOYMENT_ENDPOINT=https://<port-8000-endpoint>
NOSANA_REQUEST_TIMEOUT_MS=60000
NOSANA_MAX_SCREENSHOTS=3
NOSANA_MAX_IMAGE_BYTES=5242880
```

TaskOS runtime does not require `NOSANA_KEY_PATH`, `NOSANA_MARKET`, or CLI job submission.
