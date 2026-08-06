import crypto from 'crypto';
import { categoryRepository } from '../repositories/category.repository';
import { productRepository } from '../repositories/product.repository';
import { ApiError } from '../utils/ApiError';
import { slugify } from '../utils/slugify';
import { uploadImageBuffer, deleteImage } from '../utils/cloudinary';
import { ICategory } from '../models/Category.model';
import type { CreateCategoryInput, UpdateCategoryInput } from '../validators/category.validator';

const CLOUDINARY_FOLDER = 'ecommerce/categories';

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  while (await categoryRepository.findBySlug(slug)) {
    slug = `${base}-${crypto.randomBytes(3).toString('hex')}`;
  }
  return slug;
}

export const categoryService = {
  async list(includeInactive: boolean): Promise<ICategory[]> {
    return categoryRepository.findAll(includeInactive);
  },

  async getByIdentifier(identifier: string, includeInactive: boolean): Promise<ICategory> {
    const category = await categoryRepository.findByIdOrSlug(identifier);
    if (!category || (!includeInactive && !category.isActive)) {
      throw ApiError.notFound('Category not found');
    }
    return category;
  },

  async create(input: CreateCategoryInput, file?: Express.Multer.File): Promise<ICategory> {
    const slug = await generateUniqueSlug(input.name);
    const image = file ? await uploadImageBuffer(file.buffer, CLOUDINARY_FOLDER) : undefined;

    return categoryRepository.create({
      ...input,
      slug,
      ...(image ? { image } : {}),
    });
  },

  async update(id: string, input: UpdateCategoryInput, file?: Express.Multer.File): Promise<ICategory> {
    const category = await categoryRepository.findById(id);
    if (!category) throw ApiError.notFound('Category not found');

    const slug = input.name && input.name !== category.name ? await generateUniqueSlug(input.name) : category.slug;

    let image = category.image;
    if (file) {
      if (category.image?.publicId) await deleteImage(category.image.publicId);
      image = await uploadImageBuffer(file.buffer, CLOUDINARY_FOLDER);
    }

    const updated = await categoryRepository.updateById(id, { ...input, slug, image });
    if (!updated) throw ApiError.notFound('Category not found');
    return updated;
  },

  async remove(id: string): Promise<void> {
    const category = await categoryRepository.findById(id);
    if (!category) throw ApiError.notFound('Category not found');

    const productCount = await productRepository.countByCategory(id);
    if (productCount > 0) {
      throw ApiError.conflict('Cannot delete a category that still has products assigned to it');
    }

    if (category.image?.publicId) await deleteImage(category.image.publicId);
    await categoryRepository.deleteById(id);
  },
};
