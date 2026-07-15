import type { UserRole } from '@taskos/shared-types';
import type { OrganisationPermission } from './auth-api.js';

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

  private async request<T>(path: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
    } catch {
      throw new OrganisationApiError('WorldLab could not load your organisation.', 0);
    }
    const payload = (await response.json()) as unknown;
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
