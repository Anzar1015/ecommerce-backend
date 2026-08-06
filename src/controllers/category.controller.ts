import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { categoryService } from '../services/category.service';

export const categoryController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const includeInactive = req.user?.role === 'admin';
    const categories = await categoryService.list(includeInactive);
    res.status(200).json(new ApiResponse(200, { categories }, 'Categories fetched successfully'));
  }),

  getOne: asyncHandler(async (req: Request, res: Response) => {
    const includeInactive = req.user?.role === 'admin';
    const category = await categoryService.getByIdentifier(req.params.identifier, includeInactive);
    res.status(200).json(new ApiResponse(200, { category }, 'Category fetched successfully'));
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const category = await categoryService.create(req.body, req.file);
    res.status(201).json(new ApiResponse(201, { category }, 'Category created successfully'));
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const category = await categoryService.update(req.params.id, req.body, req.file);
    res.status(200).json(new ApiResponse(200, { category }, 'Category updated successfully'));
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await categoryService.remove(req.params.id);
    res.status(200).json(new ApiResponse(200, {}, 'Category deleted successfully'));
  }),
};
