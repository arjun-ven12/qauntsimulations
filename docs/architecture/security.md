# Security architecture

- Passwords use bcrypt with a configurable cost; plaintext and hashes never appear in responses.
- Short-lived access JWTs and rotating, revocable refresh JWTs travel in `HttpOnly`, `SameSite=Lax` cookies; production cookies are secure.
- CORS is restricted to the configured web origin. Same-site cookies plus origin restrictions form the initial CSRF-aware posture; add synchronizer tokens before enabling cross-site embedding.
- Every protected route establishes a user, organisation, and role context. Repositories include tenant constraints.
- Helmet, request-size limits, rate limits, Zod validation, JWT expiry, and structured redacted logs are enabled.
- Safety policies model domain allowlists, blocked production actions, worker ceilings, and compute budgets.
- Evidence and external outputs are untrusted and pass redaction/validation boundaries.

Never log passwords, cookies, JWTs, API keys, raw credentials, or secret environment values.
