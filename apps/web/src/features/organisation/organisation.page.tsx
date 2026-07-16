import type { UserRole } from '@taskos/shared-types';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, ShieldAlert, Trash2, Users, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { PageHeading } from '../../components/page-heading.js';
import {
  OrganisationApiError,
  organisationApi,
  organisationRoles,
} from '../../services/organisation-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { InvitationApiError, invitationApi } from '../../services/invitation-api.js';
import { primaryButton, secondaryButton } from '../projects/project-ui.js';

export function OrganisationPage() {
  const permissions = useAuthStore((state) => state.permissions);
  const currentUser = useAuthStore((state) => state.user);
  const canViewMembers = permissions.includes('VIEW_MEMBERS');
  const canManageMembers = permissions.includes('MANAGE_MEMBERS');
  const queryClient = useQueryClient();
  const [showAddMember, setShowAddMember] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<UserRole>('MEMBER');
  const [formError, setFormError] = useState('');
  const [status, setStatus] = useState('');
  const [adding, setAdding] = useState(false);
  const [updatingId, setUpdatingId] = useState('');
  const [removingId, setRemovingId] = useState('');
  const [revokingId, setRevokingId] = useState('');
  const [invitationLink, setInvitationLink] = useState('');
  const addInFlight = useRef(false);
  const current = useQuery({
    queryKey: ['organisation', 'current'],
    queryFn: () => organisationApi.current(),
  });
  const members = useQuery({
    queryKey: ['organisation', 'members'],
    queryFn: () => organisationApi.members(),
    enabled: canViewMembers,
  });
  const invitations = useQuery({
    queryKey: ['organisation', 'invitations'],
    queryFn: () => invitationApi.managerList(),
    enabled: canManageMembers,
  });

  if (current.isPending) return <OrganisationLoading />;
  if (current.isError) {
    return (
      <OrganisationMessage
        description="WorldLab could not load your organisation. Try again in a moment."
        title="Organisation unavailable"
      />
    );
  }

  const assignableRoles = organisationRoles.filter((item) =>
    current.data.membership.role === 'OWNER'
      ? item !== 'OWNER'
      : item === 'MEMBER' || item === 'VIEWER',
  );

  async function addMember(event: React.FormEvent) {
    event.preventDefault();
    if (addInFlight.current) return;
    const normalisedEmail = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalisedEmail)) {
      setFormError('Enter a valid email address.');
      return;
    }
    addInFlight.current = true;
    setAdding(true);
    setFormError('');
    setStatus('');
    try {
      const created = await invitationApi.create({ email: normalisedEmail, role });
      setInvitationLink(created.invitationUrl);
      await queryClient.invalidateQueries({ queryKey: ['organisation', 'invitations'] });
      await queryClient.invalidateQueries({ queryKey: ['invitations', 'inbox'] });
      setEmail('');
      setRole('MEMBER');
      setShowAddMember(false);
      setStatus('Invitation created and persisted.');
    } catch (error) {
      setFormError(
        error instanceof InvitationApiError
          ? error.message
          : 'WorldLab could not create this invitation.',
      );
    } finally {
      addInFlight.current = false;
      setAdding(false);
    }
  }

  async function revokeInvitation(invitationId: string) {
    setRevokingId(invitationId);
    setStatus('');
    try {
      await invitationApi.revoke(invitationId);
      await queryClient.invalidateQueries({ queryKey: ['organisation', 'invitations'] });
      setStatus('Invitation revoked.');
    } catch (error) {
      setStatus(
        error instanceof InvitationApiError
          ? error.message
          : 'WorldLab could not revoke this invitation.',
      );
    } finally {
      setRevokingId('');
    }
  }

  async function changeRole(membershipId: string, nextRole: UserRole) {
    setUpdatingId(membershipId);
    setStatus('');
    try {
      await organisationApi.updateMember(membershipId, nextRole);
      await queryClient.invalidateQueries({ queryKey: ['organisation', 'members'] });
      setStatus('Member role updated.');
    } catch (error) {
      setStatus(
        error instanceof OrganisationApiError
          ? error.message
          : 'WorldLab could not update this role.',
      );
    } finally {
      setUpdatingId('');
    }
  }

  async function removeMember(membershipId: string, displayName: string) {
    if (!window.confirm(`Remove ${displayName} from this organisation?`)) return;
    setRemovingId(membershipId);
    setStatus('');
    try {
      await organisationApi.removeMember(membershipId);
      await queryClient.invalidateQueries({ queryKey: ['organisation', 'members'] });
      setStatus('Member removed.');
    } catch (error) {
      setStatus(
        error instanceof OrganisationApiError
          ? error.message
          : 'WorldLab could not remove this member.',
      );
    } finally {
      setRemovingId('');
    }
  }

  return (
    <section aria-labelledby="organisation-heading">
      <PageHeading
        description="Membership and access for your current WorldLab organisation."
        eyebrow="Settings"
        title={current.data.organisation.name}
      />
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="card">
          <div className="eyebrow">Current organisation</div>
          <h2 className="mt-3 text-xl font-bold" id="organisation-heading">
            {current.data.organisation.name}
          </h2>
          <p className="mt-2 text-sm text-slate-400">{current.data.organisation.slug}</p>
        </div>
        <div className="card">
          <div className="eyebrow">Your role</div>
          <p className="mt-3 text-xl font-bold" data-testid="current-role">
            {current.data.membership.role}
          </p>
          <p className="mt-2 text-sm text-slate-400">Permissions are enforced by the API.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users aria-hidden="true" className="text-cyan" size={21} />
          <h2 className="text-xl font-bold">Members</h2>
        </div>
        {canManageMembers ? (
          <button
            className={primaryButton}
            onClick={() => {
              setShowAddMember((visible) => !visible);
              setFormError('');
            }}
            type="button"
          >
            <Plus aria-hidden="true" className="mr-2" size={17} /> Invite member
          </button>
        ) : null}
      </div>

      {canManageMembers && showAddMember ? (
        <form
          aria-labelledby="add-member-title"
          className="card mb-5"
          noValidate
          onSubmit={(event) => void addMember(event)}
        >
          <h3 className="text-lg font-bold" id="add-member-title">
            Invite member
          </h3>
          <p className="mt-1 text-sm text-slate-400">
            Create a persisted invitation. External email delivery is not configured, so share the
            one-time secure link after creation.
          </p>
          <div className="mt-4 grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_12rem_auto] md:items-end">
            <label className="min-w-0 text-sm font-bold">
              Recipient email
              <input
                aria-label="Recipient email"
                aria-describedby={formError ? 'add-member-error' : undefined}
                aria-invalid={Boolean(formError)}
                className="mt-2 w-full font-normal"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </label>
            <label className="text-sm font-bold" htmlFor="new-member-role">
              Role
              <select
                aria-label="New member role"
                className="mt-2 w-full font-normal"
                id="new-member-role"
                onChange={(event) => setRole(event.target.value as UserRole)}
                value={role}
              >
                {assignableRoles.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
            <button className={primaryButton} disabled={adding} type="submit">
              {adding ? 'Creating invitation…' : 'Create invitation'}
            </button>
          </div>
          {formError ? (
            <p className="mt-3 text-sm text-red-300" id="add-member-error" role="alert">
              {formError}
            </p>
          ) : null}
        </form>
      ) : null}

      {invitationLink ? (
        <section className="card mb-5 border-cyan/30" aria-labelledby="one-time-link-title">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold" id="one-time-link-title">
                One-time invitation link
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                External email delivery is not configured. Share this secure invitation link with
                the recipient. It cannot be reconstructed after dismissal or refresh.
              </p>
            </div>
            <button
              aria-label="Dismiss invitation link"
              className={secondaryButton}
              onClick={() => setInvitationLink('')}
              type="button"
            >
              <X aria-hidden="true" size={17} />
            </button>
          </div>
          <button
            className={`${primaryButton} mt-4`}
            onClick={() =>
              void navigator.clipboard
                .writeText(invitationLink)
                .then(() => setStatus('Invitation link copied.'))
            }
            type="button"
          >
            <Copy aria-hidden="true" className="mr-2" size={17} /> Copy invitation link
          </button>
        </section>
      ) : null}

      {canManageMembers ? (
        <section className="mb-8" aria-labelledby="pending-invitations-heading">
          <h2 className="mb-3 text-xl font-bold" id="pending-invitations-heading">
            Pending Invitations
          </h2>
          {invitations.isPending ? (
            <p className="text-sm text-slate-400" role="status">
              Loading invitations…
            </p>
          ) : invitations.isError ? (
            <OrganisationMessage
              title="Invitations unavailable"
              description="The invitation list could not be loaded."
            />
          ) : invitations.data.length === 0 ? (
            <p className="card text-sm text-slate-400">No organisation invitations yet.</p>
          ) : (
            <ul className="grid gap-3" data-testid="pending-invitations">
              {invitations.data.map((invitation) => (
                <li
                  className="card grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center"
                  key={invitation.id}
                >
                  <div className="min-w-0">
                    <h3 className="truncate font-bold">{invitation.email}</h3>
                    <p className="mt-1 text-sm text-slate-400">
                      {invitation.role} · Invited by {invitation.inviter.displayName}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Created {new Date(invitation.createdAt).toLocaleDateString()} · Expires{' '}
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className={`w-fit rounded-full border px-3 py-1 text-xs font-bold ${invitation.status === 'PENDING' ? 'border-cyan/40 text-cyan' : 'border-slate-700 text-slate-400'}`}
                  >
                    {invitation.status}
                  </span>
                  {invitation.status === 'PENDING' ? (
                    <button
                      aria-label={`Revoke invitation for ${invitation.email}`}
                      className={secondaryButton}
                      disabled={revokingId === invitation.id}
                      onClick={() => void revokeInvitation(invitation.id)}
                      type="button"
                    >
                      {revokingId === invitation.id ? 'Revoking…' : 'Revoke'}
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {!canManageMembers && canViewMembers ? (
        <p className="mb-4 text-sm text-slate-400" role="status">
          Your role can view this directory but cannot change organisation memberships.
        </p>
      ) : null}
      {status ? (
        <p className="mb-4 text-sm text-cyan" role="status">
          {status}
        </p>
      ) : null}
      {!canViewMembers ? (
        <AccessDenied description="Your role can view organisation details but not the member directory." />
      ) : members.isPending ? (
        <p aria-live="polite" className="text-sm text-slate-400">
          Loading members…
        </p>
      ) : members.isError &&
        members.error instanceof OrganisationApiError &&
        members.error.status === 403 ? (
        <AccessDenied
          description="The API denied access to this organisation member directory."
          alert
        />
      ) : members.isError ? (
        <OrganisationMessage
          description="The member directory could not be loaded."
          title="Members unavailable"
        />
      ) : members.data.length === 0 ? (
        <p className="card text-sm text-slate-400">No organisation members were found.</p>
      ) : (
        <ul className="grid gap-3" data-testid="member-list">
          {members.data.map((member) => {
            const isCurrentUser = member.user.id === currentUser?.id;
            const actorIsAdmin = current.data.membership.role === 'ADMIN';
            const canManageTarget =
              canManageMembers && !isCurrentUser && !(actorIsAdmin && member.role === 'OWNER');
            return (
              <li
                className="card grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_10rem_auto] md:items-center"
                data-testid="member-row"
                key={member.id}
              >
                <div className="min-w-0">
                  <h3 className="truncate font-bold">{member.user.displayName}</h3>
                  <p className="truncate text-sm text-slate-400">{member.user.email}</p>
                  <p className="mt-1 text-xs text-slate-500">Active member</p>
                </div>
                {canManageTarget ? (
                  <label className="text-xs font-bold text-slate-400">
                    Role for {member.user.displayName}
                    <select
                      aria-label={`Role for ${member.user.displayName}`}
                      className="mt-1 w-full text-sm text-slate-100"
                      disabled={updatingId === member.id || removingId === member.id}
                      onChange={(event) =>
                        void changeRole(member.id, event.target.value as UserRole)
                      }
                      value={member.role}
                    >
                      {assignableRoles.map((item) => (
                        <option key={item} value={item}>
                          {item}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span className="w-fit rounded-full border border-slate-700 px-3 py-1 text-xs font-bold text-slate-300">
                    {member.role}
                  </span>
                )}
                {canManageTarget ? (
                  <button
                    aria-label={`Remove ${member.user.displayName}`}
                    className={`${secondaryButton} px-3 text-red-200`}
                    disabled={updatingId === member.id || removingId === member.id}
                    onClick={() => void removeMember(member.id, member.user.displayName)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" className="mr-2" size={17} />
                    {removingId === member.id ? 'Removing…' : 'Remove'}
                  </button>
                ) : (
                  <span className="text-xs text-slate-500">
                    {isCurrentUser ? 'Current user' : 'Protected role'}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function AccessDenied({ description, alert = false }: { description: string; alert?: boolean }) {
  return (
    <div className="card" data-testid="members-access-denied" role={alert ? 'alert' : 'status'}>
      <div className="flex items-start gap-3">
        <ShieldAlert aria-hidden="true" className="mt-0.5 text-amber-300" size={20} />
        <div>
          <h3 className="font-bold">Member list restricted</h3>
          <p className="mt-1 text-sm text-slate-400">{description}</p>
        </div>
      </div>
    </div>
  );
}

function OrganisationLoading() {
  return (
    <p aria-live="polite" className="text-sm text-slate-400">
      Loading organisation…
    </p>
  );
}

function OrganisationMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="card" role="alert">
      <h2 className="font-bold">{title}</h2>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </div>
  );
}
