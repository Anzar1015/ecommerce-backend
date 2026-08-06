import { z } from 'zod';

export const wishlistProductParamSchema = z.object({
  params: z.object({
    productId: z.string().min(1),
  }),
});

export const moveToCartSchema = z.object({
  params: z.object({
    productId: z.string().min(1),
  }),
  body: z.object({
    quantity: z.coerce.number().int().positive().default(1),
  }),
});

export type MoveToCartInput = z.infer<typeof moveToCartSchema>['body'];
