import { z } from 'zod';
import { authApi } from '../../services/auth-api.js';
import { useAuthStore } from '../../stores/auth.store.js';

export const invariantTypes = ['NO_DUPLICATE_PAYMENT', 'NO_DUPLICATE_ORDER'] as const;
export type InvariantType = (typeof invariantTypes)[number];
export const invariantSeverities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type InvariantSeverity = (typeof invariantSeverities)[number];
export type InvariantValidationStatus = 'DRAFT' | 'READY' | 'INVALID';
export type InvariantCheckStatus = 'PASSED' | 'WARNING' | 'FAILED';

export interface InvariantConfiguration {
  requestPatterns: string[];
  methods: Array<'POST' | 'PUT' | 'PATCH'>;
  orderIdSelector?: string | undefined;
}

export interface InvariantInput {
  name: string;
  description: string;
  type: InvariantType;
  configuration: InvariantConfiguration;
  severity: InvariantSeverity;
  enabled: boolean;
}

export interface Invariant {
  id: string;
  projectId: string;
  name: string;
  description: string;
  type: InvariantType | null;
  configuration: InvariantConfiguration | null;
  severity: InvariantSeverity | null;
  enabled: boolean;
  validationStatus: InvariantValidationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface InvariantValidationCheck {
  key: string;
  status: InvariantCheckStatus;
  message: string;
}

export interface InvariantValidationResult {
  status: InvariantValidationStatus;
  checks: InvariantValidationCheck[];
  invariant: Invariant;
}

const methodsSchema = z.array(z.enum(['POST', 'PUT', 'PATCH']));
const configurationSchema = z
  .object({
    requestPatterns: z.array(z.string()),
    methods: methodsSchema,
    orderIdSelector: z.string().optional(),
  })
  .strict();
const invariantSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string(),
  type: z.enum(invariantTypes).nullable(),
  configuration: configurationSchema.nullable(),
  severity: z.enum(invariantSeverities).nullable(),
  enabled: z.boolean(),
  validationStatus: z.enum(['DRAFT', 'READY', 'INVALID']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
const validationSchema = z.object({
  status: z.enum(['DRAFT', 'READY', 'INVALID']),
  checks: z.array(
    z.object({
      key: z.string(),
      status: z.enum(['PASSED', 'WARNING', 'FAILED']),
      message: z.string(),
    }),
  ),
  invariant: invariantSchema,
});

export class InvariantApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'InvariantApiError';
  }
}

class HttpInvariantApi {
  private readonly baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

  async list(projectId: string): Promise<Invariant[]> {
    return z.array(invariantSchema).parse(await this.request(pathFor(projectId)));
  }

  async create(projectId: string, input: InvariantInput): Promise<Invariant> {
    return invariantSchema.parse(
      await this.request(pathFor(projectId), { method: 'POST', body: JSON.stringify(input) }),
    );
  }

  async get(projectId: string, invariantId: string): Promise<Invariant> {
    return invariantSchema.parse(await this.request(`${pathFor(projectId)}/${invariantId}`));
  }

  async update(
    projectId: string,
    invariantId: string,
    input: InvariantInput,
  ): Promise<Invariant> {
    return invariantSchema.parse(
      await this.request(`${pathFor(projectId)}/${invariantId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    );
  }

  async remove(projectId: string, invariantId: string): Promise<void> {
    await this.request(`${pathFor(projectId)}/${invariantId}`, { method: 'DELETE' });
  }

  async duplicate(projectId: string, invariantId: string): Promise<Invariant> {
    return invariantSchema.parse(
      await this.request(`${pathFor(projectId)}/${invariantId}/duplicate`, { method: 'POST' }),
    );
  }

  async validate(projectId: string, invariantId: string): Promise<InvariantValidationResult> {
    return validationSchema.parse(
      await this.request(`${pathFor(projectId)}/${invariantId}/validate`, { method: 'POST' }),
    );
  }

  private async request(path: string, init?: RequestInit, retry = true): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...init?.headers },
      });
    } catch {
      throw new InvariantApiError(
        'Rift could not reach the Invariant service.',
        0,
        'NETWORK_ERROR',
      );
    }
    const payload = response.status === 204 ? undefined : ((await response.json()) as unknown);
    if (response.status === 401 && retry) {
      try {
        await authApi.refresh();
        return this.request(path, init, false);
      } catch {
        await useAuthStore.getState().signOut();
      }
    }
    if (!response.ok) {
      const body = payload as
        | { error?: { code?: string; message?: string; details?: unknown } }
        | undefined;
      throw new InvariantApiError(
        body?.error?.message ?? 'Invariant request failed.',
        response.status,
        body?.error?.code ?? 'INVARIANT_REQUEST_FAILED',
        body?.error?.details,
      );
    }
    return payload;
  }
}

function pathFor(projectId: string) {
  return `/projects/${projectId}/invariants`;
}

export const invariantApi = new HttpInvariantApi();
