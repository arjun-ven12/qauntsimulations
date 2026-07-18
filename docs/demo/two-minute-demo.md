# Two-minute Rift demo

This demonstration uses only current Product data. Do not paste database IDs, create a new Investigation, or imply that a hosted execution has completed.

1. Sign in and open **Dashboard**. Confirm the active organisation, the `Checkout Reliability Lab` Project, and the real Recent Investigations and Recent Findings cards. Those cards are populated from the active organisation's activity API, not fixtures.
2. Open the latest completed checkout Investigation from **Recent Investigations**. Confirm its Environment is `Local Demo Store` and its status and timestamps are shown by Rift.
3. Open the confirmed critical Finding from the Investigation. Use the existing evidence, reproduction, and final-report views to explain the delayed-payment duplicate-submission behaviour. The strongest current proof has 13 bounded Worlds, 58 evidence artifacts, and three reproductions.
4. Point out **Verify repair** on the Finding. Select an authorised READY Environment and review the bounded preflight plan: the minimal reproduction, original passing controls, adjacent regression Worlds, and selected Invariants. Do not queue a new verification during this release demonstration.

## What this proves

- Public Render fixture: verified.
- Daytona sandbox lifecycle: verified.
- Evidence-backed Rift Investigation: verified using the existing reachable `Local Demo Store` path.
- Dashboard activity, Investigation/Finding navigation, and Repair Verification Product workflow: implemented.

## What remains blocked or pending

- Daytona-to-Render execution is externally blocked by the Daytona organisation-level outbound-network policy.
- A hosted Repair Verification is pending outbound network access. The implementation must not be described as `FIX_CONFIRMED`, `DEFECT_STILL_PRESENT`, or `REGRESSION_DETECTED` without an authoritative completed verification.
- This guide does not assert a public Rift API or web deployment.

See [backup-demo-plan.md](backup-demo-plan.md) if the activity feed or a browser session is unavailable, and [release-checklist.md](release-checklist.md) for the release gate.
