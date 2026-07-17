# Runtime API hardening

Prompt 10 adds two product-facing safety guarantees for the runtime UI:

1. public runtime mappers do not expose host-local or sandbox-internal paths;
2. final evidence reports can be previewed through a narrow read-only text endpoint.

## Public sanitisation policy

Runtime execution records may contain operational paths such as worker result paths, trace paths,
manifest paths, workspace paths, bundle paths, temporary directories, or sandbox paths. These values
remain useful internally, but they are not product UI data.

Public mappers now use a key-aware sanitiser for runtime metadata. It recursively traverses arrays and
plain objects, does not mutate persisted records, preserves safe scalars, and removes known path-like
operational keys.

Removed public keys include:

- `absolutePath`
- `localPath`
- `hostPath`
- `workspacePath`
- `bundlePath`
- `jobPath`
- `resultPath`
- `manifestPath`
- `tracePath`
- `screenshotPath`
- `artifactPath`
- `sourcePath`
- `tempPath`
- `cwd`
- related worker/report/output path keys

Safe references are preserved when they are already part of the evidence contract:

- `storageKey`
- `filename`
- `checksum`
- evidence IDs
- provider-neutral statuses
- safe relative artifact references

The sanitiser is intentionally not a broad slash-regex. Ordinary Markdown, API paths, and HTTPS URLs
remain intact unless they are under known unsafe path fields.

## Final-report content endpoint

Route:

```text
GET /api/investigations/:investigationId/evidence/:evidenceId/content
```

The route is protected by the existing investigation auth/organisation middleware and returns JSON:

```ts
type EvidenceTextContentResponse = {
  evidenceId: string;
  investigationId: string;
  type: "FINAL_REPORT";
  format: "MARKDOWN" | "JSON" | "TEXT";
  filename: string;
  contentType: string;
  sizeBytes: number;
  checksum?: string;
  content: string;
};
```

Allowed evidence type:

- `FINAL_REPORT`

Allowed content types:

- `application/json`
- `text/json`
- `text/markdown`
- `text/plain`

Unsupported screenshots, traces, ZIP files, videos, worker bundles, and binary artifacts are rejected.

## Ownership and storage validation

The endpoint verifies:

- the investigation belongs to the current organisation;
- the evidence artifact belongs to the requested investigation;
- the artifact type is `FINAL_REPORT`;
- the content type is text-previewable;
- the storage key is relative;
- the storage key contains no null bytes;
- the resolved file remains under the trusted evidence root;
- symlink escapes are rejected where detectable;
- the target is a regular readable file;
- JSON reports parse before being returned as JSON-format content.

The endpoint never returns resolved host filesystem paths.

## Size limit

Default:

```text
FINAL_REPORT_CONTENT_MAX_BYTES=1048576
```

The API rejects reports larger than the configured limit before reading when metadata already exceeds
the limit, and also validates the actual file size/content size before returning.

## Error behaviour

- `404` — investigation or evidence not found
- `400` — unsupported evidence/content type or invalid storage key
- `409` — missing or inconsistent storage state
- `413` — report exceeds preview size limit
- `422` — JSON report is malformed
- `500` — content service unavailable or unexpected trusted read failure

Responses use `Cache-Control: private, max-age=60` and `X-Content-Type-Options: nosniff`.

## Frontend behaviour

The frontend API abstraction exposes:

```ts
getEvidenceTextContent(investigationId, evidenceId)
```

Final report cards render metadata immediately. Content is fetched only when the user selects
`View report`. TanStack Query caches opened report content for the session.

Markdown is rendered as escaped React text with a small heading/list formatter. Raw HTML is not
executed and `dangerouslySetInnerHTML` is not used.

JSON reports are parsed client-side and displayed as structured sections with an expandable raw JSON
view. Malformed JSON renders a safe error state.

## Known limitations

- Binary evidence preview is still metadata-only.
- Trace archives are not previewed in the browser.
- Final report content is limited to the configured size.
- The current local evidence reader is filesystem-backed; object storage can implement the same
  response contract later.
- The UI does not fetch all evidence bodies for large investigations; only opened final reports are
  requested.

