import { Router } from 'express';
import { orderController } from '../controllers/order.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import {
  checkoutSchema,
  orderIdParamSchema,
  cancelOrderSchema,
  orderHistoryQuerySchema,
  adminOrderQuerySchema,
  updateOrderStatusSchema,
  updateOrderShippingSchema,
} from '../validators/order.validator';

const router = Router();

router.use(authenticate);

// Admin — mounted under /admin/* so these never collide with the customer
// `/:id`-shaped routes below (different segment count either way, but kept
// explicit and registered first for readability).
router.get('/admin/all', authorize('admin'), validate(adminOrderQuerySchema), orderController.adminList);
router.get('/admin/:id', authorize('admin'), validate(orderIdParamSchema), orderController.adminGetOne);
router.patch(
  '/admin/:id/status',
  authorize('admin'),
  validate(updateOrderStatusSchema),
  orderController.adminUpdateStatus
);
router.patch(
  '/admin/:id/shipping',
  authorize('admin'),
  validate(updateOrderShippingSchema),
  orderController.adminUpdateShipping
);

// Customer
router.post('/checkout', validate(checkoutSchema), orderController.checkout);
router.get('/', validate(orderHistoryQuerySchema), orderController.myOrders);
router.get('/:id', validate(orderIdParamSchema), orderController.myOrderDetails);
router.post('/:id/cancel', validate(cancelOrderSchema), orderController.cancel);

export default router;
