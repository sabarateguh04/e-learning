import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { TenantRequest } from './tenantResolver';

export const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-change-in-prod';

/** Territory tier derived from provinsi_id / kota_id. */
export type TerritoryLevel = 'NATIONAL' | 'PROVINCE' | 'CITY';

/**
 * Claims carried in the JWT. Territory ids are denormalised so data scoping
 * never needs an extra lookup.
 */
export interface UserPayload {
  id: string;
  tenant_id: string;
  username: string;
  employee_id: string;
  full_name: string;
  role_level: number;
  provinsi_id: number | null;
  kota_id: number | null;
  provinsi_name: string | null;
  kota_name: string | null;
  territory_level: TerritoryLevel;
  territory_name: string;
  /** Admin-reset accounts may only call the password-change endpoints until they set a new password. */
  must_change_password?: boolean;
}

/** Paths a user with a forced password change may still reach. */
const PASSWORD_CHANGE_ALLOWLIST = ['/api/auth/change-password', '/api/auth/me', '/api/auth/logout'];

export interface AuthenticatedRequest extends TenantRequest {
  /** Populated by reportReviewGuard for /reports/:id/approve|reject. */
  report?: import('../repositories/reportRepo').FieldReport;
  user?: UserPayload;
}

/**
 * Verifies the Bearer JWT and attaches its payload to `req.user`.
 */
export const authenticate = (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing bearer token' });
    return;
  }

  let user: UserPayload;
  try {
    user = jwt.verify(token, JWT_SECRET) as UserPayload;
  } catch {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
    return;
  }

  // A token minted for one tenant must never be replayed against another.
  if (req.tenantId && req.tenantId !== user.tenant_id) {
    res.status(403).json({ error: 'Forbidden', message: 'Token does not belong to the requested tenant' });
    return;
  }

  if (user.must_change_password && !PASSWORD_CHANGE_ALLOWLIST.includes(req.originalUrl.split('?')[0])) {
    res.status(403).json({ error: 'Forbidden', code: 'PASSWORD_CHANGE_REQUIRED', message: 'You must set a new password before continuing' });
    return;
  }

  req.user = user;
  req.tenantId ??= user.tenant_id;
  next();
};
