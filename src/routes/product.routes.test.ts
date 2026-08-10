import request from 'supertest';
import '../test/setup';
import { createApp } from '../app';
import { createProduct } from '../test/factories';

const app = createApp();

describe('GET /api/v1/products', () => {
  it('lists active products with pagination metadata', async () => {
    for (let i = 0; i < 3; i += 1) {
      await createProduct({ name: `Product ${i}` });
    }

    const res = await request(app).get('/api/v1/products').expect(200);
    expect(res.body.data.products).toHaveLength(3);
    expect(res.body.data.pagination).toMatchObject({
      page: 1,
      limit: 12,
      total: 3,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    });
  });

  it('hides non-active products from anonymous requests', async () => {
    await createProduct({ name: 'Active', status: 'active' });
    await createProduct({ name: 'Draft', status: 'draft' });

    const res = await request(app).get('/api/v1/products').expect(200);
    expect(res.body.data.products.map((p: { name: string }) => p.name)).toEqual(['Active']);
  });

  it('supports search + filters + sort + pagination together', async () => {
    for (let i = 0; i < 15; i += 1) {
      await createProduct({ name: `Widget ${i}`, price: 100 + i, brand: 'Acme' });
    }
    await createProduct({ name: 'Unrelated gadget', price: 50, brand: 'Other' });

    const res = await request(app)
      .get('/api/v1/products')
      .query({ search: 'widget', brand: 'acme', minPrice: 100, maxPrice: 110, sort: 'price_asc', page: 1, limit: 5 })
      .expect(200);

    expect(res.body.data.products.length).toBeGreaterThan(0);
    expect(res.body.data.products.every((p: { brand: string }) => p.brand === 'Acme')).toBe(true);
    expect(res.body.data.pagination.limit).toBe(5);
  });

  it('returns an empty result set (not an error) when nothing matches', async () => {
    await createProduct({ name: 'Only product' });
    const res = await request(app).get('/api/v1/products').query({ search: 'nothing-matches-this' }).expect(200);
    expect(res.body.data.products).toEqual([]);
    expect(res.body.data.pagination.total).toBe(0);
  });

  it('rejects an invalid filter (rating out of range) with 400', async () => {
    const res = await request(app).get('/api/v1/products').query({ rating: 9 }).expect(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects an invalid sort value with 400', async () => {
    const res = await request(app).get('/api/v1/products').query({ sort: 'not-a-real-sort' }).expect(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects a limit above the max page size with 400', async () => {
    await request(app).get('/api/v1/products').query({ limit: 1000 }).expect(400);
  });

  it('handles a large result set across multiple pages without error', async () => {
    for (let i = 0; i < 40; i += 1) {
      await createProduct({ name: `Bulk ${i}` });
    }
    const res = await request(app).get('/api/v1/products').query({ limit: 20, page: 2 }).expect(200);
    expect(res.body.data.products).toHaveLength(20);
    expect(res.body.data.pagination.totalPages).toBe(2);
    expect(res.body.data.pagination.hasNextPage).toBe(false);
  });
});

describe('GET /api/v1/products/suggestions', () => {
  it('returns name-matching suggestions', async () => {
    await createProduct({ name: 'iPhone 15' });
    await createProduct({ name: 'Samsung Galaxy' });

    const res = await request(app).get('/api/v1/products/suggestions').query({ q: 'iph' }).expect(200);
    expect(res.body.data.suggestions).toHaveLength(1);
    expect(res.body.data.suggestions[0].name).toBe('iPhone 15');
  });

  it('is not shadowed by the /:identifier route', async () => {
    // If route ordering were wrong, this would 404 (treated as a product lookup by slug "suggestions").
    const res = await request(app).get('/api/v1/products/suggestions').query({ q: 'x' }).expect(200);
    expect(res.body.data.suggestions).toEqual([]);
  });

  it('requires a non-empty q param', async () => {
    await request(app).get('/api/v1/products/suggestions').expect(400);
  });
});
