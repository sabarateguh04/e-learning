import { Router } from 'express';
import { ROLE, rbacGuard } from '../middlewares/rbacGuard';
import { createKota, createLegacy, createProvinsi, listKota, listLegacy, listProvinsi, setLegacyParent } from '../controllers/masterDataController';

const router = Router();

// Master data management is Super Admin only.
router.use(rbacGuard([ROLE.SUPER_ADMIN]));

router.get('/provinsi', listProvinsi);
router.post('/provinsi', createProvinsi);

router.get('/kota', listKota);
router.post('/kota', createKota);

// instansi | organisasi | satker | sub_org  (db_elearning.tbl_elearning_master_*)
router.get('/:type', listLegacy);
router.post('/:type', createLegacy);
router.patch('/:type/:id', setLegacyParent);

export default router;
