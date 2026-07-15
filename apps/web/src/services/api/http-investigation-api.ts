import {
  createInvestigationInputSchema,
  findingSchema,
  investigationProgressSchema,
  projectSchema,
} from '@taskos/shared-types';
import { z } from 'zod';
import type { CreateInvestigationInput, InvestigationApi } from './investigation-api.js';

export class HttpInvestigationApi implements InvestigationApi {
  constructor(private readonly baseUrl: string) {}

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...init?.headers },
      ...init,
    });
    const payload = (await response.json()) as unknown;
    if (!response.ok) {
      throw new Error(
        (payload as { error?: { message?: string } }).error?.message ?? 'API request failed',
      );
    }
    return payload;
  }

  async listProjects() {
    return z.array(projectSchema).parse(await this.request('/projects'));
  }

  async createProject(input: {
    name: string;
    description: string | null;
    repositoryUrl: string | null;
  }) {
    return projectSchema.parse(
      await this.request('/projects', { method: 'POST', body: JSON.stringify(input) }),
    );
  }

  async createInvestigation(input: CreateInvestigationInput) {
    const validated = createInvestigationInputSchema.parse(input);
    const { projectId, ...body } = validated;
    return investigationProgressSchema.parse(
      await this.request(`/projects/${projectId}/investigations`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  }

  async getInvestigation(investigationId: string) {
    return investigationProgressSchema.parse(
      await this.request(`/investigations/${investigationId}`),
    );
  }

  async listFindings(investigationId: string) {
    return z
      .array(findingSchema)
      .parse(await this.request(`/investigations/${investigationId}/findings`));
  }
}
