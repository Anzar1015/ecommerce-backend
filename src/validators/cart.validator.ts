import { z } from 'zod';

export const addCartItemSchema = z.object({
  body: z.object({
    productId: z.string().min(1, 'productId is required'),
    quantity: z.coerce.number().int().positive('Quantity must be at least 1'),
  }),
});

export const updateCartItemSchema = z.object({
  params: z.object({
    productId: z.string().min(1),
  }),
  body: z.object({
    quantity: z.coerce.number().int().min(0, 'Quantity cannot be negative'),
  }),
});

export const cartItemParamSchema = z.object({
  params: z.object({
    productId: z.string().min(1),
  }),
});

export const mergeCartSchema = z.object({
  body: z.object({
    items: z
      .array(
        z.object({
          productId: z.string().min(1),
          quantity: z.coerce.number().int().positive(),
        })
      )
      .max(100, 'Too many items to merge'),
  }),
});

export type AddCartItemInput = z.infer<typeof addCartItemSchema>['body'];
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>['body'];
export type MergeCartInput = z.infer<typeof mergeCartSchema>['body'];
