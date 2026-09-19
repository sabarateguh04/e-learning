import { Router } from 'express';
import { changePassword, forgotPassword, getCaptcha, getProfile, getSupportContact, login, me, register, registerOptions, removeProfilePhoto, updateProfile, uploadProfilePhoto, listTenants } from '../controllers/authController';
import { authenticate } from '../middlewares/authenticate';

const router = Router();

router.get('/captcha', getCaptcha);
router.get('/support', getSupportContact);
router.post('/forgot-password', forgotPassword);
router.post('/login', login);
router.post('/register', register);
router.get('/register-options', registerOptions);
router.get('/tenants', listTenants);
router.get('/me', authenticate, me);
router.post('/change-password', authenticate, changePassword);
router.get('/profile', authenticate, getProfile);
router.put('/profile', authenticate, updateProfile);
router.post('/profile/photo', authenticate, uploadProfilePhoto);
router.delete('/profile/photo', authenticate, removeProfilePhoto);

export default router;
