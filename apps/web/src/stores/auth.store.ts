import { create } from 'zustand';
import {
  AuthApiError,
  authApi,
  type AuthSession,
  type LoginInput,
  type OrganisationPermission,
  type RegisterInput,
} from '../services/auth-api.js';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  status: AuthStatus;
  authenticated: boolean;
  initialized: boolean;
  user: AuthSession['user'] | null;
  organisation: AuthSession['organisation'] | null;
  permissions: OrganisationPermission[];
  login(input: LoginInput): Promise<void>;
  register(input: RegisterInput): Promise<void>;
  restore(): Promise<void>;
  signOut(): Promise<void>;
}

const unauthenticatedState = {
  status: 'unauthenticated' as const,
  authenticated: false,
  initialized: true,
  user: null,
  organisation: null,
  permissions: [],
};

function authenticatedState(session: AuthSession) {
  return {
    status: 'authenticated' as const,
    authenticated: true,
    initialized: true,
    user: session.user,
    organisation: session.organisation,
    permissions: session.permissions,
  };
}

let restoreInFlight: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  status: 'loading',
  authenticated: false,
  initialized: false,
  user: null,
  organisation: null,
  permissions: [],
  login: async (input) => {
    const session = await authApi.login(input);
    set(authenticatedState(session));
  },
  register: async (input) => {
    const session = await authApi.register(input);
    set(authenticatedState(session));
  },
  restore: async () => {
    if (restoreInFlight) return restoreInFlight;
    restoreInFlight = (async () => {
      set({ status: 'loading', initialized: false });
      try {
        let session;
        try {
          session = await authApi.me();
        } catch (error) {
          if (!(error instanceof AuthApiError) || error.status !== 401) throw error;
          session = await authApi.refresh();
        }
        set(authenticatedState(session));
      } catch {
        set(unauthenticatedState);
      }
    })();
    try {
      await restoreInFlight;
    } finally {
      restoreInFlight = null;
    }
  },
  signOut: async () => {
    try {
      await authApi.logout();
    } finally {
      set(unauthenticatedState);
    }
  },
}));
