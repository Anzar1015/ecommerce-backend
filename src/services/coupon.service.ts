import { couponRepository, CouponFilters } from '../repositories/coupon.repository';
import { orderRepository } from '../repositories/order.repository';
import { cartService } from './cart.service';
import { ApiError } from '../utils/ApiError';
import { buildPaginationMeta, PaginationMeta } from '../utils/pagination';
import { ICoupon } from '../models/Coupon.model';
import { IProduct } from '../models/Product.model';
import type { CreateCouponInput, UpdateCouponInput } from '../validators/coupon.validator';

export interface CouponEligibleItem {
  productId: string;
  categoryId: string;
  /** Line total (product's own discounted price * quantity), before any coupon discount. */
  lineTotal: number;
}

export interface CouponApplication {
  coupon: ICoupon;
  discountAmount: number;
  eligibleSubtotal: number;
}

/** All server-side rules from spec 12.3, checked in order so the first
 * violation produces a clear, specific error rather than a generic one. */
async function assertCouponIsRedeemable(coupon: ICoupon, userId: string, subtotal: number): Promise<void> {
  if (!coupon.isActive) {
    throw ApiError.badRequest('This coupon is no longer active');
  }

  const now = new Date();
  if (now < coupon.startDate) {
    throw ApiError.badRequest('This coupon is not active yet');
  }
  if (now > coupon.endDate) {
    throw ApiError.badRequest('This coupon has expired');
  }

  if (coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit) {
    throw ApiError.badRequest('This coupon has reached its usage limit');
  }

  if (coupon.perUserLimit !== undefined) {
    const userUsageCount = await orderRepository.countByUserAndCouponCode(userId, coupon.code);
    if (userUsageCount >= coupon.perUserLimit) {
      throw ApiError.badRequest('You have already used this coupon the maximum number of times');
    }
  }

  if (coupon.firstOrderOnly) {
    const orderCount = await orderRepository.countByUser(userId);
    if (orderCount > 0) {
      throw ApiError.badRequest('This coupon is valid for first-time orders only');
    }
  }

  if (subtotal < coupon.minimumOrderAmount) {
    throw ApiError.badRequest('Your order does not meet the minimum amount required for this coupon');
  }
}

function computeDiscount(coupon: ICoupon, items: CouponEligibleItem[]): { discountAmount: number; eligibleSubtotal: number } {
  const hasRestriction = coupon.applicableProducts.length > 0 || coupon.applicableCategories.length > 0;
  const applicableProductIds = new Set(coupon.applicableProducts.map(String));
  const applicableCategoryIds = new Set(coupon.applicableCategories.map(String));
  const excludedProductIds = new Set(coupon.excludedProducts.map(String));

  const eligibleSubtotal = items.reduce((sum, item) => {
    if (excludedProductIds.has(item.productId)) return sum;
    const isApplicable =
      !hasRestriction || applicableProductIds.has(item.productId) || applicableCategoryIds.has(item.categoryId);
    return isApplicable ? sum + item.lineTotal : sum;
  }, 0);

  if (eligibleSubtotal <= 0) {
    throw ApiError.badRequest('This coupon does not apply to any items in your cart');
  }

  let discountAmount =
    coupon.type === 'PERCENTAGE' ? eligibleSubtotal * (coupon.value / 100) : Math.min(coupon.value, eligibleSubtotal);

  if (coupon.type === 'PERCENTAGE' && coupon.maximumDiscount !== undefined) {
    discountAmount = Math.min(discountAmount, coupon.maximumDiscount);
  }

  return { discountAmount: Math.round(discountAmount * 100) / 100, eligibleSubtotal };
}

export const couponService = {
  /** Validates a coupon code against a user's cart/order contents and
   * computes the discount. Used both for the standalone preview endpoint and
   * re-run (never trusted from the client) inside checkout itself. */
  async applyCoupon(
    userId: string,
    code: string,
    subtotal: number,
    items: CouponEligibleItem[]
  ): Promise<CouponApplication> {
    const coupon = await couponRepository.findByCode(code);
    if (!coupon) throw ApiError.badRequest('Invalid coupon code');

    await assertCouponIsRedeemable(coupon, userId, subtotal);
    const { discountAmount, eligibleSubtotal } = computeDiscount(coupon, items);

    return { coupon, discountAmount, eligibleSubtotal };
  },

  /** Preview endpoint support: validates a code against the user's live cart
   * (never a client-supplied subtotal/items) and returns the discount. */
  async validateCartCoupon(userId: string, code: string): Promise<CouponApplication & { subtotal: number }> {
    const { cart, summary } = await cartService.getCart(userId);

    const items: CouponEligibleItem[] = cart.items.map((item) => {
      const product = item.product as unknown as IProduct;
      return {
        productId: product._id.toString(),
        categoryId: product.category ? product.category.toString() : '',
        lineTotal: Math.round(product.price * (1 - product.discount / 100) * item.quantity * 100) / 100,
      };
    });

    const application = await couponService.applyCoupon(userId, code, summary.subtotal, items);
    return { ...application, subtotal: summary.subtotal };
  },

  /** Atomically records a redemption; throws if the usage limit was hit by a
   * concurrent request between validation and this call. */
  async recordUsage(couponId: string): Promise<void> {
    const updated = await couponRepository.incrementUsedCount(couponId);
    if (!updated) {
      throw ApiError.conflict('This coupon just reached its usage limit. Please remove it and try again.');
    }
  },

  /** Restores a unit of usage on order cancellation, mirroring stock restocking. */
  async releaseUsage(couponId: string): Promise<void> {
    await couponRepository.decrementUsedCount(couponId);
  },

  // --- Admin CRUD ---

  async create(input: CreateCouponInput, createdBy: string): Promise<ICoupon> {
    const existing = await couponRepository.findByCode(input.code);
    if (existing) throw ApiError.conflict('A coupon with this code already exists');
    return couponRepository.create({ ...input, createdBy });
  },

  async list(filters: CouponFilters, page: number, limit: number): Promise<{ coupons: ICoupon[]; pagination: PaginationMeta }> {
    const [coupons, total] = await Promise.all([
      couponRepository.findAll(filters, page, limit),
      couponRepository.count(filters),
    ]);
    return { coupons, pagination: buildPaginationMeta(total, page, limit) };
  },

  async getById(id: string): Promise<ICoupon> {
    const coupon = await couponRepository.findById(id);
    if (!coupon) throw ApiError.notFound('Coupon not found');
    return coupon;
  },

  async update(id: string, input: UpdateCouponInput): Promise<ICoupon> {
    if (input.code) {
      const existing = await couponRepository.findByCode(input.code);
      if (existing && existing.id !== id) throw ApiError.conflict('A coupon with this code already exists');
    }
    const updated = await couponRepository.updateById(id, input);
    if (!updated) throw ApiError.notFound('Coupon not found');
    return updated;
  },

  async remove(id: string): Promise<void> {
    const coupon = await couponRepository.findById(id);
    if (!coupon) throw ApiError.notFound('Coupon not found');
    await couponRepository.deleteById(id);
  },
};
