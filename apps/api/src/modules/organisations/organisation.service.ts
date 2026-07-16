import { ApplicationError } from '../../core/errors/application-error.js';
import type { AuthContext } from '../auth/auth.types.js';
import { hasOrganisationPermission, permissionsForRole } from './organisation.permissions.js';
import type { OrganisationRepository } from './organisation.repository.js';
import type {
  CurrentOrganisationResponse,
  AddOrganisationMemberInput,
  OrganisationMemberRecord,
  OrganisationMemberResponse,
  OrganisationMembershipRecord,
  UpdateOrganisationMemberInput,
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

  async addMember(
    context: AuthContext,
    input: AddOrganisationMemberInput,
  ): Promise<OrganisationMemberResponse> {
    const actor = await this.requireManagementPermission(context);
    this.assertRoleAssignmentAllowed(actor.role, input.role);
    const user = await this.repository.findUserByEmail(input.email);
    if (!user) {
      throw new ApplicationError(
        'USER_NOT_FOUND',
        'No registered TaskOS user was found with that email address',
        404,
      );
    }
    if (await this.repository.findMemberByUser(actor.organisation.id, user.id)) {
      throw new ApplicationError(
        'MEMBERSHIP_CONFLICT',
        'That user is already a member of this organisation',
        409,
      );
    }
    try {
      return mapMember(
        await this.repository.createMember({
          organisationId: actor.organisation.id,
          userId: user.id,
          role: input.role,
        }),
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ApplicationError(
          'MEMBERSHIP_CONFLICT',
          'That user is already a member of this organisation',
          409,
        );
      }
      throw error;
    }
  }

  async updateMember(
    context: AuthContext,
    membershipId: string,
    input: UpdateOrganisationMemberInput,
  ): Promise<OrganisationMemberResponse> {
    const actor = await this.requireManagementPermission(context);
    const target = await this.requireTargetMember(actor.organisation.id, membershipId);
    this.assertMayManageTarget(actor, target.id, target.role, input.role);
    await this.assertOwnerContinuity(actor.organisation.id, target.role, input.role);
    const updated = await this.repository.updateMemberRole({
      organisationId: actor.organisation.id,
      membershipId,
      role: input.role,
    });
    if (!updated) throw memberNotFound();
    return mapMember(updated);
  }

  async removeMember(context: AuthContext, membershipId: string): Promise<void> {
    const actor = await this.requireManagementPermission(context);
    const target = await this.requireTargetMember(actor.organisation.id, membershipId);
    this.assertMayManageTarget(actor, target.id, target.role);
    await this.assertOwnerContinuity(actor.organisation.id, target.role, undefined);
    if (!(await this.repository.deleteMember(actor.organisation.id, membershipId))) {
      throw memberNotFound();
    }
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

  private async requireManagementPermission(context: AuthContext) {
    const membership = await this.requireMembership(context);
    if (!hasOrganisationPermission(membership.role, 'MANAGE_MEMBERS')) {
      throw new ApplicationError(
        'INSUFFICIENT_PERMISSION',
        'Your organisation role does not permit managing members',
        403,
      );
    }
    return membership;
  }

  private async requireTargetMember(organisationId: string, membershipId: string) {
    const member = await this.repository.findMember(organisationId, membershipId);
    if (!member) throw memberNotFound();
    return member;
  }

  private assertRoleAssignmentAllowed(
    actorRole: OrganisationMembershipRecord['role'],
    role: OrganisationMemberResponse['role'],
  ) {
    if (actorRole !== 'OWNER' && role === 'OWNER') {
      throw new ApplicationError(
        'OWNER_ROLE_RESTRICTED',
        'Only an Owner may assign the Owner role',
        403,
      );
    }
  }

  private assertMayManageTarget(
    actor: OrganisationMembershipRecord,
    targetMembershipId: string,
    targetRole: OrganisationMemberResponse['role'],
    nextRole?: OrganisationMemberResponse['role'],
  ) {
    if (actor.role === 'ADMIN' && (targetRole === 'OWNER' || nextRole === 'OWNER')) {
      throw new ApplicationError(
        'OWNER_ROLE_RESTRICTED',
        'Administrators cannot change or remove Owners',
        403,
      );
    }
    if (actor.role !== 'OWNER' && targetMembershipId === actor.id) {
      throw new ApplicationError(
        'SELF_MANAGEMENT_RESTRICTED',
        'Administrators cannot change their own membership',
        403,
      );
    }
  }

  private async assertOwnerContinuity(
    organisationId: string,
    currentRole: OrganisationMemberResponse['role'],
    nextRole: OrganisationMemberResponse['role'] | undefined,
  ) {
    if (currentRole === 'OWNER' && nextRole !== 'OWNER') {
      if ((await this.repository.countOwners(organisationId)) <= 1) {
        throw new ApplicationError(
          'LAST_OWNER_REQUIRED',
          'The last Owner cannot be removed or demoted',
          409,
        );
      }
    }
  }
}

function mapMember(member: OrganisationMemberRecord): OrganisationMemberResponse {
  return {
    id: member.id,
    role: member.role,
    joinedAt: member.createdAt.toISOString(),
    user: member.user,
  };
}

function memberNotFound() {
  return new ApplicationError('MEMBER_NOT_FOUND', 'Organisation member was not found', 404);
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}
