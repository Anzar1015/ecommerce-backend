import crypto from 'crypto';
import { productRepository, ProductFilters } from '../repositories/product.repository';
import { categoryRepository } from '../repositories/category.repository';
import { ApiError } from '../utils/ApiError';
import { slugify } from '../utils/slugify';
import { uploadImageBuffer, deleteImage } from '../utils/cloudinary';
import { buildPaginationMeta, PaginationMeta } from '../utils/pagination';
import { logger } from '../utils/logger';
import { IProduct } from '../models/Product.model';
import type { CreateProductInput, UpdateProductInput, ProductQuery } from '../validators/product.validator';

const CLOUDINARY_FOLDER = 'ecommerce/products';

async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let slug = base;
  while (await productRepository.findBySlug(slug)) {
    slug = `${base}-${crypto.randomBytes(3).toString('hex')}`;
  }
  return slug;
}

async function assertCategoryExists(categoryId: string): Promise<void> {
  const category = await categoryRepository.findById(categoryId);
  if (!category) throw ApiError.badRequest('Selected category does not exist');
}

export const productService = {
  async list(
    query: ProductQuery,
    isAdmin: boolean
  ): Promise<{ products: IProduct[]; pagination: PaginationMeta }> {
    const { page, limit, sort, ...rest } = query;
    const filters: ProductFilters = { ...rest, sort, status: isAdmin ? rest.status : 'active' };

    const [products, total] = await Promise.all([
      productRepository.findAll(filters, page, limit),
      productRepository.count(filters),
    ]);

    return { products, pagination: buildPaginationMeta(total, page, limit) };
  },

  async getByIdentifier(identifier: string, isAdmin: boolean): Promise<IProduct> {
    const product = await productRepository.findByIdOrSlug(identifier);
    if (!product || (!isAdmin && product.status !== 'active')) {
      throw ApiError.notFound('Product not found');
    }
    return product;
  },

  async create(input: CreateProductInput, files: Express.Multer.File[]): Promise<IProduct> {
    await assertCategoryExists(input.category);

    const slug = await generateUniqueSlug(input.name);
    const images = await Promise.all(files.map((file) => uploadImageBuffer(file.buffer, CLOUDINARY_FOLDER)));

    const product = await productRepository.create({ ...input, slug, images });
    logger.info('Product created', { productId: product.id, sku: product.sku });
    return product;
  },

  async update(id: string, input: UpdateProductInput, files: Express.Multer.File[]): Promise<IProduct> {
    const product = await productRepository.findById(id);
    if (!product) throw ApiError.notFound('Product not found');

    if (input.category) await assertCategoryExists(input.category);

    const slug = input.name && input.name !== product.name ? await generateUniqueSlug(input.name) : product.slug;

    const newImages = files.length
      ? await Promise.all(files.map((file) => uploadImageBuffer(file.buffer, CLOUDINARY_FOLDER)))
      : [];

    const updated = await productRepository.updateById(id, {
      ...input,
      slug,
      ...(newImages.length ? { images: [...product.images, ...newImages] } : {}),
    });

    if (!updated) throw ApiError.notFound('Product not found');
    return updated;
  },

  async remove(id: string): Promise<void> {
    const product = await productRepository.findById(id);
    if (!product) throw ApiError.notFound('Product not found');

    await Promise.all(product.images.map((image) => deleteImage(image.publicId)));
    await productRepository.deleteById(id);
    logger.info('Product deleted', { productId: id });
  },

  async removeImage(productId: string, publicId: string): Promise<IProduct> {
    const product = await productRepository.findById(productId);
    if (!product) throw ApiError.notFound('Product not found');

    const hasImage = product.images.some((image) => image.publicId === publicId);
    if (!hasImage) throw ApiError.notFound('Image not found on this product');

    await deleteImage(publicId);
    const images = product.images.filter((image) => image.publicId !== publicId);
    const updated = await productRepository.updateById(productId, { images });
    if (!updated) throw ApiError.notFound('Product not found');
    return updated;
  },
};
