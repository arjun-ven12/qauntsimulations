# Developer boundaries

Developer 1 (runtime) owns execution, experiments, worlds, findings, Daytona, all workers, execution contracts, and the World Pack SDK.

Developer 2 (product) owns the web app, demo store, UI package, authentication, projects, environments, journeys, and scenarios.

Shared types, the Prisma schema, root configuration, lockfile, environment template, and API contracts require explicit coordination. Each shared change must be documented. See the root `AGENTS.md` for strict rules.
