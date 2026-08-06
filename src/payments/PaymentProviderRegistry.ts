import { ApiError } from '../utils/ApiError';
import { IPaymentProvider, PaymentProviderKey } from './payment.types';

/**
 * Central lookup for payment providers. Adding Stripe/Razorpay later means
 * implementing IPaymentProvider and calling `register()` once — no other
 * file needs to know a new provider exists.
 */
export class PaymentProviderRegistry {
  private readonly providers = new Map<PaymentProviderKey, IPaymentProvider>();

  register(provider: IPaymentProvider): void {
    this.providers.set(provider.key, provider);
  }

  get(key: PaymentProviderKey): IPaymentProvider {
    const provider = this.providers.get(key);
    if (!provider) {
      throw ApiError.badRequest(`Payment method "${key}" is not supported yet`);
    }
    return provider;
  }

  getImplementedKeys(): PaymentProviderKey[] {
    return Array.from(this.providers.keys());
  }
}
