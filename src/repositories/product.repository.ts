import mongoose, { FilterQuery } from 'mongoose';
import { Product, IProduct, ProductStatus, StockStatus } from '../models/Product.model';
import { Category } from '../models/Category.model';
import { escapeRegex } from '../utils/regex';

export type ProductSortOption =
  | 'relevance'
  | 'newest'
  | 'oldest'
  | 'price_asc'
  | 'price_desc'
  | 'name_asc'
  | 'name_desc'
  | 'rating'
  | 'popularity';

export interface ProductFilters {
  category?: string;
  /** More specific than `category`; when both are given, subcategory wins.
   * Phase 1 has no category hierarchy (Category is a flat collection), so this
   * resolves against the same collection as `category` — it's accepted and
   * plumbed end-to-end for forward compatibility, but there is no distinct
   * "subcategory" entity yet. */
  subcategory?: string;
  brand?: string;
  tag?: string;
  tags?: string[];
  search?: string;
  minPrice?: number;
  maxPrice?: number;
  rating?: number;
  inStock?: boolean;
  minDiscount?: number;
  status?: ProductStatus;
  sort: ProductSortOption;
}

export interface ProductSuggestion {
  id: string;
  name: string;
  slug: string;
  image?: string;
  price: number;
}

export interface InventoryFilters {
  search?: string;
  category?: string;
  stockStatus?: StockStatus;
  sort: 'stock_asc' | 'stock_desc' | 'name_asc' | 'name_desc';
}

export interface InventorySummary {
  totalProducts: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  totalStockUnits: number;
}

export interface ProductStatusCounts {
  total: number;
  active: number;
  draft: number;
  archived: number;
}

// `relevance` isn't looked up here — it's only meaningful together with an
// active search term and is computed via aggregation in findAllByRelevance().
const sortMap: Record<Exclude<ProductSortOption, 'relevance'>, Record<string, 1 | -1>> = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  name_asc: { name: 1 },
  name_desc: { name: -1 },
  rating: { 'ratings.average': -1 },
  // No real purchase/view analytics exist yet in Phase 1/2, so popularity is
  // approximated by review count (a reasonable proxy: more reviews generally
  // correlates with more sales). Swap this for a real sales/view counter once
  // that data exists.
  popularity: { 'ratings.count': -1, 'ratings.average': -1 },
};

const inventorySortMap: Record<InventoryFilters['sort'], Record<string, 1 | -1>> = {
  stock_asc: { stock: 1 },
  stock_desc: { stock: -1 },
  name_asc: { name: 1 },
  name_desc: { name: -1 },
};

// Threshold is per-document, so the comparison has to be expressed with $expr
// rather than a plain field filter.
const stockStatusExpr: Record<StockStatus, Record<string, unknown>> = {
  out_of_stock: { stock: { $lte: 0 } },
  low_stock: {
    $expr: { $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] },
  },
  in_stock: { $expr: { $gt: ['$stock', '$lowStockThreshold'] } },
};

async function resolveCategoryFilter(category?: string): Promise<mongoose.Types.ObjectId | string | undefined> {
  if (!category) return undefined;
  if (mongoose.isValidObjectId(category)) return category;
  const doc = await Category.findOne({ slug: category }).select('_id').exec();
  return doc ? doc._id : undefined;
}

async function buildFilterQuery(filters: ProductFilters): Promise<FilterQuery<IProduct>> {
  const query: FilterQuery<IProduct> = {};

  if (filters.status) query.status = filters.status;

  const categoryTarget = filters.subcategory ?? filters.category;
  if (categoryTarget) {
    const categoryId = await resolveCategoryFilter(categoryTarget);
    // If the category couldn't be resolved, force zero results rather than an unfiltered list.
    query.category = categoryId ?? new mongoose.Types.ObjectId();
  }

  if (filters.brand) query.brand = new RegExp(`^${escapeRegex(filters.brand)}$`, 'i');

  if (filters.tags?.length) {
    query.tags = { $in: filters.tags };
  } else if (filters.tag) {
    query.tags = filters.tag;
  }

  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    query.price = {};
    if (filters.minPrice !== undefined) query.price.$gte = filters.minPrice;
    if (filters.maxPrice !== undefined) query.price.$lte = filters.maxPrice;
  }

  if (filters.rating !== undefined) {
    query['ratings.average'] = { $gte: filters.rating };
  }

  if (filters.inStock !== undefined) {
    query.stock = filters.inStock ? { $gt: 0 } : { $lte: 0 };
  }

  if (filters.minDiscount !== undefined) {
    query.discount = { $gte: filters.minDiscount };
  }

  if (filters.search) {
    // Regex OR across fields rather than $text: this is the one place SKU
    // search and substring/prefix matching (needed for autocomplete-style
    // "contains" search) both have to work together, and $text can't do
    // either (it's stemmed whole-word matching and SKU isn't in the text
    // index). See the index comment in Product.model.ts for the trade-off.
    const regex = new RegExp(escapeRegex(filters.search.trim()), 'i');
    query.$or = [
      { name: regex },
      { description: regex },
      { sku: regex },
      { brand: regex },
      { tags: regex },
    ];
  }

  return query;
}

function relevanceScoreStage(term: string): Record<string, unknown> {
  const escaped = escapeRegex(term.trim());
  return {
    $addFields: {
      _relevanceScore: {
        $sum: [
          { $cond: [{ $regexMatch: { input: '$name', regex: `^${escaped}`, options: 'i' } }, 5, 0] },
          { $cond: [{ $regexMatch: { input: '$name', regex: escaped, options: 'i' } }, 3, 0] },
          {
            $cond: [
              { $regexMatch: { input: { $ifNull: ['$brand', ''] }, regex: escaped, options: 'i' } },
              2,
              0,
            ],
          },
          { $cond: [{ $regexMatch: { input: '$sku', regex: escaped, options: 'i' } }, 2, 0] },
          {
            $cond: [
              {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: '$tags',
                        as: 'tg',
                        cond: { $regexMatch: { input: '$$tg', regex: escaped, options: 'i' } },
                      },
                    },
                  },
                  0,
                ],
              },
              2,
              0,
            ],
          },
          { $cond: [{ $regexMatch: { input: '$description', regex: escaped, options: 'i' } }, 1, 0] },
        ],
      },
    },
  };
}

// Aggregation bypasses Mongoose virtuals/populate, so this mirrors the
// finalPrice/inStock/stockStatus virtuals defined on Product.model.ts and the
// category population shape — keep both in sync if those change.
const virtualFieldsStage = {
  $addFields: {
    id: { $toString: '$_id' },
    finalPrice: {
      $round: [{ $multiply: ['$price', { $subtract: [1, { $divide: ['$discount', 100] }] }] }, 2],
    },
    inStock: { $gt: ['$stock', 0] },
    stockStatus: {
      $switch: {
        branches: [
          { case: { $lte: ['$stock', 0] }, then: 'out_of_stock' },
          { case: { $lte: ['$stock', '$lowStockThreshold'] }, then: 'low_stock' },
        ],
        default: 'in_stock',
      },
    },
  },
};

const categoryLookupStages = [
  { $lookup: { from: 'categories', localField: 'category', foreignField: '_id', as: 'category' } },
  { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
  {
    $addFields: {
      category: {
        $cond: [
          { $ifNull: ['$category._id', false] },
          { _id: '$category._id', name: '$category.name', slug: '$category.slug' },
          '$category',
        ],
      },
    },
  },
];

async function buildInventoryQuery(filters: InventoryFilters): Promise<FilterQuery<IProduct>> {
  const query: FilterQuery<IProduct> = {};

  const categoryId = await resolveCategoryFilter(filters.category);
  if (filters.category) {
    query.category = categoryId ?? new mongoose.Types.ObjectId();
  }

  if (filters.search) {
    query.$or = [
      { name: new RegExp(filters.search.trim(), 'i') },
      { sku: new RegExp(filters.search.trim(), 'i') },
    ];
  }

  if (filters.stockStatus) {
    Object.assign(query, stockStatusExpr[filters.stockStatus]);
  }

  return query;
}

/**
 * Repository layer: the ONLY place that talks to Mongoose directly
 * for the Product collection.
 */
export const productRepository = {
  async findAll(filters: ProductFilters, page: number, limit: number): Promise<IProduct[]> {
    if (filters.sort === 'relevance' && filters.search) {
      return productRepository.findAllByRelevance(filters, page, limit);
    }

    const query = await buildFilterQuery(filters);
    const sort = filters.sort === 'relevance' ? sortMap.newest : sortMap[filters.sort];
    return Product.find(query)
      .populate('category', 'name slug')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  },

  /** Relevance-ranked search: same filter/match criteria as findAll, but
   * ordered by a computed text-match score instead of a plain field sort.
   * Runs as an aggregation because Mongoose's find()/sort() can't express
   * the weighted, multi-field scoring below. */
  async findAllByRelevance(filters: ProductFilters, page: number, limit: number): Promise<IProduct[]> {
    const query = await buildFilterQuery(filters);
    const pipeline: mongoose.PipelineStage[] = [
      { $match: query },
      relevanceScoreStage(filters.search as string) as unknown as mongoose.PipelineStage,
      virtualFieldsStage as unknown as mongoose.PipelineStage,
      ...(categoryLookupStages as unknown as mongoose.PipelineStage[]),
      { $sort: { _relevanceScore: -1, createdAt: -1 } },
      { $skip: (page - 1) * limit },
      { $limit: limit },
      { $project: { _relevanceScore: 0, __v: 0 } },
    ];
    const docs = await Product.aggregate(pipeline).exec();
    return docs as unknown as IProduct[];
  },

  async count(filters: ProductFilters): Promise<number> {
    const query = await buildFilterQuery(filters);
    return Product.countDocuments(query).exec();
  },

  /** Lightweight autocomplete: prefix match on name (uses the `name` index),
   * falling back to a substring match on SKU/brand so codes and brand names
   * still surface suggestions. */
  async suggest(term: string, limit: number): Promise<ProductSuggestion[]> {
    const trimmed = term.trim();
    if (!trimmed) return [];
    const escaped = escapeRegex(trimmed);
    const prefixRegex = new RegExp(`^${escaped}`, 'i');
    const containsRegex = new RegExp(escaped, 'i');

    const docs = await Product.find({
      status: 'active',
      $or: [{ name: prefixRegex }, { sku: containsRegex }, { brand: containsRegex }],
    })
      .select('name slug images price')
      .sort({ name: 1 })
      .limit(limit)
      .lean()
      .exec();

    return docs.map((doc) => ({
      id: String(doc._id),
      name: doc.name,
      slug: doc.slug,
      image: doc.images?.[0]?.url,
      price: doc.price,
    }));
  },

  async findById(id: string): Promise<IProduct | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    return Product.findById(id).populate('category', 'name slug').exec();
  },

  async findBySlug(slug: string): Promise<IProduct | null> {
    return Product.findOne({ slug }).exec();
  },

  async findByIdOrSlug(identifier: string): Promise<IProduct | null> {
    if (mongoose.isValidObjectId(identifier)) {
      return Product.findById(identifier).populate('category', 'name slug').exec();
    }
    return Product.findOne({ slug: identifier }).populate('category', 'name slug').exec();
  },

  async countByCategory(categoryId: string): Promise<number> {
    return Product.countDocuments({ category: categoryId }).exec();
  },

  async create(data: mongoose.AnyKeys<IProduct>): Promise<IProduct> {
    return Product.create(data);
  },

  async updateById(id: string, data: mongoose.UpdateQuery<IProduct>): Promise<IProduct | null> {
    return Product.findByIdAndUpdate(id, data, { new: true, runValidators: true })
      .populate('category', 'name slug')
      .exec();
  },

  async deleteById(id: string): Promise<void> {
    await Product.findByIdAndDelete(id);
  },

  /** Atomically reserves stock at order placement; fails (returns null) if
   * concurrent orders already dropped stock below the requested quantity. */
  async decrementStock(id: string, quantity: number): Promise<IProduct | null> {
    return Product.findOneAndUpdate(
      { _id: id, stock: { $gte: quantity } },
      { $inc: { stock: -quantity } },
      { new: true }
    ).exec();
  },

  /** Restores stock on order cancellation. */
  async incrementStock(id: string, quantity: number): Promise<IProduct | null> {
    return Product.findByIdAndUpdate(id, { $inc: { stock: quantity } }, { new: true }).exec();
  },

  async findInventory(filters: InventoryFilters, page: number, limit: number): Promise<IProduct[]> {
    const query = await buildInventoryQuery(filters);
    return Product.find(query)
      .populate('category', 'name slug')
      .sort(inventorySortMap[filters.sort])
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  },

  async countInventory(filters: InventoryFilters): Promise<number> {
    const query = await buildInventoryQuery(filters);
    return Product.countDocuments(query).exec();
  },

  async getInventorySummary(): Promise<InventorySummary> {
    const [result] = await Product.aggregate<{
      totalProducts: number;
      outOfStock: number;
      lowStock: number;
      totalStockUnits: number;
    }>([
      {
        $group: {
          _id: null,
          totalProducts: { $sum: 1 },
          outOfStock: { $sum: { $cond: [{ $lte: ['$stock', 0] }, 1, 0] } },
          lowStock: {
            $sum: {
              $cond: [{ $and: [{ $gt: ['$stock', 0] }, { $lte: ['$stock', '$lowStockThreshold'] }] }, 1, 0],
            },
          },
          totalStockUnits: { $sum: '$stock' },
        },
      },
    ]).exec();

    const totalProducts = result?.totalProducts ?? 0;
    const outOfStock = result?.outOfStock ?? 0;
    const lowStock = result?.lowStock ?? 0;

    return {
      totalProducts,
      outOfStock,
      lowStock,
      inStock: totalProducts - outOfStock - lowStock,
      totalStockUnits: result?.totalStockUnits ?? 0,
    };
  },

  async getStatusSummary(): Promise<ProductStatusCounts> {
    const rows = await Product.aggregate<{ _id: ProductStatus; count: number }>([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]).exec();

    const counts = rows.reduce((acc, row) => ({ ...acc, [row._id]: row.count }), {} as Partial<Record<ProductStatus, number>>);
    const active = counts.active ?? 0;
    const draft = counts.draft ?? 0;
    const archived = counts.archived ?? 0;

    return { total: active + draft + archived, active, draft, archived };
  },

  /** Atomically applies a signed delta to stock; fails (returns null) if it would go negative. */
  async adjustStock(id: string, delta: number): Promise<IProduct | null> {
    return Product.findOneAndUpdate(
      { _id: id, stock: { $gte: -delta } },
      { $inc: { stock: delta } },
      { new: true }
    )
      .populate('category', 'name slug')
      .exec();
  },
};
