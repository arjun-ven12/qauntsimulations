import { useQueryClient } from '@tanstack/react-query';
import { Activity, Boxes, FlaskConical, LogOut, ShieldCheck, Users } from 'lucide-react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store.js';

const nav = [
  { to: '/projects', label: 'Projects', icon: Boxes },
  { to: '/investigations/investigation-demo/live', label: 'Live WorldLab', icon: Activity },
  {
    to: '/investigations/investigation-demo/findings',
    label: 'Findings',
    icon: ShieldCheck,
  },
  { to: '/settings/organisation', label: 'Team', icon: Users },
];

export function AppLayout() {
  const signOut = useAuthStore((state) => state.signOut);
  const queryClient = useQueryClient();

  async function logout() {
    await signOut();
    queryClient.clear();
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
        <nav aria-label="WorldLab" className="space-y-2">
          {nav.map(({ to, label, icon: Icon }) => (
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
