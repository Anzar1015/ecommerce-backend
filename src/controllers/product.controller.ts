import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { productService } from '../services/product.service';
import type { ProductQuery, ProductSuggestQuery } from '../validators/product.validator';

function filesFromRequest(req: Request): Express.Multer.File[] {
  return Array.isArray(req.files) ? req.files : [];
}

export const productController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const isAdmin = req.user?.role === 'admin';
    const { products, pagination } = await productService.list(
      req.query as unknown as ProductQuery,
      isAdmin
    );
    res
      .status(200)
      .json(new ApiResponse(200, { products, pagination }, 'Products fetched successfully'));
  }),

  suggestions: asyncHandler(async (req: Request, res: Response) => {
    const { q, limit } = req.query as unknown as ProductSuggestQuery;
    const suggestions = await productService.suggest(q, limit);
    res
      .status(200)
      .json(new ApiResponse(200, { suggestions }, 'Suggestions fetched successfully'));
  }),

  getOne: asyncHandler(async (req: Request, res: Response) => {
    const isAdmin = req.user?.role === 'admin';
    const product = await productService.getByIdentifier(req.params.identifier, isAdmin);
    res.status(200).json(new ApiResponse(200, { product }, 'Product fetched successfully'));
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.create(req.body, filesFromRequest(req));
    res.status(201).json(new ApiResponse(201, { product }, 'Product created successfully'));
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.update(req.params.id, req.body, filesFromRequest(req));
    res.status(200).json(new ApiResponse(200, { product }, 'Product updated successfully'));
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await productService.remove(req.params.id);
    res.status(200).json(new ApiResponse(200, {}, 'Product deleted successfully'));
  }),

  removeImage: asyncHandler(async (req: Request, res: Response) => {
    const product = await productService.removeImage(req.params.id, req.body.publicId);
    res.status(200).json(new ApiResponse(200, { product }, 'Product image removed successfully'));
  }),
};
