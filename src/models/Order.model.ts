import { Schema, model, Document, Model, Types } from 'mongoose';

// 'pending' is this order's "ORDER_PLACED" state (spec 13.4) — kept as the
// existing internal value rather than renamed, since it's referenced
// throughout Phase 1 order logic; the customer/admin-facing label reads
// "Order Placed" (see ORDER_STATUS_LABELS on the frontend).
export type OrderStatus =
  | 'pending'
  | 'confirmed'
  | 'packed'
  | 'shipped'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';
export type ShippingMethod = 'standard' | 'express';
// 'stripe' | 'razorpay' are schema/type-ready for when those providers are registered
// (see src/payments) — the API only accepts currently-implemented methods.
export type PaymentMethod = 'cod' | 'stripe' | 'razorpay';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded';

export interface IOrderItem {
  product: Types.ObjectId;
  name: string;
  image?: string;
  sku: string;
  price: number;
  quantity: number;
  subtotal: number;
}

export interface IShippingAddress {
  fullName: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface IOrderStatusEvent {
  status: OrderStatus;
  changedAt: Date;
  note?: string;
}

export interface IOrderPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  paidAt?: Date;
  /** Gateway transaction/charge id, set once an online provider verifies or webhooks in. */
  providerReference?: string;
}

export interface IOrderShipping {
  method: ShippingMethod;
  /** Set by admin once the order ships (spec 13.5). */
  trackingNumber?: string;
  courier?: string;
}

/** Snapshot of the coupon as applied at checkout time — not a live ref, so
 * historical orders stay accurate even if the coupon is later edited/deleted
 * (same rationale as the shippingAddress snapshot below). */
export interface IOrderCoupon {
  coupon: Types.ObjectId;
  code: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: number;
  discountAmount: number;
}

export interface IOrder extends Document {
  orderNumber: string;
  user: Types.ObjectId;
  items: IOrderItem[];
  shippingAddress: IShippingAddress;
  status: OrderStatus;
  statusHistory: IOrderStatusEvent[];
  payment: IOrderPayment;
  shipping: IOrderShipping;
  subtotal: number;
  discount: number;
  /** Always 0 today — no tax engine exists yet (placeholder field, same as
   * shippingFee was before Module 13), scaffolded here since the Module 12
   * checkout breakdown spec calls for a Tax line. */
  tax: number;
  shippingFee: number;
  total: number;
  coupon?: IOrderCoupon;
  cancelledAt?: Date;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrderModel extends Model<IOrder> {}

const ORDER_STATUSES: OrderStatus[] = [
  'pending',
  'confirmed',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
];

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    image: { type: String },
    sku: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    subtotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

// Shipping address is snapshotted at order time so historical orders stay
// accurate even if the customer later edits or deletes the saved address.
const shippingAddressSchema = new Schema<IShippingAddress>(
  {
    fullName: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    addressLine1: { type: String, required: true, trim: true },
    addressLine2: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    postalCode: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const statusEventSchema = new Schema<IOrderStatusEvent>(
  {
    status: { type: String, enum: ORDER_STATUSES, required: true },
    changedAt: { type: Date, required: true, default: Date.now },
    note: { type: String, trim: true, maxlength: 500 },
  },
  { _id: false }
);

const orderCouponSchema = new Schema<IOrderCoupon>(
  {
    coupon: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
    code: { type: String, required: true, uppercase: true },
    type: { type: String, enum: ['PERCENTAGE', 'FIXED_AMOUNT'], required: true },
    value: { type: Number, required: true, min: 0 },
    discountAmount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const orderSchema = new Schema<IOrder>(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: (items: IOrderItem[]) => items.length > 0,
        message: 'Order must contain at least one item',
      },
    },
    shippingAddress: {
      type: shippingAddressSchema,
      required: true,
    },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'pending',
    },
    statusHistory: {
      type: [statusEventSchema],
      default: [],
    },
    payment: {
      method: { type: String, enum: ['cod', 'stripe', 'razorpay'], required: true, default: 'cod' },
      status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
      paidAt: { type: Date },
      providerReference: { type: String },
    },
    shipping: {
      method: { type: String, enum: ['standard', 'express'], required: true, default: 'standard' },
      trackingNumber: { type: String, trim: true },
      courier: { type: String, trim: true },
    },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, required: true, min: 0, default: 0 },
    tax: { type: Number, required: true, min: 0, default: 0 },
    shippingFee: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    coupon: { type: orderCouponSchema, required: false },
    cancelledAt: { type: Date },
    cancelReason: { type: String, trim: true, maxlength: 500 },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1 });

export const Order = model<IOrder, IOrderModel>('Order', orderSchema);
