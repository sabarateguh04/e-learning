import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../middlewares/authenticate';
import { notificationRepo } from '../repositories/notificationRepo';

// GET /api/notifications            -> latest 30 for the caller + unread count
export const listNotifications = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { items, unread } = await notificationRepo.listForUser(req.user!.id);
    res.json({ success: true, unread, data: items });
  } catch (err) {
    next(err);
  }
};

// GET /api/notifications/unread-count   -> lightweight poll target
export const unreadCount = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    res.json({ success: true, unread: await notificationRepo.unreadCount(req.user!.id) });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/notifications/:id/read
export const markRead = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    await notificationRepo.markRead(req.user!.id, req.params.id as string);
    res.json({ success: true, unread: await notificationRepo.unreadCount(req.user!.id) });
  } catch (err) {
    next(err);
  }
};

// POST /api/notifications/read-all
export const markAllRead = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const n = await notificationRepo.markAllRead(req.user!.id);
    res.json({ success: true, marked: n, unread: 0 });
  } catch (err) {
    next(err);
  }
};
