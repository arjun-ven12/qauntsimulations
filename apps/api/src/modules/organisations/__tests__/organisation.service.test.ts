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

  it('MEMBER may view the organisation and member directory without mutation permission', async () => {
    const repository = repositoryFor('MEMBER');
    const service = new OrganisationService(repository);

    await expect(service.current(context('MEMBER'))).resolves.toMatchObject({
      membership: { role: 'MEMBER' },
      permissions: [
        'VIEW_ORGANISATION',
        'VIEW_MEMBERS',
        'VIEW_PROJECTS',
        'CREATE_PROJECTS',
        'EDIT_PROJECTS',
      ],
    });
    await expect(service.members(context('MEMBER'))).resolves.toHaveLength(1);
    await expect(
      service.addMember(context('MEMBER'), { email: 'new@example.com', role: 'MEMBER' }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it.each(['VIEWER'] as const)('%s may view the organisation but not its members', async (role) => {
    const repository = repositoryFor(role);
    const service = new OrganisationService(repository);

    await expect(service.current(context(role))).resolves.toMatchObject({
      organisation: { id: 'org-1' },
      membership: { role },
      permissions: ['VIEW_ORGANISATION', 'VIEW_PROJECTS'],
    });
    await expect(service.members(context(role))).rejects.toMatchObject({
      code: 'INSUFFICIENT_PERMISSION',
      statusCode: 403,
    });
    expect(repository.listMembers).not.toHaveBeenCalled();
  });

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

  it('adds a registered user by normalised email and rejects unknown or duplicate users', async () => {
    const repository = repositoryFor('OWNER');
    const service = new OrganisationService(repository);

    await expect(
      service.addMember(context('OWNER'), { email: 'new@example.com', role: 'MEMBER' }),
    ).resolves.toMatchObject({ user: { email: 'new@example.com' }, role: 'MEMBER' });
    expect(repository.createMember).toHaveBeenCalledWith({
      organisationId: 'org-1',
      userId: 'new-user',
      role: 'MEMBER',
    });

    repository.findUserByEmail = vi.fn().mockResolvedValue(null);
    await expect(
      service.addMember(context('OWNER'), { email: 'missing@example.com', role: 'VIEWER' }),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND', statusCode: 404 });

    repository.findUserByEmail = vi.fn().mockResolvedValue({ id: 'new-user' });
    repository.findMemberByUser = vi.fn().mockResolvedValue({ id: 'existing' });
    await expect(
      service.addMember(context('OWNER'), { email: 'new@example.com', role: 'MEMBER' }),
    ).rejects.toMatchObject({ code: 'MEMBERSHIP_CONFLICT', statusCode: 409 });
  });

  it('enforces role boundaries, tenant scope, and last-Owner continuity during updates', async () => {
    const repository = repositoryFor('OWNER');
    const target = memberRecord('target-owner', 'OWNER', 'other-owner');
    repository.findMember = vi.fn().mockResolvedValue(target);
    repository.updateMemberRole = vi.fn().mockResolvedValue({ ...target, role: 'ADMIN' });
    repository.countOwners = vi.fn().mockResolvedValue(2);
    const service = new OrganisationService(repository);

    await expect(
      service.updateMember(context('OWNER'), 'target-owner', { role: 'ADMIN' }),
    ).resolves.toMatchObject({ id: 'target-owner', role: 'ADMIN' });

    repository.countOwners = vi.fn().mockResolvedValue(1);
    await expect(
      service.updateMember(context('OWNER'), 'target-owner', { role: 'MEMBER' }),
    ).rejects.toMatchObject({ code: 'LAST_OWNER_REQUIRED', statusCode: 409 });

    const adminRepository = repositoryFor('ADMIN');
    adminRepository.findMember = vi.fn().mockResolvedValue(target);
    const adminService = new OrganisationService(adminRepository);
    await expect(
      adminService.updateMember(context('ADMIN'), 'target-owner', { role: 'MEMBER' }),
    ).rejects.toMatchObject({ code: 'OWNER_ROLE_RESTRICTED', statusCode: 403 });
    await expect(
      adminService.addMember(context('ADMIN'), { email: 'new@example.com', role: 'OWNER' }),
    ).rejects.toMatchObject({ code: 'OWNER_ROLE_RESTRICTED', statusCode: 403 });

    repository.findMember = vi.fn().mockResolvedValue(null);
    await expect(
      service.updateMember(context('OWNER'), 'other-org-member', { role: 'MEMBER' }),
    ).rejects.toMatchObject({ code: 'MEMBER_NOT_FOUND', statusCode: 404 });
  });

  it('removes an eligible member but blocks unauthorised and last-Owner removal', async () => {
    const repository = repositoryFor('OWNER');
    repository.findMember = vi.fn().mockResolvedValue(memberRecord('member-2', 'MEMBER'));
    repository.deleteMember = vi.fn().mockResolvedValue(true);
    const service = new OrganisationService(repository);
    await expect(service.removeMember(context('OWNER'), 'member-2')).resolves.toBeUndefined();
    expect(repository.deleteMember).toHaveBeenCalledWith('org-1', 'member-2');

    repository.findMember = vi.fn().mockResolvedValue(memberRecord('owner-2', 'OWNER'));
    repository.countOwners = vi.fn().mockResolvedValue(1);
    await expect(service.removeMember(context('OWNER'), 'owner-2')).rejects.toMatchObject({
      code: 'LAST_OWNER_REQUIRED',
      statusCode: 409,
    });

    const memberService = new OrganisationService(repositoryFor('MEMBER'));
    await expect(memberService.removeMember(context('MEMBER'), 'member-2')).rejects.toMatchObject({
      statusCode: 403,
    });
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
    findUserByEmail: vi.fn().mockResolvedValue({
      id: 'new-user',
      displayName: 'New User',
      email: 'new@example.com',
    }),
    findMember: vi.fn().mockResolvedValue(null),
    findMemberByUser: vi.fn().mockResolvedValue(null),
    countOwners: vi.fn().mockResolvedValue(1),
    createMember: vi.fn().mockResolvedValue({
      id: 'membership-new',
      role: 'MEMBER',
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
      user: { id: 'new-user', displayName: 'New User', email: 'new@example.com' },
    }),
    updateMemberRole: vi.fn().mockResolvedValue(null),
    deleteMember: vi.fn().mockResolvedValue(false),
  };
}

function memberRecord(id: string, role: UserRole, userId = `user-${id}`) {
  return {
    id,
    role,
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
    user: { id: userId, displayName: `User ${id}`, email: `${id}@example.com` },
  };
}
