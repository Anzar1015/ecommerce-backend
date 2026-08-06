import mongoose from 'mongoose';
import { cartRepository } from '../repositories/cart.repository';
import { productRepository } from '../repositories/product.repository';
import { ApiError } from '../utils/ApiError';
import { ICart } from '../models/Cart.model';
import { IProduct } from '../models/Product.model';

export interface CartItemInput {
  productId: string;
  quantity: number;
}

export interface CartSummary {
  totalItems: number;
  totalQuantity: number;
  subtotal: number;
}

export interface CartResult {
  cart: ICart;
  summary: CartSummary;
}

function summarize(cart: ICart): CartSummary {
  let totalQuantity = 0;
  let subtotal = 0;

  for (const item of cart.items) {
    totalQuantity += item.quantity;
    const product = item.product as unknown as IProduct | null;
    if (product && typeof product === 'object' && 'price' in product) {
      const finalPrice = product.price * (1 - product.discount / 100);
      subtotal += finalPrice * item.quantity;
    }
  }

  return {
    totalItems: cart.items.length,
    totalQuantity,
    subtotal: Math.round(subtotal * 100) / 100,
  };
}

/**
 * Validates that `quantity` more of a product can be added on top of
 * `existingQuantity` already in the cart, without exceeding live stock.
 */
async function assertQuantityAvailable(
  productId: string,
  quantity: number,
  existingQuantity: number
): Promise<void> {
  const product = await productRepository.findById(productId);
  if (!product || product.status !== 'active') {
    throw ApiError.notFound('Product not found');
  }

  const totalRequested = existingQuantity + quantity;
  if (product.stock < totalRequested) {
    throw ApiError.badRequest(
      product.stock === 0 ? 'This product is out of stock' : `Only ${product.stock} left in stock`
    );
  }
}

async function loadPopulatedResult(userId: string): Promise<CartResult> {
  const cart = await cartRepository.findByUser(userId);
  if (!cart) throw ApiError.notFound('Cart not found');
  return { cart, summary: summarize(cart) };
}

export const cartService = {
  async getCart(userId: string): Promise<CartResult> {
    await cartRepository.getOrCreateByUser(userId);
    return loadPopulatedResult(userId);
  },

  async addItem(userId: string, input: CartItemInput): Promise<CartResult> {
    const cart = await cartRepository.getOrCreateByUser(userId);
    const existingItem = cart.items.find((item) => item.product.toString() === input.productId);

    await assertQuantityAvailable(input.productId, input.quantity, existingItem?.quantity ?? 0);

    if (existingItem) {
      existingItem.quantity += input.quantity;
    } else {
      cart.items.push({
        product: new mongoose.Types.ObjectId(input.productId),
        quantity: input.quantity,
      });
    }

    await cart.save();
    return loadPopulatedResult(userId);
  },

  async updateItemQuantity(userId: string, productId: string, quantity: number): Promise<CartResult> {
    const cart = await cartRepository.getOrCreateByUser(userId);
    const item = cart.items.find((i) => i.product.toString() === productId);
    if (!item) throw ApiError.notFound('Item not found in cart');

    if (quantity <= 0) {
      cart.items = cart.items.filter((i) => i.product.toString() !== productId);
    } else {
      await assertQuantityAvailable(productId, 0, quantity);
      item.quantity = quantity;
    }

    await cart.save();
    return loadPopulatedResult(userId);
  },

  async removeItem(userId: string, productId: string): Promise<CartResult> {
    const cart = await cartRepository.getOrCreateByUser(userId);
    cart.items = cart.items.filter((i) => i.product.toString() !== productId);
    await cart.save();
    return loadPopulatedResult(userId);
  },

  /**
   * Merges a guest cart (from client-side storage) into the user's
   * persisted cart on login. Unavailable/out-of-stock items are skipped
   * silently rather than failing the whole merge.
   */
  async mergeGuestCart(userId: string, guestItems: CartItemInput[]): Promise<CartResult> {
    const cart = await cartRepository.getOrCreateByUser(userId);

    for (const guestItem of guestItems) {
      if (guestItem.quantity <= 0) continue;

      const product = await productRepository.findById(guestItem.productId);
      if (!product || product.status !== 'active' || product.stock === 0) continue;

      const existingItem = cart.items.find((i) => i.product.toString() === guestItem.productId);
      const cappedQuantity = Math.min((existingItem?.quantity ?? 0) + guestItem.quantity, product.stock);

      if (existingItem) {
        existingItem.quantity = cappedQuantity;
      } else {
        cart.items.push({
          product: new mongoose.Types.ObjectId(guestItem.productId),
          quantity: cappedQuantity,
        });
      }
    }

    await cart.save();
    return loadPopulatedResult(userId);
  },

  /** Empties the cart — called by the Order module right after checkout succeeds. */
  async clear(userId: string): Promise<void> {
    const cart = await cartRepository.getOrCreateByUser(userId);
    cart.items = [];
    await cart.save();
  },
};
