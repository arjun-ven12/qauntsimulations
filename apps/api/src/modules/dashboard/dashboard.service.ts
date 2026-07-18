import { ApplicationError } from '../../core/errors/application-error.js';
import type { AuthContext } from '../auth/auth.types.js';
import { hasOrganisationPermission } from '../organisations/organisation.permissions.js';
import type { DashboardRepository } from './dashboard.repository.js';
import { dashboardActivityResponseSchema } from './dashboard.schema.js';

export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}
  async activity(context: AuthContext) {
    if (!context.organisationId) throw new ApplicationError('ORGANISATION_REQUIRED', 'An organisation context is required', 403);
    const role = await this.repository.findMembershipRole(context.organisationId, context.userId);
    if (!role || !hasOrganisationPermission(role as AuthContext['role'], 'VIEW_PROJECTS')) throw new ApplicationError('INSUFFICIENT_PERMISSION', 'Your organisation role does not permit dashboard activity access', 403);
    const [investigations, findings] = await Promise.all([this.repository.recentInvestigations(context.organisationId), this.repository.recentFindings(context.organisationId)]);
    return dashboardActivityResponseSchema.parse({ investigations: investigations.map((item) => ({ ...item, createdAt: item.createdAt.toISOString(), completedAt: item.completedAt?.toISOString() ?? null })), findings: findings.map((item) => ({ ...item, status: null, createdAt: item.createdAt.toISOString() })) });
  }
}
