import { z } from 'zod';

export const inventoryQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().optional(),
    category: z.string().optional(),
    stockStatus: z.enum(['out_of_stock', 'low_stock', 'in_stock']).optional(),
    sort: z.enum(['stock_asc', 'stock_desc', 'name_asc', 'name_desc']).default('stock_asc'),
  }),
});

export const adjustStockSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    type: z.enum(['increase', 'decrease', 'set']),
    quantity: z.coerce.number().int().min(0, 'Quantity cannot be negative'),
    reason: z.string().trim().max(500).optional(),
  }),
});

export type InventoryQuery = z.infer<typeof inventoryQuerySchema>['query'];
export type AdjustStockInput = z.infer<typeof adjustStockSchema>['body'];
