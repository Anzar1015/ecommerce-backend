import rateLimit from 'express-rate-limit';
import { config } from '../config/env';

/** General API rate limiter */
export const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests, please try again later',
    errors: [],
  },
});

/** Stricter limiter for auth endpoints to slow down brute-force / credential stuffing */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
    errors: [],
  },
  skipSuccessfulRequests: true,
});

/** Stricter limiter for order-creation and payment-verification — both hit a
 * paid gateway API and are prime targets for scripted abuse (order-spam,
 * signature brute-forcing). Not applied to the webhook route: that's driven
 * by Razorpay's own retry schedule, not a client we want to throttle. */
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many payment requests, please try again later',
    errors: [],
  },
});
