# Two-minute TaskOS demo

1. Sign in and open **Dashboard**. Confirm the active organisation and recent activity are populated from live API data.
2. Open the latest Investigation from **Recent Investigations**, then open its Finding.
3. From the Finding, choose **Verify repair**. Select the repaired Environment, acknowledge authorised testing, and review the bounded preflight plan.
4. Queue Repair Verification and use the returned verification page to follow its status. The Finding remains the entry point for verification history.

## Backup plan

If no recent activity is available, open a Project from Dashboard, confirm Environment/Journey/Invariant readiness, then launch a normal Scenario Investigation. Do not use hardcoded URLs or database IDs. If runtime execution is unavailable, show the prepared plan and existing Finding detail instead of claiming a completed run.

## Release checklist

- Dashboard shows only API-returned activity and links use returned IDs.
- Investigation links open `/investigations/:investigationId`.
- Finding links open `/investigations/:investigationId/findings/:findingId`.
- Repair Verification is launched from a Finding and retains the Finding context.
- Empty, loading, error, and permission states are verified before presenting the demo.
