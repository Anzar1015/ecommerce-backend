import crypto from 'crypto';
import mongoose from 'mongoose';
import { orderRepository, AdminOrderFilters } from '../repositories/order.repository';
import { cartRepository } from '../repositories/cart.repository';
import { productRepository } from '../repositories/product.repository';
import { addressRepository } from '../repositories/address.repository';
import { cartService } from './cart.service';
import { paymentService } from './payment.service';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { buildPaginationMeta, PaginationMeta } from '../utils/pagination';
import { IOrder, IOrderItem, IShippingAddress, OrderStatus } from '../models/Order.model';
import { IProduct } from '../models/Product.model';
import type { CheckoutInput } from '../validators/order.validator';

// Forward-only lifecycle; cancellation is handled separately since it can
// happen from any pre-delivery state, not just the "current" one.
const ORDER_SEQUENCE: OrderStatus[] = ['pending', 'confirmed', 'packed', 'shipped', 'delivered'];
const CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'packed', 'shipped'];

async function generateOrderNumber(): Promise<string> {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ORD-${datePart}-${randomPart}`;
}

function snapshotAddress(address: {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}): IShippingAddress {
  return {
    fullName: address.fullName,
    phone: address.phone,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
  };
}

async function restockOrderItems(order: IOrder): Promise<void> {
  await Promise.all(order.items.map((item) => productRepository.incrementStock(item.product.toString(), item.quantity)));
}

export const orderService = {
  /**
   * Validates the cart against live stock, reserves stock, snapshots
   * product + address data onto the order, then clears the cart.
   */
  async checkout(userId: string, input: CheckoutInput): Promise<IOrder> {
    const cart = await cartRepository.getOrCreateByUser(userId);
    if (cart.items.length === 0) {
      throw ApiError.badRequest('Your cart is empty');
    }

    const address = await addressRepository.findByIdForUser(userId, input.addressId);
    if (!address) throw ApiError.notFound('Shipping address not found');

    const validatedItems: { product: IProduct; quantity: number }[] = [];
    for (const item of cart.items) {
      const product = await productRepository.findById(item.product.toString());
      if (!product || product.status !== 'active') {
        throw ApiError.badRequest('One or more items in your cart are no longer available');
      }
      if (product.stock < item.quantity) {
        throw ApiError.badRequest(`Only ${product.stock} of "${product.name}" left in stock`);
      }
      validatedItems.push({ product, quantity: item.quantity });
    }

    // Reserve stock. No multi-document transaction (would require a replica
    // set); instead we track what succeeded and compensate on failure.
    const reserved: { productId: string; quantity: number }[] = [];
    try {
      for (const { product, quantity } of validatedItems) {
        const updated = await productRepository.decrementStock(product.id, quantity);
        if (!updated) {
          throw ApiError.conflict(`"${product.name}" just sold out. Please review your cart.`);
        }
        if (updated.stock <= updated.lowStockThreshold) {
          logger.warn('Product stock low', {
            productId: updated.id,
            sku: updated.sku,
            stock: updated.stock,
            lowStockThreshold: updated.lowStockThreshold,
          });
        }
        reserved.push({ productId: product.id, quantity });
      }
    } catch (error) {
      await Promise.all(reserved.map((r) => productRepository.incrementStock(r.productId, r.quantity)));
      throw error;
    }

    const items: IOrderItem[] = validatedItems.map(({ product, quantity }) => ({
      product: product._id as mongoose.Types.ObjectId,
      name: product.name,
      image: product.images[0]?.url,
      sku: product.sku,
      price: product.finalPrice,
      quantity,
      subtotal: Math.round(product.finalPrice * quantity * 100) / 100,
    }));

    const subtotal = Math.round(items.reduce((sum, item) => sum + item.subtotal, 0) * 100) / 100;
    const shippingFee = 0;
    const total = Math.round((subtotal + shippingFee) * 100) / 100;

    const order = await orderRepository.create({
      orderNumber: await generateOrderNumber(),
      user: userId,
      items,
      shippingAddress: snapshotAddress(address),
      status: 'pending',
      statusHistory: [{ status: 'pending', changedAt: new Date() }],
      payment: { method: input.paymentMethod, status: 'pending' },
      subtotal,
      shippingFee,
      total,
    });

    // Routed through the payment abstraction rather than special-cased here, so
    // wiring up a new provider never requires touching the checkout flow.
    const paymentInit = await paymentService.initiatePayment(order);
    order.payment.status = paymentInit.status;
    order.payment.providerReference = paymentInit.providerReference;
    await order.save();

    await cartService.clear(userId);
    logger.info('Order placed', { orderId: order.id, orderNumber: order.orderNumber, userId, total });

    return order;
  },

  async getOrderHistory(
    userId: string,
    page: number,
    limit: number
  ): Promise<{ orders: IOrder[]; pagination: PaginationMeta }> {
    const [orders, total] = await Promise.all([
      orderRepository.findByUser(userId, page, limit),
      orderRepository.countByUser(userId),
    ]);
    return { orders, pagination: buildPaginationMeta(total, page, limit) };
  },

  async getOrderForUser(userId: string, orderId: string): Promise<IOrder> {
    const order = await orderRepository.findByIdForUser(userId, orderId);
    if (!order) throw ApiError.notFound('Order not found');
    return order;
  },

  async cancelOrder(userId: string, orderId: string, reason?: string): Promise<IOrder> {
    const order = await orderRepository.findByIdForUser(userId, orderId);
    if (!order) throw ApiError.notFound('Order not found');

    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      throw ApiError.badRequest(`This order can no longer be cancelled (status: ${order.status})`);
    }

    await restockOrderItems(order);

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancelReason = reason;
    order.statusHistory.push({ status: 'cancelled', changedAt: new Date(), note: reason });
    await order.save();

    logger.info('Order cancelled by customer', { orderId: order.id, userId });
    return order;
  },

  // --- Admin ---

  async listOrdersAdmin(
    filters: AdminOrderFilters,
    page: number,
    limit: number
  ): Promise<{ orders: IOrder[]; pagination: PaginationMeta }> {
    const [orders, total] = await Promise.all([
      orderRepository.findAllAdmin(filters, page, limit),
      orderRepository.countAdmin(filters),
    ]);
    return { orders, pagination: buildPaginationMeta(total, page, limit) };
  },

  async getOrderByIdAdmin(orderId: string): Promise<IOrder> {
    const order = await orderRepository.findById(orderId);
    if (!order) throw ApiError.notFound('Order not found');
    return order;
  },

  async updateStatusAdmin(orderId: string, nextStatus: OrderStatus, note?: string): Promise<IOrder> {
    const order = await orderRepository.findById(orderId);
    if (!order) throw ApiError.notFound('Order not found');

    if (nextStatus === 'cancelled') {
      if (!CANCELLABLE_STATUSES.includes(order.status)) {
        throw ApiError.badRequest(`This order can no longer be cancelled (status: ${order.status})`);
      }
      await restockOrderItems(order);
      order.cancelledAt = new Date();
      order.cancelReason = note;
    } else {
      const currentIndex = ORDER_SEQUENCE.indexOf(order.status);
      const nextIndex = ORDER_SEQUENCE.indexOf(nextStatus);
      if (currentIndex === -1 || nextIndex !== currentIndex + 1) {
        throw ApiError.badRequest(`Cannot move an order from "${order.status}" to "${nextStatus}"`);
      }
      // COD orders settle on delivery — there's no separate payment capture step yet.
      if (nextStatus === 'delivered' && order.payment.method === 'cod') {
        order.payment.status = 'paid';
        order.payment.paidAt = new Date();
      }
    }

    order.status = nextStatus;
    order.statusHistory.push({ status: nextStatus, changedAt: new Date(), note });
    await order.save();

    logger.info('Order status updated by admin', { orderId: order.id, status: nextStatus });
    return order;
  },
};
