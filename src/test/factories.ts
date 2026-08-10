import { Category, ICategory } from '../models/Category.model';
import { Product, IProduct } from '../models/Product.model';

let counter = 0;
function nextId(): number {
  counter += 1;
  return counter;
}

export async function createCategory(overrides: Partial<ICategory> = {}): Promise<ICategory> {
  const n = nextId();
  return Category.create({
    name: overrides.name ?? `Category ${n}`,
    slug: overrides.slug ?? `category-${n}`,
    isActive: overrides.isActive ?? true,
    ...overrides,
  });
}

export async function createProduct(overrides: Partial<IProduct> = {}): Promise<IProduct> {
  const n = nextId();
  const category = overrides.category ?? (await createCategory())._id;
  return Product.create({
    name: overrides.name ?? `Product ${n}`,
    slug: overrides.slug ?? `product-${n}`,
    description: overrides.description ?? `Description for product ${n}, long enough to pass validation.`,
    category,
    price: overrides.price ?? 999,
    discount: overrides.discount ?? 0,
    stock: overrides.stock ?? 10,
    lowStockThreshold: overrides.lowStockThreshold ?? 5,
    sku: overrides.sku ?? `SKU-${n}`,
    brand: overrides.brand ?? 'GenericBrand',
    tags: overrides.tags ?? [],
    status: overrides.status ?? 'active',
    ratings: overrides.ratings ?? { average: 0, count: 0 },
    ...overrides,
  });
}
