import { Router } from 'express';
import { listNotifications, markAllRead, markRead, unreadCount } from '../controllers/notificationsController';

const router = Router();

// Every authenticated user reads only their own notifications (scoped by req.user.id in the repo).
router.get('/', listNotifications);
router.get('/unread-count', unreadCount);
router.patch('/:id/read', markRead);
router.post('/read-all', markAllRead);

export default router;
