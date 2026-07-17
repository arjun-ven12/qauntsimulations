import { demoCreateInvestigationInput, investigationProgressSchema } from '@taskos/shared-types';
import { describe, expect, it } from 'vitest';
import { MOCK_FINDING_ID, MOCK_INVESTIGATION_ID, MockInvestigationApi } from '../mock-investigation-api.js';

describe('MockInvestigationApi', () => {
  it('returns deterministic schema-valid progress', async () => {
    const api = new MockInvestigationApi();
    const created = await api.createInvestigation(demoCreateInvestigationInput);
    expect(investigationProgressSchema.parse(created)).toEqual(created);
    expect(created.id).toBe(MOCK_INVESTIGATION_ID);
    expect(await api.getInvestigation(created.id)).toEqual(created);
  });

  it('validates creation input through the shared schema', async () => {
    const api = new MockInvestigationApi();
    await expect(
      api.createInvestigation({ ...demoCreateInvestigationInput, journeyId: '' }),
    ).rejects.toThrow();
  });

  it('returns sanitized real-shape runtime data for Prompt 9 UI tests', async () => {
    const api = new MockInvestigationApi();
    expect(await api.getWorlds(MOCK_INVESTIGATION_ID)).toHaveLength(13);
    expect(await api.listFindings(MOCK_INVESTIGATION_ID)).toHaveLength(1);
    expect((await api.getFindingDetail(MOCK_INVESTIGATION_ID, MOCK_FINDING_ID)).evidence.some((artifact) => artifact.type === 'FINAL_REPORT')).toBe(true);
    expect((await api.getEvidence(MOCK_INVESTIGATION_ID)).every((artifact) => !artifact.path.includes('/Users/'))).toBe(true);
  });
});
