import { useEffect, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store.js';

function useRestoreSession() {
  const initialized = useAuthStore((state) => state.initialized);
  const restore = useAuthStore((state) => state.restore);

  useEffect(() => {
    if (!initialized) void restore();
  }, [initialized, restore]);
}

function AuthLoading() {
  return (
    <main
      aria-live="polite"
      className="grid min-h-screen place-items-center bg-[#09090b] text-sm text-slate-400"
    >
      Restoring WorldLab…
    </main>
  );
}

export function RouteGuard({ children }: { children: ReactNode }) {
  useRestoreSession();
  const location = useLocation();
  const authenticated = useAuthStore((state) => state.authenticated);
  const initialized = useAuthStore((state) => state.initialized);

  if (!initialized) return <AuthLoading />;
  return authenticated ? (
    children
  ) : (
    <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  );
}

export function GuestRoute({ children }: { children: ReactNode }) {
  useRestoreSession();
  const authenticated = useAuthStore((state) => state.authenticated);
  const initialized = useAuthStore((state) => state.initialized);

  if (!initialized) return <AuthLoading />;
  return authenticated ? <Navigate to="/dashboard" replace /> : children;
}
