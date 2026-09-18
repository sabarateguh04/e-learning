import { Router } from 'express';
import { ROLE, rbacGuard } from '../middlewares/rbacGuard';
import {
  approveModule,
  approveUser,
  getMenuAccess,
  getOverview,
  listModules,
  listUsers,
  rejectModule,
  rejectUser,
  resetPassword,
  updateMenuAccess,
  updateUser,
} from '../controllers/adminController';
import masterDataRoutes from './masterDataRoutes';

const router = Router();

// Every admin endpoint is Super Admin only.
router.use(rbacGuard([ROLE.SUPER_ADMIN]));

router.get('/overview', getOverview);

// Persetujuan Akun
router.get('/users', listUsers);
router.put('/users/:id', updateUser);
router.patch('/users/:id', updateUser);
router.patch('/users/:id/approve', approveUser);
router.patch('/users/:id/reject', rejectUser);
router.post('/users/:id/reset-password', resetPassword);

// Persetujuan Materi
router.get('/modules', listModules);
router.patch('/modules/:id/approve', approveModule);
router.patch('/modules/:id/reject', rejectModule);

// Hak Akses Menu
router.get('/menu-access', getMenuAccess);
router.put('/menu-access', updateMenuAccess);


// Kelola Master Data
router.use('/master', masterDataRoutes);

export default router;
