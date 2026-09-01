import { notificationRepository, NotificationFilters } from '../repositories/notification.repository';
import { notificationChannelRegistry } from '../notifications';
import { ApiError } from '../utils/ApiError';
import { logger } from '../utils/logger';
import { buildPaginationMeta, PaginationMeta } from '../utils/pagination';
import { INotification, NotificationType } from '../models/Notification.model';

export interface NotifyInput {
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

/**
 * The "Notification Service" from the module's architecture diagram:
 *
 *   Order/Payment/Auth/Coupon Service -> Event -> Notification Service -> In-App Notification
 *
 * Domain services call `notify()`/`notifyMany()` after something happens;
 * this service never reaches back into their domains. It always persists
 * the in-app notification, then best-effort fans out to any registered
 * future channel (email/SMS/push) — none are registered today.
 */
export const notificationService = {
  async notify(userId: string, input: NotifyInput): Promise<INotification> {
    const notification = await notificationRepository.create({ user: userId, ...input });
    await dispatchToChannels(userId, input);
    return notification;
  },

  /** Bulk fan-out to many users at once (e.g. a new promotion to every customer). */
  async notifyMany(userIds: string[], input: NotifyInput): Promise<void> {
    if (userIds.length === 0) return;
    await notificationRepository.createMany(userIds.map((userId) => ({ user: userId, ...input })));
    await Promise.allSettled(userIds.map((userId) => dispatchToChannels(userId, input)));
  },

  async listForUser(
    userId: string,
    filters: NotificationFilters,
    page: number,
    limit: number
  ): Promise<{ notifications: INotification[]; pagination: PaginationMeta; unreadCount: number }> {
    const [notifications, total, unreadCount] = await Promise.all([
      notificationRepository.findByUser(userId, filters, page, limit),
      notificationRepository.countByUser(userId, filters),
      notificationRepository.countUnread(userId),
    ]);
    return { notifications, pagination: buildPaginationMeta(total, page, limit), unreadCount };
  },

  async markAsRead(userId: string, id: string): Promise<INotification> {
    const notification = await notificationRepository.markAsRead(userId, id);
    if (!notification) throw ApiError.notFound('Notification not found');
    return notification;
  },

  async markAllAsRead(userId: string): Promise<void> {
    await notificationRepository.markAllAsRead(userId);
  },

  async remove(userId: string, id: string): Promise<void> {
    const deleted = await notificationRepository.deleteById(userId, id);
    if (!deleted) throw ApiError.notFound('Notification not found');
  },
};

async function dispatchToChannels(userId: string, input: NotifyInput): Promise<void> {
  const channels = notificationChannelRegistry.getAll();
  if (channels.length === 0) return;

  const results = await Promise.allSettled(
    channels.map((channel) => channel.send({ userId, ...input }))
  );
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      logger.warn('Notification channel delivery failed', {
        channel: channels[index].key,
        userId,
        error: result.reason,
      });
    }
  });
}
