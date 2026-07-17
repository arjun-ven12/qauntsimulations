import type { AllowedHttpMethod, ProjectSafetyConfiguration } from '../projects/projects.types.js';

export const environmentTypes = ['LOCAL', 'STAGING', 'PREVIEW', 'TEST_MIRROR'] as const;
export type EnvironmentTypeInput = (typeof environmentTypes)[number];
export const environmentActions = ['NAVIGATE_APPLICATION', 'READ_APPLICATION_STATE', 'SUBMIT_FORMS', 'PERFORM_CHECKOUT', 'SUBMIT_MOCK_PAYMENT', 'CREATE_TEST_ORDER', 'RESET_TEST_DATA', 'CHANGE_FEATURE_FLAGS', 'CAPTURE_SCREENSHOTS', 'CAPTURE_TRACES', 'RECORD_NETWORK_TRAFFIC'] as const;
export type EnvironmentAction = (typeof environmentActions)[number];

export interface EnvironmentConfiguration {
  featureFlagEndpoint: string | null;
  featureFlagMethod: AllowedHttpMethod;
  featureFlags: Array<{ key: string; type: 'BOOLEAN' | 'STRING' | 'NUMBER'; value: boolean | string | number; description: string | null }>;
  payment: { mode: 'MOCK' | 'SANDBOX' | 'DISABLED'; delayMs: number; result: 'SUCCESS' | 'DECLINE' | 'TIMEOUT' | 'INTERMITTENT'; retryEnabled: boolean; maxRetries: number };
  reset: { mode: 'HTTP_ENDPOINT' | 'SCRIPT_REFERENCE' | 'MANUAL' | 'NONE'; endpoint: string | null; method: AllowedHttpMethod; credentialReference: string | null; timeoutMs: number; expectedStatus: number; beforeEachWorld: boolean; afterEachWorld: boolean; procedure: string | null; scriptReference: string | null };
  testData: { customerCredentialReference: string | null; productIdentifier: string | null; initialInventory: number; seedProfile: string | null; orderCleanup: string | null; isolation: 'RESET_BEFORE_WORLD' | 'UNIQUE_TEST_DATA_PER_WORLD' | 'SHARED_READ_ONLY' };
  credentialReferences: Array<{ label: string; reference: string; purpose: string | null }>;
  allowedActions: EnvironmentAction[];
  validationResults: Array<{ key: string; label: string; status: 'PASS' | 'WARNING' | 'FAIL'; message: string }>;
}
export interface EnvironmentInput { name: string; description: string | null; type: EnvironmentTypeInput; baseUrl: string; apiBaseUrl: string | null; healthCheckUrl: string | null; isDefault: boolean; configuration: EnvironmentConfiguration; acknowledgement: true; }
export interface EnvironmentProject { id: string; organisationId: string; safetyPolicies: Array<{ domainAllowlist: string[]; configuration: unknown }>; }
export interface EnvironmentMembership { role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER'; }
export interface EnvironmentRecord { id: string; projectId: string; name: string; description: string | null; type: string; baseUrl: string; apiBaseUrl: string | null; healthCheckUrl: string | null; isDefault: boolean; validationStatus: string; lastValidatedAt: Date | null; configuration: unknown; manifest: unknown; createdAt: Date; updatedAt: Date; }
export interface EnvironmentSafetyContext { project: EnvironmentProject; safety: ProjectSafetyConfiguration; }
