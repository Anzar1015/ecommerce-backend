// Set before config/env.ts's module-level parsing runs — dotenv.config()
// never overrides an already-set process.env var, so these win over the
// (empty) values in .env for this test file.
process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret_for_unit_tests';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_for_unit_tests';

import '../test/setup';
import { paymentService } from './payment.service';
import { orderService } from './order.service';
import { Product } from '../models/Product.model';
import { Order } from '../models/Order.model';
import { createUser, createAddress, createProduct, setCartItems } from '../test/factories';

// The real SDK would make network calls; the checkout/verify/webhook flow
// under test only depends on the shape of its responses, not Razorpay's
// actual API, so the client is faked at this one seam.
jest.mock('../config/razorpay', () => ({
  getRazorpayClient: () => ({
    orders: {
      create: jest.fn().mockImplementation(async (params: { amount: number }) => ({
        id: `rzp_test_order_${Math.random().toString(36).slice(2)}`,
        amount: params.amount,
        currency: 'INR',
        status: 'created',
      })),
    },
    payments: {
      refund: jest.fn().mockImplementation(async (_paymentId: string, params: { amount: number }) => ({
        id: `rfnd_test_${Math.random().toString(36).slice(2)}`,
        amount: params.amount,
        status: 'processed',
      })),
    },
  }),
}));

async function placeRazorpayOrder(overrides: { price?: number; stock?: number } = {}) {
  const user = await createUser();
  const address = await createAddress(user.id);
  const product = await createProduct({ price: overrides.price ?? 500, stock: overrides.stock ?? 5 });
  await setCartItems(user.id, [{ product: product.id, quantity: 1 }]);
  const order = await orderService.checkout(user.id, {
    addressId: address.id,
    paymentMethod: 'razorpay',
    shippingMethod: 'standard',
  });
  return { user, product, order };
}

describe('orderService.checkout — razorpay', () => {
  it('reserves stock and stores the razorpay order id, without requiring real signature verification yet', async () => {
    const { product, order } = await placeRazorpayOrder({ price: 500, stock: 5 });

    expect(order.payment.method).toBe('razorpay');
    expect(order.payment.status).toBe('pending');
    expect(order.payment.razorpayOrderId).toMatch(/^rzp_test_order_/);

    const updatedProduct = await Product.findById(product.id).exec();
    expect(updatedProduct?.stock).toBe(4); // reserved at checkout time, same as COD
  });
});

describe('paymentService.verifyPayment — idempotency', () => {
  it('restocks items exactly once when verification fails, even if called twice', async () => {
    const { user, product, order } = await placeRazorpayOrder({ price: 500, stock: 5 });

    // Both calls use a bad signature — should fail verification both times.
    const badPayload = {
      razorpay_order_id: order.payment.razorpayOrderId,
      razorpay_payment_id: 'pay_fake',
      razorpay_signature: 'deadbeef',
    };

    const first = await paymentService.verifyPayment(user.id, order.id, badPayload);
    expect(first.payment.status).toBe('failed');

    const second = await paymentService.verifyPayment(user.id, order.id, badPayload);
    expect(second.payment.status).toBe('failed');

    const updatedProduct = await Product.findById(product.id).exec();
    // Stock was decremented to 4 at checkout; a single restock should bring it back to 5, not 6.
    expect(updatedProduct?.stock).toBe(5);
  });

  it('is a no-op once the order is already paid', async () => {
    const { user, order } = await placeRazorpayOrder();

    await Order.findByIdAndUpdate(order.id, { 'payment.status': 'paid', 'payment.paidAt': new Date() }).exec();

    const result = await paymentService.verifyPayment(user.id, order.id, { anything: 'goes' });
    expect(result.payment.status).toBe('paid');
  });

  it('throws for an order that does not belong to the caller', async () => {
    const { order } = await placeRazorpayOrder();
    const otherUser = await createUser();

    await expect(paymentService.verifyPayment(otherUser.id, order.id, {})).rejects.toThrow('not found');
  });
});

describe('paymentService.handleWebhook — idempotency and ordering', () => {
  it('marks the order paid on a valid payment.captured webhook', async () => {
    const { order } = await placeRazorpayOrder();
    const crypto = await import('crypto');
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_webhook_1', order_id: order.payment.razorpayOrderId, status: 'captured' } },
      },
    });
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET ?? '')
      .update(body)
      .digest('hex');

    await paymentService.handleWebhook('razorpay', Buffer.from(body), signature);

    const updated = await Order.findById(order.id).exec();
    expect(updated?.payment.status).toBe('paid');
    expect(updated?.payment.razorpayPaymentId).toBe('pay_webhook_1');
  });

  it('ignores a duplicate delivery of the same event (idempotent)', async () => {
    const { order } = await placeRazorpayOrder();
    const crypto = await import('crypto');
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_dup', order_id: order.payment.razorpayOrderId, status: 'captured' } },
      },
    });
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET ?? '')
      .update(body)
      .digest('hex');

    await paymentService.handleWebhook('razorpay', Buffer.from(body), signature);
    const firstPaidAt = (await Order.findById(order.id).exec())?.payment.paidAt?.getTime();

    await new Promise((resolve) => setTimeout(resolve, 5));
    await paymentService.handleWebhook('razorpay', Buffer.from(body), signature);
    const secondPaidAt = (await Order.findById(order.id).exec())?.payment.paidAt?.getTime();

    expect(secondPaidAt).toBe(firstPaidAt); // untouched by the duplicate delivery
  });

  it('ignores a late failed-payment webhook for an order that is already paid', async () => {
    const { order, product } = await placeRazorpayOrder({ price: 500, stock: 5 });
    await Order.findByIdAndUpdate(order.id, {
      'payment.status': 'paid',
      'payment.paidAt': new Date(),
      'payment.razorpayPaymentId': 'pay_settled',
    }).exec();

    const crypto = await import('crypto');
    const body = JSON.stringify({
      event: 'payment.failed',
      payload: {
        payment: { entity: { id: 'pay_settled', order_id: order.payment.razorpayOrderId, status: 'failed' } },
      },
    });
    const signature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET ?? '')
      .update(body)
      .digest('hex');

    await paymentService.handleWebhook('razorpay', Buffer.from(body), signature);

    const updated = await Order.findById(order.id).exec();
    expect(updated?.payment.status).toBe('paid'); // not flipped back to failed
    const updatedProduct = await Product.findById(product.id).exec();
    expect(updatedProduct?.stock).toBe(4); // not restocked — the order is fulfilled, not failed
  });
});

describe('orderService.retryPayment', () => {
  it('issues a fresh razorpay order id for a still-pending payment', async () => {
    const { user, order } = await placeRazorpayOrder();
    const firstRzpOrderId = order.payment.razorpayOrderId;

    const retried = await orderService.retryPayment(user.id, order.id);

    expect(retried.payment.razorpayOrderId).toBeDefined();
    expect(retried.payment.razorpayOrderId).not.toBe(firstRzpOrderId);
    expect(retried.payment.status).toBe('pending');
  });

  it('rejects retrying an already-paid order', async () => {
    const { user, order } = await placeRazorpayOrder();
    await Order.findByIdAndUpdate(order.id, { 'payment.status': 'paid' }).exec();

    await expect(orderService.retryPayment(user.id, order.id)).rejects.toThrow('already');
  });

  it('rejects retrying a cancelled order', async () => {
    const { user, order } = await placeRazorpayOrder();
    await orderService.cancelOrder(user.id, order.id);

    await expect(orderService.retryPayment(user.id, order.id)).rejects.toThrow('cancelled');
  });
});

describe('paymentService.refundPayment', () => {
  async function paidRazorpayOrder() {
    const { user, order } = await placeRazorpayOrder({ price: 1000 });
    await Order.findByIdAndUpdate(order.id, {
      'payment.status': 'paid',
      'payment.paidAt': new Date(),
      'payment.razorpayPaymentId': 'pay_paid_1',
    }).exec();
    return { user, order };
  }

  it('processes a full refund and marks the order refunded', async () => {
    const { order } = await paidRazorpayOrder();

    const refunded = await paymentService.refundPayment(order.id, undefined, 'Customer requested');

    expect(refunded.payment.status).toBe('refunded');
    expect(refunded.refunds).toHaveLength(1);
    expect(refunded.refunds[0].amount).toBe(1000);
  });

  it('processes a partial refund and marks the order partially_refunded', async () => {
    const { order } = await paidRazorpayOrder();

    const refunded = await paymentService.refundPayment(order.id, 400, 'Partial return');

    expect(refunded.payment.status).toBe('partially_refunded');
    expect(refunded.refunds[0].amount).toBe(400);
  });

  it('rejects refunding more than the remaining refundable amount', async () => {
    const { order } = await paidRazorpayOrder();
    await paymentService.refundPayment(order.id, 700);

    await expect(paymentService.refundPayment(order.id, 500)).rejects.toThrow('between');
  });

  it('rejects refunding an order that was never paid', async () => {
    const { order } = await placeRazorpayOrder();
    await expect(paymentService.refundPayment(order.id, 100)).rejects.toThrow('Cannot refund');
  });

  it('rejects refunding an already-fully-refunded order (caught by the payment-status guard)', async () => {
    const { order } = await paidRazorpayOrder();
    await paymentService.refundPayment(order.id, undefined);

    await expect(paymentService.refundPayment(order.id, 1)).rejects.toThrow('Cannot refund an order with payment status "refunded"');
  });
});
