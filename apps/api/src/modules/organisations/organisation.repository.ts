import type { DatabaseClient } from '@taskos/database';
import type {
  OrganisationMemberRecord,
  OrganisationMembershipRecord,
  OrganisationUserRecord,
} from './organisation.types.js';

export interface OrganisationRepository {
  findMembership(
    userId: string,
    organisationId: string,
  ): Promise<OrganisationMembershipRecord | null>;
  listMembers(organisationId: string): Promise<OrganisationMemberRecord[]>;
  findUserByEmail(email: string): Promise<OrganisationUserRecord | null>;
  findMember(
    organisationId: string,
    membershipId: string,
  ): Promise<OrganisationMemberRecord | null>;
  findMemberByUser(
    organisationId: string,
    userId: string,
  ): Promise<OrganisationMemberRecord | null>;
  countOwners(organisationId: string): Promise<number>;
  createMember(input: {
    organisationId: string;
    userId: string;
    role: OrganisationMemberRecord['role'];
  }): Promise<OrganisationMemberRecord>;
  updateMemberRole(input: {
    organisationId: string;
    membershipId: string;
    role: OrganisationMemberRecord['role'];
  }): Promise<OrganisationMemberRecord | null>;
  deleteMember(organisationId: string, membershipId: string): Promise<boolean>;
}

export class PrismaOrganisationRepository implements OrganisationRepository {
  constructor(private readonly database: DatabaseClient) {}

  findMembership(userId: string, organisationId: string) {
    return this.database.organisationMember.findFirst({
      where: {
        userId,
        organisationId,
        organisation: { deletedAt: null },
        user: { deletedAt: null },
      },
      select: {
        id: true,
        role: true,
        createdAt: true,
        organisation: { select: { id: true, name: true, slug: true } },
      },
    });
  }

  listMembers(organisationId: string) {
    return this.database.organisationMember.findMany({
      where: {
        organisationId,
        organisation: { deletedAt: null },
        user: { deletedAt: null },
      },
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  findUserByEmail(email: string) {
    return this.database.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, displayName: true, email: true },
    });
  }

  findMember(organisationId: string, membershipId: string) {
    return this.database.organisationMember.findFirst({
      where: { id: membershipId, organisationId, user: { deletedAt: null } },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  findMemberByUser(organisationId: string, userId: string) {
    return this.database.organisationMember.findFirst({
      where: { organisationId, userId, user: { deletedAt: null } },
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  countOwners(organisationId: string) {
    return this.database.organisationMember.count({
      where: { organisationId, role: 'OWNER', user: { deletedAt: null } },
    });
  }

  createMember(input: {
    organisationId: string;
    userId: string;
    role: OrganisationMemberRecord['role'];
  }) {
    return this.database.organisationMember.create({
      data: input,
      select: {
        id: true,
        role: true,
        createdAt: true,
        user: { select: { id: true, displayName: true, email: true } },
      },
    });
  }

  async updateMemberRole(input: {
    organisationId: string;
    membershipId: string;
    role: OrganisationMemberRecord['role'];
  }) {
    const result = await this.database.organisationMember.updateMany({
      where: { id: input.membershipId, organisationId: input.organisationId },
      data: { role: input.role },
    });
    return result.count ? this.findMember(input.organisationId, input.membershipId) : null;
  }

  async deleteMember(organisationId: string, membershipId: string) {
    const result = await this.database.organisationMember.deleteMany({
      where: { id: membershipId, organisationId },
    });
    return result.count > 0;
  }
}
