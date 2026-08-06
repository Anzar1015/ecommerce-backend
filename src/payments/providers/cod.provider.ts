import { ApiError } from '../../utils/ApiError';
import { IOrder } from '../../models/Order.model';
import { IPaymentProvider, PaymentInitiationResult, PaymentVerificationResult, WebhookEvent } from '../payment.types';

/**
 * Cash on Delivery "provider". No money moves online, so payment stays
 * `pending` until the order is marked delivered (see order.service.ts).
 */
export const codProvider: IPaymentProvider = {
  key: 'cod',

  async initiate(_order: IOrder): Promise<PaymentInitiationResult> {
    return {
      providerKey: 'cod',
      requiresAction: false,
      status: 'pending',
    };
  },

  async verify(_order: IOrder, _payload: Record<string, unknown>): Promise<PaymentVerificationResult> {
    throw ApiError.badRequest('Cash on Delivery orders do not require payment verification');
  },

  parseWebhookEvent(_rawBody: Buffer, _signature?: string): WebhookEvent {
    throw ApiError.badRequest('Cash on Delivery does not support webhooks');
  },
};
