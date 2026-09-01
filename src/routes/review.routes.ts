import { Router } from 'express';
import { reviewController } from '../controllers/review.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate, authorize, optionalAuthenticate } from '../middleware/auth.middleware';
import { uploadReviewImages } from '../middleware/upload.middleware';
import {
  createReviewSchema,
  updateReviewSchema,
  reviewIdParamSchema,
  productReviewsQuerySchema,
  adminReviewQuerySchema,
  moderateReviewSchema,
} from '../validators/review.validator';

const router = Router();

// Public / customer — registered before the generic /:id routes below.
router.get(
  '/product/:productId',
  optionalAuthenticate, // logged-in viewers get their own `hasVoted` flags on each review
  validate(productReviewsQuerySchema),
  reviewController.listForProduct
);
router.get('/eligibility/:productId', authenticate, reviewController.eligibility);

// Admin — mounted under /admin/* so these never collide with the customer
// `/:id`-shaped routes below (same convention as order.routes.ts).
router.get('/admin/all', authenticate, authorize('admin'), validate(adminReviewQuerySchema), reviewController.adminList);
router.patch(
  '/admin/:id/status',
  authenticate,
  authorize('admin'),
  validate(moderateReviewSchema),
  reviewController.adminModerate
);
router.delete(
  '/admin/:id',
  authenticate,
  authorize('admin'),
  validate(reviewIdParamSchema),
  reviewController.adminRemove
);

router.post('/', authenticate, uploadReviewImages, validate(createReviewSchema), reviewController.create);
router.patch('/:id', authenticate, validate(updateReviewSchema), reviewController.update);
router.delete('/:id', authenticate, validate(reviewIdParamSchema), reviewController.remove);
router.post('/:id/helpful', authenticate, validate(reviewIdParamSchema), reviewController.toggleHelpful);

export default router;
