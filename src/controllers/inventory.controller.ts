import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { inventoryService } from '../services/inventory.service';
import type { InventoryQuery } from '../validators/inventory.validator';

export const inventoryController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { products, pagination } = await inventoryService.list(req.query as unknown as InventoryQuery);
    res.status(200).json(new ApiResponse(200, { products, pagination }, 'Inventory fetched successfully'));
  }),

  summary: asyncHandler(async (_req: Request, res: Response) => {
    const summary = await inventoryService.getSummary();
    res.status(200).json(new ApiResponse(200, { summary }, 'Inventory summary fetched successfully'));
  }),

  adjustStock: asyncHandler(async (req: Request, res: Response) => {
    const product = await inventoryService.adjustStock(req.params.id, req.body);
    res.status(200).json(new ApiResponse(200, { product }, 'Stock adjusted successfully'));
  }),
};
