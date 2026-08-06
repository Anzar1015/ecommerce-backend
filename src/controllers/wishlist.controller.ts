import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { wishlistService } from '../services/wishlist.service';

export const wishlistController = {
  getWishlist: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const wishlist = await wishlistService.getWishlist(req.user.sub);
    res.status(200).json(new ApiResponse(200, { wishlist }, 'Wishlist fetched successfully'));
  }),

  addProduct: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const wishlist = await wishlistService.addProduct(req.user.sub, req.params.productId);
    res.status(200).json(new ApiResponse(200, { wishlist }, 'Product added to wishlist'));
  }),

  removeProduct: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const wishlist = await wishlistService.removeProduct(req.user.sub, req.params.productId);
    res.status(200).json(new ApiResponse(200, { wishlist }, 'Product removed from wishlist'));
  }),

  moveToCart: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const result = await wishlistService.moveToCart(req.user.sub, req.params.productId, req.body.quantity);
    res.status(200).json(new ApiResponse(200, result, 'Product moved to cart'));
  }),
};
