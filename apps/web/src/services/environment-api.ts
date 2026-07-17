import { useAuthStore } from '../stores/auth.store.js';
import { authApi } from './auth-api.js';

export type HttpMethod = 'GET' | 'POST' | 'OPTIONS' | 'PUT' | 'PATCH' | 'DELETE';
export type EnvironmentType = 'LOCAL' | 'STAGING' | 'PREVIEW' | 'TEST_MIRROR';
export type EnvironmentAction =
  | 'NAVIGATE_APPLICATION'
  | 'READ_APPLICATION_STATE'
  | 'SUBMIT_FORMS'
  | 'PERFORM_CHECKOUT'
  | 'SUBMIT_MOCK_PAYMENT'
  | 'CREATE_TEST_ORDER'
  | 'RESET_TEST_DATA'
  | 'CHANGE_FEATURE_FLAGS'
  | 'CAPTURE_SCREENSHOTS'
  | 'CAPTURE_TRACES'
  | 'RECORD_NETWORK_TRAFFIC';

export interface EnvironmentConfig {
  featureFlagEndpoint: string | null;
  featureFlagMethod: HttpMethod;
  featureFlags: Array<{
    key: string;
    type: 'BOOLEAN' | 'STRING' | 'NUMBER';
    value: boolean | string | number;
    description: string | null;
  }>;
  payment: {
    mode: 'MOCK' | 'SANDBOX' | 'DISABLED';
    delayMs: number;
    result: 'SUCCESS' | 'DECLINE' | 'TIMEOUT' | 'INTERMITTENT';
    retryEnabled: boolean;
    maxRetries: number;
  };
  reset: {
    mode: 'HTTP_ENDPOINT' | 'SCRIPT_REFERENCE' | 'MANUAL' | 'NONE';
    endpoint: string | null;
    method: HttpMethod;
    credentialReference: string | null;
    timeoutMs: number;
    expectedStatus: number;
    beforeEachWorld: boolean;
    afterEachWorld: boolean;
    procedure: string | null;
    scriptReference: string | null;
  };
  testData: {
    customerCredentialReference: string | null;
    productIdentifier: string | null;
    initialInventory: number;
    seedProfile: string | null;
    orderCleanup: string | null;
    isolation: 'RESET_BEFORE_WORLD' | 'UNIQUE_TEST_DATA_PER_WORLD' | 'SHARED_READ_ONLY';
  };
  credentialReferences: Array<{
    label: string;
    reference: string;
    purpose: string | null;
  }>;
  allowedActions: EnvironmentAction[];
  validationResults?: Array<{
    key: string;
    label: string;
    status: 'PASS' | 'WARNING' | 'FAIL';
    message: string;
  }>;
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  type: EnvironmentType;
  baseUrl: string;
  apiBaseUrl: string | null;
  healthCheckUrl: string | null;
  isDefault: boolean;
  validationStatus: string;
  lastValidatedAt: string | null;
  featureFlags: EnvironmentConfig['featureFlags'];
  paymentConfiguration: EnvironmentConfig['payment'];
  resetConfiguration: EnvironmentConfig['reset'];
  testDataConfiguration: EnvironmentConfig['testData'];
  credentialReferences: EnvironmentConfig['credentialReferences'];
  allowedActions: EnvironmentAction[];
  validationResults: NonNullable<EnvironmentConfig['validationResults']>;
  configuration: EnvironmentConfig;
  createdAt: string;
  updatedAt: string;
}

export interface EnvironmentInput {
  name: string;
  description: string | null;
  type: EnvironmentType;
  baseUrl: string;
  apiBaseUrl: string | null;
  healthCheckUrl: string | null;
  isDefault: boolean;
  configuration: EnvironmentConfig;
  acknowledgement: true;
}

export class EnvironmentApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'EnvironmentApiError';
  }
}

class HttpEnvironmentApi {
  private readonly baseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:4000/api';

  list(projectId: string): Promise<Environment[]> {
    return this.request(`/projects/${projectId}/environments`);
  }

  get(projectId: string, environmentId: string): Promise<Environment> {
    return this.request(`/projects/${projectId}/environments/${environmentId}`);
  }

  create(projectId: string, input: EnvironmentInput): Promise<Environment> {
    return this.request(`/projects/${projectId}/environments`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  update(
    projectId: string,
    environmentId: string,
    input: Partial<EnvironmentInput>,
  ): Promise<Environment> {
    return this.request(`/projects/${projectId}/environments/${environmentId}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  }

  validate(projectId: string, environmentId: string): Promise<Environment> {
    return this.request(`/projects/${projectId}/environments/${environmentId}/validate`, {
      method: 'POST',
    });
  }

  setDefault(projectId: string, environmentId: string): Promise<Environment> {
    return this.request(`/projects/${projectId}/environments/${environmentId}/set-default`, {
      method: 'POST',
    });
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
      throw new EnvironmentApiError('WorldLab could not reach the environment service.', 0);
    }
    const data = (await response.json()) as T & { error?: { message?: string } };
    if (response.status === 401 && retry) {
      try {
        await authApi.refresh();
        return this.request<T>(path, init, false);
      } catch {
        await useAuthStore.getState().signOut();
      }
    }
    if (!response.ok)
      throw new EnvironmentApiError(data.error?.message ?? 'Environment request failed.', response.status);
    return data;
  }
}

export const environmentApi = new HttpEnvironmentApi();
