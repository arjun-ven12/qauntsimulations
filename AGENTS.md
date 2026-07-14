# TaskOS WorldLab contributor boundaries

This monorepo is split so two Codex sessions can work concurrently without file overlap.

## Runtime developer ownership

- `apps/api/src/modules/execution/**`, `experiments/**`, `worlds/**`, `findings/**`
- `apps/api/src/integrations/daytona/**`
- `workers/**`
- `packages/execution-contracts/**`, `packages/world-pack-sdk/**`

## Product developer ownership

- `apps/web/**`, `apps/demo-store/**`, `packages/ui/**`
- `apps/api/src/modules/auth/**`, `projects/**`, `environments/**`, `journeys/**`, `scenarios/**`

## Shared files: coordinate before editing

- `packages/shared-types/**`, `packages/database/prisma/schema.prisma`
- root `package.json`, `pnpm-lock.yaml`, `.env.example`, `tsconfig.base.json`
- `docs/api-contracts/**`

Document shared-contract changes in the pull request and in the relevant contract documentation.

## Non-negotiable rules

- Never perform repository-wide refactors or rename top-level directories.
- Never modify files outside the assigned ownership area.
- Prefer adding focused files inside an owned module.
- Never silently replace architectural choices.
- Neon PostgreSQL and Prisma remain the source-of-truth persistence layer.
- JWT authentication must not be replaced by a third-party auth service.
- Business logic must depend on ports/interfaces, not directly on OpenAI, Kimi, Daytona, Nosana, Prisma, or Express.
- Controllers handle HTTP only; services contain application logic; repositories isolate persistence.
- Never log credentials, cookies, tokens, API keys, or secret environment variables.
