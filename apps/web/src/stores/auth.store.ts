import { create } from 'zustand';
interface AuthState { authenticated: boolean; email: string | null; signIn(email: string): void; signOut(): void }
export const useAuthStore = create<AuthState>((set) => ({ authenticated: true, email: 'demo@taskos.local', signIn: (email) => set({ authenticated: true, email }), signOut: () => set({ authenticated: false, email: null }) }));
