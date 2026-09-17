import Razorpay from 'razorpay';
import { config } from './env';

let client: Razorpay | null = null;

/**
 * Lazily constructed so the app can still boot (COD keeps working) when
 * Razorpay hasn't been configured yet — but the first actual attempt to use
 * it fails fast with a clear message instead of a cryptic Razorpay API
 * auth error.
 */
export function getRazorpayClient(): Razorpay {
  if (!config.razorpay.keyId || !config.razorpay.keySecret) {
    throw new Error(
      'Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in your .env file.'
    );
  }
  if (!client) {
    client = new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });
  }
  return client;
}
