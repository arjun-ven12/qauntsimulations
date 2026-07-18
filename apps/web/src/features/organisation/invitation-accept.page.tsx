import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ContextualNavigation } from '../../components/contextual-navigation.js';
import { InvitationApiError, invitationApi } from '../../services/invitation-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import { primaryButton, secondaryButton } from '../projects/project-ui.js';

export function InvitationAcceptPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const location = useLocation();
  const queryClient = useQueryClient();
  const initialized = useAuthStore((state) => state.initialized);
  const authenticated = useAuthStore((state) => state.authenticated);
  const restore = useAuthStore((state) => state.restore);
  const syncSession = useAuthStore((state) => state.syncSession);
  const signOut = useAuthStore((state) => state.signOut);
  const [pending, setPending] = useState(false);
  const [resolved, setResolved] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!initialized) void restore();
  }, [initialized, restore]);
  const preview = useQuery({
    queryKey: ['invitations', 'preview', token],
    queryFn: () => invitationApi.preview(token),
    enabled: token.length >= 32,
    retry: false,
  });
  const returnPath = `${location.pathname}${location.search}`;

  async function accept() {
    setPending(true);
    setError('');
    try {
      await invitationApi.accept(token);
      await syncSession();
      await queryClient.invalidateQueries({ queryKey: ['invitations'] });
      setResolved('Invitation accepted. Open Invitations to switch organisations.');
    } catch (requestError) {
      setError(
        requestError instanceof InvitationApiError
          ? requestError.message
          : 'Rift could not accept this invitation.',
      );
    } finally {
      setPending(false);
    }
  }
  async function decline() {
    if (!preview.data?.invitationId) return;
    setPending(true);
    setError('');
    try {
      await invitationApi.decline(preview.data.invitationId);
      setResolved('Invitation declined.');
      await queryClient.invalidateQueries({ queryKey: ['invitations'] });
    } catch (requestError) {
      setError(
        requestError instanceof InvitationApiError
          ? requestError.message
          : 'Rift could not decline this invitation.',
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-5">
      <section className="card w-full max-w-xl" aria-labelledby="invitation-preview-title">
        <ContextualNavigation />
        <div className="eyebrow">Rift</div>
        <h1 className="mt-3 text-2xl font-black" id="invitation-preview-title">
          Organisation invitation
        </h1>
        {preview.isPending ? (
          <p className="mt-4" role="status">
            Checking invitation…
          </p>
        ) : preview.isError || !preview.data || preview.data.state === 'INVALID' ? (
          <p className="mt-4 text-red-300" role="alert">
            This invitation link is invalid.
          </p>
        ) : (
          <div className="mt-4">
            <h2 className="text-xl font-bold">{preview.data.organisation?.name}</h2>
            <p className="mt-2 text-slate-300">Invited role: {preview.data.role}</p>
            <p className="mt-1 text-sm text-slate-400">Recipient: {preview.data.recipient}</p>
            <p className="mt-1 text-sm text-slate-400">
              Expires{' '}
              {preview.data.expiresAt ? new Date(preview.data.expiresAt).toLocaleString() : '—'}
            </p>
            <p className="mt-3 font-bold">Status: {preview.data.state}</p>
            {resolved ? (
              <p className="mt-4 text-emerald-300" role="status">
                {resolved}
              </p>
            ) : null}
            {error ? (
              <p className="mt-4 text-red-300" role="alert">
                {error}
              </p>
            ) : null}
            {preview.data.state === 'PENDING' && !resolved ? (
              initialized && authenticated ? (
                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    className={primaryButton}
                    disabled={pending}
                    onClick={() => void accept()}
                    type="button"
                  >
                    {pending ? 'Accepting…' : 'Accept invitation'}
                  </button>
                  <button
                    className={secondaryButton}
                    disabled={pending}
                    onClick={() => void decline()}
                    type="button"
                  >
                    Decline invitation
                  </button>
                  <button className={secondaryButton} onClick={() => void signOut()} type="button">
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="mt-5 flex flex-wrap gap-3">
                  <Link className={primaryButton} state={{ from: returnPath }} to="/login">
                    Log in
                  </Link>
                  <Link className={secondaryButton} state={{ from: returnPath }} to="/register">
                    Create account
                  </Link>
                </div>
              )
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
