import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, Boxes, FlaskConical, Gauge, LogOut, Mail, ShieldCheck, Users } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { invitationApi } from '../services/invitation-api.js';
import { useAuthStore } from '../stores/auth.store.js';

const runtimeInvestigationId = import.meta.env.VITE_DEMO_INVESTIGATION_ID ?? 'cmrol9cxh0001rurb8godxnh6';

export const appNavigation = [
  { to: '/dashboard', label: 'Dashboard', icon: Gauge },
  { to: '/projects', label: 'Projects', icon: Boxes },
  { to: `/investigations/${runtimeInvestigationId}`, label: 'Live WorldLab', icon: Activity },
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
        error instanceof Error ? error.message : 'WorldLab could not switch organisations.',
      );
    } finally {
      setSwitching(false);
    }
  }

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="border-r border-slate-800 bg-slate-950 p-5">
        <div className="mb-10 flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-cyan text-ink">
            <FlaskConical size={22} />
          </span>
          <div>
            <div className="font-black tracking-tight">TaskOS</div>
            <div className="text-xs text-slate-500">WORLDLAB</div>
          </div>
        </div>
        {organisation ? (
          <div className="mb-6 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
            <label className="text-xs font-bold text-slate-400" htmlFor="organisation-switcher">
              Active organisation
            </label>
            <select
              aria-label="Active organisation"
              className="mt-2 w-full text-sm"
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
              <p className="mt-2 text-xs text-cyan" role="status">
                Switching organisation…
              </p>
            ) : null}
            {switchError ? (
              <p className="mt-2 text-xs text-red-300" role="alert">
                {switchError}
              </p>
            ) : null}
          </div>
        ) : null}
        <nav aria-label="WorldLab" className="space-y-2">
          {appNavigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm ${
                  isActive ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-900'
                }`
              }
              key={to}
              to={to}
            >
              <Icon size={18} />
              {label}
              {label === 'Invitations' && pendingInvitationCount > 0 ? (
                <span
                  className="ml-auto rounded-full bg-cyan px-2 py-0.5 text-xs font-bold text-ink"
                  aria-label={`${pendingInvitationCount} pending invitations`}
                >
                  {pendingInvitationCount}
                </span>
              ) : null}
            </NavLink>
          ))}
        </nav>
        <button
          className="mt-10 flex items-center gap-2 text-sm text-slate-500"
          onClick={() => void logout()}
          type="button"
        >
          <LogOut size={16} /> Sign out
        </button>
      </aside>
      <main className="min-w-0 p-6 lg:p-10">
        <Outlet />
      </main>
    </div>
  );
}
