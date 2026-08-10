import { z } from 'zod';
import { IMPLEMENTED_PAYMENT_METHODS, PaymentProviderKey } from '../payments';

// Validated against the payment provider registry (not a hardcoded literal list),
// so the API surface can never accept a method that has no provider behind it.
const paymentMethodSchema = z.custom<PaymentProviderKey>(
  (value) => typeof value === 'string' && (IMPLEMENTED_PAYMENT_METHODS as string[]).includes(value),
  { message: 'Unsupported payment method' }
);

export const checkoutSchema = z.object({
  body: z.object({
    addressId: z.string().min(1, 'Shipping address is required'),
    paymentMethod: paymentMethodSchema.default('cod'),
    couponCode: z.string().trim().min(1).optional(),
    shippingMethod: z.enum(['standard', 'express']).default('standard'),
  }),
});

export const orderIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export const cancelOrderSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    reason: z.string().trim().max(500).optional(),
  }),
});

const ADMIN_ASSIGNABLE_STATUSES = [
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
] as const;

export const updateOrderStatusSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    status: z.enum(ADMIN_ASSIGNABLE_STATUSES),
    note: z.string().trim().max(500).optional(),
  }),
});

export const updateOrderShippingSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z
    .object({
      trackingNumber: z.string().trim().min(1).max(100).optional(),
      courier: z.string().trim().min(1).max(100).optional(),
    })
    .refine((data) => data.trackingNumber !== undefined || data.courier !== undefined, {
      message: 'Provide a tracking number and/or courier',
    }),
});

export const orderHistoryQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(50).default(10),
  }),
});

export const adminOrderQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    status: z
      .enum(['pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'])
      .optional(),
    search: z.string().trim().optional(),
  }),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>['body'];
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>['body'];
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>['body'];
export type UpdateOrderShippingInput = z.infer<typeof updateOrderShippingSchema>['body'];
export type OrderHistoryQuery = z.infer<typeof orderHistoryQuerySchema>['query'];
export type AdminOrderQuery = z.infer<typeof adminOrderQuerySchema>['query'];
