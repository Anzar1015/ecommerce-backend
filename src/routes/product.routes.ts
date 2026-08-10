import { Router } from 'express';
import { productController } from '../controllers/product.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate, authorize, optionalAuthenticate } from '../middleware/auth.middleware';
import { uploadProductImages } from '../middleware/upload.middleware';
import {
  createProductSchema,
  updateProductSchema,
  productIdParamSchema,
  productQuerySchema,
  productSuggestQuerySchema,
  removeProductImageSchema,
} from '../validators/product.validator';

const router = Router();

router.get('/', optionalAuthenticate, validate(productQuerySchema), productController.list);
// Must be registered before /:identifier, otherwise "suggestions" would be
// captured as a product identifier.
router.get('/suggestions', validate(productSuggestQuerySchema), productController.suggestions);
router.get('/:identifier', optionalAuthenticate, productController.getOne);

router.post(
  '/',
  authenticate,
  authorize('admin'),
  uploadProductImages,
  validate(createProductSchema),
  productController.create
);

router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  uploadProductImages,
  validate(updateProductSchema),
  productController.update
);

router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validate(productIdParamSchema),
  productController.remove
);

router.delete(
  '/:id/images',
  authenticate,
  authorize('admin'),
  validate(removeProductImageSchema),
  productController.removeImage
);

export default router;
