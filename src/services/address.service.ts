import { addressRepository } from '../repositories/address.repository';
import { ApiError } from '../utils/ApiError';
import { IAddress } from '../models/Address.model';
import type { CreateAddressInput, UpdateAddressInput } from '../validators/address.validator';

export const addressService = {
  async list(userId: string): Promise<IAddress[]> {
    return addressRepository.findAllByUser(userId);
  },

  async create(userId: string, input: CreateAddressInput): Promise<IAddress> {
    const existingCount = await addressRepository.countByUser(userId);
    // The very first address a user saves becomes their default automatically.
    const isDefault = input.isDefault ?? existingCount === 0;

    if (isDefault) await addressRepository.unsetDefaultForUser(userId);

    return addressRepository.create({ ...input, user: userId, isDefault });
  },

  async update(userId: string, addressId: string, input: UpdateAddressInput): Promise<IAddress> {
    const existing = await addressRepository.findByIdForUser(userId, addressId);
    if (!existing) throw ApiError.notFound('Address not found');

    if (input.isDefault) await addressRepository.unsetDefaultForUser(userId, addressId);

    const updated = await addressRepository.updateById(addressId, input);
    if (!updated) throw ApiError.notFound('Address not found');
    return updated;
  },

  async remove(userId: string, addressId: string): Promise<void> {
    const existing = await addressRepository.findByIdForUser(userId, addressId);
    if (!existing) throw ApiError.notFound('Address not found');

    await addressRepository.deleteById(addressId);

    // Promote another address to default so checkout always has a sensible pick.
    if (existing.isDefault) {
      const remaining = await addressRepository.findAllByUser(userId);
      if (remaining.length > 0) {
        await addressRepository.updateById(remaining[0].id, { isDefault: true });
      }
    }
  },
};
