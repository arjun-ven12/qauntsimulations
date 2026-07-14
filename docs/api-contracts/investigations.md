# Investigation API contract

Functional endpoints:

- `POST /api/projects/:projectId/investigations` validates the tenant-scoped environment, journey, and scenario; generates and persists a plan and worlds.
- `GET /api/investigations/:investigationId` returns status, plan, aggregate progress, worker counts, recent events, finding count, and elapsed seconds.
- `GET /api/investigations/:investigationId/plan`
- `GET /api/investigations/:investigationId/worlds`
- `GET /api/investigations/:investigationId/findings`
- `POST /api/investigations/:investigationId/cancel`

Polling clients should treat event data as extensible and status as a discriminated union. Future SSE will emit the same event types.
