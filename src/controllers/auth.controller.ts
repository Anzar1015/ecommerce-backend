import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { authService } from '../services/auth.service';
import { setAuthCookies, clearAuthCookies } from '../utils/cookies';
import { logger } from '../utils/logger';
import { userRepository } from '../repositories/user.repository';

export const authController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const { user, accessToken, refreshToken } = await authService.register(req.body);
    setAuthCookies(res, accessToken, refreshToken);
    res.status(201).json(new ApiResponse(201, { user }, 'Account created successfully'));
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const { user, accessToken, refreshToken } = await authService.login(req.body);
    setAuthCookies(res, accessToken, refreshToken);
    res.status(200).json(new ApiResponse(200, { user }, 'Logged in successfully'));
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const incomingRefreshToken = req.signedCookies?.refreshToken;
    const { accessToken, refreshToken } = await authService.refresh(incomingRefreshToken);
    setAuthCookies(res, accessToken, refreshToken);
    res.status(200).json(new ApiResponse(200, {}, 'Token refreshed successfully'));
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    const refreshToken = req.signedCookies?.refreshToken;
    if (req.user && refreshToken) {
      await authService.logout(req.user.sub, refreshToken);
    }
    clearAuthCookies(res);
    res.status(200).json(new ApiResponse(200, {}, 'Logged out successfully'));
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const user = await userRepository.findById(req.user.sub);
    if (!user) throw ApiError.notFound('User not found');
    res.status(200).json(new ApiResponse(200, { user: user.toJSON() }, 'Current user fetched'));
  }),

  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    const result = await authService.forgotPassword(req.body.email);

    // TODO(future module): send resetToken via email using an SMTP/email service.
    // For now we log it in development so the flow is testable end-to-end.
    if (result) {
      logger.info('Password reset requested', { userId: result.user.id });
      if (process.env.NODE_ENV !== 'production') {
        logger.debug('Password reset token (dev only)', { token: result.resetToken });
      }
    }

    // Always return the same response, whether or not the email exists,
    // to avoid leaking which emails are registered.
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          {},
          'If an account with that email exists, a password reset link has been sent'
        )
      );
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.params;
    const { password } = req.body;
    await authService.resetPassword(token, password);
    res.status(200).json(new ApiResponse(200, {}, 'Password reset successfully. Please log in.'));
  }),
};
