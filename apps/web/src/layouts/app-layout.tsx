import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Boxes, Gauge, LogOut, Mail, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ContextualNavigation } from '../components/contextual-navigation.js';
import { invitationApi } from '../services/invitation-api.js';
import { useAuthStore } from '../stores/auth.store.js';

const runtimeInvestigationId = import.meta.env.VITE_DEMO_INVESTIGATION_ID ?? 'cmrol9cxh0001rurb8godxnh6';

export const appNavigation = [
  { to: '/dashboard', label: 'Dashboard', icon: Gauge },
  { to: '/projects', label: 'Projects', icon: Boxes },
  { to: `/investigations/${runtimeInvestigationId}`, label: 'Investigations', icon: Activity },
  {
    to: `/investigations/${runtimeInvestigationId}/findings`,
    label: 'Findings',
    icon: ShieldCheck,
  },
  { to: '/settings/organisation', label: 'Team', icon: Users },
  { to: '/invitations', label: 'Invitations', icon: Mail },
];

export function AppLayout() {
  const signOut = useAuthStore((state) => state.signOut);
  const switchOrganisation = useAuthStore((state) => state.switchOrganisation);
  const organisation = useAuthStore((state) => state.organisation);
  const memberships = useAuthStore((state) => state.memberships);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const inbox = useQuery({
    queryKey: ['invitations', 'inbox'],
    queryFn: () => invitationApi.inbox(),
  });
  const pendingInvitationCount =
    inbox.data?.filter((item) => item.status === 'PENDING').length ?? 0;

  async function logout() {
    await signOut();
    queryClient.clear();
  }

  async function changeOrganisation(organisationId: string) {
    if (!organisation || organisationId === organisation.id || switching) return;
    setSwitching(true);
    setSwitchError('');
    try {
      await switchOrganisation(organisationId);
      await queryClient.resetQueries();
      navigate('/dashboard');
    } catch (error) {
      setSwitchError(
        error instanceof Error ? error.message : 'Rift could not switch organisations.',
      );
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--rift-bg)] lg:grid lg:grid-cols-[264px_1fr]">
      <aside className="border-r border-[var(--rift-border)] bg-[var(--rift-sidebar)] p-5 lg:min-h-screen">
        <div className="mb-8 pt-1">
          <div aria-label="Rift" className="text-sm font-semibold tracking-[0.22em] text-[var(--rift-primary)]">RIFT</div>
        </div>
        {organisation ? (
          <div className="mb-6 flex min-h-11 items-center gap-2 border-y border-[var(--rift-border)] py-1">
            <label className="shrink-0 text-[11px] font-medium uppercase tracking-[0.12em] text-[var(--rift-text-muted)]" htmlFor="organisation-switcher">
              Workspace
            </label>
            <select
              aria-label="Workspace selector"
              className="w-full min-w-0 border-0 bg-transparent px-1 py-1.5 text-sm font-medium text-[var(--rift-text)] focus:shadow-none"
              disabled={switching || !memberships?.length}
              id="organisation-switcher"
              onChange={(event) => void changeOrganisation(event.target.value)}
              value={organisation.id}
            >
              {(memberships ?? []).map((membership) => (
                <option key={membership.membershipId} value={membership.organisation.id}>
                  {membership.organisation.name} · {membership.role}
                </option>
              ))}
              {!memberships?.length ? (
                <option value={organisation.id}>
                  {organisation.name} · {organisation.role}
                </option>
              ) : null}
            </select>
            {switching ? (
              <p className="sr-only" role="status">
                Switching organisation…
              </p>
            ) : null}
          </div>
        ) : null}
        {switchError ? (
          <p className="-mt-4 mb-4 text-xs text-[var(--rift-fail)]" role="alert">
            {switchError}
          </p>
        ) : null}
        <nav aria-label="Rift navigation" className="space-y-1.5">
          {appNavigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border border-[var(--rift-border-strong)] bg-[var(--rift-surface-raised)] text-[var(--rift-text)]'
                    : 'border border-transparent text-[var(--rift-text-secondary)] hover:bg-[var(--rift-surface-hover)] hover:text-[var(--rift-text)]'
                }`
              }
              key={to}
              to={to}
            >
              <Icon size={18} />
              {label}
              {label === 'Invitations' && pendingInvitationCount > 0 ? (
                <span
                  className="ml-auto rounded-full border border-[var(--rift-border-strong)] bg-[var(--rift-primary)] px-2 py-0.5 text-xs font-semibold text-[var(--rift-primary-text)]"
                  aria-label={`${pendingInvitationCount} pending invitations`}
                >
                  {pendingInvitationCount}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <button
          className="mt-10 flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-[var(--rift-text-muted)] transition hover:bg-[var(--rift-surface-hover)] hover:text-[var(--rift-text)]"
          onClick={() => void logout()}
          type="button"
        >
          <LogOut size={16} /> Sign out
        </button>
      </aside>
      <main className="min-w-0 bg-[var(--rift-bg)] p-6 lg:p-10">
        <ContextualNavigation />
        <Outlet />
      </main>
    </div>
  );
}
