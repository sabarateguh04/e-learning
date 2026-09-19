import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authenticate';

/**
 * 6-tier role hierarchy. Lower number = wider scope — except UNIT_HEAD, which was added
 * later (number 5 keeps existing rows untouched) and sits between EXEC_CITY and TRAINER:
 *
 *   0  SUPER_ADMIN     manages tenants & master modules
 *   1  EXEC_NATIONAL   sees every report in the tenant
 *   2  EXEC_PROVINCE   sees reports inside their province
 *   3  EXEC_CITY       sees reports inside their city
 *   5  UNIT_HEAD       leads ONE unit (satker: school, polsek, puskesmas) — sees and approves its trainers
 *   4  TRAINER         submits reports, sees only their own
 */
export const ROLE = {
  SUPER_ADMIN: 0,
  EXEC_NATIONAL: 1,
  EXEC_PROVINCE: 2,
  EXEC_CITY: 3,
  TRAINER: 4,
  UNIT_HEAD: 5,
} as const;

/** Rank in the hierarchy (0 = widest) — use this, not the raw number, when comparing breadth. */
export const ROLE_RANK: Record<number, number> = { 0: 0, 1: 1, 2: 2, 3: 3, 5: 4, 4: 5 };

export type RoleLevel = (typeof ROLE)[keyof typeof ROLE];

export const ROLE_LABEL: Record<RoleLevel, string> = {
  0: 'Super Admin',
  1: 'Eksekutif Nasional',
  2: 'Eksekutif Provinsi',
  3: 'Eksekutif Kota',
  5: 'Pimpinan Unit',
  4: 'Trainer',
};

/** Roles that monitor and approve (everything except Trainer). */
export const EXECUTIVE_ROLES: readonly RoleLevel[] = [ROLE.SUPER_ADMIN, ROLE.EXEC_NATIONAL, ROLE.EXEC_PROVINCE, ROLE.EXEC_CITY, ROLE.UNIT_HEAD];
/** Roles a person may pick when registering (Super Admin is provisioned, never self-registered). */
export const REGISTERABLE_ROLES: readonly RoleLevel[] = [ROLE.EXEC_NATIONAL, ROLE.EXEC_PROVINCE, ROLE.EXEC_CITY, ROLE.UNIT_HEAD, ROLE.TRAINER];

export const isRoleLevel = (n: unknown): n is RoleLevel => typeof n === 'number' && n in ROLE_LABEL;

/**
 * Allows the request only when `req.user.role_level` is in `allowedRoles`.
 * Must run after `authenticate`.
 *
 *   router.post('/', rbacGuard([ROLE.TRAINER]), submitReport)
 */
export const rbacGuard = (allowedRoles: readonly number[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role_level)) {
      const label = isRoleLevel(req.user.role_level) ? ROLE_LABEL[req.user.role_level] : String(req.user.role_level);
      res.status(403).json({
        error: 'Forbidden',
        message: `Role "${label}" is not permitted for this operation`,
      });
      return;
    }

    next();
  };
};

/**
 * Convenience: allow the given role and every role above it (lower number).
 *
 *   rbacMinLevel(ROLE.EXEC_CITY)  ===  rbacGuard([0, 1, 2, 3])
 */
export const rbacMinLevel = (minRole: number) =>
  rbacGuard(Object.values(ROLE).filter((level) => level <= minRole));
