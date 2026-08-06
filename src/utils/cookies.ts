import { Response } from 'express';
import { config } from '../config/env';
import { durationToMs } from '../auth/jwt';

const baseCookieOptions = {
  httpOnly: true,
  secure: config.isProduction, // HTTPS only in production
  sameSite: (config.isProduction ? 'strict' : 'lax') as 'strict' | 'lax',
  signed: true,
  path: '/',
};

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie('accessToken', accessToken, {
    ...baseCookieOptions,
    maxAge: durationToMs(config.jwt.accessExpiry),
  });
  res.cookie('refreshToken', refreshToken, {
    ...baseCookieOptions,
    maxAge: durationToMs(config.jwt.refreshExpiry),
    path: '/api/v1/auth', // refresh token only sent to auth routes
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie('accessToken', { ...baseCookieOptions });
  res.clearCookie('refreshToken', { ...baseCookieOptions, path: '/api/v1/auth' });
}
