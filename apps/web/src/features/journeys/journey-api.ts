import { z } from 'zod';
import { authApi } from '../../services/auth-api.js';
import { useAuthStore } from '../../stores/auth.store.js';

export const journeyActionSchema = z.enum([
  'GOTO',
  'CLICK',
  'FILL',
  'WAIT_FOR',
  'ASSERT_VISIBLE',
  'SCREENSHOT',
]);
export type JourneyAction = z.infer<typeof journeyActionSchema>;
export type JourneyState = 'DRAFT' | 'ENABLED';
export type JourneyValidationStatus = 'DRAFT' | 'READY' | 'INVALID';

export type CompletionCondition =
  | { type: 'VISIBLE'; selector: string }
  | { type: 'TEXT'; selector: string; expectedText: string };

export interface JourneyStepMetadata {
  name?: string | undefined;
  timeoutMs?: number | undefined;
  expectedState?: 'VISIBLE' | undefined;
  screenshotCheckpoint?: boolean | undefined;
  screenshotCheckpointName?: string | undefined;
  continueOnFailure?: boolean | undefined;
}

export interface JourneyStepInput {
  order: number;
  action: JourneyAction;
  selector: string | null;
  value: string | null;
  metadata: JourneyStepMetadata;
}

export interface JourneyInput {
  name: string;
  description: string | null;
  environmentId: string;
  startPath: string;
  state: JourneyState;
  completionCondition: CompletionCondition;
  steps: JourneyStepInput[];
}

export interface JourneyStep extends JourneyStepInput {
  id: string;
}

export interface Journey extends Omit<JourneyInput, 'steps'> {
  id: string;
  projectId: string;
  validationStatus: JourneyValidationStatus;
  steps: JourneyStep[];
  createdAt: string;
  updatedAt: string;
}

export interface JourneyValidationCheck {
  key: string;
  status: 'PASSED' | 'WARNING' | 'FAILED';
  message: string;
  stepOrder?: number | undefined;
}

export interface JourneyValidationResult {
  status: JourneyValidationStatus;
  checks: JourneyValidationCheck[];
  journey: Journey;
}

const metadataSchema = z
  .object({
    name: z.string().optional(),
    timeoutMs: z.number().optional(),
    expectedState: z.literal('VISIBLE').optional(),
    screenshotCheckpoint: z.boolean().optional(),
    screenshotCheckpointName: z.string().optional(),
    continueOnFailure: z.boolean().optional(),
  })
  .strict();
const stepSchema = z.object({
  id: z.string(),
  order: z.number().int().nonnegative(),
  action: journeyActionSchema,
  selector: z.string().nullable(),
  value: z.string().nullable(),
  metadata: metadataSchema,
});
const completionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('VISIBLE'), selector: z.string() }),
  z.object({ type: z.literal('TEXT'), selector: z.string(), expectedText: z.string() }),
]);
const journeySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  environmentId: z.string().nullable().transform((value) => value ?? ''),
  startPath: z.string().nullable().transform((value) => value ?? ''),
  state: z.enum(['DRAFT', 'ENABLED']),
  completionCondition: completionSchema.nullable().transform(
    (value): CompletionCondition =>
      value ?? { type: 'VISIBLE', selector: '' },
  ),
  validationStatus: z.enum(['DRAFT', 'READY', 'INVALID']),
  steps: z.array(stepSchema),
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
      stepOrder: z.number().int().nonnegative().optional(),
    }),
  ),
  journey: journeySchema,
});

export class JourneyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'JourneyApiError';
  }
}

class HttpJourneyApi {
  private readonly baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

  async list(projectId: string): Promise<Journey[]> {
    return z.array(journeySchema).parse(await this.request(pathFor(projectId)));
  }

  async create(projectId: string, input: JourneyInput): Promise<Journey> {
    return journeySchema.parse(
      await this.request(pathFor(projectId), { method: 'POST', body: JSON.stringify(input) }),
    );
  }

  async get(projectId: string, journeyId: string): Promise<Journey> {
    return journeySchema.parse(await this.request(`${pathFor(projectId)}/${journeyId}`));
  }

  async update(projectId: string, journeyId: string, input: JourneyInput): Promise<Journey> {
    return journeySchema.parse(
      await this.request(`${pathFor(projectId)}/${journeyId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    );
  }

  async remove(projectId: string, journeyId: string): Promise<void> {
    await this.request(`${pathFor(projectId)}/${journeyId}`, { method: 'DELETE' });
  }

  async duplicate(projectId: string, journeyId: string): Promise<Journey> {
    return journeySchema.parse(
      await this.request(`${pathFor(projectId)}/${journeyId}/duplicate`, { method: 'POST' }),
    );
  }

  async validate(projectId: string, journeyId: string): Promise<JourneyValidationResult> {
    return validationSchema.parse(
      await this.request(`${pathFor(projectId)}/${journeyId}/validate`, { method: 'POST' }),
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
      throw new JourneyApiError('WorldLab could not reach the Journey service.', 0, 'NETWORK_ERROR');
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
      throw new JourneyApiError(
        body?.error?.message ?? 'Journey request failed.',
        response.status,
        body?.error?.code ?? 'JOURNEY_REQUEST_FAILED',
        body?.error?.details,
      );
    }
    return payload;
  }
}

function pathFor(projectId: string) {
  return `/projects/${projectId}/journeys`;
}

export const journeyApi = new HttpJourneyApi();
