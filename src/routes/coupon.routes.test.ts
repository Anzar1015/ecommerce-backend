import request from 'supertest';
import '../test/setup';
import { createApp } from '../app';
import { signAccessToken } from '../auth/jwt';
import { createUser, createProduct, createCoupon, setCartItems } from '../test/factories';
import type { IUser } from '../models/User.model';

const app = createApp();

function authHeader(user: IUser) {
  return { Authorization: `Bearer ${signAccessToken({ sub: user.id, role: user.role })}` };
}

describe('Coupon routes — authorization', () => {
  it('rejects unauthenticated access to admin coupon management', async () => {
    await request(app).get('/api/v1/coupons').expect(401);
  });

  it('rejects a non-admin customer from creating a coupon', async () => {
    const customer = await createUser();
    await request(app)
      .post('/api/v1/coupons')
      .set(authHeader(customer))
      .send({
        code: 'BLOCKED10',
        type: 'PERCENTAGE',
        value: 10,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(403);
  });

  it('allows an admin to create, list, update and delete a coupon', async () => {
    const admin = await createUser({ role: 'admin' });

    const createRes = await request(app)
      .post('/api/v1/coupons')
      .set(authHeader(admin))
      .send({
        code: 'ADMIN10',
        type: 'PERCENTAGE',
        value: 10,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(201);

    const couponId = createRes.body.data.coupon.id;
    expect(createRes.body.data.coupon.code).toBe('ADMIN10');

    const listRes = await request(app).get('/api/v1/coupons').set(authHeader(admin)).expect(200);
    expect(listRes.body.data.coupons).toHaveLength(1);

    await request(app)
      .patch(`/api/v1/coupons/${couponId}`)
      .set(authHeader(admin))
      .send({ isActive: false })
      .expect(200);

    await request(app).delete(`/api/v1/coupons/${couponId}`).set(authHeader(admin)).expect(200);
    await request(app).get(`/api/v1/coupons/${couponId}`).set(authHeader(admin)).expect(404);
  });

  it('rejects an invalid coupon payload (percentage over 100) with 400', async () => {
    const admin = await createUser({ role: 'admin' });
    await request(app)
      .post('/api/v1/coupons')
      .set(authHeader(admin))
      .send({
        code: 'TOOBIG',
        type: 'PERCENTAGE',
        value: 150,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(400);
  });

  it('rejects an end date before the start date with 400', async () => {
    const admin = await createUser({ role: 'admin' });
    await request(app)
      .post('/api/v1/coupons')
      .set(authHeader(admin))
      .send({
        code: 'BADDATES',
        type: 'FIXED_AMOUNT',
        value: 100,
        startDate: new Date(Date.now() + 86400000).toISOString(),
        endDate: new Date().toISOString(),
      })
      .expect(400);
  });
});

describe('POST /api/v1/coupons/validate', () => {
  it('validates a coupon against the caller\'s live cart and returns the discount', async () => {
    const admin = await createUser({ role: 'admin' });
    const customer = await createUser();
    const product = await createProduct({ price: 1000 });
    await setCartItems(customer.id, [{ product: product.id, quantity: 2 }]);
    const coupon = await createCoupon({ createdBy: admin.id, type: 'PERCENTAGE', value: 10 });

    const res = await request(app)
      .post('/api/v1/coupons/validate')
      .set(authHeader(customer))
      .send({ code: coupon.code })
      .expect(200);

    expect(res.body.data.valid).toBe(true);
    expect(res.body.data.discountAmount).toBe(200);
    expect(res.body.data.estimatedTotal).toBe(1800);
  });

  it('returns 400 for an invalid coupon code', async () => {
    const customer = await createUser();
    await request(app)
      .post('/api/v1/coupons/validate')
      .set(authHeader(customer))
      .send({ code: 'DOES-NOT-EXIST' })
      .expect(400);
  });

  it('requires authentication', async () => {
    await request(app).post('/api/v1/coupons/validate').send({ code: 'ANY' }).expect(401);
  });
});
