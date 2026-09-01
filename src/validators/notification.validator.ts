import { z } from 'zod';

export const notificationQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(50).default(20),
    isRead: z
      .enum(['true', 'false'])
      .optional()
      .transform((val) => (val === undefined ? undefined : val === 'true')),
    type: z.enum(['ORDER', 'PAYMENT', 'SHIPPING', 'ACCOUNT', 'PROMOTION', 'SYSTEM']).optional(),
  }),
});

export const notificationIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export type NotificationQuery = z.infer<typeof notificationQuerySchema>['query'];
