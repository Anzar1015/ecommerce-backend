import { Router } from 'express';
import { addressController } from '../controllers/address.controller';
import { validate } from '../middleware/validate.middleware';
import { authenticate } from '../middleware/auth.middleware';
import { createAddressSchema, updateAddressSchema, addressIdParamSchema } from '../validators/address.validator';

const router = Router();

router.use(authenticate);

router.get('/', addressController.list);
router.post('/', validate(createAddressSchema), addressController.create);
router.patch('/:id', validate(updateAddressSchema), addressController.update);
router.delete('/:id', validate(addressIdParamSchema), addressController.remove);

export default router;
