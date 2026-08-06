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
  removeProductImageSchema,
} from '../validators/product.validator';

const router = Router();

router.get('/', optionalAuthenticate, validate(productQuerySchema), productController.list);
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
