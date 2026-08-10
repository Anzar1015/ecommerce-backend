import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { shippingService } from '../services/shipping.service';
import type { ShippingMethodsQuery } from '../validators/shipping.validator';

export const shippingController = {
  listMethods: asyncHandler(async (req: Request, res: Response) => {
    const { subtotal } = req.query as unknown as ShippingMethodsQuery;
    const methods = shippingService.listMethods().map((option) => ({
      ...option,
      fee: subtotal !== undefined ? shippingService.calculateFee(option.method, subtotal) : option.baseFee,
    }));
    res
      .status(200)
      .json(new ApiResponse(200, { methods, freeShippingThreshold: shippingService.getFreeShippingThreshold() }, 'Shipping methods fetched successfully'));
  }),
};
