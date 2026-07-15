import { demoCreateInvestigationInput, investigationProgressSchema } from '@taskos/shared-types';
import { describe, expect, it } from 'vitest';
import { MockInvestigationApi } from '../mock-investigation-api.js';

describe('MockInvestigationApi', () => {
  it('returns deterministic schema-valid progress', async () => {
    const api = new MockInvestigationApi();
    const created = await api.createInvestigation(demoCreateInvestigationInput);
    expect(investigationProgressSchema.parse(created)).toEqual(created);
    expect(created.id).toBe('investigation_demo_checkout');
    expect(await api.getInvestigation(created.id)).toEqual(created);
  });

  it('validates creation input through the shared schema', async () => {
    const api = new MockInvestigationApi();
    await expect(
      api.createInvestigation({ ...demoCreateInvestigationInput, journeyId: '' }),
    ).rejects.toThrow();
  });
});
