import { Schema, model, Document, Model, Types } from 'mongoose';

export type ProductStatus = 'draft' | 'active' | 'archived';
export type StockStatus = 'out_of_stock' | 'low_stock' | 'in_stock';

export interface IProductImage {
  url: string;
  publicId: string;
}

export interface IProduct extends Document {
  name: string;
  slug: string;
  description: string;
  images: IProductImage[];
  category: Types.ObjectId;
  price: number;
  discount: number;
  stock: number;
  lowStockThreshold: number;
  sku: string;
  brand?: string;
  tags: string[];
  status: ProductStatus;
  ratings: {
    average: number;
    count: number;
  };
  createdAt: Date;
  updatedAt: Date;

  finalPrice: number;
  inStock: boolean;
  stockStatus: StockStatus;
}

export interface IProductModel extends Model<IProduct> {}

const productImageSchema = new Schema<IProductImage>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
  },
  { _id: false }
);

const productSchema = new Schema<IProduct>(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: 2,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Product description is required'],
      trim: true,
      maxlength: 5000,
    },
    images: {
      type: [productImageSchema],
      default: [],
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Product category is required'],
    },
    price: {
      type: Number,
      required: [true, 'Product price is required'],
      min: [0, 'Price cannot be negative'],
    },
    discount: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative'],
      max: [100, 'Discount cannot exceed 100%'],
    },
    stock: {
      type: Number,
      required: [true, 'Product stock is required'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      min: [0, 'Low stock threshold cannot be negative'],
      default: 5,
    },
    sku: {
      type: String,
      required: [true, 'SKU is required'],
      unique: true,
      trim: true,
      uppercase: true,
    },
    brand: {
      type: String,
      trim: true,
      default: '',
    },
    tags: {
      type: [String],
      default: [],
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'archived'],
      default: 'draft',
    },
    ratings: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0, min: 0 },
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

// Text index powers relevance-ranked search (sort=relevance): MongoDB's built-in
// textScore. The general `search` filter itself uses per-field regex (see
// product.repository.ts) instead of this index, because $text does stemmed
// whole-word matching only — it can't match SKUs or support autocomplete-style
// prefix/substring queries the way regex can. Trade-off: regex search can't use
// a B-tree index for arbitrary substrings, so at very large catalog sizes this
// should be swapped for a real search engine (MongoDB Atlas Search / Elasticsearch).
productSchema.index({ name: 'text', description: 'text', brand: 'text', tags: 'text' });
productSchema.index({ category: 1 });
productSchema.index({ status: 1 });
productSchema.index({ price: 1 });
productSchema.index({ stock: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ brand: 1 });
productSchema.index({ name: 1 });
productSchema.index({ 'ratings.average': -1 });
// Compound indexes for the public catalog, which always filters by status
// alongside one of these — a plain { status: 1 } index can't serve the
// category/sort part of the query as efficiently as these prefixes can.
productSchema.index({ status: 1, category: 1 });
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ status: 1, price: 1 });

productSchema.virtual('finalPrice').get(function (this: IProduct) {
  return Math.round(this.price * (1 - this.discount / 100) * 100) / 100;
});

productSchema.virtual('inStock').get(function (this: IProduct) {
  return this.stock > 0;
});

productSchema.virtual('stockStatus').get(function (this: IProduct): StockStatus {
  if (this.stock <= 0) return 'out_of_stock';
  if (this.stock <= this.lowStockThreshold) return 'low_stock';
  return 'in_stock';
});

export const Product = model<IProduct, IProductModel>('Product', productSchema);
