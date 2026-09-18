import { Router } from 'express';
import { approveReport, getReports, rejectReport, submitReport } from '../controllers/reportsController';
import { reportReviewGuard } from '../middlewares/reportReviewGuard';
import { downloadExecutiveReportPdf, getExecutiveReport } from '../controllers/executiveReportController';
import { EXECUTIVE_ROLES, ROLE, rbacGuard } from '../middlewares/rbacGuard';
import { menuGuard } from '../middlewares/menuGuard';

const router = Router();

// Every role may list — results are scoped bottom-up inside the controller.
router.get('/', getReports);

// Executive report (levels 0-3): aggregation strictly bounded by the caller's role & territory.
router.get('/executive', rbacGuard(EXECUTIVE_ROLES), menuGuard('executive_reports'), getExecutiveReport);
router.get('/executive/pdf', rbacGuard(EXECUTIVE_ROLES), menuGuard('executive_reports'), downloadExecutiveReportPdf);

// Hierarchical approval: exactly one level above the trainer within the same territory (Super Admin = override).
router.post('/:id/approve', rbacGuard(EXECUTIVE_ROLES), menuGuard('reports_inbox'), reportReviewGuard, approveReport);
router.post('/:id/reject', rbacGuard(EXECUTIVE_ROLES), menuGuard('reports_inbox'), reportReviewGuard, rejectReport);

// Only trainers submit, and only while "Submit Field Report" is enabled in the menu matrix.
router.post('/', rbacGuard([ROLE.TRAINER]), menuGuard('submit_report'), submitReport);

export default router;
