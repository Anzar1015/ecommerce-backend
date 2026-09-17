import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { paymentLimiter } from '../middleware/rateLimiter.middleware';
import { verifyPaymentSchema, refundPaymentSchema } from '../validators/payment.validator';

const router = Router();

// Webhook route is mounted separately in app.ts (needs the raw body, before express.json()).

// Public: only the Razorpay key id, never the secret.
router.get('/config', paymentController.config);

router.post('/:orderId/verify', paymentLimiter, authenticate, validate(verifyPaymentSchema), paymentController.verify);

router.post(
  '/:orderId/refund',
  authenticate,
  authorize('admin'),
  validate(refundPaymentSchema),
  paymentController.refund
);

export default router;
