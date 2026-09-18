import { Request, Response, NextFunction } from 'express';

export interface TenantRequest extends Request {
  tenantId?: string;
}

export const tenantResolver = (req: TenantRequest, res: Response, next: NextFunction) => {
  const tenantId = req.headers['x-tenant-id'] as string;

  if (!tenantId) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'x-tenant-id header is required'
    });
  }

  req.tenantId = tenantId;
  next();
};
