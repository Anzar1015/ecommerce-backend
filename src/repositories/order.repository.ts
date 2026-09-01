import mongoose, { FilterQuery } from 'mongoose';
import { Order, IOrder, OrderStatus } from '../models/Order.model';

export interface AdminOrderFilters {
  status?: OrderStatus;
  search?: string;
}

export type OrderStatusCounts = Record<OrderStatus, number>;

export interface RevenueSummary {
  totalRevenue: number;
  todayRevenue: number;
  monthRevenue: number;
  paidOrderCount: number;
}

function buildAdminQuery(filters: AdminOrderFilters): FilterQuery<IOrder> {
  const query: FilterQuery<IOrder> = {};
  if (filters.status) query.status = filters.status;
  if (filters.search) query.orderNumber = new RegExp(filters.search.trim(), 'i');
  return query;
}

/**
 * Repository layer: the ONLY place that talks to Mongoose directly
 * for the Order collection.
 */
export const orderRepository = {
  async create(data: mongoose.AnyKeys<IOrder>): Promise<IOrder> {
    return Order.create(data);
  },

  async findByUser(userId: string, page: number, limit: number): Promise<IOrder[]> {
    return Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  },

  async countByUser(userId: string): Promise<number> {
    return Order.countDocuments({ user: userId }).exec();
  },

  /** Counts a user's non-cancelled orders that redeemed a given coupon code — the
   * primitive behind per-user coupon usage limits. */
  async countByUserAndCouponCode(userId: string, code: string): Promise<number> {
    return Order.countDocuments({
      user: userId,
      'coupon.code': code.toUpperCase(),
      status: { $ne: 'cancelled' },
    }).exec();
  },

  /** The primitive behind review eligibility (spec 14.2 "verified purchaser"):
   * a delivered order, placed by this user, containing this product. */
  async findDeliveredOrderForUserAndProduct(userId: string, productId: string): Promise<IOrder | null> {
    return Order.findOne({ user: userId, status: 'delivered', 'items.product': productId })
      .sort({ createdAt: -1 })
      .exec();
  },

  async findByIdForUser(userId: string, orderId: string): Promise<IOrder | null> {
    if (!mongoose.isValidObjectId(orderId)) return null;
    return Order.findOne({ _id: orderId, user: userId }).exec();
  },

  async findById(orderId: string): Promise<IOrder | null> {
    if (!mongoose.isValidObjectId(orderId)) return null;
    return Order.findById(orderId).populate('user', 'name email').exec();
  },

  async findByProviderReference(providerReference: string): Promise<IOrder | null> {
    return Order.findOne({ 'payment.providerReference': providerReference }).exec();
  },

  async findAllAdmin(filters: AdminOrderFilters, page: number, limit: number): Promise<IOrder[]> {
    const query = buildAdminQuery(filters);
    return Order.find(query)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  },

  async countAdmin(filters: AdminOrderFilters): Promise<number> {
    const query = buildAdminQuery(filters);
    return Order.countDocuments(query).exec();
  },

  async findRecent(limit: number): Promise<IOrder[]> {
    return Order.find().populate('user', 'name email').sort({ createdAt: -1 }).limit(limit).exec();
  },

  /** Counts every order status, defaulting missing statuses to 0 (not just the ones present in the collection). */
  async countByStatusAll(): Promise<OrderStatusCounts> {
    const rows = await Order.aggregate<{ _id: OrderStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec();

    const counts = rows.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {} as Partial<OrderStatusCounts>);

    return {
      pending: counts.pending ?? 0,
      confirmed: counts.confirmed ?? 0,
      packed: counts.packed ?? 0,
      shipped: counts.shipped ?? 0,
      out_for_delivery: counts.out_for_delivery ?? 0,
      delivered: counts.delivered ?? 0,
      cancelled: counts.cancelled ?? 0,
    };
  },

  /** Revenue is recognized when payment is marked `paid` (see order/payment services), not at order placement. */
  async getRevenueSummary(startOfToday: Date, startOfMonth: Date): Promise<RevenueSummary> {
    const [result] = await Order.aggregate<{
      totalRevenue: number;
      paidOrderCount: number;
      todayRevenue: number;
      monthRevenue: number;
    }>([
      { $match: { 'payment.status': 'paid' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
          paidOrderCount: { $sum: 1 },
          todayRevenue: { $sum: { $cond: [{ $gte: ['$payment.paidAt', startOfToday] }, '$total', 0] } },
          monthRevenue: { $sum: { $cond: [{ $gte: ['$payment.paidAt', startOfMonth] }, '$total', 0] } },
        },
      },
    ]).exec();

    return {
      totalRevenue: result?.totalRevenue ?? 0,
      paidOrderCount: result?.paidOrderCount ?? 0,
      todayRevenue: result?.todayRevenue ?? 0,
      monthRevenue: result?.monthRevenue ?? 0,
    };
  },
};
