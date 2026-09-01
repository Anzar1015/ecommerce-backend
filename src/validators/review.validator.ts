import { z } from 'zod';

export const createReviewSchema = z.object({
  body: z.object({
    productId: z.string().min(1, 'Product is required'),
    rating: z.coerce.number().int('Rating must be a whole number').min(1).max(5),
    title: z.string().trim().min(3, 'Title must be at least 3 characters').max(150),
    comment: z.string().trim().min(10, 'Comment must be at least 10 characters').max(2000),
  }),
});

export const updateReviewSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    rating: z.coerce.number().int('Rating must be a whole number').min(1).max(5).optional(),
    title: z.string().trim().min(3).max(150).optional(),
    comment: z.string().trim().min(10).max(2000).optional(),
  }),
});

export const reviewIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const productReviewsQuerySchema = z.object({
  params: z.object({ productId: z.string().min(1) }),
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(50).default(10),
    rating: z.coerce.number().int().min(1).max(5).optional(),
    sort: z.enum(['recent', 'highest', 'lowest', 'helpful']).default('recent'),
  }),
});

export const adminReviewQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z.enum(['pending', 'approved', 'rejected', 'hidden']).optional(),
    productId: z.string().optional(),
  }),
});

export const moderateReviewSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z.object({
    status: z.enum(['approved', 'rejected', 'hidden']),
  }),
});

export type CreateReviewInput = z.infer<typeof createReviewSchema>['body'];
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>['body'];
export type ProductReviewsQuery = z.infer<typeof productReviewsQuerySchema>['query'];
export type AdminReviewQuery = z.infer<typeof adminReviewQuerySchema>['query'];
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>['body'];
