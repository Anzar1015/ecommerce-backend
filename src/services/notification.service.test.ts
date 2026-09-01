import '../test/setup';
import { notificationService } from './notification.service';
import { notificationRepository } from '../repositories/notification.repository';
import { createUser } from '../test/factories';

describe('notificationService.notify', () => {
  it('creates an in-app notification for the user', async () => {
    const user = await createUser();
    const notification = await notificationService.notify(user.id, {
      type: 'ACCOUNT',
      title: 'Welcome',
      message: 'Hi there',
    });

    expect(notification.user.toString()).toBe(user.id);
    expect(notification.type).toBe('ACCOUNT');
    expect(notification.isRead).toBe(false);
  });
});

describe('notificationService.notifyMany', () => {
  it('creates a notification for every listed user', async () => {
    const userA = await createUser();
    const userB = await createUser();

    await notificationService.notifyMany([userA.id, userB.id], {
      type: 'PROMOTION',
      title: 'Sale',
      message: 'Everything 10% off',
    });

    const resultA = await notificationService.listForUser(userA.id, {}, 1, 10);
    const resultB = await notificationService.listForUser(userB.id, {}, 1, 10);
    expect(resultA.notifications).toHaveLength(1);
    expect(resultB.notifications).toHaveLength(1);
  });

  it('is a no-op for an empty user list', async () => {
    await expect(notificationService.notifyMany([], { type: 'SYSTEM', title: 'x', message: 'y' })).resolves.toBeUndefined();
  });
});

describe('notificationService.listForUser', () => {
  it('paginates and reports an accurate unread count', async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i += 1) {
      await notificationService.notify(user.id, { type: 'SYSTEM', title: `N${i}`, message: 'x' });
    }

    const result = await notificationService.listForUser(user.id, {}, 1, 3);
    expect(result.notifications).toHaveLength(3);
    expect(result.pagination.total).toBe(5);
    expect(result.unreadCount).toBe(5);
  });

  it('filters by isRead and type', async () => {
    const user = await createUser();
    const n1 = await notificationService.notify(user.id, { type: 'ORDER', title: 'a', message: 'x' });
    await notificationService.notify(user.id, { type: 'PROMOTION', title: 'b', message: 'y' });
    await notificationService.markAsRead(user.id, n1.id);

    const unread = await notificationService.listForUser(user.id, { isRead: false }, 1, 10);
    expect(unread.notifications).toHaveLength(1);
    expect(unread.notifications[0].type).toBe('PROMOTION');

    const orderOnly = await notificationService.listForUser(user.id, { type: 'ORDER' }, 1, 10);
    expect(orderOnly.notifications).toHaveLength(1);
    expect(orderOnly.notifications[0].type).toBe('ORDER');
  });

  it('only returns the requesting user\'s notifications', async () => {
    const userA = await createUser();
    const userB = await createUser();
    await notificationService.notify(userA.id, { type: 'SYSTEM', title: 'a', message: 'x' });

    const resultB = await notificationService.listForUser(userB.id, {}, 1, 10);
    expect(resultB.notifications).toHaveLength(0);
  });
});

describe('notificationService.markAsRead / markAllAsRead', () => {
  it('marks a single notification read and sets readAt', async () => {
    const user = await createUser();
    const notification = await notificationService.notify(user.id, { type: 'SYSTEM', title: 'a', message: 'x' });

    const updated = await notificationService.markAsRead(user.id, notification.id);
    expect(updated.isRead).toBe(true);
    expect(updated.readAt).toBeDefined();
  });

  it('throws when marking a nonexistent or another user\'s notification', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const notification = await notificationService.notify(userA.id, { type: 'SYSTEM', title: 'a', message: 'x' });

    await expect(notificationService.markAsRead(userB.id, notification.id)).rejects.toThrow('not found');
  });

  it('marks all of a user\'s unread notifications as read, leaving others untouched', async () => {
    const user = await createUser();
    await notificationService.notify(user.id, { type: 'SYSTEM', title: 'a', message: 'x' });
    await notificationService.notify(user.id, { type: 'SYSTEM', title: 'b', message: 'y' });

    await notificationService.markAllAsRead(user.id);

    const result = await notificationService.listForUser(user.id, {}, 1, 10);
    expect(result.unreadCount).toBe(0);
    expect(result.notifications.every((n) => n.isRead)).toBe(true);
  });
});

describe('notificationService.remove', () => {
  it('deletes a notification owned by the user', async () => {
    const user = await createUser();
    const notification = await notificationService.notify(user.id, { type: 'SYSTEM', title: 'a', message: 'x' });

    await notificationService.remove(user.id, notification.id);
    const found = await notificationRepository.findByUser(user.id, {}, 1, 10);
    expect(found).toHaveLength(0);
  });

  it('throws when deleting another user\'s notification', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const notification = await notificationService.notify(userA.id, { type: 'SYSTEM', title: 'a', message: 'x' });

    await expect(notificationService.remove(userB.id, notification.id)).rejects.toThrow('not found');
  });
});
