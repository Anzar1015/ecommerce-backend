import mongoose from 'mongoose';
import { Category, ICategory } from '../models/Category.model';

/**
 * Repository layer: the ONLY place that talks to Mongoose directly
 * for the Category collection.
 */
export const categoryRepository = {
  async findAll(includeInactive: boolean): Promise<ICategory[]> {
    const filter = includeInactive ? {} : { isActive: true };
    return Category.find(filter).sort({ name: 1 }).exec();
  },

  async findById(id: string): Promise<ICategory | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    return Category.findById(id).exec();
  },

  async findBySlug(slug: string): Promise<ICategory | null> {
    return Category.findOne({ slug }).exec();
  },

  async findByIdOrSlug(identifier: string): Promise<ICategory | null> {
    if (mongoose.isValidObjectId(identifier)) {
      return Category.findById(identifier).exec();
    }
    return Category.findOne({ slug: identifier }).exec();
  },

  async create(data: Partial<ICategory>): Promise<ICategory> {
    return Category.create(data);
  },

  async updateById(id: string, data: Partial<ICategory>): Promise<ICategory | null> {
    return Category.findByIdAndUpdate(id, data, { new: true, runValidators: true }).exec();
  },

  async deleteById(id: string): Promise<void> {
    await Category.findByIdAndDelete(id);
  },
};
