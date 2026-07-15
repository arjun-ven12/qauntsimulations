import { ApplicationError } from '../../core/errors/application-error.js';
import type { AuthContext } from '../auth/auth.types.js';
import { hasOrganisationPermission, permissionsForRole } from './organisation.permissions.js';
import type { OrganisationRepository } from './organisation.repository.js';
import type {
  CurrentOrganisationResponse,
  OrganisationMemberResponse,
  OrganisationMembershipRecord,
} from './organisation.types.js';

export class OrganisationService {
  constructor(private readonly repository: OrganisationRepository) {}

  async current(context: AuthContext): Promise<CurrentOrganisationResponse> {
    const membership = await this.requireMembership(context);
    return {
      organisation: membership.organisation,
      membership: {
        id: membership.id,
        role: membership.role,
        joinedAt: membership.createdAt.toISOString(),
      },
      permissions: permissionsForRole(membership.role),
    };
  }

  async members(context: AuthContext): Promise<OrganisationMemberResponse[]> {
    const membership = await this.requireMembership(context);
    if (!hasOrganisationPermission(membership.role, 'VIEW_MEMBERS')) {
      throw new ApplicationError(
        'INSUFFICIENT_PERMISSION',
        'Your organisation role does not permit viewing members',
        403,
      );
    }
    return (await this.repository.listMembers(membership.organisation.id)).map((member) => ({
      id: member.id,
      role: member.role,
      joinedAt: member.createdAt.toISOString(),
      user: member.user,
    }));
  }

  private async requireMembership(context: AuthContext): Promise<OrganisationMembershipRecord> {
    if (!context.organisationId) {
      throw new ApplicationError(
        'ORGANISATION_REQUIRED',
        'An organisation context is required',
        403,
      );
    }
    const membership = await this.repository.findMembership(context.userId, context.organisationId);
    if (!membership) {
      throw new ApplicationError(
        'ORGANISATION_ACCESS_DENIED',
        'You do not have access to this organisation',
        403,
      );
    }
    return membership;
  }
}
