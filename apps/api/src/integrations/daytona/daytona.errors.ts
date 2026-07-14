import { ApplicationError } from '../../core/errors/application-error.js';
export class SandboxProviderError extends ApplicationError { constructor(message: string, details?: unknown) { super('SANDBOX_PROVIDER_ERROR', message, 502, details); } }
