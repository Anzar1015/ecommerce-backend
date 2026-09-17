import { IOrder, PaymentStatus } from '../models/Order.model';

export type PaymentProviderKey = 'cod' | 'stripe' | 'razorpay';

export interface PaymentInitiationResult {
  providerKey: PaymentProviderKey;
  /** Whether the customer must complete an extra step (redirect, card form, etc.) before the payment is settled. */
  requiresAction: boolean;
  status: PaymentStatus;
  clientSecret?: string;
  redirectUrl?: string;
  providerReference?: string;
  /** Razorpay-specific: the gateway order id the frontend passes to Checkout.js. */
  razorpayOrderId?: string;
}

export interface PaymentVerificationResult {
  success: boolean;
  status: PaymentStatus;
  providerReference?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
}

export interface WebhookEvent {
  type: string;
  providerReference?: string;
  status?: PaymentStatus;
  razorpayPaymentId?: string;
}

export interface RefundResult {
  razorpayRefundId: string;
  amount: number;
  status: string;
}

/**
 * Every payment provider (COD today; Stripe/Razorpay later) implements this
 * so the rest of the app never branches on a provider name.
 */
export interface IPaymentProvider {
  readonly key: PaymentProviderKey;
  /** HTTP header the provider signs webhook payloads with, e.g.
   * "x-razorpay-signature" — lets the generic webhook controller read the
   * right header without knowing which provider it's dispatching to. */
  readonly webhookSignatureHeader: string;
  initiate(order: IOrder): Promise<PaymentInitiationResult>;
  verify(order: IOrder, payload: Record<string, unknown>): Promise<PaymentVerificationResult>;
  parseWebhookEvent(rawBody: Buffer, signature?: string): WebhookEvent;
  /** Full or partial refund. `amount` is in rupees (not paise) — providers convert internally. */
  refund(order: IOrder, amount: number, reason?: string): Promise<RefundResult>;
}
