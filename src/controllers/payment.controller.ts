import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { paymentService } from '../services/payment.service';
import type { PaymentProviderKey } from '../payments';

export const paymentController = {
  verify: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const order = await paymentService.verifyPayment(req.user.sub, req.params.orderId, req.body ?? {});
    res.status(200).json(new ApiResponse(200, { order }, 'Payment verified successfully'));
  }),

  /**
   * Mounted with express.raw() BEFORE the global JSON body parser (see app.ts) so
   * req.body is the untouched Buffer providers like Stripe need for signature checks.
   */
  webhook: asyncHandler(async (req: Request, res: Response) => {
    const provider = req.params.provider as PaymentProviderKey;
    const signature = req.headers['x-webhook-signature'] as string | undefined;
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));

    await paymentService.handleWebhook(provider, rawBody, signature);
    res.status(200).json(new ApiResponse(200, {}, 'Webhook processed'));
  }),
};
