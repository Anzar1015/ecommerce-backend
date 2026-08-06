import { PaymentProviderRegistry } from './PaymentProviderRegistry';
import { codProvider } from './providers/cod.provider';

export const paymentProviderRegistry = new PaymentProviderRegistry();
paymentProviderRegistry.register(codProvider);

/** Payment methods the API actually accepts today. Grows as providers are registered above. */
export const IMPLEMENTED_PAYMENT_METHODS = paymentProviderRegistry.getImplementedKeys();

export * from './payment.types';
