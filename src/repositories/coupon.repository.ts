import mongoose, { FilterQuery } from 'mongoose';
import { Coupon, ICoupon } from '../models/Coupon.model';

export interface CouponFilters {
  search?: string;
  isActive?: boolean;
}

function buildQuery(filters: CouponFilters): FilterQuery<ICoupon> {
  const query: FilterQuery<ICoupon> = {};
  if (filters.isActive !== undefined) query.isActive = filters.isActive;
  if (filters.search) query.code = new RegExp(filters.search.trim(), 'i');
  return query;
}

/**
 * Repository layer: the ONLY place that talks to Mongoose directly
 * for the Coupon collection.
 */
export const couponRepository = {
  async create(data: mongoose.AnyKeys<ICoupon>): Promise<ICoupon> {
    return Coupon.create(data);
  },

  async findById(id: string): Promise<ICoupon | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    return Coupon.findById(id).exec();
  },

  async findByCode(code: string): Promise<ICoupon | null> {
    return Coupon.findOne({ code: code.trim().toUpperCase() }).exec();
  },

  async findAll(filters: CouponFilters, page: number, limit: number): Promise<ICoupon[]> {
    const query = buildQuery(filters);
    return Coupon.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  },

  async count(filters: CouponFilters): Promise<number> {
    const query = buildQuery(filters);
    return Coupon.countDocuments(query).exec();
  },

  async updateById(id: string, data: mongoose.UpdateQuery<ICoupon>): Promise<ICoupon | null> {
    return Coupon.findByIdAndUpdate(id, data, { new: true, runValidators: true }).exec();
  },

  async deleteById(id: string): Promise<void> {
    await Coupon.findByIdAndDelete(id);
  },

  /** Atomically increments the global usage counter; fails (returns null) if
   * doing so would exceed usageLimit (guards a race with concurrent checkouts). */
  async incrementUsedCount(id: string): Promise<ICoupon | null> {
    return Coupon.findOneAndUpdate(
      {
        _id: id,
        $or: [{ usageLimit: { $exists: false } }, { $expr: { $lt: ['$usedCount', '$usageLimit'] } }],
      },
      { $inc: { usedCount: 1 } },
      { new: true }
    ).exec();
  },

  /** Restores a unit of usage on order cancellation, mirroring stock restocking. */
  async decrementUsedCount(id: string): Promise<void> {
    await Coupon.findOneAndUpdate({ _id: id, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }).exec();
  },
};
