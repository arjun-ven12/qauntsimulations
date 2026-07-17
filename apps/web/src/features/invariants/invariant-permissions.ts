import { useAuthStore } from '../../stores/auth.store.js';

export function useCanMutateInvariants() {
  const role = useAuthStore((state) => state.organisation?.role);
  const currentRole = useAuthStore.getState().organisation?.role;
  return role === 'OWNER' || role === 'ADMIN' || currentRole === 'OWNER' || currentRole === 'ADMIN';
}
