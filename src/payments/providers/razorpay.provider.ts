import crypto from 'crypto';
import { z } from 'zod';
import { getRazorpayClient } from '../../config/razorpay';
import { config } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { logger } from '../../utils/logger';
import { IOrder } from '../../models/Order.model';
import {
  IPaymentProvider,
  PaymentInitiationResult,
  PaymentVerificationResult,
  RefundResult,
  WebhookEvent,
} from '../payment.types';

const verifyPayloadSchema = z.object({
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

interface RazorpayPaymentWebhookEntity {
  id: string;
  order_id: string;
  status: string;
}

const webhookBodySchema = z.object({
  event: z.string(),
  payload: z
    .object({
      payment: z
        .object({
          entity: z.object({
            id: z.string(),
            order_id: z.string(),
            status: z.string(),
          }),
        })
        .optional(),
    })
    .optional(),
});

function requireWebhookSecret(): string {
  if (!config.razorpay.webhookSecret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET is not set — cannot verify incoming webhooks.');
  }
  return config.razorpay.webhookSecret;
}

function requireKeySecret(): string {
  if (!config.razorpay.keySecret) {
    throw new Error('RAZORPAY_KEY_SECRET is not set — cannot verify payment signatures.');
  }
  return config.razorpay.keySecret;
}

/**
 * HMAC-SHA256 over `payload`, keyed with `secret`, compared to `signature`
 * in constant time. This is the same formula Razorpay documents for both
 * checkout-signature and webhook verification — implemented directly
 * (rather than via the SDK's own `validate*` helpers, which compare with
 * plain `===`) so a mismatch can't leak timing information.
 */
function verifyHmacSignature(payload: string, signature: string, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'hex');
  const providedBuffer = Buffer.from(signature, 'hex');
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

export const razorpayProvider: IPaymentProvider = {
  key: 'razorpay',
  webhookSignatureHeader: 'x-razorpay-signature',

  async initiate(order: IOrder): Promise<PaymentInitiationResult> {
    const razorpay = getRazorpayClient();

    // Amount is always recomputed from the already-server-validated order
    // total (see order.service.ts checkout()) — the client never supplies
    // an amount anywhere in this flow.
    const amountInPaise = Math.round(order.total * 100);

    const rzpOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: order.orderNumber,
      notes: { orderId: order.id, orderNumber: order.orderNumber },
    });

    logger.info('Razorpay order created', { orderId: order.id, razorpayOrderId: rzpOrder.id, amountInPaise });

    return {
      providerKey: 'razorpay',
      requiresAction: true,
      status: 'pending',
      providerReference: rzpOrder.id,
      razorpayOrderId: rzpOrder.id,
    };
  },

  /**
   * Verifies the checkout signature Razorpay's client-side handler returns.
   * This is the critical security step: it proves the payment was actually
   * authorized by Razorpay for *this* order, not merely that the client
   * claims it was. A mismatch is a normal, expected outcome (tampering or a
   * genuinely failed payment) — it's returned as a failure result, not
   * thrown, so the caller can uniformly mark the order failed either way.
   */
  async verify(order: IOrder, payload: Record<string, unknown>): Promise<PaymentVerificationResult> {
    const parsed = verifyPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw ApiError.badRequest('Invalid payment verification payload', parsed.error.errors);
    }
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;

    // The order id in the payload must match the one *this* order was
    // initiated with — prevents a signature valid for a different order
    // (e.g. a cheaper one) from being replayed onto this one.
    if (razorpay_order_id !== order.payment.razorpayOrderId) {
      logger.warn('Razorpay order id mismatch during verification', {
        orderId: order.id,
        expected: order.payment.razorpayOrderId,
        received: razorpay_order_id,
      });
      return { success: false, status: 'failed' };
    }

    // Razorpay's documented checkout-verification formula: HMAC-SHA256 of
    // "{order_id}|{payment_id}", keyed with the account's key secret.
    const signaturePayload = `${razorpay_order_id}|${razorpay_payment_id}`;
    const isValid = verifyHmacSignature(signaturePayload, razorpay_signature, requireKeySecret());

    if (!isValid) {
      logger.warn('Razorpay signature verification failed', { orderId: order.id, razorpay_order_id });
      return { success: false, status: 'failed' };
    }

    return {
      success: true,
      status: 'paid',
      providerReference: razorpay_payment_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
    };
  },

  /**
   * Webhooks are the source of truth for payment status, not this checkout
   * callback above — but both paths funnel through the same signature
   * verification discipline (see payment.controller.ts / payment.service.ts).
   */
  parseWebhookEvent(rawBody: Buffer, signature?: string): WebhookEvent {
    if (!signature) {
      throw ApiError.unauthorized('Missing Razorpay webhook signature');
    }

    const bodyString = rawBody.toString('utf8');
    const isValid = verifyHmacSignature(bodyString, signature, requireWebhookSecret());
    if (!isValid) {
      throw ApiError.unauthorized('Invalid Razorpay webhook signature');
    }

    let json: unknown;
    try {
      json = JSON.parse(bodyString);
    } catch {
      throw ApiError.badRequest('Malformed webhook payload');
    }

    const parsed = webhookBodySchema.safeParse(json);
    if (!parsed.success) {
      // Signature was valid but the shape is one we don't recognize (a Razorpay
      // event type we don't handle) — not an error, just nothing to update.
      return { type: typeof json === 'object' && json && 'event' in json ? String((json as { event: unknown }).event) : 'unknown' };
    }

    const entity: RazorpayPaymentWebhookEntity | undefined = parsed.data.payload?.payment?.entity;
    const status = mapEventToStatus(parsed.data.event);

    return {
      type: parsed.data.event,
      providerReference: entity?.order_id,
      razorpayPaymentId: entity?.id,
      status,
    };
  },

  async refund(order: IOrder, amount: number, reason?: string): Promise<RefundResult> {
    if (!order.payment.razorpayPaymentId) {
      throw ApiError.badRequest('This order has no captured Razorpay payment to refund');
    }

    const razorpay = getRazorpayClient();
    const refund = await razorpay.payments.refund(order.payment.razorpayPaymentId, {
      amount: Math.round(amount * 100),
      notes: reason ? { reason } : undefined,
    });

    logger.info('Razorpay refund created', {
      orderId: order.id,
      razorpayPaymentId: order.payment.razorpayPaymentId,
      razorpayRefundId: refund.id,
      amount,
    });

    return { razorpayRefundId: refund.id, amount, status: refund.status };
  },
};

function mapEventToStatus(event: string): WebhookEvent['status'] {
  switch (event) {
    case 'payment.captured':
    case 'order.paid':
      return 'paid';
    case 'payment.failed':
      return 'failed';
    default:
      return undefined;
  }
}
