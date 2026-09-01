import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { notificationQuerySchema, notificationIdParamSchema } from '../validators/notification.validator';

const router = Router();

router.use(authenticate);

router.get('/', validate(notificationQuerySchema), notificationController.list);
// Registered before /:id-shaped routes below so "read-all" is never captured as an id.
router.patch('/read-all', notificationController.markAllAsRead);
router.patch('/:id/read', validate(notificationIdParamSchema), notificationController.markAsRead);
router.delete('/:id', validate(notificationIdParamSchema), notificationController.remove);

export default router;
