import { Router } from 'express';
import { wishlistController } from '../controllers/wishlist.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { wishlistProductParamSchema, moveToCartSchema } from '../validators/wishlist.validator';

const router = Router();

router.use(authenticate);

router.get('/', wishlistController.getWishlist);
router.post('/:productId', validate(wishlistProductParamSchema), wishlistController.addProduct);
router.delete('/:productId', validate(wishlistProductParamSchema), wishlistController.removeProduct);
router.post(
  '/:productId/move-to-cart',
  validate(moveToCartSchema),
  wishlistController.moveToCart
);

export default router;
