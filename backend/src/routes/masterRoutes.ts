import { Router } from 'express';
import { kota, legacy, provinsi } from '../controllers/masterController';

const router = Router();

// Cascading reference data (public, read-only)
router.get('/provinsi', provinsi);
router.get('/kota', kota); //            ?provinsi_id=
// English aliases (same handlers): /provinces, /cities?province_id=
router.get('/provinces', provinsi);
router.get('/cities', kota);
router.get('/instansi', legacy('instansi'));
router.get('/organisasi', legacy('organisasi')); // ?instansi_id=
router.get('/satker', legacy('satker')); //         ?org_id=
router.get('/sub-org', legacy('sub_org')); //       ?satker_id=

export default router;
