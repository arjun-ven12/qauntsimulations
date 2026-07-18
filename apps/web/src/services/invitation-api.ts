import type { UserRole } from '@taskos/shared-types';
import { useAuthStore } from '../stores/auth.store.js';
import { authApi } from './auth-api.js';

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED' | 'EXPIRED';

export interface ManagerInvitation {
  id: string;
  email: string;
  role: UserRole;
  status: InvitationStatus;
  inviter: { id: string; displayName: string };
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  declinedAt: string | null;
  revokedAt: string | null;
  delivery: 'LINK_ONLY';
}

export interface RecipientInvitation {
  id: string;
  organisation: { id: string; name: string; slug: string };
  role: UserRole;
  status: InvitationStatus;
  inviter: { id: string; displayName: string };
  createdAt: string;
  expiresAt: string;
}

export interface InvitationPreview {
  invitationId?: string;
  state: InvitationStatus | 'INVALID';
  organisation?: { name: string };
  role?: UserRole;
  expiresAt?: string;
  recipient?: string;
}

export class InvitationApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'InvitationApiError';
  }
}

class HttpInvitationApi {
  constructor(private readonly baseUrl: string) {}

  managerList() {
    return this.request<ManagerInvitation[]>('/organisations/current/invitations');
  }
  create(input: { email: string; role: UserRole }) {
    return this.request<{
      invitation: ManagerInvitation;
      invitationUrl: string;
      delivery: { method: 'LINK_ONLY'; message: string };
    }>('/organisations/current/invitations', { method: 'POST', body: JSON.stringify(input) });
  }
  revoke(id: string) {
    return this.request<ManagerInvitation>(`/organisations/current/invitations/${id}/revoke`, {
      method: 'POST',
    });
  }
  inbox() {
    return this.request<RecipientInvitation[]>('/invitations');
  }
  preview(token: string) {
    return this.request<InvitationPreview>(
      `/invitations/preview?token=${encodeURIComponent(token)}`,
      undefined,
      false,
    );
  }
  accept(token: string) {
    return this.request<{
      accepted: true;
      idempotent: boolean;
      organisation: { id: string; name: string; slug: string };
    }>('/invitations/accept', { method: 'POST', body: JSON.stringify({ token }) });
  }
  acceptFromInbox(id: string) {
    return this.request<{
      accepted: true;
      idempotent: boolean;
      organisation: { id: string; name: string; slug: string };
    }>(`/invitations/${id}/accept`, { method: 'POST' });
  }
  decline(id: string) {
    return this.request<RecipientInvitation>(`/invitations/${id}/decline`, { method: 'POST' });
  }

  private async request<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      });
    } catch {
      throw new InvitationApiError(
        'Rift could not reach the invitation service.',
        0,
        'NETWORK_ERROR',
      );
    }
    const payload = (await response.json()) as unknown;
    if (response.status === 401 && retry) {
      try {
        await refreshInvitationSession();
        return this.request(path, init, false);
      } catch {
        await useAuthStore.getState().signOut();
      }
    }
    if (!response.ok) {
      const error = payload as { error?: { code?: string; message?: string } };
      throw new InvitationApiError(
        error.error?.message ?? 'The invitation request failed.',
        response.status,
        error.error?.code ?? 'INVITATION_REQUEST_FAILED',
      );
    }
    return payload as T;
  }
}

export const invitationApi = new HttpInvitationApi(
  import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
);
let refreshInFlight: Promise<unknown> | null = null;
async function refreshInvitationSession() {
  refreshInFlight ??= authApi.refresh();
  try {
    await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}
