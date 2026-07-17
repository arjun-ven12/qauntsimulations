import { z } from 'zod';
import { useAuthStore } from '../stores/auth.store.js';
import { authApi } from './auth-api.js';

export type ProjectPermission =
  'VIEW_PROJECTS' | 'CREATE_PROJECTS' | 'EDIT_PROJECTS' | 'MANAGE_PROJECT_SAFETY';

export interface EndpointReference {
  label: string;
  url: string;
}

export interface CredentialReference {
  id?: string;
  label: string;
  reference: string;
  provider?: string;
}

export interface ProjectSummary {
  id: string;
  organisationId: string;
  name: string;
  description: string | null;
  applicationUrl: string | null;
  repositoryUrl: string | null;
  organisation: { id: string; name: string; slug: string };
  safety: {
    configured: boolean;
    authorisedHostCount: number;
    prohibitedActionCount: number;
  };
  createdAt: string;
  updatedAt: string;
}

export interface SafetyPolicy {
  id: string;
  domainAllowlist: string[];
  prohibitedActions: string[];
  allowedHttpMethods: Array<'GET' | 'POST' | 'OPTIONS' | 'PUT' | 'PATCH' | 'DELETE'>;
  permitCheckoutSubmission: boolean;
  permitMockPayment: boolean;
  permitTestOrderCreation: boolean;
  restrictions: Record<string, boolean>;
  acknowledgedAt: string;
  updatedAt: string;
}

export interface ProjectDetails extends Omit<ProjectSummary, 'safety'> {
  credentialReferences: CredentialReference[];
  apiEndpoints: EndpointReference[];
  webhookEndpoints: EndpointReference[];
  safety: SafetyPolicy;
}

export interface ProjectSetupInput {
  name: string;
  description: string | null;
  applicationUrl: string;
  repositoryUrl: string | null;
  credentialReferences: Array<{ label: string; reference: string }>;
  apiEndpoints: EndpointReference[];
  webhookEndpoints: EndpointReference[];
}

export interface CreateProjectInput extends ProjectSetupInput {
  prohibitedActions: string[];
  acknowledgement: true;
}

export interface UpdateSafetyInput {
  domainAllowlist: string[];
  allowedHttpMethods: SafetyPolicy['allowedHttpMethods'];
  permitCheckoutSubmission: boolean;
  permitMockPayment: boolean;
  permitTestOrderCreation: boolean;
  prohibitedActions: string[];
  acknowledgement: true;
}

const endpointSchema = z.object({ label: z.string(), url: z.string().url() });
const summarySchema = z.object({
  id: z.string(),
  organisationId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  applicationUrl: z.string().url().nullable(),
  repositoryUrl: z.string().url().nullable(),
  organisation: z.object({ id: z.string(), name: z.string(), slug: z.string() }),
  safety: z.object({
    configured: z.boolean(),
    authorisedHostCount: z.number(),
    prohibitedActionCount: z.number(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
const safetyWireSchema = z.object({
  id: z.string(),
  domainAllowlist: z.array(z.string()),
  prohibitedActions: z.array(z.string()),
  allowedHttpMethods: z.array(z.enum(['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'])),
  permitCheckoutSubmission: z.boolean(),
  permitMockPayment: z.boolean(),
  permitOrderCreation: z.boolean(),
  restrictions: z.record(z.boolean()),
  acknowledgedAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
const safetySchema = safetyWireSchema.transform(({ permitOrderCreation, ...policy }) => ({
  ...policy,
  permitTestOrderCreation: permitOrderCreation,
}));
const detailsSchema = summarySchema.omit({ safety: true }).extend({
  credentialReferences: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      reference: z
        .string()
        .nullable()
        .transform((value) => value ?? ''),
      provider: z.string(),
    }),
  ),
  apiEndpoints: z.array(endpointSchema),
  webhookEndpoints: z.array(endpointSchema),
  safety: safetySchema,
});

export class ProjectApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ProjectApiError';
  }
}

class HttpProjectApi {
  constructor(private readonly baseUrl: string) {}

  async list(): Promise<ProjectSummary[]> {
    return z.array(summarySchema).parse(await this.request('/projects'));
  }

  async create(input: CreateProjectInput): Promise<ProjectDetails> {
    return detailsSchema.parse(
      await this.request('/projects', { method: 'POST', body: JSON.stringify(input) }),
    );
  }

  async get(projectId: string): Promise<ProjectDetails> {
    return detailsSchema.parse(await this.request(`/projects/${projectId}`));
  }

  async update(projectId: string, input: ProjectSetupInput): Promise<ProjectDetails> {
    return detailsSchema.parse(
      await this.request(`/projects/${projectId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    );
  }

  async getSafety(projectId: string): Promise<SafetyPolicy> {
    return safetySchema.parse(await this.request(`/projects/${projectId}/safety`));
  }

  async updateSafety(projectId: string, input: UpdateSafetyInput): Promise<SafetyPolicy> {
    const { permitTestOrderCreation, ...rest } = input;
    return safetySchema.parse(
      await this.request(`/projects/${projectId}/safety`, {
        method: 'PATCH',
        body: JSON.stringify({ ...rest, permitOrderCreation: permitTestOrderCreation }),
      }),
    );
  }

  private async request(path: string, init?: RequestInit, retrySession = true): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      });
    } catch {
      throw new ProjectApiError(
        'WorldLab could not reach the project service. Check your connection and try again.',
        0,
        'NETWORK_ERROR',
      );
    }
    const payload = (await response.json()) as unknown;
    if (response.status === 401 && retrySession) {
      try {
        await refreshProjectSession();
        return this.request(path, init, false);
      } catch {
        await useAuthStore.getState().signOut();
      }
    }
    if (!response.ok) {
      const error = payload as {
        error?: { code?: string; message?: string; details?: unknown };
      };
      throw new ProjectApiError(
        error.error?.message ?? 'The project request could not be completed.',
        response.status,
        error.error?.code ?? 'PROJECT_REQUEST_FAILED',
        error.error?.details,
      );
    }
    return payload;
  }
}

export const projectApi = new HttpProjectApi(
  import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api',
);

let refreshInFlight: Promise<unknown> | null = null;

async function refreshProjectSession() {
  refreshInFlight ??= authApi.refresh();
  try {
    await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}
