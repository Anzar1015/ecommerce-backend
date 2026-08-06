import mongoose from 'mongoose';
import { wishlistRepository } from '../repositories/wishlist.repository';
import { productRepository } from '../repositories/product.repository';
import { cartService, CartResult } from './cart.service';
import { ApiError } from '../utils/ApiError';
import { IWishlist } from '../models/Wishlist.model';

async function loadPopulated(userId: string): Promise<IWishlist> {
  const wishlist = await wishlistRepository.findByUser(userId);
  if (!wishlist) throw ApiError.notFound('Wishlist not found');
  return wishlist;
}

export const wishlistService = {
  async getWishlist(userId: string): Promise<IWishlist> {
    await wishlistRepository.getOrCreateByUser(userId);
    return loadPopulated(userId);
  },

  async addProduct(userId: string, productId: string): Promise<IWishlist> {
    const product = await productRepository.findById(productId);
    if (!product) throw ApiError.notFound('Product not found');

    const wishlist = await wishlistRepository.getOrCreateByUser(userId);
    const alreadyExists = wishlist.products.some((id) => id.toString() === productId);

    if (!alreadyExists) {
      wishlist.products.push(new mongoose.Types.ObjectId(productId));
      await wishlist.save();
    }

    return loadPopulated(userId);
  },

  async removeProduct(userId: string, productId: string): Promise<IWishlist> {
    const wishlist = await wishlistRepository.getOrCreateByUser(userId);
    wishlist.products = wishlist.products.filter((id) => id.toString() !== productId);
    await wishlist.save();
    return loadPopulated(userId);
  },

  async moveToCart(userId: string, productId: string, quantity: number): Promise<CartResult> {
    const wishlist = await wishlistRepository.getOrCreateByUser(userId);
    const exists = wishlist.products.some((id) => id.toString() === productId);
    if (!exists) throw ApiError.notFound('Product not found in wishlist');

    const result = await cartService.addItem(userId, { productId, quantity });

    wishlist.products = wishlist.products.filter((id) => id.toString() !== productId);
    await wishlist.save();

    return result;
  },
};
