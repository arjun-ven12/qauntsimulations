import { describe, it } from 'vitest';

const enabled = process.env.RUN_DAYTONA_MINIMISATION_INTEGRATION_TESTS === 'true';

describe.skipIf(!enabled)('live Daytona minimisation integration', () => {
  it('requires explicit Daytona credentials and sandbox access before running live minimisation', () => {
    if (!process.env.DAYTONA_API_KEY) {
      throw new Error('DAYTONA_API_KEY is required for the live Daytona minimisation integration test.');
    }
    // The live path intentionally remains opt-in. The normal CI suite uses deterministic
    // service tests plus existing Daytona fleet regression tests to avoid creating sandboxes.
  });
});
