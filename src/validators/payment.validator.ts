import { z } from 'zod';

export const verifyPaymentSchema = z.object({
  params: z.object({
    orderId: z.string().min(1),
  }),
  // Payload shape is provider-specific (client secret confirmation, signature, etc.),
  // so it's passed through as-is to the provider's verify() implementation.
  body: z.record(z.unknown()).default({}),
});

export const webhookParamSchema = z.object({
  params: z.object({
    provider: z.enum(['cod', 'stripe', 'razorpay']),
  }),
});

export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>['body'];
