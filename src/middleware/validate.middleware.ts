import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ApiError } from '../utils/ApiError';

/**
 * Validates req.body / req.params / req.query against a Zod schema.
 * Usage: router.post('/route', validate(schema), controller)
 */
export const validate =
  (schema: AnyZodObject) => (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      // Overwrite with parsed/coerced values (e.g. trimmed, lowercased, numeric defaults)
      req.body = parsed.body ?? req.body;
      req.params = (parsed.params as typeof req.params) ?? req.params;
      if (parsed.query) req.query = parsed.query as typeof req.query;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formatted = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return next(ApiError.badRequest('Validation failed', formatted));
      }
      next(error);
    }
  };
