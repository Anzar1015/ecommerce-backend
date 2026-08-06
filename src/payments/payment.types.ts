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
}

export interface PaymentVerificationResult {
  success: boolean;
  status: PaymentStatus;
  providerReference?: string;
}

export interface WebhookEvent {
  type: string;
  providerReference?: string;
  status?: PaymentStatus;
}

/**
 * Every payment provider (COD today; Stripe/Razorpay later) implements this
 * so the rest of the app never branches on a provider name.
 */
export interface IPaymentProvider {
  readonly key: PaymentProviderKey;
  initiate(order: IOrder): Promise<PaymentInitiationResult>;
  verify(order: IOrder, payload: Record<string, unknown>): Promise<PaymentVerificationResult>;
  parseWebhookEvent(rawBody: Buffer, signature?: string): WebhookEvent;
}
