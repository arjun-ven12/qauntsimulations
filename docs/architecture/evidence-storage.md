# Evidence storage

Neon stores artifact type, key, MIME type, size, checksum, redaction state, and relationships. It never stores large artifact bytes. `EvidenceStorage` currently has a path-safe, checksum-producing local implementation. The object-store adapter is intentionally a stub.

Evidence is untrusted. Upload validation, secret redaction, evidence redaction, protected/signed URLs, retention, and object-store malware scanning are explicit extension hooks. Supported artifacts include screenshots, video, Playwright traces, console/network logs, DOM snapshots, worker results, manifests, and minimum reproduction scripts.
