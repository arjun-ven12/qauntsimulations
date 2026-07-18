import { z } from 'zod';
import { authApi } from '../../services/auth-api.js';
import { useAuthStore } from '../../stores/auth.store.js';
import {
  templateCategorySchema,
  type RiftTemplate,
  type TemplateCategory,
} from './template-model.js';

const templateSchema = z.object({
  id: z.string().min(1),
  category: templateCategorySchema,
  source: z.literal('CUSTOM'),
  name: z.string().min(1),
  description: z.string().optional(),
  schemaVersion: z.literal(1),
  payload: z.unknown(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export class TemplateApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = 'TemplateApiError';
  }
}

class HttpTemplateApi {
  private readonly baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

  async list<TPayload>(category: TemplateCategory): Promise<RiftTemplate<TPayload>[]> {
    return z
      .array(templateSchema)
      .parse(
        await this.request(`/templates?category=${encodeURIComponent(category)}`),
      ) as RiftTemplate<TPayload>[];
  }

  async get<TPayload>(id: string): Promise<RiftTemplate<TPayload>> {
    return templateSchema.parse(await this.request(`/templates/${id}`)) as RiftTemplate<TPayload>;
  }

  async create<TPayload>(input: {
    category: TemplateCategory;
    name: string;
    description?: string;
    payload: TPayload;
  }): Promise<RiftTemplate<TPayload>> {
    return templateSchema.parse(
      await this.request('/templates', {
        method: 'POST',
        body: JSON.stringify({ ...input, schemaVersion: 1 }),
      }),
    ) as RiftTemplate<TPayload>;
  }

  async update<TPayload>(
    id: string,
    input: Partial<Pick<RiftTemplate<TPayload>, 'name' | 'description' | 'payload'>>,
  ): Promise<RiftTemplate<TPayload>> {
    return templateSchema.parse(
      await this.request(`/templates/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...input, schemaVersion: 1 }),
      }),
    ) as RiftTemplate<TPayload>;
  }

  async remove(id: string): Promise<void> {
    await this.request(`/templates/${id}`, { method: 'DELETE' });
  }

  private async request(
    path: string,
    init: RequestInit = {},
    retrySession = true,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...init.headers },
      });
    } catch {
      throw new TemplateApiError('Rift could not reach the template service.', 0, 'NETWORK_ERROR');
    }
    const payload = response.status === 204 ? undefined : ((await response.json()) as unknown);
    if (response.status === 401 && retrySession) {
      try {
        await authApi.refresh();
        return this.request(path, init, false);
      } catch {
        await useAuthStore.getState().signOut();
      }
    }
    if (!response.ok) {
      const error = payload as { error?: { code?: string; message?: string } } | undefined;
      throw new TemplateApiError(
        error?.error?.message ?? 'Template request failed.',
        response.status,
        error?.error?.code ?? 'TEMPLATE_REQUEST_FAILED',
      );
    }
    return payload;
  }
}

export const templateApi = new HttpTemplateApi();
