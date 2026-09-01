import { INotificationChannel } from './notification.types';

/**
 * Central lookup for outbound notification channels (email/SMS/push).
 * In-app notifications are always persisted directly by
 * `notificationService.notify()` — this registry is only for *additional*
 * delivery channels layered on top. Adding one later (e.g. Nodemailer,
 * Twilio, Firebase Cloud Messaging) means implementing `INotificationChannel`
 * and calling `register()` once — no other file needs to change.
 * Mirrors `PaymentProviderRegistry` in src/payments.
 */
export class NotificationChannelRegistry {
  private readonly channels: INotificationChannel[] = [];

  register(channel: INotificationChannel): void {
    this.channels.push(channel);
  }

  getAll(): INotificationChannel[] {
    return this.channels;
  }
}
