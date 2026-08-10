import { z } from 'zod';

export const shippingMethodsQuerySchema = z.object({
  query: z.object({
    subtotal: z.coerce.number().min(0).optional(),
  }),
});

export type ShippingMethodsQuery = z.infer<typeof shippingMethodsQuerySchema>['query'];
