import { Router } from 'express';
import { shippingController } from '../controllers/shipping.controller';
import { validate } from '../middleware/validate.middleware';
import { shippingMethodsQuerySchema } from '../validators/shipping.validator';

const router = Router();

router.get('/methods', validate(shippingMethodsQuerySchema), shippingController.listMethods);

export default router;
