import { z } from 'zod';

const codeSchema = z
  .string()
  .trim()
  .min(3, 'Code must be at least 3 characters')
  .max(30)
  .transform((val) => val.toUpperCase());

// Create defaults a missing array to []; update leaves it untouched (undefined)
// so a partial PATCH doesn't accidentally clear an existing restriction list.
const createObjectIdArray = z
  .array(z.string().min(1))
  .optional()
  .transform((val) => val ?? []);
const updateObjectIdArray = z.array(z.string().min(1)).optional();

const money = z.coerce.number().min(0);

function refineCoupon(
  data: { type?: 'PERCENTAGE' | 'FIXED_AMOUNT'; value?: number; startDate?: Date; endDate?: Date },
  ctx: z.RefinementCtx
): void {
  if (data.type === 'PERCENTAGE' && data.value !== undefined && data.value > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'A percentage discount cannot exceed 100',
      path: ['value'],
    });
  }
  if (data.startDate && data.endDate && data.endDate <= data.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date must be after the start date',
      path: ['endDate'],
    });
  }
}

export const createCouponSchema = z.object({
  body: z
    .object({
      code: codeSchema,
      description: z.string().trim().max(500).optional(),
      type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']),
      value: z.coerce.number().positive('Value must be greater than 0'),
      minimumOrderAmount: money.default(0),
      maximumDiscount: money.optional(),
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
      usageLimit: z.coerce.number().int().positive().optional(),
      perUserLimit: z.coerce.number().int().positive().optional(),
      firstOrderOnly: z.coerce.boolean().default(false),
      isActive: z.coerce.boolean().default(true),
      applicableProducts: createObjectIdArray,
      applicableCategories: createObjectIdArray,
      excludedProducts: createObjectIdArray,
    })
    .superRefine(refineCoupon),
});

export const updateCouponSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
  body: z
    .object({
      code: codeSchema.optional(),
      description: z.string().trim().max(500).optional(),
      type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
      value: z.coerce.number().positive('Value must be greater than 0').optional(),
      minimumOrderAmount: money.optional(),
      maximumDiscount: money.optional(),
      startDate: z.coerce.date().optional(),
      endDate: z.coerce.date().optional(),
      usageLimit: z.coerce.number().int().positive().optional(),
      perUserLimit: z.coerce.number().int().positive().optional(),
      firstOrderOnly: z.coerce.boolean().optional(),
      isActive: z.coerce.boolean().optional(),
      applicableProducts: updateObjectIdArray,
      applicableCategories: updateObjectIdArray,
      excludedProducts: updateObjectIdArray,
    })
    .superRefine(refineCoupon),
});

export const couponIdParamSchema = z.object({
  params: z.object({ id: z.string().min(1) }),
});

export const couponQuerySchema = z.object({
  query: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    search: z.string().trim().optional(),
    isActive: z
      .enum(['true', 'false'])
      .optional()
      .transform((val) => (val === undefined ? undefined : val === 'true')),
  }),
});

export const validateCouponSchema = z.object({
  body: z.object({
    code: z.string().trim().min(1, 'Coupon code is required'),
  }),
});

export type CreateCouponInput = z.infer<typeof createCouponSchema>['body'];
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>['body'];
export type CouponQuery = z.infer<typeof couponQuerySchema>['query'];
export type ValidateCouponInput = z.infer<typeof validateCouponSchema>['body'];
