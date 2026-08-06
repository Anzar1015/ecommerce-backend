import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { dashboardService } from '../services/dashboard.service';

export const dashboardController = {
  summary: asyncHandler(async (_req: Request, res: Response) => {
    const summary = await dashboardService.getSummary();
    res.status(200).json(new ApiResponse(200, { summary }, 'Dashboard summary fetched successfully'));
  }),
};
