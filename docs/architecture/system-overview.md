# System overview

Rift is a modular monolith plus an independently executable browser worker. The React product sends API-safe contracts to Express. Application services use repositories for Neon/Prisma and ports for AI, sandboxes, visual inference, and evidence storage. Workers receive versioned JSON jobs and return validated JSON results; they never import Express or Prisma.

```text
Web UI ──HTTP/polling──> API modular monolith ──> Neon PostgreSQL
                              │  │  │
                              │  │  └──> EvidenceStorage ──> local files (object store later)
                              │  └─────> AIProvider ──> OpenAI | Kimi stub | Mock
                              └────────> SandboxProvider ──> Daytona adapter | Mock
                                                       └──> Playwright worker
```

The API owns orchestration and tenant authorization. The worker owns deterministic browser execution. The Commerce World Pack supplies supported journey, actor, fault, invariant, safety, and evidence declarations.

The MVP is deliberately not microservices. Polling uses a stable investigation/event response that can later back SSE without changing domain services.
