import { Router } from 'express';
import { categoryController } from '../controllers/category.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate, authorize, optionalAuthenticate } from '../middleware/auth.middleware';
import { uploadCategoryImage } from '../middleware/upload.middleware';
import {
  createCategorySchema,
  updateCategorySchema,
  categoryIdParamSchema,
} from '../validators/category.validator';

const router = Router();

router.get('/', optionalAuthenticate, categoryController.list);
router.get('/:identifier', optionalAuthenticate, categoryController.getOne);

router.post(
  '/',
  authenticate,
  authorize('admin'),
  uploadCategoryImage,
  validate(createCategorySchema),
  categoryController.create
);

router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  uploadCategoryImage,
  validate(updateCategorySchema),
  categoryController.update
);

router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  validate(categoryIdParamSchema),
  categoryController.remove
);

export default router;
