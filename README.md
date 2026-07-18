# Rift

Rift is a modular-monolith foundation for adaptive, counterfactual reliability experiments. It plans experimental worlds, executes deterministic Playwright journeys in isolated sandboxes, records evidence, and turns reproduced invariant violations into findings.

## Quick start

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm db:generate
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

The web UI defaults to its in-memory mock API. The API requires Neon connection strings for persisted flows; external AI and sandbox credentials are optional because mock providers are available.

## Workspace map

- `apps/web` — product UI
- `apps/api` — Express modular monolith
- `apps/demo-store` — deliberately fault-injectable commerce target
- `packages/*` — safe contracts, configuration, database, providers, SDK, UI
- `workers/playwright-runner` — standalone sandbox executable
- `workers/commerce-pack` — first World Pack
- `docs` — architecture, contracts, ownership, and demo path

See [AGENTS.md](AGENTS.md) before making changes.
