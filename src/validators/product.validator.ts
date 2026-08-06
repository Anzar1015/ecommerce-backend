import { z } from 'zod';

const tagsFromString = z
  .string()
  .optional()
  .transform((val) => (val ? val.split(',').map((t) => t.trim()).filter(Boolean) : undefined));

export const createProductSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(200),
    description: z.string().trim().min(10, 'Description must be at least 10 characters').max(5000),
    category: z.string().min(1, 'Category is required'),
    price: z.coerce.number().positive('Price must be greater than 0'),
    discount: z.coerce.number().min(0).max(100).default(0),
    stock: z.coerce.number().int().min(0, 'Stock cannot be negative'),
    lowStockThreshold: z.coerce.number().int().min(0, 'Low stock threshold cannot be negative').default(5),
    sku: z.string().trim().min(1, 'SKU is required'),
    brand: z.string().trim().max(100).optional(),
    tags: tagsFromString,
    status: z.enum(['draft', 'active', 'archived']).optional(),
  }),
});

export const updateProductSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    name: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().min(10).max(5000).optional(),
    category: z.string().min(1).optional(),
    price: z.coerce.number().positive().optional(),
    discount: z.coerce.number().min(0).max(100).optional(),
    stock: z.coerce.number().int().min(0).optional(),
    lowStockThreshold: z.coerce.number().int().min(0).optional(),
    sku: z.string().trim().min(1).optional(),
    brand: z.string().trim().max(100).optional(),
    tags: tagsFromString,
    status: z.enum(['draft', 'active', 'archived']).optional(),
  }),
});

export const productIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const removeProductImageSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    publicId: z.string().min(1, 'publicId is required'),
  }),
});

export const productQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(12),
    category: z.string().optional(),
    brand: z.string().optional(),
    tag: z.string().optional(),
    search: z.string().trim().optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    status: z.enum(['draft', 'active', 'archived']).optional(),
    sort: z
      .enum(['newest', 'oldest', 'price_asc', 'price_desc', 'name_asc', 'name_desc', 'rating'])
      .default('newest'),
  }),
});

export type CreateProductInput = z.infer<typeof createProductSchema>['body'];
export type UpdateProductInput = z.infer<typeof updateProductSchema>['body'];
export type ProductQuery = z.infer<typeof productQuerySchema>['query'];
