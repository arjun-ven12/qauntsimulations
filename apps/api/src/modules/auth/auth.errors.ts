import { ApplicationError } from '../../core/errors/application-error.js';
export class InvalidCredentialsError extends ApplicationError {
  constructor() {
    super('INVALID_CREDENTIALS', 'Email or password is incorrect', 401);
  }
}
export class EmailAlreadyRegisteredError extends ApplicationError {
  constructor() {
    super('EMAIL_REGISTERED', 'An account already exists for this email', 409);
  }
}
