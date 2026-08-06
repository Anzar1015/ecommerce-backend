import { Schema, model, Document, Model } from 'mongoose';

export interface ICategoryImage {
  url: string;
  publicId: string;
}

export interface ICategory extends Document {
  name: string;
  slug: string;
  description?: string;
  image?: ICategoryImage;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ICategoryModel extends Model<ICategory> {}

const categoryImageSchema = new Schema<ICategoryImage>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false }
);

const categorySchema = new Schema<ICategory>(
  {
    name: {
      type: String,
      required: [true, 'Category name is required'],
      trim: true,
      unique: true,
      minlength: 2,
      maxlength: 100,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    image: {
      type: categoryImageSchema,
      required: false,
    },
    isActive: {
      type: Boolean,
      default: true,
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

categorySchema.index({ isActive: 1 });

export const Category = model<ICategory, ICategoryModel>('Category', categorySchema);
