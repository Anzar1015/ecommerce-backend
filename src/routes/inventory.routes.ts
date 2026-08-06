import { Router } from 'express';
import { inventoryController } from '../controllers/inventory.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { inventoryQuerySchema, adjustStockSchema } from '../validators/inventory.validator';

const router = Router();

router.use(authenticate, authorize('admin'));

router.get('/', validate(inventoryQuerySchema), inventoryController.list);
router.get('/summary', inventoryController.summary);
router.patch('/:id/stock', validate(adjustStockSchema), inventoryController.adjustStock);

export default router;
