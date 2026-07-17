import {
  createInvestigationInputSchema,
  findingSchema,
  investigationProgressSchema,
  projectSchema,
} from '@taskos/shared-types';
import { z } from 'zod';
import {
  evidenceArtifactResponseSchema,
  evidenceTextContentResponseSchema,
  experimentPlanResponseSchema,
  findingDetailSchema,
  investigationExperimentSchema,
  InvestigationApiError,
  investigationWorkerSchema,
  investigationWorldSchema,
  type CreateInvestigationInput,
  type InvestigationApi,
} from './investigation-api.js';

export class HttpInvestigationApi implements InvestigationApi {
  constructor(private readonly baseUrl: string) {}

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...init?.headers },
        ...init,
      });
    } catch (error) {
      const timedOut =
        typeof DOMException !== 'undefined' &&
        error instanceof DOMException &&
        error.name === 'TimeoutError';
      throw new InvestigationApiError(
        'WorldLab could not reach the investigation API.',
        0,
        timedOut ? 'TIMEOUT' : 'NETWORK',
        error,
      );
    }
    let payload: unknown;
    try {
      payload = (await response.json()) as unknown;
    } catch (error) {
      throw new InvestigationApiError('WorldLab received invalid JSON.', response.status, 'INVALID_JSON', error);
    }
    if (!response.ok) {
      const errorCode = (payload as { error?: { code?: string } }).error?.code;
      const kind =
        response.status === 404 ? 'NOT_FOUND'
          : response.status === 413 || errorCode === 'EVIDENCE_CONTENT_TOO_LARGE' ? 'CONTENT_TOO_LARGE'
            : errorCode === 'EVIDENCE_CONTENT_UNSUPPORTED' ? 'UNSUPPORTED_CONTENT'
              : 'HTTP';
      throw new InvestigationApiError(
        (payload as { error?: { message?: string } }).error?.message ?? 'API request failed',
        response.status,
        kind,
        payload,
      );
    }
    return payload;
  }

  private parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, payload: unknown): T {
    try {
      return schema.parse(payload);
    } catch (error) {
      throw new InvestigationApiError('WorldLab received an unexpected response shape.', 0, 'SCHEMA_MISMATCH', error);
    }
  }

  async listProjects() {
    return this.parse(z.array(projectSchema), await this.request('/projects'));
  }

  async createProject(input: {
    name: string;
    description: string | null;
    repositoryUrl: string | null;
  }) {
    return this.parse(
      projectSchema,
      await this.request('/projects', { method: 'POST', body: JSON.stringify(input) }),
    );
  }

  async createInvestigation(input: CreateInvestigationInput) {
    const validated = createInvestigationInputSchema.parse(input);
    const { projectId, ...body } = validated;
    return this.parse(
      investigationProgressSchema,
      await this.request(`/projects/${projectId}/investigations`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    );
  }

  async getInvestigation(investigationId: string) {
    return this.parse(investigationProgressSchema, await this.request(`/investigations/${investigationId}`));
  }

  async getExperimentPlan(investigationId: string) {
    return this.parse(
      experimentPlanResponseSchema.nullable(),
      await this.request(`/investigations/${investigationId}/plan`),
    );
  }

  async getWorlds(investigationId: string) {
    return this.parse(
      z.array(investigationWorldSchema),
      await this.request(`/investigations/${investigationId}/worlds`),
    );
  }

  async getExperiments(investigationId: string) {
    return this.parse(
      z.array(investigationExperimentSchema),
      await this.request(`/investigations/${investigationId}/experiments`),
    );
  }

  async getWorkers(investigationId: string) {
    return this.parse(
      z.array(investigationWorkerSchema),
      await this.request(`/investigations/${investigationId}/workers`),
    );
  }

  async getEvidence(investigationId: string) {
    return this.parse(
      z.array(evidenceArtifactResponseSchema),
      await this.request(`/investigations/${investigationId}/evidence`),
    );
  }

  async getEvidenceTextContent(investigationId: string, evidenceId: string) {
    return this.parse(
      evidenceTextContentResponseSchema,
      await this.request(`/investigations/${investigationId}/evidence/${evidenceId}/content`),
    );
  }

  async listFindings(investigationId: string) {
    return this.parse(
      z.array(findingSchema),
      await this.request(`/investigations/${investigationId}/findings`),
    );
  }

  async getFindingDetail(investigationId: string, findingId: string) {
    return this.parse(
      findingDetailSchema,
      await this.request(`/investigations/${investigationId}/findings/${findingId}`),
    );
  }
}
