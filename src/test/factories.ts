import { Category, ICategory } from '../models/Category.model';
import { Product, IProduct } from '../models/Product.model';
import { User, IUser } from '../models/User.model';
import { Address, IAddress } from '../models/Address.model';
import { Cart } from '../models/Cart.model';
import { Coupon, ICoupon } from '../models/Coupon.model';

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

export async function createUser(overrides: Partial<IUser> = {}): Promise<IUser> {
  const n = nextId();
  return User.create({
    name: overrides.name ?? `Test User ${n}`,
    email: overrides.email ?? `user${n}@example.com`,
    password: overrides.password ?? 'Password123!',
    role: overrides.role ?? 'customer',
    ...overrides,
  });
}

export async function createAddress(userId: string, overrides: Partial<IAddress> = {}): Promise<IAddress> {
  return Address.create({
    user: userId,
    fullName: overrides.fullName ?? 'Test User',
    phone: overrides.phone ?? '9876543210',
    addressLine1: overrides.addressLine1 ?? '123 Test Street',
    city: overrides.city ?? 'Mumbai',
    state: overrides.state ?? 'Maharashtra',
    postalCode: overrides.postalCode ?? '400001',
    country: overrides.country ?? 'India',
    isDefault: overrides.isDefault ?? true,
    ...overrides,
  });
}

/** Creates/replaces the given user's cart with the provided items. */
export async function setCartItems(userId: string, items: { product: string; quantity: number }[]): Promise<void> {
  await Cart.findOneAndUpdate({ user: userId }, { user: userId, items }, { upsert: true, new: true });
}

export async function createCoupon(overrides: Partial<ICoupon> & { createdBy: string }): Promise<ICoupon> {
  const n = nextId();
  const now = Date.now();
  return Coupon.create({
    code: overrides.code ?? `COUPON${n}`,
    type: overrides.type ?? 'PERCENTAGE',
    value: overrides.value ?? 10,
    minimumOrderAmount: overrides.minimumOrderAmount ?? 0,
    startDate: overrides.startDate ?? new Date(now - 24 * 60 * 60 * 1000),
    endDate: overrides.endDate ?? new Date(now + 24 * 60 * 60 * 1000),
    firstOrderOnly: overrides.firstOrderOnly ?? false,
    isActive: overrides.isActive ?? true,
    applicableProducts: overrides.applicableProducts ?? [],
    applicableCategories: overrides.applicableCategories ?? [],
    excludedProducts: overrides.excludedProducts ?? [],
    ...overrides,
  });
}
