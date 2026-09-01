import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { notificationService } from '../services/notification.service';
import type { NotificationQuery } from '../validators/notification.validator';

export const notificationController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const { page, limit, ...filters } = req.query as unknown as NotificationQuery;
    const result = await notificationService.listForUser(req.user.sub, filters, page, limit);
    res.status(200).json(new ApiResponse(200, result, 'Notifications fetched successfully'));
  }),

  markAsRead: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const notification = await notificationService.markAsRead(req.user.sub, req.params.id);
    res.status(200).json(new ApiResponse(200, { notification }, 'Notification marked as read'));
  }),

  markAllAsRead: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    await notificationService.markAllAsRead(req.user.sub);
    res.status(200).json(new ApiResponse(200, {}, 'All notifications marked as read'));
  }),

  remove: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    await notificationService.remove(req.user.sub, req.params.id);
    res.status(200).json(new ApiResponse(200, {}, 'Notification deleted successfully'));
  }),
};
