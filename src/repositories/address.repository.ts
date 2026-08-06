import mongoose from 'mongoose';
import { Address, IAddress } from '../models/Address.model';

/**
 * Repository layer: the ONLY place that talks to Mongoose directly
 * for the Address collection.
 */
export const addressRepository = {
  async findAllByUser(userId: string): Promise<IAddress[]> {
    return Address.find({ user: userId }).sort({ isDefault: -1, createdAt: -1 }).exec();
  },

  async findByIdForUser(userId: string, addressId: string): Promise<IAddress | null> {
    if (!mongoose.isValidObjectId(addressId)) return null;
    return Address.findOne({ _id: addressId, user: userId }).exec();
  },

  async create(data: mongoose.AnyKeys<IAddress>): Promise<IAddress> {
    return Address.create(data);
  },

  async updateById(addressId: string, data: mongoose.UpdateQuery<IAddress>): Promise<IAddress | null> {
    return Address.findByIdAndUpdate(addressId, data, { new: true, runValidators: true }).exec();
  },

  async deleteById(addressId: string): Promise<void> {
    await Address.findByIdAndDelete(addressId);
  },

  async unsetDefaultForUser(userId: string, exceptId?: string): Promise<void> {
    const filter: mongoose.FilterQuery<IAddress> = { user: userId, isDefault: true };
    if (exceptId) filter._id = { $ne: exceptId };
    await Address.updateMany(filter, { $set: { isDefault: false } });
  },

  async countByUser(userId: string): Promise<number> {
    return Address.countDocuments({ user: userId }).exec();
  },
};
