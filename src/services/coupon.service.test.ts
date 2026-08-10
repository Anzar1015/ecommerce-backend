import '../test/setup';
import { couponService } from './coupon.service';
import { couponRepository } from '../repositories/coupon.repository';
import { createUser, createProduct, createCategory, createCoupon } from '../test/factories';
import { ApiError } from '../utils/ApiError';

async function eligibleItem(overrides: { productId: string; categoryId: string; lineTotal: number }) {
  return overrides;
}

describe('couponService.applyCoupon — rules', () => {
  it('rejects an invalid/unknown coupon code', async () => {
    const user = await createUser();
    await expect(couponService.applyCoupon(user.id, 'NOPE', 1000, [])).rejects.toThrow('Invalid coupon code');
  });

  it('rejects a disabled coupon', async () => {
    const user = await createUser();
    const coupon = await createCoupon({ createdBy: user.id, isActive: false });
    await expect(couponService.applyCoupon(user.id, coupon.code, 1000, [])).rejects.toThrow('no longer active');
  });

  it('rejects an expired coupon', async () => {
    const user = await createUser();
    const coupon = await createCoupon({
      createdBy: user.id,
      startDate: new Date(Date.now() - 10 * 86400000),
      endDate: new Date(Date.now() - 1 * 86400000),
    });
    await expect(couponService.applyCoupon(user.id, coupon.code, 1000, [])).rejects.toThrow('expired');
  });

  it('rejects a coupon that has not started yet', async () => {
    const user = await createUser();
    const coupon = await createCoupon({
      createdBy: user.id,
      startDate: new Date(Date.now() + 1 * 86400000),
      endDate: new Date(Date.now() + 10 * 86400000),
    });
    await expect(couponService.applyCoupon(user.id, coupon.code, 1000, [])).rejects.toThrow('not active yet');
  });

  it('rejects when the global usage limit is reached', async () => {
    const user = await createUser();
    const coupon = await createCoupon({ createdBy: user.id, usageLimit: 5, usedCount: 5 });
    await expect(couponService.applyCoupon(user.id, coupon.code, 1000, [])).rejects.toThrow('usage limit');
  });

  it('rejects when the per-user limit has already been reached', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const product = await createProduct({ price: 1000 });
    const coupon = await createCoupon({ createdBy: admin.id, perUserLimit: 1 });

    // Simulate a prior non-cancelled order that redeemed this coupon.
    const { Order } = await import('../models/Order.model');
    const { Address } = await import('../models/Address.model');
    const address = await Address.create({
      user: user.id,
      fullName: 'A',
      phone: '9999999999',
      addressLine1: 'x',
      city: 'x',
      state: 'x',
      postalCode: '123456',
      country: 'India',
    });
    await Order.create({
      orderNumber: 'ORD-TEST-0001',
      user: user.id,
      items: [{ product: product.id, name: product.name, sku: product.sku, price: 100, quantity: 1, subtotal: 100 }],
      shippingAddress: {
        fullName: address.fullName,
        phone: address.phone,
        addressLine1: address.addressLine1,
        city: address.city,
        state: address.state,
        postalCode: address.postalCode,
        country: address.country,
      },
      status: 'pending',
      payment: { method: 'cod', status: 'pending' },
      subtotal: 100,
      total: 100,
      coupon: { coupon: coupon._id, code: coupon.code, type: coupon.type, value: coupon.value, discountAmount: 10 },
    });

    await expect(
      couponService.applyCoupon(user.id, coupon.code, 1000, [
        await eligibleItem({ productId: product.id, categoryId: 'x', lineTotal: 1000 }),
      ])
    ).rejects.toThrow('already used this coupon');
  });

  it('rejects a first-order-only coupon for a user with prior orders', async () => {
    const admin = await createUser({ role: 'admin' });
    const user = await createUser();
    const coupon = await createCoupon({ createdBy: admin.id, firstOrderOnly: true });

    const { Order } = await import('../models/Order.model');
    await Order.create({
      orderNumber: 'ORD-TEST-0002',
      user: user.id,
      items: [{ product: (await createProduct()).id, name: 'x', sku: 'x', price: 10, quantity: 1, subtotal: 10 }],
      shippingAddress: {
        fullName: 'A',
        phone: '9999999999',
        addressLine1: 'x',
        city: 'x',
        state: 'x',
        postalCode: '123456',
        country: 'India',
      },
      status: 'pending',
      payment: { method: 'cod', status: 'pending' },
      subtotal: 10,
      total: 10,
    });

    await expect(couponService.applyCoupon(user.id, coupon.code, 1000, [])).rejects.toThrow('first-time orders only');
  });

  it('rejects when the subtotal is below the minimum order amount', async () => {
    const user = await createUser();
    const coupon = await createCoupon({ createdBy: user.id, minimumOrderAmount: 5000 });
    await expect(couponService.applyCoupon(user.id, coupon.code, 1000, [])).rejects.toThrow(
      'does not meet the minimum'
    );
  });

  it('rejects when no cart items are eligible under product/category restrictions', async () => {
    const user = await createUser();
    const restrictedProduct = await createProduct();
    const otherProduct = await createProduct();
    const coupon = await createCoupon({ createdBy: user.id, applicableProducts: [restrictedProduct._id] });

    await expect(
      couponService.applyCoupon(user.id, coupon.code, 1000, [
        { productId: otherProduct.id, categoryId: 'x', lineTotal: 1000 },
      ])
    ).rejects.toThrow('does not apply to any items');
  });
});

describe('couponService.applyCoupon — discount calculation', () => {
  it('computes a flat percentage discount with no cap', async () => {
    const user = await createUser();
    const coupon = await createCoupon({ createdBy: user.id, type: 'PERCENTAGE', value: 10 });
    const product = await createProduct();

    const result = await couponService.applyCoupon(user.id, coupon.code, 1000, [
      { productId: product.id, categoryId: 'x', lineTotal: 1000 },
    ]);

    expect(result.discountAmount).toBe(100);
  });

  it('caps a percentage discount at maximumDiscount', async () => {
    const user = await createUser();
    const coupon = await createCoupon({ createdBy: user.id, type: 'PERCENTAGE', value: 50, maximumDiscount: 200 });
    const product = await createProduct();

    const result = await couponService.applyCoupon(user.id, coupon.code, 2000, [
      { productId: product.id, categoryId: 'x', lineTotal: 2000 },
    ]);

    expect(result.discountAmount).toBe(200);
  });

  it('applies a fixed-amount discount, capped at the eligible subtotal', async () => {
    const user = await createUser();
    const coupon = await createCoupon({ createdBy: user.id, type: 'FIXED_AMOUNT', value: 500 });
    const product = await createProduct();

    const small = await couponService.applyCoupon(user.id, coupon.code, 300, [
      { productId: product.id, categoryId: 'x', lineTotal: 300 },
    ]);
    expect(small.discountAmount).toBe(300);

    const large = await couponService.applyCoupon(user.id, coupon.code, 3000, [
      { productId: product.id, categoryId: 'x', lineTotal: 3000 },
    ]);
    expect(large.discountAmount).toBe(500);
  });

  it('only discounts eligible items when applicableCategories is set', async () => {
    const user = await createUser();
    const eligibleCategory = await createCategory();
    const coupon = await createCoupon({
      createdBy: user.id,
      type: 'PERCENTAGE',
      value: 10,
      applicableCategories: [eligibleCategory._id],
    });

    const result = await couponService.applyCoupon(user.id, coupon.code, 1500, [
      { productId: 'p1', categoryId: eligibleCategory.id, lineTotal: 1000 },
      { productId: 'p2', categoryId: 'unrelated-category', lineTotal: 500 },
    ]);

    // Only the 1000 line qualifies -> 10% of 1000 = 100, not 10% of 1500.
    expect(result.discountAmount).toBe(100);
    expect(result.eligibleSubtotal).toBe(1000);
  });

  it('excludes explicitly excluded products even when otherwise eligible', async () => {
    const user = await createUser();
    const excludedProduct = await createProduct();
    const coupon = await createCoupon({ createdBy: user.id, type: 'PERCENTAGE', value: 10, excludedProducts: [excludedProduct._id] });

    const result = await couponService.applyCoupon(user.id, coupon.code, 1000, [
      { productId: excludedProduct.id, categoryId: 'x', lineTotal: 400 },
      { productId: 'other', categoryId: 'x', lineTotal: 600 },
    ]);

    expect(result.eligibleSubtotal).toBe(600);
    expect(result.discountAmount).toBe(60);
  });
});

describe('couponService usage counters', () => {
  it('increments usedCount on recordUsage and decrements on releaseUsage', async () => {
    const user = await createUser();
    const coupon = await createCoupon({ createdBy: user.id });

    await couponService.recordUsage(coupon.id);
    let updated = await couponRepository.findById(coupon.id);
    expect(updated?.usedCount).toBe(1);

    await couponService.releaseUsage(coupon.id);
    updated = await couponRepository.findById(coupon.id);
    expect(updated?.usedCount).toBe(0);
  });

  it('refuses to record usage past the usage limit (race-safe)', async () => {
    const user = await createUser();
    const coupon = await createCoupon({ createdBy: user.id, usageLimit: 1, usedCount: 1 });
    await expect(couponService.recordUsage(coupon.id)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('couponService admin CRUD', () => {
  it('rejects creating a coupon with a duplicate code', async () => {
    const admin = await createUser({ role: 'admin' });
    await createCoupon({ createdBy: admin.id, code: 'DUPE10' });

    await expect(
      couponService.create(
        {
          code: 'DUPE10',
          type: 'PERCENTAGE',
          value: 10,
          minimumOrderAmount: 0,
          startDate: new Date(),
          endDate: new Date(Date.now() + 86400000),
          firstOrderOnly: false,
          isActive: true,
          applicableProducts: [],
          applicableCategories: [],
          excludedProducts: [],
        },
        admin.id
      )
    ).rejects.toThrow('already exists');
  });

  it('lists coupons with pagination', async () => {
    const admin = await createUser({ role: 'admin' });
    await createCoupon({ createdBy: admin.id });
    await createCoupon({ createdBy: admin.id });

    const result = await couponService.list({}, 1, 10);
    expect(result.coupons).toHaveLength(2);
    expect(result.pagination.total).toBe(2);
  });

  it('deletes a coupon', async () => {
    const admin = await createUser({ role: 'admin' });
    const coupon = await createCoupon({ createdBy: admin.id });

    await couponService.remove(coupon.id);
    await expect(couponService.getById(coupon.id)).rejects.toThrow('not found');
  });
});
