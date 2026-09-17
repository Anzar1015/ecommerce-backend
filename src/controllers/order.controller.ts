import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { orderService } from '../services/order.service';
import type { OrderHistoryQuery, AdminOrderQuery } from '../validators/order.validator';

export const orderController = {
  checkout: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const order = await orderService.checkout(req.user.sub, req.body);
    res.status(201).json(new ApiResponse(201, { order }, 'Order placed successfully'));
  }),

  myOrders: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const { page, limit } = req.query as unknown as OrderHistoryQuery;
    const result = await orderService.getOrderHistory(req.user.sub, page, limit);
    res.status(200).json(new ApiResponse(200, result, 'Orders fetched successfully'));
  }),

  myOrderDetails: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const order = await orderService.getOrderForUser(req.user.sub, req.params.id);
    res.status(200).json(new ApiResponse(200, { order }, 'Order fetched successfully'));
  }),

  cancel: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const order = await orderService.cancelOrder(req.user.sub, req.params.id, req.body.reason);
    res.status(200).json(new ApiResponse(200, { order }, 'Order cancelled successfully'));
  }),

  retryPayment: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const order = await orderService.retryPayment(req.user.sub, req.params.id);
    res.status(200).json(new ApiResponse(200, { order }, 'Payment re-initiated'));
  }),

  adminList: asyncHandler(async (req: Request, res: Response) => {
    const { page, limit, ...filters } = req.query as unknown as AdminOrderQuery;
    const result = await orderService.listOrdersAdmin(filters, page, limit);
    res.status(200).json(new ApiResponse(200, result, 'Orders fetched successfully'));
  }),

  adminGetOne: asyncHandler(async (req: Request, res: Response) => {
    const order = await orderService.getOrderByIdAdmin(req.params.id);
    res.status(200).json(new ApiResponse(200, { order }, 'Order fetched successfully'));
  }),

  adminUpdateStatus: asyncHandler(async (req: Request, res: Response) => {
    const order = await orderService.updateStatusAdmin(req.params.id, req.body.status, req.body.note);
    res.status(200).json(new ApiResponse(200, { order }, 'Order status updated successfully'));
  }),

  adminUpdateShipping: asyncHandler(async (req: Request, res: Response) => {
    const order = await orderService.updateShippingDetailsAdmin(req.params.id, req.body);
    res.status(200).json(new ApiResponse(200, { order }, 'Shipping details updated successfully'));
  }),
};
