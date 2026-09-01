import mongoose, { FilterQuery } from 'mongoose';
import { Review, IReview, ReviewStatus } from '../models/Review.model';

export interface ProductReviewFilters {
  product: string;
  status: ReviewStatus;
  rating?: number;
}

export interface AdminReviewFilters {
  status?: ReviewStatus;
  product?: string;
}

export type ProductReviewSort = 'recent' | 'highest' | 'lowest' | 'helpful';

export interface RatingSummary {
  average: number;
  count: number;
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

const sortMap: Record<ProductReviewSort, Record<string, 1 | -1>> = {
  recent: { createdAt: -1 },
  highest: { rating: -1, createdAt: -1 },
  lowest: { rating: 1, createdAt: -1 },
  helpful: { helpfulCount: -1, createdAt: -1 },
};

function buildProductQuery(filters: ProductReviewFilters): FilterQuery<IReview> {
  const query: FilterQuery<IReview> = { product: filters.product, status: filters.status };
  if (filters.rating !== undefined) query.rating = filters.rating;
  return query;
}

function buildAdminQuery(filters: AdminReviewFilters): FilterQuery<IReview> {
  const query: FilterQuery<IReview> = {};
  if (filters.status) query.status = filters.status;
  if (filters.product) query.product = filters.product;
  return query;
}

/**
 * Repository layer: the ONLY place that talks to Mongoose directly
 * for the Review collection.
 */
export const reviewRepository = {
  async create(data: mongoose.AnyKeys<IReview>): Promise<IReview> {
    return Review.create(data);
  },

  async findById(id: string): Promise<IReview | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    return Review.findById(id).exec();
  },

  async findByUserAndProduct(userId: string, productId: string): Promise<IReview | null> {
    return Review.findOne({ user: userId, product: productId }).exec();
  },

  async findByProduct(
    filters: ProductReviewFilters,
    sort: ProductReviewSort,
    page: number,
    limit: number
  ): Promise<IReview[]> {
    const query = buildProductQuery(filters);
    return Review.find(query)
      .populate('user', 'name')
      .sort(sortMap[sort])
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  },

  async countByProduct(filters: ProductReviewFilters): Promise<number> {
    const query = buildProductQuery(filters);
    return Review.countDocuments(query).exec();
  },

  async findAllAdmin(filters: AdminReviewFilters, page: number, limit: number): Promise<IReview[]> {
    const query = buildAdminQuery(filters);
    return Review.find(query)
      .populate('user', 'name email')
      .populate('product', 'name slug')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  },

  async countAdmin(filters: AdminReviewFilters): Promise<number> {
    const query = buildAdminQuery(filters);
    return Review.countDocuments(query).exec();
  },

  async updateById(id: string, data: mongoose.UpdateQuery<IReview>): Promise<IReview | null> {
    return Review.findByIdAndUpdate(id, data, { new: true, runValidators: true }).exec();
  },

  async deleteById(id: string): Promise<void> {
    await Review.findByIdAndDelete(id);
  },

  /** Atomically toggles a user's helpful vote, keeping `helpfulCount` and
   * `helpfulVotes` in sync in a single update. */
  async toggleHelpful(reviewId: string, userId: string): Promise<IReview | null> {
    const review = await Review.findById(reviewId).exec();
    if (!review) return null;

    const hasVoted = review.helpfulVotes.some((voterId) => voterId.toString() === userId);
    const update = hasVoted
      ? { $pull: { helpfulVotes: userId }, $inc: { helpfulCount: -1 } }
      : { $addToSet: { helpfulVotes: userId }, $inc: { helpfulCount: 1 } };

    return Review.findByIdAndUpdate(reviewId, update, { new: true }).exec();
  },

  /** Set of review ids (among the given list) the user has voted helpful on — used to render vote state without a query per review. */
  async findVotedReviewIds(reviewIds: string[], userId: string): Promise<Set<string>> {
    const rows = await Review.find({ _id: { $in: reviewIds }, helpfulVotes: userId })
      .select('_id')
      .lean()
      .exec();
    return new Set(rows.map((row) => row._id.toString()));
  },

  /** Aggregates average/count/distribution over a product's approved reviews. */
  async getRatingSummary(productId: string): Promise<RatingSummary> {
    const [result] = await Review.aggregate<{
      average: number;
      count: number;
      distribution: { rating: number; count: number }[];
    }>([
      { $match: { product: new mongoose.Types.ObjectId(productId), status: 'approved' } },
      {
        $group: {
          _id: null,
          average: { $avg: '$rating' },
          count: { $sum: 1 },
          ratings: { $push: '$rating' },
        },
      },
      {
        $project: {
          average: 1,
          count: 1,
          distribution: {
            $map: {
              input: [1, 2, 3, 4, 5],
              as: 'star',
              in: {
                rating: '$$star',
                count: {
                  $size: { $filter: { input: '$ratings', as: 'r', cond: { $eq: ['$$r', '$$star'] } } },
                },
              },
            },
          },
        },
      },
    ]).exec();

    const distribution = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 } as RatingSummary['distribution'];
    result?.distribution.forEach((entry) => {
      distribution[String(entry.rating) as keyof typeof distribution] = entry.count;
    });

    return {
      average: result ? Math.round(result.average * 10) / 10 : 0,
      count: result?.count ?? 0,
      distribution,
    };
  },
};
