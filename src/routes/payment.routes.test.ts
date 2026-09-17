process.env.RAZORPAY_KEY_ID = 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = 'test_key_secret_for_unit_tests';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_webhook_secret_for_unit_tests';

import crypto from 'crypto';
import request from 'supertest';
import '../test/setup';
import { createApp } from '../app';
import { signAccessToken } from '../auth/jwt';
import { createUser, createProduct, createAddress, setCartItems } from '../test/factories';
import type { IUser } from '../models/User.model';

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

const app = createApp();

function authHeader(user: IUser) {
  return { Authorization: `Bearer ${signAccessToken({ sub: user.id, role: user.role })}` };
}

async function placeRazorpayOrder(user: IUser) {
  const address = await createAddress(user.id);
  const product = await createProduct({ price: 500, stock: 5 });
  await setCartItems(user.id, [{ product: product.id, quantity: 1 }]);

  const res = await request(app)
    .post('/api/v1/orders/checkout')
    .set(authHeader(user))
    .send({ addressId: address.id, paymentMethod: 'razorpay', shippingMethod: 'standard' })
    .expect(201);

  return res.body.data.order;
}

describe('GET /api/v1/payments/config', () => {
  it('returns only the public key id, never a secret', async () => {
    const res = await request(app).get('/api/v1/payments/config').expect(200);
    expect(res.body.data.razorpayKeyId).toBe('rzp_test_dummy');
    expect(JSON.stringify(res.body)).not.toContain('test_key_secret_for_unit_tests');
  });

  it('does not require authentication', async () => {
    await request(app).get('/api/v1/payments/config').expect(200);
  });
});

describe('POST /api/v1/payments/:orderId/verify', () => {
  it('requires authentication', async () => {
    await request(app).post('/api/v1/payments/000000000000000000000000/verify').send({}).expect(401);
  });

  it('verifies a correctly signed payment end to end', async () => {
    const user = await createUser();
    const order = await placeRazorpayOrder(user);

    const signature = crypto
      .createHmac('sha256', 'test_key_secret_for_unit_tests')
      .update(`${order.payment.razorpayOrderId}|pay_e2e_1`)
      .digest('hex');

    const res = await request(app)
      .post(`/api/v1/payments/${order.id}/verify`)
      .set(authHeader(user))
      .send({
        razorpay_order_id: order.payment.razorpayOrderId,
        razorpay_payment_id: 'pay_e2e_1',
        razorpay_signature: signature,
      })
      .expect(200);

    expect(res.body.data.order.payment.status).toBe('paid');
  });

  it('marks the order failed for an invalid signature, rather than erroring', async () => {
    const user = await createUser();
    const order = await placeRazorpayOrder(user);

    const res = await request(app)
      .post(`/api/v1/payments/${order.id}/verify`)
      .set(authHeader(user))
      .send({
        razorpay_order_id: order.payment.razorpayOrderId,
        razorpay_payment_id: 'pay_bad',
        razorpay_signature: 'tampered',
      })
      .expect(200);

    expect(res.body.data.order.payment.status).toBe('failed');
  });

  it('rejects verifying another user\'s order', async () => {
    const owner = await createUser();
    const intruder = await createUser();
    const order = await placeRazorpayOrder(owner);

    await request(app)
      .post(`/api/v1/payments/${order.id}/verify`)
      .set(authHeader(intruder))
      .send({ razorpay_order_id: 'x', razorpay_payment_id: 'y', razorpay_signature: 'z' })
      .expect(404);
  });
});

describe('POST /api/v1/payments/:orderId/refund', () => {
  it('rejects a non-admin customer', async () => {
    const user = await createUser();
    const order = await placeRazorpayOrder(user);

    await request(app).post(`/api/v1/payments/${order.id}/refund`).set(authHeader(user)).send({}).expect(403);
  });

  it('rejects an unauthenticated request', async () => {
    await request(app).post('/api/v1/payments/000000000000000000000000/refund').send({}).expect(401);
  });

  it('lets an admin fully refund a paid order', async () => {
    const admin = await createUser({ role: 'admin' });
    const customer = await createUser();
    const order = await placeRazorpayOrder(customer);

    const signature = crypto
      .createHmac('sha256', 'test_key_secret_for_unit_tests')
      .update(`${order.payment.razorpayOrderId}|pay_to_refund`)
      .digest('hex');
    await request(app)
      .post(`/api/v1/payments/${order.id}/verify`)
      .set(authHeader(customer))
      .send({
        razorpay_order_id: order.payment.razorpayOrderId,
        razorpay_payment_id: 'pay_to_refund',
        razorpay_signature: signature,
      })
      .expect(200);

    const res = await request(app)
      .post(`/api/v1/payments/${order.id}/refund`)
      .set(authHeader(admin))
      .send({ reason: 'Customer requested' })
      .expect(200);

    expect(res.body.data.order.payment.status).toBe('refunded');
  });

  it('rejects a negative or zero refund amount', async () => {
    const admin = await createUser({ role: 'admin' });
    const customer = await createUser();
    const order = await placeRazorpayOrder(customer);

    await request(app)
      .post(`/api/v1/payments/${order.id}/refund`)
      .set(authHeader(admin))
      .send({ amount: -50 })
      .expect(400);
  });
});

describe('POST /api/v1/payments/webhook/razorpay', () => {
  it('rejects a request with no signature header', async () => {
    await request(app)
      .post('/api/v1/payments/webhook/razorpay')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ event: 'payment.captured' }))
      .expect(401);
  });

  it('rejects a request with an invalid signature', async () => {
    await request(app)
      .post('/api/v1/payments/webhook/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', 'not-valid')
      .send(JSON.stringify({ event: 'payment.captured' }))
      .expect(401);
  });

  it('accepts a correctly signed webhook and marks the order paid', async () => {
    const user = await createUser();
    const order = await placeRazorpayOrder(user);

    const body = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: { entity: { id: 'pay_webhook_e2e', order_id: order.payment.razorpayOrderId, status: 'captured' } },
      },
    });
    const signature = crypto.createHmac('sha256', 'test_webhook_secret_for_unit_tests').update(body).digest('hex');

    await request(app)
      .post('/api/v1/payments/webhook/razorpay')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', signature)
      .send(body)
      .expect(200);

    const verifyRes = await request(app)
      .get(`/api/v1/orders/${order.id}`)
      .set(authHeader(user))
      .expect(200);
    expect(verifyRes.body.data.order.payment.status).toBe('paid');
  });
});
