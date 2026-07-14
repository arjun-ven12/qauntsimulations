export interface CreateEnvironmentInput { name: string; type: 'DEVELOPMENT' | 'STAGING' | 'PRODUCTION' | 'DEMO'; baseUrl: string; manifest: Record<string, unknown> }
