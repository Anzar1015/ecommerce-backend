import { Router } from 'express';
import { cartController } from '../controllers/cart.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import {
  addCartItemSchema,
  updateCartItemSchema,
  cartItemParamSchema,
  mergeCartSchema,
} from '../validators/cart.validator';

const router = Router();

// Cart is always tied to a signed-in user; guest carts live entirely
// client-side and only touch the API once, via /merge, right after login.
router.use(authenticate);

router.get('/', cartController.getCart);
router.post('/items', validate(addCartItemSchema), cartController.addItem);
router.patch('/items/:productId', validate(updateCartItemSchema), cartController.updateItem);
router.delete('/items/:productId', validate(cartItemParamSchema), cartController.removeItem);
router.post('/merge', validate(mergeCartSchema), cartController.merge);

export default router;
