import { useEffect, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '../stores/auth.store.js';

export function RouteGuard({ children }: { children: ReactNode }) {
  const authenticated = useAuthStore((state) => state.authenticated);
  const initialized = useAuthStore((state) => state.initialized);
  const restore = useAuthStore((state) => state.restore);

  useEffect(() => {
    if (!initialized) void restore();
  }, [initialized, restore]);

  if (!initialized) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#09090b] text-sm text-slate-400">
        Restoring WorldLab…
      </main>
    );
  }
  return authenticated ? children : <Navigate to="/login" replace />;
}
