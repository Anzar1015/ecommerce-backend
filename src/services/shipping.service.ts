import type { ShippingMethod } from '../models/Order.model';

export interface ShippingMethodOption {
  method: ShippingMethod;
  label: string;
  estimatedDelivery: string;
  baseFee: number;
}

/**
 * Configurable shipping rules, kept as data rather than scattered
 * conditionals so they're the one place to change pricing/ETAs.
 * Free-standard-shipping threshold only discounts Standard — Express stays a
 * paid premium option regardless of order size (a common, defensible
 * real-world convention; the spec's Free-shipping example doesn't say
 * otherwise, so this is a documented interpretation, not the only valid one).
 */
const SHIPPING_METHODS: Record<ShippingMethod, ShippingMethodOption> = {
  standard: { method: 'standard', label: 'Standard Delivery', estimatedDelivery: '4-6 days', baseFee: 50 },
  express: { method: 'express', label: 'Express Delivery', estimatedDelivery: '1-2 days', baseFee: 120 },
};

const FREE_STANDARD_SHIPPING_THRESHOLD = 500;

export const shippingService = {
  listMethods(): ShippingMethodOption[] {
    return Object.values(SHIPPING_METHODS);
  },

  /** Computes the shipping fee for a method given the order subtotal — the
   * single source of truth used both for the informational GET endpoint and
   * for the authoritative calculation at checkout. */
  calculateFee(method: ShippingMethod, subtotal: number): number {
    if (method === 'standard' && subtotal >= FREE_STANDARD_SHIPPING_THRESHOLD) {
      return 0;
    }
    return SHIPPING_METHODS[method].baseFee;
  },

  getFreeShippingThreshold(): number {
    return FREE_STANDARD_SHIPPING_THRESHOLD;
  },
};
