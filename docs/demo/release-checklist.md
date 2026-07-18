# TaskOS release checklist and code freeze

## Product readiness

- [x] Dashboard reads active-organisation configuration and tenant-scoped recent activity.
- [x] Recent Investigation and Finding cards navigate with IDs returned by the activity API.
- [x] Empty, loading, unavailable-activity, and permission-aware Project states have Product UI coverage.
- [x] Finding detail exposes Repair Verification discoverability for users with edit access.
- [x] Repair Verification uses persisted target Environments and a bounded preflight plan; it does not turn missing execution into a business result.

## Evidence and demo truthfulness

- [x] Existing completed checkout evidence is used as the primary demonstration proof.
- [x] Public Render fixture and Daytona sandbox lifecycle are described separately from TaskOS evidence execution.
- [x] Daytona-to-Render is labelled as an external organisation-level outbound-network block.
- [x] No hosted Investigation, hosted Finding, hosted Repair Verification, or repair outcome is claimed without immutable evidence.
- [x] The backup plan does not require a paid runtime execution, planning request, reset, deployment, or fabricated data.

## Release validation

Run before release handoff:

```sh
npx pnpm exec vitest run apps/web/src/features/dashboard
npx pnpm --filter @taskos/web typecheck
npx pnpm test
npx pnpm build
npx pnpm lint
git diff --check
git status --short
```

## Code-freeze decision

Freeze Product changes after the validation commands pass and the working tree contains only reviewed release changes. Do not add a new feature or retry Daytona-to-Render execution to satisfy this checklist. Restore or obtain organisation-level outbound HTTPS access before scheduling hosted execution proof.
