import express, { Application } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config/env';
import { apiLimiter } from './middleware/rateLimiter.middleware';
import { notFoundHandler, errorHandler } from './middleware/error.middleware';
import routes from './routes';
import { paymentController } from './controllers/payment.controller';
import { logger } from './utils/logger';

export function createApp(): Application {
  const app = express();

  // Trust reverse proxy (needed for correct req.ip / secure cookies behind nginx/load balancer)
  app.set('trust proxy', 1);

  // --- Security middleware ---
  app.use(helmet());
  app.use(
    cors({
      origin: config.clientUrl,
      credentials: true, // allow cookies to be sent cross-origin
    })
  );

  // --- Request logging ---
  app.use((req, _res, next) => {
    logger.http(`${req.method} ${req.originalUrl}`);
    next();
  });

  // --- Payment webhooks: raw body required (BEFORE express.json()) so provider
  // signature verification (Stripe et al.) can hash the untouched payload. ---
  app.post(
    '/api/v1/payments/webhook/:provider',
    express.raw({ type: 'application/json', limit: '1mb' }),
    paymentController.webhook
  );

  // --- Body & cookie parsing ---
  app.use(express.json({ limit: '10kb' })); // guard against large payload attacks
  app.use(express.urlencoded({ extended: true, limit: '10kb' }));
  app.use(cookieParser(config.cookieSecret));

  // --- Rate limiting (applies to all /api routes) ---
  app.use('/api', apiLimiter);

  // --- Health check (for load balancers / uptime monitors) ---
  app.get('/health', (_req, res) => {
    res.status(200).json({ success: true, message: 'OK', data: { uptime: process.uptime() } });
  });

  // --- API routes ---
  app.use('/api/v1', routes);

  // --- 404 + centralized error handling ---
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
