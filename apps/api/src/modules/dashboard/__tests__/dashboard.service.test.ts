import { describe, expect, it, vi } from 'vitest';
import type { DashboardRepository } from '../dashboard.repository.js';
import { DashboardService } from '../dashboard.service.js';

const context = { userId: 'user', organisationId: 'organisation', role: 'OWNER' as const, tokenVersion: 0, issuedAt: 1, expiry: 2 };
describe('Dashboard activity', () => {
  it('returns bounded, newest-first tenant activity with safe summaries', async () => {
    const repository = fakeRepository();
    const result = await new DashboardService(repository).activity(context);
    expect(result.investigations).toHaveLength(1);
    expect(result.investigations[0]).toMatchObject({ id: 'investigation-new', projectId: 'project', projectName: 'Project', findingsCount: 2 });
    expect(result.findings[0]).toMatchObject({ id: 'finding-new', investigationId: 'investigation-new', projectName: 'Project', status: null });
  });
  it('requires active-organisation VIEW_PROJECTS membership', async () => {
    await expect(new DashboardService(fakeRepository(null)).activity(context)).rejects.toMatchObject({ code: 'INSUFFICIENT_PERMISSION', statusCode: 403 });
  });
});
function fakeRepository(role: string | null = 'OWNER'): DashboardRepository {
  return {
    findMembershipRole: vi.fn().mockResolvedValue(role),
    recentInvestigations: vi.fn().mockResolvedValue([{ id: 'investigation-new', projectId: 'project', projectName: 'Project', name: 'Latest', status: 'COMPLETED', createdAt: new Date('2026-07-18T00:00:00.000Z'), completedAt: new Date('2026-07-18T00:01:00.000Z'), findingsCount: 2 }]),
    recentFindings: vi.fn().mockResolvedValue([{ id: 'finding-new', investigationId: 'investigation-new', projectId: 'project', projectName: 'Project', title: 'Finding', severity: 'CRITICAL', confidence: 'CONFIRMED', createdAt: new Date('2026-07-18T00:00:00.000Z') }]),
  };
}
