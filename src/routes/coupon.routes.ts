import { Router } from 'express';
import { couponController } from '../controllers/coupon.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  createCouponSchema,
  updateCouponSchema,
  couponIdParamSchema,
  couponQuerySchema,
  validateCouponSchema,
} from '../validators/coupon.validator';

const router = Router();

router.use(authenticate);

// Registered before /:id so "validate" is never captured as a coupon id.
router.post('/validate', validate(validateCouponSchema), couponController.validate);

router.post('/', authorize('admin'), validate(createCouponSchema), couponController.create);
router.get('/', authorize('admin'), validate(couponQuerySchema), couponController.list);
router.get('/:id', authorize('admin'), validate(couponIdParamSchema), couponController.getOne);
router.patch('/:id', authorize('admin'), validate(updateCouponSchema), couponController.update);
router.delete('/:id', authorize('admin'), validate(couponIdParamSchema), couponController.remove);

export default router;
