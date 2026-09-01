import { NotificationType } from '../models/Notification.model';

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
}

/**
 * Every future delivery channel (email, SMS, push) implements this so the
 * rest of the app never branches on a channel name — mirrors
 * `IPaymentProvider` in src/payments/payment.types.ts.
 */
export interface INotificationChannel {
  readonly key: string;
  send(payload: NotificationPayload): Promise<void>;
}
