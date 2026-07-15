import { create } from 'zustand';
import {
  AuthApiError,
  authApi,
  type LoginInput,
  type RegisterInput,
} from '../services/auth-api.js';

interface AuthState {
  authenticated: boolean;
  initialized: boolean;
  email: string | null;
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  restore(): Promise<void>;
  signOut(): Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  authenticated: false,
  initialized: false,
  email: null,
  login: async (input) => {
    const session = await authApi.login(input);
    set({ authenticated: true, initialized: true, email: session.user.email });
  },
  register: async (input) => {
    const session = await authApi.register(input);
    set({ authenticated: true, initialized: true, email: session.user.email });
  },
  restore: async () => {
    try {
      let session;
      try {
        session = await authApi.me();
      } catch (error) {
        if (!(error instanceof AuthApiError) || error.status !== 401) throw error;
        session = await authApi.refresh();
      }
      set({ authenticated: true, initialized: true, email: session.user.email });
    } catch {
      set({ authenticated: false, initialized: true, email: null });
    }
  },
  signOut: async () => {
    try {
      await authApi.logout();
    } finally {
      set({ authenticated: false, initialized: true, email: null });
    }
  },
}));
