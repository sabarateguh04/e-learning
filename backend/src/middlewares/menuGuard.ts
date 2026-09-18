import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authenticate';
import { accessRepo, MenuKey, MENU_META } from '../repositories/accessRepo';

/**
 * Enforces the Super Admin's menu matrix (tbl_elearning_menu_access) on the API,
 * so a role that was toggled off in "Hak Akses Menu" is blocked server-side too.
 * Runs after `authenticate`.
 */
export const menuGuard = (menuKey: MenuKey) => {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }
    try {
      if (await accessRepo.isAllowed(menuKey, req.user.role_level)) {
        next();
        return;
      }
      res.status(403).json({ error: 'Forbidden', message: `Access to "${MENU_META[menuKey].label}" is disabled for your role` });
    } catch (err) {
      next(err);
    }
  };
};
