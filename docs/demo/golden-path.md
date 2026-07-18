# Historical golden-path reference

This is a capability reference, not a claim about the currently available hosted execution path. For the release demonstration, use [two-minute-demo.md](two-minute-demo.md).

1. Configure a Project, authorised Environment, checkout Journey, and explicit Invariants.
2. TaskOS creates bounded execution Worlds and runs Playwright Journeys through the configured execution provider.
3. The delayed-response World can exercise the controlled duplicate-submission defect.
4. TaskOS collects evidence and invariant evaluations, then uses bounded controls and reproductions to support a Finding.
5. The Finding exposes Repair Verification, which prepares a minimal reproduction, controls, and bounded regression Worlds before any result is derived.

The public Render Demo Store is verified. Daytona sandbox lifecycle is verified. Daytona-to-Render execution is currently externally blocked by the Daytona organisation's outbound-network policy; this document does not claim a hosted run or hosted repair result.
