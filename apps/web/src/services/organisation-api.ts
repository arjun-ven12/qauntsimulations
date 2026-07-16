import type { UserRole } from '@taskos/shared-types';
import type { OrganisationPermission } from './auth-api.js';
import { authApi } from './auth-api.js';
import { useAuthStore } from '../stores/auth.store.js';

export const organisationRoles = [
  'OWNER',
  'ADMIN',
  'MEMBER',
  'VIEWER',
] as const satisfies readonly UserRole[];

export interface CurrentOrganisation {
  organisation: { id: string; name: string; slug: string };
  membership: { id: string; role: UserRole; joinedAt: string };
  permissions: OrganisationPermission[];
}

export interface OrganisationMember {
  id: string;
  role: UserRole;
  joinedAt: string;
  user: { id: string; displayName: string; email: string };
}

export class OrganisationApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'OrganisationApiError';
  }
}

class HttpOrganisationApi {
  constructor(private readonly baseUrl: string) {}

  current(): Promise<CurrentOrganisation> {
    return this.request<CurrentOrganisation>('/organisations/current');
  }

  members(): Promise<OrganisationMember[]> {
    return this.request<OrganisationMember[]>('/organisations/current/members');
  }

  addMember(input: { email: string; role: UserRole }): Promise<OrganisationMember> {
    return this.request<OrganisationMember>('/organisations/current/members', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  updateMember(membershipId: string, role: UserRole): Promise<OrganisationMember> {
    return this.request<OrganisationMember>(`/organisations/current/members/${membershipId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async removeMember(membershipId: string): Promise<void> {
    await this.request<void>(`/organisations/current/members/${membershipId}`, {
      method: 'DELETE',
    });
  }

  private async request<T>(path: string, init?: RequestInit, retrySession = true): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      });
    } catch {
      throw new OrganisationApiError('WorldLab could not load your organisation.', 0);
    }
    const payload = response.status === 204 ? undefined : ((await response.json()) as unknown);
    if (response.status === 401 && retrySession) {
      try {
        await refreshOrganisationSession();
        return this.request(path, init, false);
      } catch {
        await useAuthStore.getState().signOut();
      }
    }
    if (!response.ok) {
      const error = payload as { error?: { message?: string } };
      throw new OrganisationApiError(
        error.error?.message ?? 'WorldLab could not load your organisation.',
        response.status,
      );
    }
    return payload as T;
  }
}

export const organisationApi = new HttpOrganisationApi(
  import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
);

let refreshInFlight: Promise<unknown> | null = null;

async function refreshOrganisationSession() {
  refreshInFlight ??= authApi.refresh();
  try {
    await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}
