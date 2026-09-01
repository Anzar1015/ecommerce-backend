import { reviewRepository, AdminReviewFilters, ProductReviewSort, RatingSummary } from '../repositories/review.repository';
import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { uploadImageBuffer, deleteImage } from '../utils/cloudinary';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { buildPaginationMeta, PaginationMeta } from '../utils/pagination';
import { IReview, ReviewStatus } from '../models/Review.model';
import type { CreateReviewInput, UpdateReviewInput } from '../validators/review.validator';

const CLOUDINARY_FOLDER = 'ecommerce/reviews';

export interface ReviewWithVote extends IReview {
  hasVoted?: boolean;
}

async function recomputeProductRating(productId: string): Promise<void> {
  const summary = await reviewRepository.getRatingSummary(productId);
  await productRepository.updateRatings(productId, { average: summary.average, count: summary.count });
}

/** Verified-purchase gate (spec 14.2): the user must have a delivered order
 * containing this product, and must not already have reviewed it. Returns
 * the qualifying order id. */
async function assertCanReview(userId: string, productId: string): Promise<string> {
  const existing = await reviewRepository.findByUserAndProduct(userId, productId);
  if (existing) throw ApiError.conflict('You have already reviewed this product');

  const order = await orderRepository.findDeliveredOrderForUserAndProduct(userId, productId);
  if (!order) {
    throw ApiError.forbidden('You can only review products from a delivered order');
  }
  return order.id;
}

function attachVoteFlag(review: IReview, votedIds: Set<string>): ReviewWithVote {
  const plain = review as ReviewWithVote;
  plain.hasVoted = votedIds.has(review.id);
  return plain;
}

export const reviewService = {
  async getEligibility(userId: string, productId: string): Promise<{ canReview: boolean; reason?: string }> {
    try {
      await assertCanReview(userId, productId);
      return { canReview: true };
    } catch (error) {
      return { canReview: false, reason: error instanceof ApiError ? error.message : 'Not eligible' };
    }
  },

  async create(userId: string, input: CreateReviewInput, files: Express.Multer.File[]): Promise<IReview> {
    const orderId = await assertCanReview(userId, input.productId);

    const images = await Promise.all(files.map((file) => uploadImageBuffer(file.buffer, CLOUDINARY_FOLDER)));

    const review = await reviewRepository.create({
      user: userId,
      product: input.productId,
      order: orderId,
      rating: input.rating,
      title: input.title,
      comment: input.comment,
      images,
      isVerifiedPurchase: true,
      status: 'pending',
    });

    logger.info('Review created', { reviewId: review.id, productId: input.productId, userId });
    // Not yet visible/counted (status is 'pending') — no rating recompute needed here.
    return review;
  },

  /** Editing resets moderation to 'pending' so changed content is re-reviewed
   * before counting toward the public rating again. */
  async update(userId: string, reviewId: string, input: UpdateReviewInput): Promise<IReview> {
    const review = await reviewRepository.findById(reviewId);
    if (!review) throw ApiError.notFound('Review not found');
    if (review.user.toString() !== userId) throw ApiError.forbidden('You can only edit your own review');

    const wasApproved = review.status === 'approved';

    const updated = await reviewRepository.updateById(reviewId, { ...input, status: 'pending' });
    if (!updated) throw ApiError.notFound('Review not found');

    if (wasApproved) await recomputeProductRating(updated.product.toString());

    logger.info('Review updated', { reviewId, userId });
    return updated;
  },

  async remove(userId: string, reviewId: string): Promise<void> {
    const review = await reviewRepository.findById(reviewId);
    if (!review) throw ApiError.notFound('Review not found');
    if (review.user.toString() !== userId) throw ApiError.forbidden('You can only delete your own review');

    await Promise.all(review.images.map((image) => deleteImage(image.publicId)));
    await reviewRepository.deleteById(reviewId);

    if (review.status === 'approved') await recomputeProductRating(review.product.toString());
    logger.info('Review deleted by author', { reviewId, userId });
  },

  async listForProduct(
    productId: string,
    filters: { rating?: number; sort: ProductReviewSort },
    page: number,
    limit: number,
    viewerId?: string
  ): Promise<{ reviews: ReviewWithVote[]; pagination: PaginationMeta; summary: RatingSummary }> {
    const productFilters = { product: productId, status: 'approved' as ReviewStatus, rating: filters.rating };

    const [reviews, total, summary] = await Promise.all([
      reviewRepository.findByProduct(productFilters, filters.sort, page, limit),
      reviewRepository.countByProduct(productFilters),
      reviewRepository.getRatingSummary(productId),
    ]);

    let votedIds = new Set<string>();
    if (viewerId) {
      votedIds = await reviewRepository.findVotedReviewIds(
        reviews.map((r) => r.id),
        viewerId
      );
    }

    return {
      reviews: reviews.map((review) => attachVoteFlag(review, votedIds)),
      pagination: buildPaginationMeta(total, page, limit),
      summary,
    };
  },

  async toggleHelpful(userId: string, reviewId: string): Promise<IReview> {
    const review = await reviewRepository.findById(reviewId);
    if (!review) throw ApiError.notFound('Review not found');
    if (review.status !== 'approved') throw ApiError.badRequest('Cannot vote on this review');
    if (review.user.toString() === userId) throw ApiError.badRequest('You cannot vote on your own review');

    const updated = await reviewRepository.toggleHelpful(reviewId, userId);
    if (!updated) throw ApiError.notFound('Review not found');
    return updated;
  },

  // --- Admin ---

  async listForAdmin(
    filters: AdminReviewFilters,
    page: number,
    limit: number
  ): Promise<{ reviews: IReview[]; pagination: PaginationMeta }> {
    const [reviews, total] = await Promise.all([
      reviewRepository.findAllAdmin(filters, page, limit),
      reviewRepository.countAdmin(filters),
    ]);
    return { reviews, pagination: buildPaginationMeta(total, page, limit) };
  },

  async moderate(reviewId: string, status: 'approved' | 'rejected' | 'hidden'): Promise<IReview> {
    const review = await reviewRepository.findById(reviewId);
    if (!review) throw ApiError.notFound('Review not found');

    const wasApproved = review.status === 'approved';
    const updated = await reviewRepository.updateById(reviewId, { status });
    if (!updated) throw ApiError.notFound('Review not found');

    // Recompute whenever the approved set changes in either direction.
    if (wasApproved !== (status === 'approved')) {
      await recomputeProductRating(updated.product.toString());
    }

    logger.info('Review moderated', { reviewId, status });
    return updated;
  },

  async removeAdmin(reviewId: string): Promise<void> {
    const review = await reviewRepository.findById(reviewId);
    if (!review) throw ApiError.notFound('Review not found');

    await Promise.all(review.images.map((image) => deleteImage(image.publicId)));
    await reviewRepository.deleteById(reviewId);

    if (review.status === 'approved') await recomputeProductRating(review.product.toString());
    logger.info('Review deleted by admin', { reviewId });
  },
};
