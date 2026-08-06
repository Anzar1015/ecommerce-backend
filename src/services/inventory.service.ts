import { productRepository, InventoryFilters } from '../repositories/product.repository';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { buildPaginationMeta, PaginationMeta } from '../utils/pagination';
import { IProduct } from '../models/Product.model';
import type { InventoryQuery, AdjustStockInput } from '../validators/inventory.validator';

export const inventoryService = {
  async list(query: InventoryQuery): Promise<{ products: IProduct[]; pagination: PaginationMeta }> {
    const { page, limit, ...rest } = query;
    const filters: InventoryFilters = rest;

    const [products, total] = await Promise.all([
      productRepository.findInventory(filters, page, limit),
      productRepository.countInventory(filters),
    ]);

    return { products, pagination: buildPaginationMeta(total, page, limit) };
  },

  async getSummary() {
    return productRepository.getInventorySummary();
  },

  async adjustStock(productId: string, input: AdjustStockInput): Promise<IProduct> {
    const product = await productRepository.findById(productId);
    if (!product) throw ApiError.notFound('Product not found');

    const delta =
      input.type === 'increase' ? input.quantity : input.type === 'decrease' ? -input.quantity : input.quantity - product.stock;

    if (delta === 0) return product;

    const updated = await productRepository.adjustStock(productId, delta);
    if (!updated) {
      throw ApiError.badRequest(`Cannot reduce stock below zero (current stock: ${product.stock})`);
    }

    logger.info('Stock adjusted', {
      productId,
      sku: product.sku,
      type: input.type,
      delta,
      newStock: updated.stock,
      reason: input.reason,
    });

    return updated;
  },
};
