import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiResponse } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { paymentService } from '../services/payment.service';
import { paymentProviderRegistry } from '../payments';
import { config } from '../config/env';
import type { PaymentProviderKey } from '../payments';

export const paymentController = {
  /** The public key id only — the secret never leaves the server. */
  config: asyncHandler(async (_req: Request, res: Response) => {
    res.status(200).json(new ApiResponse(200, { razorpayKeyId: config.razorpay.keyId ?? null }, 'Payment config fetched'));
  }),

  verify: asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw ApiError.unauthorized();
    const order = await paymentService.verifyPayment(req.user.sub, req.params.orderId, req.body ?? {});
    res.status(200).json(new ApiResponse(200, { order }, 'Payment verified successfully'));
  }),

  refund: asyncHandler(async (req: Request, res: Response) => {
    const order = await paymentService.refundPayment(req.params.orderId, req.body.amount, req.body.reason);
    res.status(200).json(new ApiResponse(200, { order }, 'Refund processed successfully'));
  }),

  /**
   * Mounted with express.raw() BEFORE the global JSON body parser (see app.ts) so
   * req.body is the untouched Buffer providers need for signature checks.
   * Each provider declares its own signature header (see payment.types.ts) so
   * this stays provider-agnostic — adding a new provider never requires
   * touching this controller.
   */
  webhook: asyncHandler(async (req: Request, res: Response) => {
    const providerKey = req.params.provider as PaymentProviderKey;
    const provider = paymentProviderRegistry.get(providerKey);
    const signature = req.headers[provider.webhookSignatureHeader] as string | undefined;
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body ?? {}));

    await paymentService.handleWebhook(providerKey, rawBody, signature);
    res.status(200).json(new ApiResponse(200, {}, 'Webhook processed'));
  }),
};
