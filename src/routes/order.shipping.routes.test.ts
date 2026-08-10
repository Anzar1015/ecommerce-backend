import request from 'supertest';
import '../test/setup';
import { createApp } from '../app';
import { signAccessToken } from '../auth/jwt';
import { createUser, createProduct, createAddress, setCartItems } from '../test/factories';
import type { IUser } from '../models/User.model';

const app = createApp();

function authHeader(user: IUser) {
  return { Authorization: `Bearer ${signAccessToken({ sub: user.id, role: user.role })}` };
}

async function placeOrderViaApi(customer: IUser) {
  const address = await createAddress(customer.id);
  const product = await createProduct({ price: 500, stock: 5 });
  await setCartItems(customer.id, [{ product: product.id, quantity: 1 }]);

  const res = await request(app)
    .post('/api/v1/orders/checkout')
    .set(authHeader(customer))
    .send({ addressId: address.id, paymentMethod: 'cod', shippingMethod: 'express' })
    .expect(201);

  return res.body.data.order;
}

describe('PATCH /api/v1/orders/admin/:id/shipping', () => {
  it('lets an admin set tracking number and courier', async () => {
    const admin = await createUser({ role: 'admin' });
    const customer = await createUser();
    const order = await placeOrderViaApi(customer);

    const res = await request(app)
      .patch(`/api/v1/orders/admin/${order.id}/shipping`)
      .set(authHeader(admin))
      .send({ trackingNumber: 'TRK999', courier: 'Delhivery' })
      .expect(200);

    expect(res.body.data.order.shipping.trackingNumber).toBe('TRK999');
    expect(res.body.data.order.shipping.courier).toBe('Delhivery');
  });

  it('rejects a non-admin customer', async () => {
    const customer = await createUser();
    const order = await placeOrderViaApi(customer);

    await request(app)
      .patch(`/api/v1/orders/admin/${order.id}/shipping`)
      .set(authHeader(customer))
      .send({ trackingNumber: 'TRK1' })
      .expect(403);
  });

  it('rejects an empty payload (neither field provided)', async () => {
    const admin = await createUser({ role: 'admin' });
    const customer = await createUser();
    const order = await placeOrderViaApi(customer);

    await request(app)
      .patch(`/api/v1/orders/admin/${order.id}/shipping`)
      .set(authHeader(admin))
      .send({})
      .expect(400);
  });

  it('checkout reflects the express shipping fee end to end', async () => {
    const customer = await createUser();
    const order = await placeOrderViaApi(customer);
    expect(order.shippingFee).toBe(120);
    expect(order.total).toBe(620);
  });
});
