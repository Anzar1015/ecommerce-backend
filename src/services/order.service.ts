import crypto from 'crypto';
import mongoose from 'mongoose';
import { orderRepository, AdminOrderFilters } from '../repositories/order.repository';
import { cartRepository } from '../repositories/cart.repository';
import { productRepository } from '../repositories/product.repository';
import { addressRepository } from '../repositories/address.repository';
import { cartService } from './cart.service';
import { paymentService } from './payment.service';
import { couponService, CouponEligibleItem } from './coupon.service';
import { shippingService } from './shipping.service';
import { notificationService } from './notification.service';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { buildPaginationMeta, PaginationMeta } from '../utils/pagination';
import { resolveOrderUserId } from '../utils/orderUser';
import { IOrder, IOrderItem, IOrderCoupon, IShippingAddress, OrderStatus } from '../models/Order.model';
import { IProduct } from '../models/Product.model';
import { NotificationType } from '../models/Notification.model';
import type { CheckoutInput, UpdateOrderShippingInput } from '../validators/order.validator';

// Forward-only lifecycle; cancellation is handled separately since it can
// happen from any pre-delivery state, not just the "current" one.
const ORDER_SEQUENCE: OrderStatus[] = [
  'pending',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
];
const CANCELLABLE_STATUSES: OrderStatus[] = ['pending', 'confirmed', 'packed', 'shipped', 'out_for_delivery'];

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

/** Restores a unit of coupon usage on cancellation, mirroring stock restocking. */
async function releaseCouponUsageIfAny(order: IOrder): Promise<void> {
  if (order.coupon) {
    await couponService.releaseUsage(order.coupon.coupon.toString());
  }
}

// "shipped"/"out_for_delivery" are categorized as SHIPPING (spec 15.1 lists it
// as its own type, distinct from ORDER); every other lifecycle step is ORDER.
const ORDER_STATUS_NOTIFICATION_COPY: Partial<
  Record<OrderStatus, { type: NotificationType; title: string; message: (order: IOrder) => string }>
> = {
  pending: { type: 'ORDER', title: 'Order Placed', message: (o) => `Your order ${o.orderNumber} has been placed successfully.` },
  confirmed: { type: 'ORDER', title: 'Order Confirmed', message: (o) => `Your order ${o.orderNumber} has been confirmed.` },
  packed: { type: 'ORDER', title: 'Order Packed', message: (o) => `Your order ${o.orderNumber} has been packed and is ready to ship.` },
  shipped: { type: 'SHIPPING', title: 'Order Shipped', message: (o) => `Your order ${o.orderNumber} has shipped.` },
  out_for_delivery: { type: 'SHIPPING', title: 'Out for Delivery', message: (o) => `Your order ${o.orderNumber} is out for delivery.` },
  delivered: { type: 'ORDER', title: 'Order Delivered', message: (o) => `Your order ${o.orderNumber} has been delivered. Enjoy!` },
  cancelled: { type: 'ORDER', title: 'Order Cancelled', message: (o) => `Your order ${o.orderNumber} has been cancelled.` },
};

/** Best-effort: a notification failure should never fail the order operation that triggered it. */
async function notifyOrderStatus(order: IOrder, status: OrderStatus): Promise<void> {
  const copy = ORDER_STATUS_NOTIFICATION_COPY[status];
  if (!copy) return;
  try {
    await notificationService.notify(resolveOrderUserId(order), {
      type: copy.type,
      title: copy.title,
      message: copy.message(order),
      link: `/orders/${order.id}`,
    });
  } catch (error) {
    logger.warn('Failed to send order notification', {
      orderId: order.id,
      status,
      error: error instanceof Error ? error.message : error,
    });
  }
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

    const subtotal = Math.round(
      validatedItems.reduce((sum, { product, quantity }) => sum + product.finalPrice * quantity, 0) * 100
    ) / 100;
    // Always recomputed here from the method alone — never trust a client-sent fee.
    const shippingFee = shippingService.calculateFee(input.shippingMethod, subtotal);
    const tax = 0; // No tax engine yet — placeholder field (see Order.model.ts).

    // Coupon is validated and its discount computed BEFORE stock is reserved,
    // so a rejected coupon (invalid/expired/limit-reached/etc.) never leaves
    // stock decremented with nothing to compensate it — it just fails early.
    // The frontend's earlier /coupons/validate preview is never trusted as
    // the authoritative discount amount, since state (usage limits, stock,
    // cart contents) can change between preview and placing the order.
    let discount = 0;
    let couponSnapshot: IOrderCoupon | undefined;
    if (input.couponCode) {
      const eligibleItems: CouponEligibleItem[] = validatedItems.map(({ product, quantity }) => ({
        productId: product.id,
        categoryId: product.category.toString(),
        lineTotal: Math.round(product.finalPrice * quantity * 100) / 100,
      }));
      const application = await couponService.applyCoupon(userId, input.couponCode, subtotal, eligibleItems);
      discount = application.discountAmount;
      couponSnapshot = {
        coupon: application.coupon._id as mongoose.Types.ObjectId,
        code: application.coupon.code,
        type: application.coupon.type,
        value: application.coupon.value,
        discountAmount: discount,
      };
    }

    const total = Math.max(0, Math.round((subtotal - discount + shippingFee + tax) * 100) / 100);

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

    const order = await orderRepository.create({
      orderNumber: await generateOrderNumber(),
      user: userId,
      items,
      shippingAddress: snapshotAddress(address),
      status: 'pending',
      statusHistory: [{ status: 'pending', changedAt: new Date() }],
      payment: { method: input.paymentMethod, status: 'pending' },
      shipping: { method: input.shippingMethod },
      subtotal,
      discount,
      tax,
      shippingFee,
      total,
      coupon: couponSnapshot,
    });

    // Recorded only after the order is durably created, so a checkout that
    // fails earlier never consumes coupon usage. The order itself is already
    // committed at this point (with its discount applied), so a lost race on
    // the global usage counter is logged rather than failing the checkout —
    // usedCount is a best-effort anti-abuse counter, not the source of truth
    // for whether this specific order was entitled to the discount (that was
    // already re-validated above).
    if (couponSnapshot) {
      try {
        await couponService.recordUsage(couponSnapshot.coupon.toString());
      } catch (error) {
        logger.warn('Coupon usage counter could not be incremented (limit race)', {
          couponCode: couponSnapshot.code,
          orderId: order.id,
          error: error instanceof Error ? error.message : error,
        });
      }
    }

    // Routed through the payment abstraction rather than special-cased here, so
    // wiring up a new provider never requires touching the checkout flow.
    // Stock is already reserved above regardless of payment method, so an
    // initiation failure here (e.g. a Razorpay API/network error) doesn't
    // need to restock anything — the order stays in the same retryable
    // "payment failed" state that a rejected verification would leave it in
    // (see paymentService.verifyPayment), and the existing retry-payment
    // path picks it back up.
    let paymentInit;
    try {
      paymentInit = await paymentService.initiatePayment(order);
    } catch (error) {
      order.payment.status = 'failed';
      await order.save();
      logger.error('Payment initiation failed', {
        orderId: order.id,
        error: error instanceof Error ? error.message : error,
      });
      throw ApiError.internal('We could not start your payment. Please try again from your orders page.');
    }

    order.payment.status = paymentInit.status;
    order.payment.providerReference = paymentInit.providerReference;
    if (paymentInit.razorpayOrderId) order.payment.razorpayOrderId = paymentInit.razorpayOrderId;
    await order.save();

    await cartService.clear(userId);
    await notifyOrderStatus(order, 'pending');
    logger.info('Order placed', { orderId: order.id, orderNumber: order.orderNumber, userId, total });

    return order;
  },

  /**
   * Re-initiates payment for an order that's still awaiting it — the recovery
   * path for a customer who closed the Razorpay checkout modal without
   * paying, or whose payment attempt failed. Stock stays reserved from the
   * original checkout; this only asks the provider for a fresh payment
   * attempt (a new Razorpay order id) against the same Cartify order.
   */
  async retryPayment(userId: string, orderId: string): Promise<IOrder> {
    const order = await orderRepository.findByIdForUser(userId, orderId);
    if (!order) throw ApiError.notFound('Order not found');

    if (order.status === 'cancelled') {
      throw ApiError.badRequest('This order has been cancelled');
    }
    if (order.payment.status !== 'pending' && order.payment.status !== 'failed') {
      throw ApiError.badRequest(`This order's payment is already "${order.payment.status}"`);
    }

    const paymentInit = await paymentService.initiatePayment(order);
    order.payment.status = paymentInit.status;
    order.payment.providerReference = paymentInit.providerReference;
    if (paymentInit.razorpayOrderId) order.payment.razorpayOrderId = paymentInit.razorpayOrderId;
    // Clear any signature from a prior failed attempt — it belongs to the old razorpay order id, not this one.
    order.payment.razorpaySignature = undefined;
    await order.save();

    logger.info('Payment retried', { orderId: order.id, userId });
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
    await releaseCouponUsageIfAny(order);

    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancelReason = reason;
    order.statusHistory.push({ status: 'cancelled', changedAt: new Date(), note: reason });
    await order.save();
    await notifyOrderStatus(order, 'cancelled');

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
      await releaseCouponUsageIfAny(order);
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
    await notifyOrderStatus(order, nextStatus);

    logger.info('Order status updated by admin', { orderId: order.id, status: nextStatus });
    return order;
  },

  /** Sets tracking number / courier independently of a status change —
   * admins may add tracking before or after marking an order shipped. */
  async updateShippingDetailsAdmin(orderId: string, input: UpdateOrderShippingInput): Promise<IOrder> {
    const order = await orderRepository.findById(orderId);
    if (!order) throw ApiError.notFound('Order not found');

    if (input.trackingNumber !== undefined) order.shipping.trackingNumber = input.trackingNumber;
    if (input.courier !== undefined) order.shipping.courier = input.courier;
    await order.save();

    logger.info('Order shipping details updated by admin', { orderId: order.id });
    return order;
  },
};
