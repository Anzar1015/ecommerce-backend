import { Schema, model, Document, Model, Types } from 'mongoose';

export type ReviewStatus = 'pending' | 'approved' | 'rejected' | 'hidden';

export interface IReviewImage {
  url: string;
  publicId: string;
}

export interface IReview extends Document {
  user: Types.ObjectId;
  product: Types.ObjectId;
  /** The delivered order that proved eligibility to review — a snapshot
   * reference, kept for audit/support purposes. */
  order: Types.ObjectId;
  rating: number;
  title: string;
  comment: string;
  images: IReviewImage[];
  isVerifiedPurchase: boolean;
  status: ReviewStatus;
  helpfulVotes: Types.ObjectId[];
  helpfulCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReviewModel extends Model<IReview> {}

const reviewImageSchema = new Schema<IReviewImage>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false }
);

const reviewSchema = new Schema<IReview>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    rating: {
      type: Number,
      required: [true, 'Rating is required'],
      min: [1, 'Rating must be between 1 and 5'],
      max: [5, 'Rating must be between 1 and 5'],
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be a whole number',
      },
    },
    title: {
      type: String,
      required: [true, 'Review title is required'],
      trim: true,
      minlength: 3,
      maxlength: 150,
    },
    comment: {
      type: String,
      required: [true, 'Review comment is required'],
      trim: true,
      minlength: 10,
      maxlength: 2000,
    },
    images: {
      type: [reviewImageSchema],
      default: [],
    },
    isVerifiedPurchase: {
      type: Boolean,
      default: true, // reviews can only be created after eligibility is verified — see review.service.ts
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'hidden'],
      default: 'pending',
    },
    helpfulVotes: {
      type: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },
    helpfulCount: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        delete ret.helpfulVotes; // internal dedupe list — clients get `helpfulCount` + `hasVoted` instead (added per-request)
        return ret;
      },
    },
  }
);

// One review per user per product (spec 14.2 "Prevent duplicate reviews").
reviewSchema.index({ user: 1, product: 1 }, { unique: true });
// Public listing: approved reviews for a product, newest first.
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
reviewSchema.index({ product: 1, status: 1, rating: 1 });
reviewSchema.index({ status: 1 });

export const Review = model<IReview, IReviewModel>('Review', reviewSchema);
