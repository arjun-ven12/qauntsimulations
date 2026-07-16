import type { UserRole } from '@taskos/shared-types';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthContext } from '../../auth/auth.types.js';
import type { InvitationRepository } from '../invitation.repository.js';
import { InvitationService } from '../invitation.service.js';
import type { InvitationAcceptanceResult, InvitationRecord } from '../invitation.types.js';

describe('InvitationService', () => {
  let repository: MemoryInvitationRepository;
  let service: InvitationService;

  beforeEach(() => {
    repository = new MemoryInvitationRepository();
    service = new InvitationService(repository, 'http://localhost:5173');
  });

  it('creates a persisted pending invitation with a hash but never persists or returns the raw token hash', async () => {
    const result = await service.create(context('OWNER'), {
      email: 'mira@example.com',
      role: 'MEMBER',
    });
    expect(result.invitation).toMatchObject({
      email: 'mira@example.com',
      role: 'MEMBER',
      status: 'PENDING',
    });
    expect(result.invitationUrl).toMatch(/^http:\/\/localhost:5173\/invitations\/accept\?token=/);
    expect(repository.lastCreate?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(repository.lastCreate).not.toHaveProperty('token');
    expect(JSON.stringify(result.invitation)).not.toMatch(/token/i);
    expect(result.delivery.method).toBe('LINK_ONLY');
  });

  it.each([
    ['ADMIN', 'ADMIN'],
    ['ADMIN', 'OWNER'],
    ['MEMBER', 'MEMBER'],
    ['VIEWER', 'VIEWER'],
    ['OWNER', 'OWNER'],
  ] as Array<[UserRole, UserRole]>)('blocks %s inviting role %s', async (actorRole, role) => {
    await expect(
      service.create(context(actorRole), { email: 'mira@example.com', role }),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('rejects existing members and duplicate pending invitations', async () => {
    repository.memberEmails.add('member@example.com');
    await expect(
      service.create(context('OWNER'), { email: 'member@example.com', role: 'MEMBER' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'MEMBERSHIP_CONFLICT' });
    repository.duplicate = true;
    await expect(
      service.create(context('OWNER'), { email: 'new@example.com', role: 'VIEWER' }),
    ).rejects.toMatchObject({ statusCode: 409, code: 'INVITATION_CONFLICT' });
  });

  it('lists only the active organisation and recipient email scopes', async () => {
    repository.records.push(
      record({ id: 'one', organisationId: 'org-1', email: 'owner@example.com' }),
      record({ id: 'two', organisationId: 'org-2', email: 'other@example.com' }),
    );
    await expect(service.listForOrganisation(context('OWNER'))).resolves.toEqual([
      expect.objectContaining({ id: 'one' }),
    ]);
    await expect(service.inbox(context('OWNER'))).resolves.toEqual([
      expect.objectContaining({ id: 'one' }),
    ]);
  });

  it('returns safe preview fields for valid and invalid tokens', async () => {
    repository.tokenRecord = record({ email: 'mira.member@example.com' });
    const preview = await service.preview('raw-token-value-with-at-least-thirty-two-characters');
    expect(preview).toMatchObject({
      state: 'PENDING',
      recipient: 'm**********@example.com',
      organisation: { name: 'World Lab' },
    });
    expect(preview).not.toHaveProperty('email');
    expect(preview).not.toHaveProperty('tokenHash');
    repository.tokenRecord = null;
    await expect(service.preview('another-raw-token-with-thirty-two-characters')).resolves.toEqual({
      state: 'INVALID',
    });
  });

  it.each([
    ['EMAIL_MISMATCH', 403],
    ['EXPIRED', 410],
    ['REVOKED', 410],
    ['DECLINED', 409],
    ['MEMBER_EXISTS', 409],
  ] as const)('maps acceptance outcome %s safely', async (outcome, statusCode) => {
    repository.acceptance = { outcome } as InvitationAcceptanceResult;
    await expect(
      service.accept(context('MEMBER'), 'raw-token-value-with-at-least-thirty-two-characters'),
    ).rejects.toMatchObject({ statusCode });
  });

  it('returns an idempotent accepted result without creating another membership', async () => {
    const invitation = record({ status: 'ACCEPTED' });
    repository.acceptance = {
      outcome: 'ALREADY_ACCEPTED',
      invitation,
      membership: { id: 'membership-1', role: 'MEMBER', organisation: invitation.organisation },
    };
    await expect(
      service.accept(context('MEMBER'), 'raw-token-value-with-at-least-thirty-two-characters'),
    ).resolves.toMatchObject({ accepted: true, idempotent: true });
  });

  it('allows the matching recipient to decline and managers to revoke', async () => {
    repository.records.push(record({ id: 'invitation-1', email: 'owner@example.com' }));
    await expect(service.decline(context('OWNER'), 'invitation-1')).resolves.toMatchObject({
      status: 'DECLINED',
    });
    repository.records[0] = record({ id: 'invitation-1' });
    await expect(service.revoke(context('OWNER'), 'invitation-1')).resolves.toMatchObject({
      status: 'REVOKED',
    });
    await expect(service.revoke(context('MEMBER'), 'invitation-1')).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

function context(role: UserRole): AuthContext {
  return { userId: role.toLowerCase(), organisationId: 'org-1', role, tokenVersion: 0 };
}

class MemoryInvitationRepository implements InvitationRepository {
  records: InvitationRecord[] = [];
  memberEmails = new Set<string>();
  duplicate = false;
  lastCreate: Parameters<InvitationRepository['createPending']>[0] | null = null;
  tokenRecord: InvitationRecord | null = null;
  acceptance: InvitationAcceptanceResult = {
    outcome: 'ACCEPTED',
    invitation: record(),
    membership: {
      id: 'membership-new',
      role: 'MEMBER',
      organisation: { id: 'org-1', name: 'World Lab', slug: 'world-lab' },
    },
  };
  async findActorMembership(_userId: string, _organisationId: string) {
    return { role: contextRole(_userId) };
  }
  async findUser(userId: string) {
    return {
      id: userId,
      email: userId === 'member' ? 'recipient@example.com' : 'owner@example.com',
    };
  }
  async findMemberByEmail(_organisationId: string, email: string) {
    return this.memberEmails.has(email) ? { id: 'member' } : null;
  }
  async createPending(input: Parameters<InvitationRepository['createPending']>[0]) {
    this.lastCreate = input;
    if (this.duplicate) return null;
    const created = record({
      organisationId: input.organisationId,
      email: input.email,
      role: input.role,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
    });
    this.records.push(created);
    return created;
  }
  async expirePending() {}
  async listForOrganisation(organisationId: string) {
    return this.records.filter((item) => item.organisationId === organisationId);
  }
  async listForRecipient(email: string) {
    return this.records.filter((item) => item.email === email);
  }
  async findByTokenHash() {
    return this.tokenRecord;
  }
  async findForRecipient(id: string, email: string) {
    return this.records.find((item) => item.id === id && item.email === email) ?? null;
  }
  async revoke(organisationId: string, id: string, now: Date) {
    const item = this.records.find(
      (record) =>
        record.organisationId === organisationId && record.id === id && record.status === 'PENDING',
    );
    if (!item) return null;
    item.status = 'REVOKED';
    item.revokedAt = now;
    return item;
  }
  async decline(email: string, id: string, now: Date) {
    const item = this.records.find(
      (record) => record.email === email && record.id === id && record.status === 'PENDING',
    );
    if (!item) return null;
    item.status = 'DECLINED';
    item.declinedAt = now;
    return item;
  }
  async accept() {
    return this.acceptance;
  }
}

function contextRole(userId: string): UserRole {
  return userId.toUpperCase() as UserRole;
}
function record(overrides: Partial<InvitationRecord> = {}): InvitationRecord {
  const now = new Date('2026-07-16T00:00:00.000Z');
  return {
    id: 'invitation-1',
    organisationId: 'org-1',
    email: 'recipient@example.com',
    role: 'MEMBER',
    tokenHash: 'a'.repeat(64),
    status: 'PENDING',
    expiresAt: new Date('2026-07-23T00:00:00.000Z'),
    acceptedAt: null,
    declinedAt: null,
    revokedAt: null,
    createdAt: now,
    updatedAt: now,
    organisation: { id: 'org-1', name: 'World Lab', slug: 'world-lab' },
    invitedBy: { id: 'actor', displayName: 'Owner' },
    ...overrides,
  };
}
