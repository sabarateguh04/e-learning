import { Router } from 'express';
import { downloadExecutiveReport, getExecutiveDashboardData, getFilterOptions } from '../controllers/analyticsController';
import { EXECUTIVE_ROLES, rbacGuard } from '../middlewares/rbacGuard';
import { menuGuard } from '../middlewares/menuGuard';

const router = Router();

// Levels 0-3 only, subject to the "dashboard" menu toggle.
router.get('/executive', rbacGuard(EXECUTIVE_ROLES), menuGuard('dashboard'), getExecutiveDashboardData);
router.get('/executive/report.pdf', rbacGuard(EXECUTIVE_ROLES), menuGuard('dashboard'), downloadExecutiveReport);
router.get('/filters', rbacGuard(EXECUTIVE_ROLES), getFilterOptions);

export default router;
