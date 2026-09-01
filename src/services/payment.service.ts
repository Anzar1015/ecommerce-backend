import { paymentProviderRegistry } from '../payments';
import type { PaymentInitiationResult, PaymentProviderKey } from '../payments';
import { orderRepository } from '../repositories/order.repository';
import { notificationService } from './notification.service';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { IOrder, PaymentStatus } from '../models/Order.model';

/** Best-effort: a notification failure should never fail the payment operation that triggered it. */
async function notifyPaymentStatus(order: IOrder, status: PaymentStatus): Promise<void> {
  if (status !== 'paid' && status !== 'failed') return; // no separate "pending" notification
  try {
    await notificationService.notify(order.user.toString(), {
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

export const paymentService = {
  /** Called right after an order is created; never branches on provider name. */
  async initiatePayment(order: IOrder): Promise<PaymentInitiationResult> {
    const provider = paymentProviderRegistry.get(order.payment.method);
    return provider.initiate(order);
  },

  async verifyPayment(userId: string, orderId: string, payload: Record<string, unknown>): Promise<IOrder> {
    const order = await orderRepository.findByIdForUser(userId, orderId);
    if (!order) throw ApiError.notFound('Order not found');

    const provider = paymentProviderRegistry.get(order.payment.method);
    const result = await provider.verify(order, payload);

    order.payment.status = result.status;
    order.payment.providerReference = result.providerReference ?? order.payment.providerReference;
    if (result.status === 'paid') order.payment.paidAt = new Date();
    await order.save();
    await notifyPaymentStatus(order, result.status);

    logger.info('Payment verified', { orderId: order.id, provider: order.payment.method, status: result.status });
    return order;
  },

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

    order.payment.status = event.status;
    if (event.status === 'paid') order.payment.paidAt = new Date();
    await order.save();
    await notifyPaymentStatus(order, event.status);

    logger.info('Payment updated via webhook', { orderId: order.id, provider: providerKey, status: event.status });
  },
};
