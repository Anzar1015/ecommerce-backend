import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { reviewService } from '../services/review.service';
import type { ProductReviewsQuery, AdminReviewQuery } from '../validators/review.validator';

function filesFromRequest(req: Request): Express.Multer.File[] {
  return Array.isArray(req.files) ? req.files : [];
}

export const reviewController = {
  eligibility: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await reviewService.getEligibility(req.user.sub, req.params.productId);
    res.status(200).json(new ApiResponse(200, result, 'Eligibility checked'));
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const review = await reviewService.create(req.user.sub, req.body, filesFromRequest(req));
    res.status(201).json(new ApiResponse(201, { review }, 'Review submitted for moderation'));
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const review = await reviewService.update(req.user.sub, req.params.id, req.body);
    res.status(200).json(new ApiResponse(200, { review }, 'Review updated successfully'));
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    await reviewService.remove(req.user.sub, req.params.id);
    res.status(200).json(new ApiResponse(200, {}, 'Review deleted successfully'));
  }),

  listForProduct: asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, rating, sort } = req.query as unknown as ProductReviewsQuery;
    const result = await reviewService.listForProduct(
      req.params.productId,
      { rating, sort },
      page,
      limit,
      req.user?.sub
    );
    res.status(200).json(new ApiResponse(200, result, 'Reviews fetched successfully'));
  }),

  toggleHelpful: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const review = await reviewService.toggleHelpful(req.user.sub, req.params.id);
    res.status(200).json(new ApiResponse(200, { review }, 'Vote recorded'));
  }),

  adminList: asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, ...filters } = req.query as unknown as AdminReviewQuery;
    const result = await reviewService.listForAdmin(filters, page, limit);
    res.status(200).json(new ApiResponse(200, result, 'Reviews fetched successfully'));
  }),

  adminModerate: asyncHandler(async (req: Request, res: Response) => {
    const review = await reviewService.moderate(req.params.id, req.body.status);
    res.status(200).json(new ApiResponse(200, { review }, 'Review moderated successfully'));
  }),

  adminRemove: asyncHandler(async (req: Request, res: Response) => {
    await reviewService.removeAdmin(req.params.id);
    res.status(200).json(new ApiResponse(200, {}, 'Review deleted successfully'));
  }),
};
