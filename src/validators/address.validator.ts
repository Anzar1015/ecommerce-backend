import { z } from 'zod';

const fullName = z.string().trim().min(2, 'Full name must be at least 2 characters').max(100);
const phone = z.string().trim().min(7, 'Enter a valid phone number').max(20);
const addressLine1 = z.string().trim().min(3, 'Address is required').max(200);
const addressLine2 = z.string().trim().max(200).optional();
const city = z.string().trim().min(1, 'City is required').max(100);
const state = z.string().trim().min(1, 'State is required').max(100);
const postalCode = z.string().trim().min(1, 'Postal code is required').max(20);
const country = z.string().trim().min(1, 'Country is required').max(100);
const isDefault = z.coerce.boolean().optional();

export const createAddressSchema = z.object({
  body: z.object({
    fullName,
    phone,
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    country,
    isDefault,
  }),
});

export const updateAddressSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    fullName: fullName.optional(),
    phone: phone.optional(),
    addressLine1: addressLine1.optional(),
    addressLine2,
    city: city.optional(),
    state: state.optional(),
    postalCode: postalCode.optional(),
    country: country.optional(),
    isDefault,
  }),
});

export const addressIdParamSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>['body'];
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>['body'];
