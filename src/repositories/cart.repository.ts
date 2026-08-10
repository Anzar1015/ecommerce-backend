import { Cart, ICart } from '../models/Cart.model';

// `category` is included so coupon eligibility (applicableCategories) can be
// evaluated against the cart without a second query.
const PRODUCT_POPULATE_FIELDS = 'name slug images price discount stock status category';

/**
 * Repository layer: the ONLY place that talks to Mongoose directly
 * for the Cart collection.
 */
export const cartRepository = {
  async findByUser(userId: string): Promise<ICart | null> {
    return Cart.findOne({ user: userId }).populate('items.product', PRODUCT_POPULATE_FIELDS).exec();
  },

  async getOrCreateByUser(userId: string): Promise<ICart> {
    const existing = await Cart.findOne({ user: userId }).exec();
    if (existing) return existing;
    return Cart.create({ user: userId, items: [] });
  },
};
