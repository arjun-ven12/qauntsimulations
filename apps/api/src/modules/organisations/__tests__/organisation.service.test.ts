import type { UserRole } from '@taskos/shared-types';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationError } from '../../../core/errors/application-error.js';
import type { AuthContext } from '../../auth/auth.types.js';
import type { OrganisationRepository } from '../organisation.repository.js';
import { OrganisationService } from '../organisation.service.js';
import type { OrganisationMembershipRecord } from '../organisation.types.js';

describe('OrganisationService authorization', () => {
  it.each(['OWNER', 'ADMIN'] as const)(
    '%s may view the tenant-scoped member list',
    async (role) => {
      const repository = repositoryFor(role);
      const service = new OrganisationService(repository);

      const result = await service.members(context(role));

      expect(result).toEqual([
        expect.objectContaining({
          role: 'MEMBER',
          user: { id: 'member-1', displayName: 'Member One', email: 'member@example.com' },
        }),
      ]);
      expect(repository.listMembers).toHaveBeenCalledWith('org-1');
    },
  );

  it.each(['MEMBER', 'VIEWER'] as const)(
    '%s may view the organisation but not its members',
    async (role) => {
      const repository = repositoryFor(role);
      const service = new OrganisationService(repository);

      await expect(service.current(context(role))).resolves.toMatchObject({
        organisation: { id: 'org-1' },
        membership: { role },
        permissions: ['VIEW_ORGANISATION'],
      });
      await expect(service.members(context(role))).rejects.toMatchObject({
        code: 'INSUFFICIENT_PERMISSION',
        statusCode: 403,
      });
      expect(repository.listMembers).not.toHaveBeenCalled();
    },
  );

  it('rejects missing and cross-organisation membership without querying members', async () => {
    const repository = repositoryFor('OWNER');
    repository.findMembership = vi.fn().mockResolvedValue(null);
    const service = new OrganisationService(repository);

    await expect(service.members(context('OWNER'))).rejects.toBeInstanceOf(ApplicationError);
    await expect(
      service.current({ ...context('OWNER'), organisationId: undefined }),
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(repository.listMembers).not.toHaveBeenCalled();
  });
});

function context(role: UserRole): AuthContext {
  return { userId: 'user-1', organisationId: 'org-1', role, tokenVersion: 0 };
}

function repositoryFor(role: UserRole): OrganisationRepository & {
  findMembership: ReturnType<typeof vi.fn>;
  listMembers: ReturnType<typeof vi.fn>;
} {
  const membership: OrganisationMembershipRecord = {
    id: 'membership-1',
    role,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    organisation: { id: 'org-1', name: 'World Lab', slug: 'world-lab' },
  };
  return {
    findMembership: vi.fn().mockResolvedValue(membership),
    listMembers: vi.fn().mockResolvedValue([
      {
        id: 'membership-2',
        role: 'MEMBER',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        user: { id: 'member-1', displayName: 'Member One', email: 'member@example.com' },
      },
    ]),
  };
}
