import '../test/setup';
import { productRepository, ProductFilters } from './product.repository';
import { createCategory, createProduct } from '../test/factories';

const baseFilters: ProductFilters = { sort: 'newest', status: 'active' };

describe('productRepository — search', () => {
  it('matches by name (case insensitive)', async () => {
    await createProduct({ name: 'iPhone 15 Pro' });
    await createProduct({ name: 'Samsung Galaxy S24' });

    const results = await productRepository.findAll({ ...baseFilters, search: 'iphone' }, 1, 10);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('iPhone 15 Pro');
  });

  it('matches by SKU', async () => {
    await createProduct({ name: 'Wireless Mouse', sku: 'WM-BLACK-01' });
    await createProduct({ name: 'Wireless Keyboard', sku: 'WK-BLACK-01' });

    const results = await productRepository.findAll({ ...baseFilters, search: 'WM-BLACK' }, 1, 10);
    expect(results).toHaveLength(1);
    expect(results[0].sku).toBe('WM-BLACK-01');
  });

  it('matches by brand and description substrings', async () => {
    await createProduct({ name: 'Running Shoes', brand: 'Zoomax', description: 'Lightweight breathable mesh upper.' });
    const byBrand = await productRepository.findAll({ ...baseFilters, search: 'zoomax' }, 1, 10);
    expect(byBrand).toHaveLength(1);

    const byDescription = await productRepository.findAll({ ...baseFilters, search: 'breathable' }, 1, 10);
    expect(byDescription).toHaveLength(1);
  });

  it('returns an empty array for a search term with no matches', async () => {
    await createProduct({ name: 'Desk Lamp' });
    const results = await productRepository.findAll({ ...baseFilters, search: 'nonexistentterm' }, 1, 10);
    expect(results).toHaveLength(0);
  });

  it('treats an empty/whitespace search as no filter', async () => {
    await createProduct({ name: 'Desk Lamp' });
    await createProduct({ name: 'Office Chair' });
    const results = await productRepository.findAll({ ...baseFilters, search: '' }, 1, 10);
    expect(results).toHaveLength(2);
  });

  it('escapes regex special characters instead of throwing', async () => {
    await createProduct({ name: 'Cable (2m)' });
    await expect(productRepository.findAll({ ...baseFilters, search: '(2m)' }, 1, 10)).resolves.toHaveLength(1);
  });

  it('ranks name matches above description-only matches when sort=relevance', async () => {
    await createProduct({ name: 'Widget', description: 'A generic accessory.' });
    await createProduct({ name: 'Generic Gadget', description: 'A widget-compatible accessory.' });

    const results = await productRepository.findAll({ ...baseFilters, search: 'widget', sort: 'relevance' }, 1, 10);
    expect(results).toHaveLength(2);
    expect(results[0].name).toBe('Widget');
  });
});

describe('productRepository — filters', () => {
  it('filters by category', async () => {
    const electronics = await createCategory({ name: 'Electronics', slug: 'electronics' });
    const apparel = await createCategory({ name: 'Apparel', slug: 'apparel' });
    await createProduct({ name: 'Laptop', category: electronics._id });
    await createProduct({ name: 'T-Shirt', category: apparel._id });

    const results = await productRepository.findAll({ ...baseFilters, category: 'electronics' }, 1, 10);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Laptop');
  });

  it('returns zero results for an unresolvable category rather than an unfiltered list', async () => {
    await createProduct({ name: 'Laptop' });
    const results = await productRepository.findAll({ ...baseFilters, category: 'does-not-exist' }, 1, 10);
    expect(results).toHaveLength(0);
  });

  it('prefers subcategory over category when both are given', async () => {
    const a = await createCategory({ slug: 'cat-a' });
    const b = await createCategory({ slug: 'cat-b' });
    await createProduct({ name: 'In A', category: a._id });
    await createProduct({ name: 'In B', category: b._id });

    const results = await productRepository.findAll(
      { ...baseFilters, category: 'cat-a', subcategory: 'cat-b' },
      1,
      10
    );
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('In B');
  });

  it('filters by brand (case insensitive, exact)', async () => {
    await createProduct({ name: 'Phone A', brand: 'Acme' });
    await createProduct({ name: 'Phone B', brand: 'Acmesupplies' });

    const results = await productRepository.findAll({ ...baseFilters, brand: 'acme' }, 1, 10);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Phone A');
  });

  it('filters by price range', async () => {
    await createProduct({ name: 'Cheap', price: 199 });
    await createProduct({ name: 'Mid', price: 999 });
    await createProduct({ name: 'Expensive', price: 5999 });

    const results = await productRepository.findAll({ ...baseFilters, minPrice: 500, maxPrice: 2000 }, 1, 10);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Mid');
  });

  it('filters by minimum rating', async () => {
    await createProduct({ name: 'Low rated', ratings: { average: 2.5, count: 4 } });
    await createProduct({ name: 'High rated', ratings: { average: 4.6, count: 20 } });

    const results = await productRepository.findAll({ ...baseFilters, rating: 4 }, 1, 10);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('High rated');
  });

  it('filters by availability (inStock)', async () => {
    await createProduct({ name: 'In stock', stock: 5 });
    await createProduct({ name: 'Out of stock', stock: 0 });

    const inStock = await productRepository.findAll({ ...baseFilters, inStock: true }, 1, 10);
    expect(inStock.map((p) => p.name)).toEqual(['In stock']);

    const outOfStock = await productRepository.findAll({ ...baseFilters, inStock: false }, 1, 10);
    expect(outOfStock.map((p) => p.name)).toEqual(['Out of stock']);
  });

  it('filters by minimum discount', async () => {
    await createProduct({ name: 'No discount', discount: 0 });
    await createProduct({ name: 'On sale', discount: 25 });

    const results = await productRepository.findAll({ ...baseFilters, minDiscount: 10 }, 1, 10);
    expect(results.map((p) => p.name)).toEqual(['On sale']);
  });

  it('filters by multiple tags (matches any)', async () => {
    await createProduct({ name: 'Summer item', tags: ['summer', 'sale'] });
    await createProduct({ name: 'Winter item', tags: ['winter'] });
    await createProduct({ name: 'Unrelated item', tags: [] });

    const results = await productRepository.findAll({ ...baseFilters, tags: ['summer', 'winter'] }, 1, 10);
    expect(results.map((p) => p.name).sort()).toEqual(['Summer item', 'Winter item']);
  });

  it('combines multiple filters with AND semantics', async () => {
    const electronics = await createCategory({ slug: 'electronics-2' });
    await createProduct({ name: 'Match', category: electronics._id, brand: 'Acme', price: 1000, stock: 3 });
    await createProduct({ name: 'Wrong brand', category: electronics._id, brand: 'Other', price: 1000, stock: 3 });
    await createProduct({ name: 'Wrong price', category: electronics._id, brand: 'Acme', price: 99999, stock: 3 });

    const results = await productRepository.findAll(
      { ...baseFilters, category: 'electronics-2', brand: 'Acme', minPrice: 500, maxPrice: 2000, inStock: true },
      1,
      10
    );
    expect(results.map((p) => p.name)).toEqual(['Match']);
  });

  it('forces zero results for a nonsensical price range rather than erroring', async () => {
    await createProduct({ name: 'Item', price: 500 });
    const results = await productRepository.findAll({ ...baseFilters, minPrice: 1000, maxPrice: 100 }, 1, 10);
    expect(results).toHaveLength(0);
  });
});

describe('productRepository — sorting', () => {
  it('sorts by price ascending/descending', async () => {
    await createProduct({ name: 'Product AA', price: 300 });
    await createProduct({ name: 'Product BB', price: 100 });
    await createProduct({ name: 'Product CC', price: 200 });

    const asc = await productRepository.findAll({ ...baseFilters, sort: 'price_asc' }, 1, 10);
    expect(asc.map((p) => p.name)).toEqual(['Product BB', 'Product CC', 'Product AA']);

    const desc = await productRepository.findAll({ ...baseFilters, sort: 'price_desc' }, 1, 10);
    expect(desc.map((p) => p.name)).toEqual(['Product AA', 'Product CC', 'Product BB']);
  });

  it('sorts by rating descending', async () => {
    await createProduct({ name: 'Low', ratings: { average: 2, count: 5 } });
    await createProduct({ name: 'High', ratings: { average: 4.8, count: 5 } });

    const results = await productRepository.findAll({ ...baseFilters, sort: 'rating' }, 1, 10);
    expect(results.map((p) => p.name)).toEqual(['High', 'Low']);
  });

  it('sorts by popularity (review count) descending', async () => {
    await createProduct({ name: 'Few reviews', ratings: { average: 5, count: 2 } });
    await createProduct({ name: 'Many reviews', ratings: { average: 3, count: 200 } });

    const results = await productRepository.findAll({ ...baseFilters, sort: 'popularity' }, 1, 10);
    expect(results.map((p) => p.name)).toEqual(['Many reviews', 'Few reviews']);
  });
});

describe('productRepository — pagination', () => {
  it('paginates results and reports an accurate total count', async () => {
    for (let i = 0; i < 25; i += 1) {
      await createProduct({ name: `Product ${i}` });
    }

    const page1 = await productRepository.findAll({ ...baseFilters, sort: 'name_asc' }, 1, 10);
    const page3 = await productRepository.findAll({ ...baseFilters, sort: 'name_asc' }, 3, 10);
    const total = await productRepository.count(baseFilters);

    expect(page1).toHaveLength(10);
    expect(page3).toHaveLength(5);
    expect(total).toBe(25);
  });

  it('returns an empty array for a page beyond the last one', async () => {
    await createProduct({ name: 'Only product' });
    const results = await productRepository.findAll({ ...baseFilters }, 99, 10);
    expect(results).toHaveLength(0);
  });
});

describe('productRepository — suggest', () => {
  it('suggests products matching a name prefix, only among active products', async () => {
    await createProduct({ name: 'iPhone 15', status: 'active' });
    await createProduct({ name: 'iPhone 15 Pro Max', status: 'active' });
    await createProduct({ name: 'iPhone Case', status: 'draft' });
    await createProduct({ name: 'Samsung Galaxy', status: 'active' });

    const suggestions = await productRepository.suggest('iph', 8);
    expect(suggestions.map((s) => s.name).sort()).toEqual(['iPhone 15', 'iPhone 15 Pro Max']);
  });

  it('returns an empty array for a blank query', async () => {
    await createProduct({ name: 'Anything' });
    const suggestions = await productRepository.suggest('   ', 8);
    expect(suggestions).toEqual([]);
  });

  it('respects the limit', async () => {
    for (let i = 0; i < 5; i += 1) {
      await createProduct({ name: `Widget ${i}` });
    }
    const suggestions = await productRepository.suggest('widget', 3);
    expect(suggestions).toHaveLength(3);
  });
});
