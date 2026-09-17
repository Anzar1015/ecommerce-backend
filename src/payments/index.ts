import { PaymentProviderRegistry } from './PaymentProviderRegistry';
import { codProvider } from './providers/cod.provider';
import { razorpayProvider } from './providers/razorpay.provider';

export const paymentProviderRegistry = new PaymentProviderRegistry();
paymentProviderRegistry.register(codProvider);
paymentProviderRegistry.register(razorpayProvider);

/** Payment methods the API actually accepts today. Grows as providers are registered above. */
export const IMPLEMENTED_PAYMENT_METHODS = paymentProviderRegistry.getImplementedKeys();

export * from './payment.types';
