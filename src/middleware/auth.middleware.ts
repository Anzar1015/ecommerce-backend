import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from '../auth/jwt';
import { ApiError } from '../utils/ApiError';
import { UserRole } from '../models/User.model';

/**
 * Verifies the access token from the httpOnly signed cookie
 * (falls back to Authorization: Bearer header for non-browser clients,
 * e.g. mobile apps or server-to-server calls) and attaches the
 * decoded payload to req.user.
 */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const cookieToken = req.signedCookies?.accessToken;
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : undefined;

  const token = cookieToken || headerToken;

  if (!token) {
    return next(ApiError.unauthorized('Authentication required'));
  }

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired access token'));
  }
}

/**
 * Role-based access control. Use after `authenticate`.
 * Example: router.delete('/products/:id', authenticate, authorize('admin'), ...)
 */
export function authorize(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(ApiError.unauthorized('Authentication required'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(ApiError.forbidden('You do not have permission to perform this action'));
    }
    next();
  };
}

/**
 * Optional authentication: attaches req.user if a valid token is present,
 * but does not fail the request if it's missing. Useful for guest-cart-style
 * routes that behave differently for logged-in users.
 */
export function optionalAuthenticate(req: Request, _res: Response, next: NextFunction): void {
  const cookieToken = req.signedCookies?.accessToken;
  if (!cookieToken) return next();
  try {
    req.user = verifyAccessToken(cookieToken);
  } catch {
    // ignore invalid token for optional auth
  }
  next();
}
