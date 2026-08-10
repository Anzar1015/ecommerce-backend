import { Schema, model, Document, Model, Types } from 'mongoose';

export type CouponType = 'PERCENTAGE' | 'FIXED_AMOUNT';

export interface ICoupon extends Document {
  code: string;
  description?: string;
  type: CouponType;
  /** Percentage points (1-100) for PERCENTAGE, or a flat INR amount for FIXED_AMOUNT. */
  value: number;
  minimumOrderAmount: number;
  /** Caps the discount for PERCENTAGE coupons; ignored for FIXED_AMOUNT. */
  maximumDiscount?: number;
  startDate: Date;
  endDate: Date;
  usageLimit?: number;
  usedCount: number;
  perUserLimit?: number;
  /** Not in the spec's field list but required to enforce the "first-order restriction" rule. */
  firstOrderOnly: boolean;
  isActive: boolean;
  applicableProducts: Types.ObjectId[];
  applicableCategories: Types.ObjectId[];
  excludedProducts: Types.ObjectId[];
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICouponModel extends Model<ICoupon> {}

const couponSchema = new Schema<ICoupon>(
  {
    code: {
      type: String,
      required: [true, 'Coupon code is required'],
      unique: true,
      trim: true,
      uppercase: true,
      minlength: 3,
      maxlength: 30,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    type: {
      type: String,
      enum: ['PERCENTAGE', 'FIXED_AMOUNT'],
      required: true,
    },
    value: {
      type: Number,
      required: [true, 'Coupon value is required'],
      min: [0, 'Value cannot be negative'],
    },
    minimumOrderAmount: {
      type: Number,
      default: 0,
      min: [0, 'Minimum order amount cannot be negative'],
    },
    maximumDiscount: {
      type: Number,
      min: [0, 'Maximum discount cannot be negative'],
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'End date is required'],
    },
    usageLimit: {
      type: Number,
      min: [1, 'Usage limit must be at least 1'],
    },
    usedCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    perUserLimit: {
      type: Number,
      min: [1, 'Per-user limit must be at least 1'],
    },
    firstOrderOnly: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    applicableProducts: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
      default: [],
    },
    applicableCategories: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Category' }],
      default: [],
    },
    excludedProducts: {
      type: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
      default: [],
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
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

couponSchema.index({ isActive: 1 });
couponSchema.index({ endDate: 1 });

export const Coupon = model<ICoupon, ICouponModel>('Coupon', couponSchema);
