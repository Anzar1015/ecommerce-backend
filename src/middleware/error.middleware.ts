import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { config } from '../config/env';
import mongoose from 'mongoose';

/**
 * Converts known non-ApiError exceptions (Mongoose validation errors,
 * duplicate key errors, JWT errors, etc.) into ApiError so the response
 * shape stays consistent regardless of where the error originated.
 */
function normalizeError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;

  if (err instanceof mongoose.Error.ValidationError) {
    const errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
    return new ApiError(400, 'Validation failed', errors);
  }

  if (err instanceof mongoose.Error.CastError) {
    return new ApiError(400, `Invalid value for field "${err.path}"`);
  }

  if (typeof err === 'object' && err !== null && 'code' in err && (err as any).code === 11000) {
    const field = Object.keys((err as any).keyValue ?? {})[0] ?? 'field';
    return new ApiError(409, `${field} already exists`);
  }

  if (err instanceof Error && err.name === 'JsonWebTokenError') {
    return ApiError.unauthorized('Invalid token');
  }

  if (err instanceof Error && err.name === 'TokenExpiredError') {
    return ApiError.unauthorized('Token expired');
  }

  if (err instanceof Error && (err.name === 'MulterError' || err.message === 'Only image files are allowed')) {
    return ApiError.badRequest(err.message);
  }

  const message = err instanceof Error ? err.message : 'Internal server error';
  return new ApiError(500, message, [], err instanceof Error ? err.stack : undefined);
}

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const apiError = normalizeError(err);

  if (apiError.statusCode >= 500) {
    logger.error(apiError.message, {
      stack: apiError.stack,
      path: req.originalUrl,
      method: req.method,
    });
  } else {
    logger.warn(apiError.message, { path: req.originalUrl, method: req.method });
  }

  res.status(apiError.statusCode).json({
    success: false,
    message: apiError.message,
    errors: apiError.errors,
    ...(config.isProduction ? {} : { stack: apiError.stack }),
  });
}
