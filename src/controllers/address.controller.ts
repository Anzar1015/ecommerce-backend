import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { addressService } from '../services/address.service';

export const addressController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const addresses = await addressService.list(req.user.sub);
    res.status(200).json(new ApiResponse(200, { addresses }, 'Addresses fetched successfully'));
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const address = await addressService.create(req.user.sub, req.body);
    res.status(201).json(new ApiResponse(201, { address }, 'Address added successfully'));
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const address = await addressService.update(req.user.sub, req.params.id, req.body);
    res.status(200).json(new ApiResponse(200, { address }, 'Address updated successfully'));
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    await addressService.remove(req.user.sub, req.params.id);
    res.status(200).json(new ApiResponse(200, {}, 'Address removed successfully'));
  }),
};
