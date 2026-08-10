import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { couponService } from '../services/coupon.service';
import type { CouponQuery } from '../validators/coupon.validator';

export const couponController = {
  create: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const coupon = await couponService.create(req.body, req.user.sub);
    res.status(201).json(new ApiResponse(201, { coupon }, 'Coupon created successfully'));
  }),

  list: asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, ...filters } = req.query as unknown as CouponQuery;
    const result = await couponService.list(filters, page, limit);
    res.status(200).json(new ApiResponse(200, result, 'Coupons fetched successfully'));
  }),

  getOne: asyncHandler(async (req: Request, res: Response) => {
    const coupon = await couponService.getById(req.params.id);
    res.status(200).json(new ApiResponse(200, { coupon }, 'Coupon fetched successfully'));
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const coupon = await couponService.update(req.params.id, req.body);
    res.status(200).json(new ApiResponse(200, { coupon }, 'Coupon updated successfully'));
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    await couponService.remove(req.params.id);
    res.status(200).json(new ApiResponse(200, {}, 'Coupon deleted successfully'));
  }),

  validate: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const { coupon, discountAmount, subtotal } = await couponService.validateCartCoupon(req.user.sub, req.body.code);
    res.status(200).json(
      new ApiResponse(
        200,
        {
          valid: true,
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          discountAmount,
          subtotal,
          estimatedTotal: Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100),
        },
        'Coupon is valid'
      )
    );
  }),
};
