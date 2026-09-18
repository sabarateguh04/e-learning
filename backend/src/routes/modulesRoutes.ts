import { Router } from 'express';
import { createModule, getAllModules, getModuleById, getModuleOptions, getMyModules, trackView, updateModule } from '../controllers/modulesController';
import { ROLE, rbacGuard } from '../middlewares/rbacGuard';

const router = Router();

router.get('/', getAllModules);
router.get('/mine', getMyModules);
router.get('/options', getModuleOptions);
router.get('/:id', getModuleById);
router.post('/:id/view', trackView);

// Authoring: trainers submit (PENDING), Super Admin publishes directly.
router.post('/', rbacGuard([ROLE.TRAINER, ROLE.SUPER_ADMIN]), createModule);
router.put('/:id', rbacGuard([ROLE.TRAINER, ROLE.SUPER_ADMIN]), updateModule);

export default router;
