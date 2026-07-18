import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail } from 'lucide-react';
import { useState } from 'react';
import { PageHeading } from '../../components/page-heading.js';
import { InvitationApiError, invitationApi } from '../../services/invitation-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { primaryButton, secondaryButton } from '../projects/project-ui.js';

export function InvitationsPage() {
  const queryClient = useQueryClient();
  const syncSession = useAuthStore((state) => state.syncSession);
  const switchOrganisation = useAuthStore((state) => state.switchOrganisation);
  const [pendingId, setPendingId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [joinedOrganisation, setJoinedOrganisation] = useState<{ id: string; name: string } | null>(
    null,
  );
  const inbox = useQuery({
    queryKey: ['invitations', 'inbox'],
    queryFn: () => invitationApi.inbox(),
  });

  async function accept(id: string) {
    setPendingId(id);
    setError('');
    setMessage('');
    try {
      const result = await invitationApi.acceptFromInbox(id);
      await syncSession();
      await queryClient.invalidateQueries({ queryKey: ['invitations'] });
      setJoinedOrganisation(result.organisation);
      setMessage('Invitation accepted. Your organisation membership is ready.');
    } catch (requestError) {
      setError(
        requestError instanceof InvitationApiError
          ? requestError.message
          : 'Rift could not accept this invitation.',
      );
    } finally {
      setPendingId('');
    }
  }

  async function decline(id: string) {
    setPendingId(id);
    setError('');
    setMessage('');
    try {
      await invitationApi.decline(id);
      await queryClient.invalidateQueries({ queryKey: ['invitations'] });
      setMessage('Invitation declined.');
    } catch (requestError) {
      setError(
        requestError instanceof InvitationApiError
          ? requestError.message
          : 'Rift could not decline this invitation.',
      );
    } finally {
      setPendingId('');
    }
  }

  async function switchToJoined() {
    if (!joinedOrganisation) return;
    setPendingId('switch');
    try {
      await switchOrganisation(joinedOrganisation.id);
      queryClient.clear();
      window.location.assign('/projects');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Rift could not switch organisations.',
      );
      setPendingId('');
    }
  }

  return (
    <section aria-labelledby="invitations-heading">
      <PageHeading
        eyebrow="Account"
        title="Invitations"
        description="Review organisation invitations sent to your authenticated email address."
      />
      <h2 className="sr-only" id="invitations-heading">
        Organisation invitations
      </h2>
      {error ? (
        <p className="mb-4 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mb-4 text-sm text-emerald-300" role="status">
          {message}
        </p>
      ) : null}
      {joinedOrganisation ? (
        <button
          className={`${primaryButton} mb-5`}
          disabled={pendingId === 'switch'}
          onClick={() => void switchToJoined()}
          type="button"
        >
          Switch to {joinedOrganisation.name}
        </button>
      ) : null}
      {inbox.isPending ? (
        <p role="status">Loading invitations…</p>
      ) : inbox.isError ? (
        <p className="card text-red-300" role="alert">
          Invitations could not be loaded.
        </p>
      ) : inbox.data.length === 0 ? (
        <div className="card text-center" data-testid="invitations-empty">
          <Mail aria-hidden="true" className="mx-auto text-slate-500" />
          <h2 className="mt-3 font-bold">No invitations</h2>
          <p className="mt-1 text-sm text-slate-400">
            You have no organisation invitations for this account.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4">
          {inbox.data.map((invitation) => (
            <li
              className="card grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              key={invitation.id}
            >
              <div>
                <h2 className="font-bold">{invitation.organisation.name}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Role: {invitation.role} · Invited by {invitation.inviter.displayName}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Expires {new Date(invitation.expiresAt).toLocaleString()}
                </p>
                <span className="mt-2 inline-block rounded-full border border-slate-700 px-3 py-1 text-xs font-bold">
                  {invitation.status}
                </span>
              </div>
              {invitation.status === 'PENDING' ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    aria-label={`Accept invitation to ${invitation.organisation.name}`}
                    className={primaryButton}
                    disabled={pendingId === invitation.id}
                    onClick={() => void accept(invitation.id)}
                    type="button"
                  >
                    Accept
                  </button>
                  <button
                    aria-label={`Decline invitation to ${invitation.organisation.name}`}
                    className={secondaryButton}
                    disabled={pendingId === invitation.id}
                    onClick={() => void decline(invitation.id)}
                    type="button"
                  >
                    Decline
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
