// Set before any import triggers config/env.ts's module-level parsing —
// dotenv.config() never overrides an already-set process.env var, so this
// wins over the (empty) values in .env for this test file.
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret_for_unit_tests';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_for_unit_tests';

import crypto from 'crypto';
import { Order, IOrder } from '../../models/Order.model';
import { razorpayProvider } from './razorpay.provider';

function buildOrder(overrides: Partial<{ razorpayOrderId: string; total: number; razorpayPaymentId: string }> = {}): IOrder {
  return new Order({
    orderNumber: 'ORD-20260101-ABCDEF',
    user: '65f000000000000000000001',
    items: [
      { product: '65f000000000000000000002', name: 'Test Product', sku: 'SKU-1', price: 500, quantity: 1, subtotal: 500 },
    ],
    shippingAddress: {
      fullName: 'Test User',
      phone: '9876543210',
      addressLine1: '123 Test Street',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400001',
      country: 'India',
    },
    payment: {
      method: 'razorpay',
      status: 'pending',
      razorpayOrderId: overrides.razorpayOrderId ?? 'order_TEST123',
      razorpayPaymentId: overrides.razorpayPaymentId,
    },
    shipping: { method: 'standard' },
    subtotal: overrides.total ?? 500,
    total: overrides.total ?? 500,
  });
}

function signVerificationPayload(orderId: string, paymentId: string, secret = 'test_key_secret_for_unit_tests'): string {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

function signWebhookBody(body: string, secret = 'test_webhook_secret_for_unit_tests'): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

describe('razorpayProvider.verify — signature verification (critical security path)', () => {
  it('accepts a correctly signed payment', async () => {
    const order = buildOrder({ razorpayOrderId: 'order_ABC' });
    const signature = signVerificationPayload('order_ABC', 'pay_XYZ');

    const result = await razorpayProvider.verify(order, {
      razorpay_order_id: 'order_ABC',
      razorpay_payment_id: 'pay_XYZ',
      razorpay_signature: signature,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe('paid');
    expect(result.razorpayPaymentId).toBe('pay_XYZ');
    expect(result.razorpaySignature).toBe(signature);
  });

  it('rejects a tampered signature', async () => {
    const order = buildOrder({ razorpayOrderId: 'order_ABC' });
    const validSignature = signVerificationPayload('order_ABC', 'pay_XYZ');
    const tamperedSignature = validSignature.slice(0, -2) + (validSignature.slice(-2) === '00' ? '11' : '00');

    const result = await razorpayProvider.verify(order, {
      razorpay_order_id: 'order_ABC',
      razorpay_payment_id: 'pay_XYZ',
      razorpay_signature: tamperedSignature,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('failed');
  });

  it('rejects a signature computed with the wrong secret', async () => {
    const order = buildOrder({ razorpayOrderId: 'order_ABC' });
    const signature = signVerificationPayload('order_ABC', 'pay_XYZ', 'not_the_real_secret');

    const result = await razorpayProvider.verify(order, {
      razorpay_order_id: 'order_ABC',
      razorpay_payment_id: 'pay_XYZ',
      razorpay_signature: signature,
    });

    expect(result.success).toBe(false);
  });

  it('rejects a valid signature for a *different* order (replay protection)', async () => {
    const order = buildOrder({ razorpayOrderId: 'order_REAL' });
    // Attacker has a valid signature for a cheaper order and tries to replay it here.
    const signatureForOtherOrder = signVerificationPayload('order_CHEAPER', 'pay_XYZ');

    const result = await razorpayProvider.verify(order, {
      razorpay_order_id: 'order_CHEAPER',
      razorpay_payment_id: 'pay_XYZ',
      razorpay_signature: signatureForOtherOrder,
    });

    expect(result.success).toBe(false);
  });

  it('rejects a malformed payload instead of throwing an unhandled error', async () => {
    const order = buildOrder();
    await expect(razorpayProvider.verify(order, { foo: 'bar' })).rejects.toThrow();
  });

  it('rejects a signature with a garbage (non-hex) value without throwing', async () => {
    const order = buildOrder({ razorpayOrderId: 'order_ABC' });
    const result = await razorpayProvider.verify(order, {
      razorpay_order_id: 'order_ABC',
      razorpay_payment_id: 'pay_XYZ',
      razorpay_signature: 'not-a-real-signature',
    });
    expect(result.success).toBe(false);
  });
});

describe('razorpayProvider.parseWebhookEvent — webhook signature verification', () => {
  const paymentCapturedBody = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_WEBHOOK1', order_id: 'order_WEBHOOK1', status: 'captured' } } },
  });

  it('accepts a correctly signed payment.captured event and maps it to "paid"', () => {
    const rawBody = Buffer.from(paymentCapturedBody);
    const signature = signWebhookBody(paymentCapturedBody);

    const event = razorpayProvider.parseWebhookEvent(rawBody, signature);

    expect(event.status).toBe('paid');
    expect(event.providerReference).toBe('order_WEBHOOK1');
    expect(event.razorpayPaymentId).toBe('pay_WEBHOOK1');
  });

  it('maps payment.failed to "failed"', () => {
    const body = JSON.stringify({
      event: 'payment.failed',
      payload: { payment: { entity: { id: 'pay_2', order_id: 'order_2', status: 'failed' } } },
    });
    const event = razorpayProvider.parseWebhookEvent(Buffer.from(body), signWebhookBody(body));
    expect(event.status).toBe('failed');
  });

  it('rejects a webhook with an invalid signature', () => {
    const rawBody = Buffer.from(paymentCapturedBody);
    expect(() => razorpayProvider.parseWebhookEvent(rawBody, 'invalid-signature')).toThrow();
  });

  it('rejects a webhook whose body was tampered with after signing', () => {
    const signature = signWebhookBody(paymentCapturedBody);
    const tamperedBody = paymentCapturedBody.replace('order_WEBHOOK1', 'order_ATTACKER_CHOSEN');
    expect(() => razorpayProvider.parseWebhookEvent(Buffer.from(tamperedBody), signature)).toThrow();
  });

  it('rejects a missing signature', () => {
    expect(() => razorpayProvider.parseWebhookEvent(Buffer.from(paymentCapturedBody), undefined)).toThrow();
  });

  it('does not throw for a correctly-signed but unrecognized event type', () => {
    const body = JSON.stringify({ event: 'refund.processed' });
    const event = razorpayProvider.parseWebhookEvent(Buffer.from(body), signWebhookBody(body));
    expect(event.status).toBeUndefined();
  });
});

describe('razorpayProvider.refund', () => {
  it('rejects refunding an order with no captured payment', async () => {
    const order = buildOrder(); // no razorpayPaymentId
    await expect(razorpayProvider.refund(order, 100)).rejects.toThrow('no captured Razorpay payment');
  });
});
