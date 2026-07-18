import { ChevronLeft } from 'lucide-react';
import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

export type RouteContext = {
  back?: { label: string; to: string };
  title: string;
};

export function routeContext(pathname: string): RouteContext {
  if (pathname === '/invitations/accept') return { title: 'Organisation invitation', back: { label: 'sign in', to: '/login' } };
  if (pathname === '/dashboard') return { title: 'Dashboard' };
  if (pathname === '/projects') return { title: 'Projects', back: { label: 'Dashboard', to: '/dashboard' } };
  if (pathname === '/projects/new') return { title: 'New Project', back: { label: 'Projects', to: '/projects' } };
  if (/^\/projects\/[^/]+\/investigations\/new$/.test(pathname)) return { title: 'New Investigation', back: { label: 'Project', to: pathname.replace(/\/investigations\/new$/, '') } };
  if (/^\/projects\/[^/]+\/(settings|safety)$/.test(pathname)) return { title: 'Project settings', back: { label: 'Project', to: pathname.replace(/\/(settings|safety)$/, '') } };
  if (/^\/projects\/[^/]+\/environments\/new$/.test(pathname)) return { title: 'New Environment', back: { label: 'Environments', to: pathname.replace(/\/new$/, '') } };
  if (/^\/projects\/[^/]+\/environments\/[^/]+\/settings$/.test(pathname)) return { title: 'Environment settings', back: { label: 'Environment', to: pathname.replace(/\/settings$/, '') } };
  if (/^\/projects\/[^/]+\/environments\/[^/]+$/.test(pathname)) return { title: 'Environment', back: { label: 'Environments', to: pathname.replace(/\/[^/]+$/, '') } };
  if (/^\/projects\/[^/]+\/environments$/.test(pathname)) return { title: 'Environments', back: { label: 'Project', to: pathname.replace(/\/environments$/, '') } };
  if (/^\/projects\/[^/]+\/journeys\/new$/.test(pathname)) return { title: 'New Journey', back: { label: 'Journeys', to: pathname.replace(/\/new$/, '') } };
  if (/^\/projects\/[^/]+\/journeys\/[^/]+\/settings$/.test(pathname)) return { title: 'Journey settings', back: { label: 'Journey', to: pathname.replace(/\/settings$/, '') } };
  if (/^\/projects\/[^/]+\/journeys\/[^/]+$/.test(pathname)) return { title: 'Journey', back: { label: 'Journeys', to: pathname.replace(/\/[^/]+$/, '') } };
  if (/^\/projects\/[^/]+\/journeys$/.test(pathname)) return { title: 'Journeys', back: { label: 'Project', to: pathname.replace(/\/journeys$/, '') } };
  if (/^\/projects\/[^/]+\/invariants\/new$/.test(pathname)) return { title: 'New Invariant', back: { label: 'Invariants', to: pathname.replace(/\/new$/, '') } };
  if (/^\/projects\/[^/]+\/invariants\/[^/]+\/settings$/.test(pathname)) return { title: 'Invariant settings', back: { label: 'Invariant', to: pathname.replace(/\/settings$/, '') } };
  if (/^\/projects\/[^/]+\/invariants\/[^/]+$/.test(pathname)) return { title: 'Invariant', back: { label: 'Invariants', to: pathname.replace(/\/[^/]+$/, '') } };
  if (/^\/projects\/[^/]+\/invariants$/.test(pathname)) return { title: 'Invariants', back: { label: 'Project', to: pathname.replace(/\/invariants$/, '') } };
  if (/^\/projects\/[^/]+$/.test(pathname)) return { title: 'Project', back: { label: 'Projects', to: '/projects' } };
  if (/^\/investigations\/[^/]+\/findings\/[^/]+\/repair-verifications\/(new|[^/]+)$/.test(pathname)) return { title: 'Repair Verification', back: { label: 'Finding', to: pathname.replace(/\/repair-verifications\/(new|[^/]+)$/, '') } };
  if (/^\/investigations\/[^/]+\/findings\/[^/]+$/.test(pathname)) return { title: 'Finding', back: { label: 'Findings', to: pathname.replace(/\/[^/]+$/, '') } };
  if (/^\/investigations\/[^/]+\/(plan|live|worlds|findings)$/.test(pathname)) return { title: 'Investigation', back: { label: 'Investigation', to: pathname.replace(/\/(plan|live|worlds|findings)$/, '') } };
  if (/^\/investigations\/[^/]+$/.test(pathname)) return { title: 'Investigation', back: { label: 'Dashboard', to: '/dashboard' } };
  if (/^\/repairs\/[^/]+\/verify$/.test(pathname)) return { title: 'Repair verification', back: { label: 'Dashboard', to: '/dashboard' } };
  if (pathname === '/settings/organisation') return { title: 'Organisation settings', back: { label: 'Dashboard', to: '/dashboard' } };
  if (pathname === '/invitations') return { title: 'Invitations', back: { label: 'Dashboard', to: '/dashboard' } };
  return { title: 'Rift', back: { label: 'Dashboard', to: '/dashboard' } };
}

export function ContextualNavigation() {
  const { pathname } = useLocation();
  const context = routeContext(pathname);

  useEffect(() => {
    document.title = context.title === 'Rift' ? 'Rift' : `${context.title} · Rift`;
  }, [context.title]);

  if (!context.back) return null;
  return (
    <Link aria-label={`Back to ${context.back.label}`} className="mb-5 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 py-2 text-sm font-bold text-slate-300 hover:bg-slate-900 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan" to={context.back.to}>
      <ChevronLeft aria-hidden="true" size={17} /> Back to {context.back.label}
    </Link>
  );
}
