import { Wishlist, IWishlist } from '../models/Wishlist.model';

const PRODUCT_POPULATE_FIELDS = 'name slug images price discount stock status ratings';

/**
 * Repository layer: the ONLY place that talks to Mongoose directly
 * for the Wishlist collection.
 */
export const wishlistRepository = {
  async findByUser(userId: string): Promise<IWishlist | null> {
    return Wishlist.findOne({ user: userId }).populate('products', PRODUCT_POPULATE_FIELDS).exec();
  },

  async getOrCreateByUser(userId: string): Promise<IWishlist> {
    const existing = await Wishlist.findOne({ user: userId }).exec();
    if (existing) return existing;
    return Wishlist.create({ user: userId, products: [] });
  },
};
