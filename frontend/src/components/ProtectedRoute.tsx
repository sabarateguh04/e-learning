import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore, selectIsAuthenticated, selectRoleLevel } from '../store/authStore';
import { homeFor } from '../lib/roles';

interface ProtectedRouteProps {
  /** Optional role_level whitelist mirroring the backend `rbacGuard`. */
  allowedRoles?: readonly number[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const location = useLocation();
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const roleLevel = useAuthStore(selectRoleLevel);
  const mustChange = useAuthStore((s) => Boolean(s.user?.must_change_password));

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Admin-reset accounts land on the change-password screen and nowhere else.
  if (mustChange && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }

  if (allowedRoles && (roleLevel === undefined || !allowedRoles.includes(roleLevel))) {
    return <Navigate to={homeFor(roleLevel)} replace />;
  }

  return <Outlet />;
}

/** `/` — sends each role to its landing page. */
export function RoleHome() {
  const roleLevel = useAuthStore(selectRoleLevel);
  return <Navigate to={homeFor(roleLevel)} replace />;
}
