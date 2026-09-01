import { NotificationChannelRegistry } from './NotificationChannelRegistry';

// No channels registered yet — in-app is the only delivery method today.
// Register real implementations here once an email/SMS/push provider is
// wired up (see notification.types.ts for the interface each must satisfy).
export const notificationChannelRegistry = new NotificationChannelRegistry();

export * from './notification.types';
