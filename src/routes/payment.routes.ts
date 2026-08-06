import { Router } from 'express';
import { paymentController } from '../controllers/payment.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { verifyPaymentSchema } from '../validators/payment.validator';

const router = Router();

// Webhook route is mounted separately in app.ts (needs the raw body, before express.json()).
router.post('/:orderId/verify', authenticate, validate(verifyPaymentSchema), paymentController.verify);

export default router;
