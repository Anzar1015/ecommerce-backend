import mongoose, { FilterQuery } from 'mongoose';
import { Notification, INotification, NotificationType } from '../models/Notification.model';

export interface NotificationFilters {
  isRead?: boolean;
  type?: NotificationType;
}

function buildQuery(userId: string, filters: NotificationFilters): FilterQuery<INotification> {
  const query: FilterQuery<INotification> = { user: userId };
  if (filters.isRead !== undefined) query.isRead = filters.isRead;
  if (filters.type) query.type = filters.type;
  return query;
}

/**
 * Repository layer: the ONLY place that talks to Mongoose directly
 * for the Notification collection.
 */
export const notificationRepository = {
  async create(data: mongoose.AnyKeys<INotification>): Promise<INotification> {
    return Notification.create(data);
  },

  /** Bulk fan-out (e.g. a new promotion to every customer). */
  async createMany(entries: mongoose.AnyKeys<INotification>[]): Promise<void> {
    if (entries.length === 0) return;
    await Notification.insertMany(entries, { ordered: false });
  },

  async findByUser(userId: string, filters: NotificationFilters, page: number, limit: number): Promise<INotification[]> {
    const query = buildQuery(userId, filters);
    return Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  },

  async countByUser(userId: string, filters: NotificationFilters): Promise<number> {
    const query = buildQuery(userId, filters);
    return Notification.countDocuments(query).exec();
  },

  async countUnread(userId: string): Promise<number> {
    return Notification.countDocuments({ user: userId, isRead: false }).exec();
  },

  async markAsRead(userId: string, id: string): Promise<INotification | null> {
    if (!mongoose.isValidObjectId(id)) return null;
    return Notification.findOneAndUpdate(
      { _id: id, user: userId },
      { isRead: true, readAt: new Date() },
      { new: true }
    ).exec();
  },

  async markAllAsRead(userId: string): Promise<void> {
    await Notification.updateMany(
      { user: userId, isRead: false },
      { isRead: true, readAt: new Date() }
    ).exec();
  },

  async deleteById(userId: string, id: string): Promise<boolean> {
    if (!mongoose.isValidObjectId(id)) return false;
    const result = await Notification.findOneAndDelete({ _id: id, user: userId }).exec();
    return !!result;
  },
};
