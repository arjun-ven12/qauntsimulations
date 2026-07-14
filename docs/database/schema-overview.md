# Database schema overview

The Prisma schema contains 38 relational models across identity/tenancy, project configuration, journey/scenario design, investigation/execution, evidence/findings, repair verification, and memory. PostgreSQL is configured with pooled `DATABASE_URL` for runtime and direct `DIRECT_URL` for migrations.

Queryable lifecycle, tenancy, severity, confidence, relationships, and timestamps are columns. JSON is reserved for flexible manifests, plans, world/fault parameters, expected/observed values, and causal metadata. Large evidence bytes remain outside PostgreSQL. Soft deletion is used on user-authored roots where auditability matters; dependent execution records generally cascade with their owning investigation.
