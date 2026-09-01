import request from 'supertest';
import '../test/setup';
import { createApp } from '../app';
import { signAccessToken } from '../auth/jwt';
import { createUser, createProduct, createOrder } from '../test/factories';
import type { IUser } from '../models/User.model';

const app = createApp();

function authHeader(user: IUser) {
  return { Authorization: `Bearer ${signAccessToken({ sub: user.id, role: user.role })}` };
}

describe('POST /api/v1/reviews', () => {
  it('requires authentication', async () => {
    await request(app).post('/api/v1/reviews').send({ productId: 'x', rating: 5, title: 'a', comment: 'b' }).expect(401);
  });

  it('rejects a review from a user with no delivered order for the product', async () => {
    const user = await createUser();
    const product = await createProduct();

    await request(app)
      .post('/api/v1/reviews')
      .set(authHeader(user))
      .field('productId', product.id)
      .field('rating', '5')
      .field('title', 'Great product')
      .field('comment', 'Really happy with this purchase.')
      .expect(403);
  });

  it('creates a pending review for a verified purchaser', async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id);

    const res = await request(app)
      .post('/api/v1/reviews')
      .set(authHeader(user))
      .field('productId', product.id)
      .field('rating', '5')
      .field('title', 'Great product')
      .field('comment', 'Really happy with this purchase.')
      .expect(201);

    expect(res.body.data.review.status).toBe('pending');
    expect(res.body.data.review.isVerifiedPurchase).toBe(true);
  });

  it('rejects an invalid rating with 400', async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id);

    await request(app)
      .post('/api/v1/reviews')
      .set(authHeader(user))
      .field('productId', product.id)
      .field('rating', '9')
      .field('title', 'Great product')
      .field('comment', 'Really happy with this purchase.')
      .expect(400);
  });

  it('rejects a duplicate review with 409', async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id);

    const submit = () =>
      request(app)
        .post('/api/v1/reviews')
        .set(authHeader(user))
        .field('productId', product.id)
        .field('rating', '4')
        .field('title', 'Great product')
        .field('comment', 'Really happy with this purchase.');

    await submit().expect(201);
    await submit().expect(409);
  });
});

describe('GET /api/v1/reviews/eligibility/:productId', () => {
  it('reports eligibility for a verified purchaser', async () => {
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id);

    const res = await request(app)
      .get(`/api/v1/reviews/eligibility/${product.id}`)
      .set(authHeader(user))
      .expect(200);

    expect(res.body.data.canReview).toBe(true);
  });

  it('reports ineligibility without a delivered order', async () => {
    const user = await createUser();
    const product = await createProduct();

    const res = await request(app)
      .get(`/api/v1/reviews/eligibility/${product.id}`)
      .set(authHeader(user))
      .expect(200);

    expect(res.body.data.canReview).toBe(false);
  });
});

describe('GET /api/v1/reviews/product/:productId', () => {
  it('only lists approved reviews and includes a rating summary', async () => {
    const product = await createProduct();
    const user = await createUser();
    await createOrder(user.id, product.id);

    await request(app)
      .post('/api/v1/reviews')
      .set(authHeader(user))
      .field('productId', product.id)
      .field('rating', '5')
      .field('title', 'Great product')
      .field('comment', 'Really happy with this purchase.')
      .expect(201);

    const res = await request(app).get(`/api/v1/reviews/product/${product.id}`).expect(200);
    expect(res.body.data.reviews).toHaveLength(0);
    expect(res.body.data.summary.count).toBe(0);
  });

  it('does not require authentication', async () => {
    const product = await createProduct();
    await request(app).get(`/api/v1/reviews/product/${product.id}`).expect(200);
  });
});

describe('Admin review moderation', () => {
  it('rejects a non-admin from the admin list endpoint', async () => {
    const customer = await createUser();
    await request(app).get('/api/v1/reviews/admin/all').set(authHeader(customer)).expect(403);
  });

  it('lets an admin approve a review, making it publicly visible', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id);

    const createRes = await request(app)
      .post('/api/v1/reviews')
      .set(authHeader(user))
      .field('productId', product.id)
      .field('rating', '5')
      .field('title', 'Great product')
      .field('comment', 'Really happy with this purchase.')
      .expect(201);

    const reviewId = createRes.body.data.review.id;

    await request(app)
      .patch(`/api/v1/reviews/admin/${reviewId}/status`)
      .set(authHeader(admin))
      .send({ status: 'approved' })
      .expect(200);

    const listRes = await request(app).get(`/api/v1/reviews/product/${product.id}`).expect(200);
    expect(listRes.body.data.reviews).toHaveLength(1);
    expect(listRes.body.data.summary.average).toBe(5);
  });

  it('rejects an invalid moderation status with 400', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const product = await createProduct();
    await createOrder(user.id, product.id);

    const createRes = await request(app)
      .post('/api/v1/reviews')
      .set(authHeader(user))
      .field('productId', product.id)
      .field('rating', '5')
      .field('title', 'Great product')
      .field('comment', 'Really happy with this purchase.')
      .expect(201);

    await request(app)
      .patch(`/api/v1/reviews/admin/${createRes.body.data.review.id}/status`)
      .set(authHeader(admin))
      .send({ status: 'not-a-real-status' })
      .expect(400);
  });
});

describe('POST /api/v1/reviews/:id/helpful', () => {
  it('toggles a helpful vote', async () => {
    const admin = await createUser({ role: 'admin' });
    const author = await createUser();
    const voter = await createUser();
    const product = await createProduct();
    await createOrder(author.id, product.id);

    const createRes = await request(app)
      .post('/api/v1/reviews')
      .set(authHeader(author))
      .field('productId', product.id)
      .field('rating', '5')
      .field('title', 'Great product')
      .field('comment', 'Really happy with this purchase.')
      .expect(201);
    const reviewId = createRes.body.data.review.id;

    await request(app)
      .patch(`/api/v1/reviews/admin/${reviewId}/status`)
      .set(authHeader(admin))
      .send({ status: 'approved' })
      .expect(200);

    const voteRes = await request(app)
      .post(`/api/v1/reviews/${reviewId}/helpful`)
      .set(authHeader(voter))
      .expect(200);
    expect(voteRes.body.data.review.helpfulCount).toBe(1);
  });
});
