import { z } from 'zod';

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    description: z.string().trim().max(2000).optional(),
    isActive: z.coerce.boolean().optional(),
  }),
});

export const updateCategorySchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(2000).optional(),
    isActive: z.coerce.boolean().optional(),
  }),
});

export const categoryIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>['body'];
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>['body'];
