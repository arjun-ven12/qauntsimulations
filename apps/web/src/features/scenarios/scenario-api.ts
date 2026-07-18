import { z } from 'zod';
import { authApi } from '../../services/auth-api.js';
import { useAuthStore } from '../../stores/auth.store.js';

export interface ScenarioControls {
  browsers: string[];
  viewports: string[];
  networkProfiles: string[];
  maximumWorlds: number;
  maximumConcurrentWorkers: number;
}

export interface ScenarioLaunchInput {
  environmentId: string;
  journeyId: string;
  invariantIds: string[];
  scenario: {
    prompt: string;
    controls: ScenarioControls;
  };
}

export interface ScenarioPreflightWarning {
  code: string;
  field: string;
  message: string;
  blocking: false;
}

export interface ScenarioPreflightResult {
  status: 'READY';
  projectId: string;
  environmentId: string;
  journeyId: string;
  invariantIds: string[];
  validation: {
    status: 'READY';
    warnings: ScenarioPreflightWarning[];
  };
}

export interface ScenarioLaunchResult {
  id: string;
  status: string;
}

const warningSchema = z.object({
  code: z.string(),
  field: z.string(),
  message: z.string(),
  blocking: z.literal(false),
});
const preflightSchema = z.object({
  status: z.literal('READY'),
  projectId: z.string(),
  environmentId: z.string(),
  journeyId: z.string(),
  invariantIds: z.array(z.string()),
  validation: z.object({
    status: z.literal('READY'),
    warnings: z.array(warningSchema),
  }),
});
const launchResultSchema = z.object({ id: z.string(), status: z.string() }).passthrough();

export class ScenarioApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ScenarioApiError';
  }
}

class HttpScenarioApi {
  private readonly baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

  async preflight(projectId: string, input: ScenarioLaunchInput) {
    return preflightSchema.parse(
      await this.request(`/projects/${projectId}/investigations/preflight`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  }

  async launch(projectId: string, input: ScenarioLaunchInput) {
    return launchResultSchema.parse(
      await this.request(`/projects/${projectId}/investigations`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    );
  }

  private async request(path: string, init: RequestInit, retry = true): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...init.headers },
      });
    } catch {
      throw new ScenarioApiError(
        'Rift could not reach the Investigation service.',
        0,
        'NETWORK_ERROR',
      );
    }

    const payload = (await response.json()) as unknown;
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
      throw new ScenarioApiError(
        body?.error?.message ?? 'Scenario launch request failed.',
        response.status,
        body?.error?.code ?? 'SCENARIO_LAUNCH_REQUEST_FAILED',
        body?.error?.details,
      );
    }
    return payload;
  }
}

export const scenarioApi = new HttpScenarioApi();
