import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { ApplicationError } from '../errors/application-error.js';

export function validateBody(schema: ZodTypeAny, validationStatus = 422) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    if (validationStatus === 422) {
      request.body = schema.parse(request.body);
      next();
      return;
    }
    const result = schema.safeParse(request.body);
    if (!result.success) {
      next(
        new ApplicationError(
          'VALIDATION_ERROR',
          'Request validation failed',
          validationStatus,
          result.error.flatten(),
        ),
      );
      return;
    }
    request.body = result.data;
    next();
  };
}
