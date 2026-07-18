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

const navigationGroups = [
  { label: 'Workspace', items: appNavigation.slice(0, 2) },
  { label: 'Operations', items: appNavigation.slice(2, 4) },
  { label: 'Manage', items: appNavigation.slice(4) },
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
    <div className="min-h-screen bg-[var(--rift-bg)] lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="flex flex-col border-r border-[var(--rift-border)] bg-[var(--rift-sidebar)] px-4 py-5 lg:sticky lg:top-0 lg:h-screen">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-9 flex h-8 items-center px-2">
            <div aria-label="Rift" className="text-sm font-semibold tracking-[0.24em] text-[var(--rift-primary)]">RIFT</div>
          </div>
          <nav aria-label="Rift navigation" className="space-y-7">
            {navigationGroups.map((group) => (
              <div key={group.label}>
                <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--rift-text-muted)]">{group.label}</p>
                <div className="space-y-1">
                  {group.items.map(({ to, label, icon: Icon }) => (
                    <NavLink
                      className={({ isActive }) =>
                        `flex min-h-10 items-center gap-3 rounded-md border-l-2 px-2.5 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? 'border-white bg-[var(--rift-surface-raised)] text-[var(--rift-text)]'
                            : 'border-transparent text-[var(--rift-text-secondary)] hover:bg-[var(--rift-surface-hover)] hover:text-[var(--rift-text)]'
                        }`
                      }
                      key={to}
                      to={to}
                    >
                      <Icon aria-hidden="true" size={17} strokeWidth={1.75} />
                      {label}
                      {label === 'Invitations' && pendingInvitationCount > 0 ? (
                        <span
                          className="ml-auto min-w-5 rounded-full border border-[var(--rift-border-strong)] bg-white px-1.5 py-0.5 text-center text-[10px] font-semibold text-black"
                          aria-label={`${pendingInvitationCount} pending invitations`}
                        >
                          {pendingInvitationCount}
                        </span>
                      ) : null}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-8 border-t border-[var(--rift-border)] pt-4 lg:mt-auto">
          {organisation ? (
            <div className="px-2">
              <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--rift-text-muted)]" htmlFor="organisation-switcher">
                Workspace
              </label>
              <select
                aria-label="Workspace selector"
                className="mt-2 w-full min-w-0 border border-[var(--rift-border)] bg-[var(--rift-surface)] px-2.5 py-2 text-xs font-medium text-[var(--rift-text)]"
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
                  <option value={organisation.id}>{organisation.name} · {organisation.role}</option>
                ) : null}
              </select>
              {switching ? <p className="sr-only" role="status">Switching organisation…</p> : null}
            </div>
          ) : null}
          {switchError ? <p className="mt-2 px-2 text-xs text-[var(--rift-text-secondary)]" role="alert">{switchError}</p> : null}
          <button
            className="mt-3 flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-sm font-medium text-[var(--rift-text-muted)] transition hover:bg-[var(--rift-surface-hover)] hover:text-[var(--rift-text)]"
            onClick={() => void logout()}
            type="button"
          >
            <LogOut aria-hidden="true" size={16} /> Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 bg-[var(--rift-bg)] px-5 py-6 sm:px-7 lg:px-9 lg:py-8 xl:px-12">
        <ContextualNavigation />
        <Outlet />
      </main>
    </div>
  );
}
