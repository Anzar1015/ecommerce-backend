import crypto from 'crypto';
import { userRepository } from '../repositories/user.repository';
import { ApiError } from '../utils/ApiError';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../auth/jwt';
import { IUser } from '../models/User.model';
import { logger } from '../utils/logger';
import type { LoginInput, RegisterInput } from '../validators/auth.validator';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

function sanitizeUser(user: IUser) {
  // toJSON transform on the model already strips sensitive fields
  return user.toJSON();
}

async function issueTokens(user: IUser): Promise<AuthTokens> {
  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const refreshToken = signRefreshToken({ sub: user.id });
  await userRepository.addRefreshToken(user.id, refreshToken);
  return { accessToken, refreshToken };
}

export const authService = {
  async register(input: RegisterInput) {
    const existing = await userRepository.findByEmail(input.email);
    if (existing) {
      throw ApiError.conflict('An account with this email already exists');
    }

    const user = await userRepository.create(input);
    const tokens = await issueTokens(user);

    logger.info('User registered', { userId: user.id, email: user.email });

    return { user: sanitizeUser(user), ...tokens };
  },

  async login(input: LoginInput) {
    const user = await userRepository.findByEmail(input.email, true);
    if (!user) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    const isMatch = await user.comparePassword(input.password);
    if (!isMatch) {
      logger.warn('Failed login attempt', { email: input.email });
      throw ApiError.unauthorized('Invalid email or password');
    }

    const tokens = await issueTokens(user);
    logger.info('User logged in', { userId: user.id });

    return { user: sanitizeUser(user), ...tokens };
  },

  async refresh(refreshToken: string): Promise<AuthTokens> {
    if (!refreshToken) {
      throw ApiError.unauthorized('Refresh token missing');
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    const user = await userRepository.findById(payload.sub, true);
    if (!user || !user.refreshTokens.includes(refreshToken)) {
      // Token reuse or unknown token: treat as compromised, revoke all sessions
      if (user) await userRepository.clearAllRefreshTokens(user.id);
      throw ApiError.unauthorized('Invalid refresh token');
    }

    // Rotate: invalidate the old refresh token, issue a new pair
    await userRepository.removeRefreshToken(user.id, refreshToken);
    return issueTokens(user);
  },

  async logout(userId: string, refreshToken: string): Promise<void> {
    await userRepository.removeRefreshToken(userId, refreshToken);
  },

  async forgotPassword(email: string): Promise<{ resetToken: string; user: IUser } | null> {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      // Do not reveal whether the email exists — respond the same either way
      return null;
    }
    const resetToken = user.generatePasswordResetToken();
    await user.save({ validateBeforeSave: false });
    return { resetToken, user };
  },

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const user = await userRepository.findByResetToken(hashedToken);

    if (!user) {
      throw ApiError.badRequest('Password reset token is invalid or has expired');
    }

    user.password = newPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Invalidate all existing sessions after a password reset
    await userRepository.clearAllRefreshTokens(user.id);
  },
};
