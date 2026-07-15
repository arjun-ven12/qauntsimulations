import type { DatabaseClient } from '@taskos/database';
import type {
  OrganisationMemberRecord,
  OrganisationMembershipRecord,
} from './organisation.types.js';

export interface OrganisationRepository {
  findMembership(
    userId: string,
    organisationId: string,
  ): Promise<OrganisationMembershipRecord | null>;
  listMembers(organisationId: string): Promise<OrganisationMemberRecord[]>;
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
}
