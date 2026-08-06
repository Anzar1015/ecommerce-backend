import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { cartService } from '../services/cart.service';

export const cartController = {
  getCart: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await cartService.getCart(req.user.sub);
    res.status(200).json(new ApiResponse(200, result, 'Cart fetched successfully'));
  }),

  addItem: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await cartService.addItem(req.user.sub, req.body);
    res.status(200).json(new ApiResponse(200, result, 'Item added to cart'));
  }),

  updateItem: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await cartService.updateItemQuantity(
      req.user.sub,
      req.params.productId,
      req.body.quantity
    );
    res.status(200).json(new ApiResponse(200, result, 'Cart updated'));
  }),

  removeItem: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await cartService.removeItem(req.user.sub, req.params.productId);
    res.status(200).json(new ApiResponse(200, result, 'Item removed from cart'));
  }),

  merge: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await cartService.mergeGuestCart(req.user.sub, req.body.items);
    res.status(200).json(new ApiResponse(200, result, 'Cart merged successfully'));
  }),
};
