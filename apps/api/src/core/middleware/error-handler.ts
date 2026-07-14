import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { ApplicationError } from '../errors/application-error.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  if (error instanceof ZodError) { response.status(422).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed', details: error.flatten(), requestId: request.id } }); return; }
  if (error instanceof ApplicationError) { response.status(error.statusCode).json({ error: { code: error.code, message: error.message, details: error.details, requestId: request.id } }); return; }
  request.log?.error({ err: error }, 'Unhandled request error');
  response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred', requestId: request.id } });
};
