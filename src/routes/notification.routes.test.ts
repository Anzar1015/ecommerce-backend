import request from 'supertest';
import '../test/setup';
import { createApp } from '../app';
import { signAccessToken } from '../auth/jwt';
import { notificationService } from '../services/notification.service';
import { createUser } from '../test/factories';
import type { IUser } from '../models/User.model';

const app = createApp();

function authHeader(user: IUser) {
  return { Authorization: `Bearer ${signAccessToken({ sub: user.id, role: user.role })}` };
}

describe('GET /api/v1/notifications', () => {
  it('requires authentication', async () => {
    await request(app).get('/api/v1/notifications').expect(401);
  });

  it('lists the caller\'s notifications with an unread count', async () => {
    const user = await createUser();
    await notificationService.notify(user.id, { type: 'ORDER', title: 'Order Placed', message: 'x' });
    await notificationService.notify(user.id, { type: 'PROMOTION', title: 'Sale', message: 'y' });

    const res = await request(app).get('/api/v1/notifications').set(authHeader(user)).expect(200);
    expect(res.body.data.notifications).toHaveLength(2);
    expect(res.body.data.unreadCount).toBe(2);
  });

  it('never returns another user\'s notifications', async () => {
    const userA = await createUser();
    const userB = await createUser();
    await notificationService.notify(userA.id, { type: 'SYSTEM', title: 'a', message: 'x' });

    const res = await request(app).get('/api/v1/notifications').set(authHeader(userB)).expect(200);
    expect(res.body.data.notifications).toHaveLength(0);
  });

  it('rejects an invalid type filter with 400', async () => {
    const user = await createUser();
    await request(app)
      .get('/api/v1/notifications')
      .set(authHeader(user))
      .query({ type: 'NOT_A_TYPE' })
      .expect(400);
  });
});

describe('PATCH /api/v1/notifications/:id/read', () => {
  it('marks a notification as read', async () => {
    const user = await createUser();
    const notification = await notificationService.notify(user.id, { type: 'SYSTEM', title: 'a', message: 'x' });

    const res = await request(app)
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set(authHeader(user))
      .expect(200);
    expect(res.body.data.notification.isRead).toBe(true);
  });

  it('rejects marking another user\'s notification with 404', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const notification = await notificationService.notify(userA.id, { type: 'SYSTEM', title: 'a', message: 'x' });

    await request(app)
      .patch(`/api/v1/notifications/${notification.id}/read`)
      .set(authHeader(userB))
      .expect(404);
  });
});

describe('PATCH /api/v1/notifications/read-all', () => {
  it('marks every unread notification as read and is not shadowed by /:id/read', async () => {
    const user = await createUser();
    await notificationService.notify(user.id, { type: 'SYSTEM', title: 'a', message: 'x' });
    await notificationService.notify(user.id, { type: 'SYSTEM', title: 'b', message: 'y' });

    await request(app).patch('/api/v1/notifications/read-all').set(authHeader(user)).expect(200);

    const res = await request(app).get('/api/v1/notifications').set(authHeader(user)).expect(200);
    expect(res.body.data.unreadCount).toBe(0);
  });
});

describe('DELETE /api/v1/notifications/:id', () => {
  it('deletes the caller\'s own notification', async () => {
    const user = await createUser();
    const notification = await notificationService.notify(user.id, { type: 'SYSTEM', title: 'a', message: 'x' });

    await request(app).delete(`/api/v1/notifications/${notification.id}`).set(authHeader(user)).expect(200);

    const res = await request(app).get('/api/v1/notifications').set(authHeader(user)).expect(200);
    expect(res.body.data.notifications).toHaveLength(0);
  });

  it('rejects deleting another user\'s notification with 404', async () => {
    const userA = await createUser();
    const userB = await createUser();
    const notification = await notificationService.notify(userA.id, { type: 'SYSTEM', title: 'a', message: 'x' });

    await request(app).delete(`/api/v1/notifications/${notification.id}`).set(authHeader(userB)).expect(404);
  });
});
