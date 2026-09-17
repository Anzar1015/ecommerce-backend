import { paymentProviderRegistry } from '../payments';
import type { PaymentProviderKey } from '../payments';
import { orderRepository } from '../repositories/order.repository';
import { productRepository } from '../repositories/product.repository';
import { notificationService } from './notification.service';
import { resolveOrderUserId } from '../utils/orderUser';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { IOrder, PaymentStatus } from '../models/Order.model';

/** Best-effort: a notification failure should never fail the payment operation that triggered it. */
async function notifyPaymentStatus(order: IOrder, status: PaymentStatus): Promise<void> {
  if (status !== 'paid' && status !== 'failed') return; // no separate "pending" notification
  try {
    await notificationService.notify(resolveOrderUserId(order), {
      type: 'PAYMENT',
      title: status === 'paid' ? 'Payment Successful' : 'Payment Failed',
      message:
        status === 'paid'
          ? `Payment for order ${order.orderNumber} was successful.`
          : `Payment for order ${order.orderNumber} failed. Please try again.`,
      link: `/orders/${order.id}`,
    });
  } catch (error) {
    logger.warn('Failed to send payment notification', {
      orderId: order.id,
      status,
      error: error instanceof Error ? error.message : error,
    });
  }
}

/** Not imported from order.service.ts to avoid a circular import (that file
 * already imports this one) — small enough to duplicate deliberately. */
async function restockOrderItems(order: IOrder): Promise<void> {
  await Promise.all(order.items.map((item) => productRepository.incrementStock(item.product.toString(), item.quantity)));
}

export const paymentService = {
  /** Called right after an order is created; never branches on provider name. */
  async initiatePayment(order: IOrder) {
    const provider = paymentProviderRegistry.get(order.payment.method);
    return provider.initiate(order);
  },

  /**
   * Idempotent: calling this twice for the same order (a duplicate client
   * callback, a slow network retry, etc.) never double-applies anything.
   * Once an order is `paid`, this just returns it as-is; a payment that's
   * already `failed` can be re-verified (a genuine retry of a new attempt).
   */
  async verifyPayment(userId: string, orderId: string, payload: Record<string, unknown>): Promise<IOrder> {
    const order = await orderRepository.findByIdForUser(userId, orderId);
    if (!order) throw ApiError.notFound('Order not found');

    if (order.payment.status === 'paid') {
      logger.info('Payment already verified (idempotent no-op)', { orderId: order.id });
      return order;
    }

    const provider = paymentProviderRegistry.get(order.payment.method);
    const result = await provider.verify(order, payload);

    const wasFailed = order.payment.status === 'failed';

    order.payment.status = result.status;
    order.payment.providerReference = result.providerReference ?? order.payment.providerReference;
    if (result.razorpayPaymentId) order.payment.razorpayPaymentId = result.razorpayPaymentId;
    if (result.razorpaySignature) order.payment.razorpaySignature = result.razorpaySignature;
    if (result.status === 'paid') order.payment.paidAt = new Date();
    await order.save();

    // Stock was reserved at order-creation time regardless of payment method
    // (see order.service.ts checkout()) — a failed verification needs to
    // give it back, but only once (a retried failed→failed verify must not
    // restock twice).
    if (result.status === 'failed' && !wasFailed) {
      await restockOrderItems(order);
    }

    await notifyPaymentStatus(order, result.status);

    logger.info('Payment verified', { orderId: order.id, provider: order.payment.method, status: result.status });
    return order;
  },

  /**
   * Source of truth for payment status — webhooks can be delivered more than
   * once, or out of order, so every transition here is guarded to stay
   * idempotent and to never let a late/duplicate event undo a settled state.
   */
  async handleWebhook(providerKey: PaymentProviderKey, rawBody: Buffer, signature?: string): Promise<void> {
    const provider = paymentProviderRegistry.get(providerKey);
    const event = provider.parseWebhookEvent(rawBody, signature);

    if (!event.providerReference || !event.status) {
      logger.info('Payment webhook received (no order update)', { provider: providerKey, type: event.type });
      return;
    }

    const order = await orderRepository.findByProviderReference(event.providerReference);
    if (!order) {
      logger.warn('Payment webhook referenced unknown order', { provider: providerKey, ref: event.providerReference });
      return;
    }

    if (order.payment.status === event.status) {
      logger.info('Webhook event already applied (idempotent no-op)', {
        orderId: order.id,
        status: event.status,
      });
      return;
    }

    // A failed-payment webhook arriving after the order was already marked
    // paid (e.g. a retried/duplicate delivery of a stale event) must never
    // undo a settled, fulfilled order.
    if (order.payment.status === 'paid' && event.status === 'failed') {
      logger.warn('Ignoring failed-payment webhook for an already-paid order', { orderId: order.id });
      return;
    }

    const wasFailed = order.payment.status === 'failed';

    order.payment.status = event.status;
    if (event.razorpayPaymentId) order.payment.razorpayPaymentId = event.razorpayPaymentId;
    if (event.status === 'paid') order.payment.paidAt = new Date();
    await order.save();

    if (event.status === 'failed' && !wasFailed) {
      await restockOrderItems(order);
    }

    await notifyPaymentStatus(order, event.status);

    logger.info('Payment updated via webhook', { orderId: order.id, provider: providerKey, status: event.status });
  },

  /** Admin-only, full or partial refund of an already-paid order. */
  async refundPayment(orderId: string, amount?: number, reason?: string): Promise<IOrder> {
    const order = await orderRepository.findById(orderId);
    if (!order) throw ApiError.notFound('Order not found');

    if (order.payment.status !== 'paid' && order.payment.status !== 'partially_refunded') {
      throw ApiError.badRequest(`Cannot refund an order with payment status "${order.payment.status}"`);
    }

    const alreadyRefunded = order.refunds.reduce((sum, refund) => sum + refund.amount, 0);
    const refundableAmount = Math.round((order.total - alreadyRefunded) * 100) / 100;
    if (refundableAmount <= 0) {
      throw ApiError.badRequest('This order has already been fully refunded');
    }

    const refundAmount = amount ?? refundableAmount;
    if (refundAmount <= 0 || refundAmount > refundableAmount) {
      throw ApiError.badRequest(`Refund amount must be between ₹0 and ₹${refundableAmount}`);
    }

    const provider = paymentProviderRegistry.get(order.payment.method);
    const result = await provider.refund(order, refundAmount, reason);

    order.refunds.push({
      amount: refundAmount,
      razorpayRefundId: result.razorpayRefundId,
      reason,
      createdAt: new Date(),
    });
    const totalRefunded = alreadyRefunded + refundAmount;
    order.payment.status = totalRefunded >= order.total ? 'refunded' : 'partially_refunded';
    await order.save();

    try {
      await notificationService.notify(resolveOrderUserId(order), {
        type: 'PAYMENT',
        title: order.payment.status === 'refunded' ? 'Refund Completed' : 'Partial Refund Processed',
        message: `₹${refundAmount} was refunded for order ${order.orderNumber}.`,
        link: `/orders/${order.id}`,
      });
    } catch (error) {
      logger.warn('Failed to send refund notification', {
        orderId: order.id,
        error: error instanceof Error ? error.message : error,
      });
    }

    logger.info('Payment refunded', { orderId: order.id, amount: refundAmount, status: order.payment.status });
    return order;
  },
};
