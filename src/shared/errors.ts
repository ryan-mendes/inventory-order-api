import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (entity: string, id: number | string) =>
  new AppError(404, 'NOT_FOUND', `${entity} ${id} not found`);

export const conflict = (message: string) => new AppError(409, 'CONFLICT', message);

export const unprocessable = (message: string) =>
  new AppError(422, 'BUSINESS_RULE_VIOLATION', message);

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: err.flatten().fieldErrors },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message } });
    return;
  }

  console.error(err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } });
};
