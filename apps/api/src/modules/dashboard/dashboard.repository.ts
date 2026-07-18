import type { DatabaseClient } from '@taskos/database';

export interface DashboardRepository {
  findMembershipRole(organisationId: string, userId: string): Promise<string | null>;
  recentInvestigations(organisationId: string): Promise<Array<{ id: string; projectId: string; projectName: string; name: string; status: string; createdAt: Date; completedAt: Date | null; findingsCount: number }>>;
  recentFindings(organisationId: string): Promise<Array<{ id: string; investigationId: string; projectId: string; projectName: string; title: string; severity: string | null; confidence: string | number | null; createdAt: Date }>>;
}

export class PrismaDashboardRepository implements DashboardRepository {
  constructor(private readonly database: DatabaseClient) {}
  async findMembershipRole(organisationId: string, userId: string) {
    const membership = await this.database.organisationMember.findFirst({ where: { organisationId, userId, organisation: { deletedAt: null }, user: { deletedAt: null } }, select: { role: true } });
    return membership ? String(membership.role) : null;
  }
  async recentInvestigations(organisationId: string) {
    const records = await this.database.investigation.findMany({ where: { organisationId, project: { deletedAt: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 5, select: { id: true, projectId: true, name: true, status: true, createdAt: true, completedAt: true, project: { select: { name: true } }, _count: { select: { findings: { where: { deletedAt: null } } } } } });
    return records.map((record) => ({ id: record.id, projectId: record.projectId, projectName: record.project.name, name: record.name, status: String(record.status), createdAt: record.createdAt, completedAt: record.completedAt, findingsCount: record._count.findings }));
  }
  async recentFindings(organisationId: string) {
    const records = await this.database.finding.findMany({ where: { organisationId, deletedAt: null, project: { deletedAt: null } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 5, select: { id: true, investigationId: true, projectId: true, title: true, severity: true, confidence: true, createdAt: true, project: { select: { name: true } } } });
    return records.map((record) => ({ id: record.id, investigationId: record.investigationId, projectId: record.projectId, projectName: record.project.name, title: record.title, severity: String(record.severity), confidence: String(record.confidence), createdAt: record.createdAt }));
  }
}
