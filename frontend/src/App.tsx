import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Login } from './pages/Login';
import { MainLayout } from './components/MainLayout';
import { Skeleton } from './components/ui';

// Route-level code splitting: each screen ships as its own chunk.
const load = <T extends Record<string, unknown>, K extends keyof T>(importer: () => Promise<T>, name: K) =>
  lazy(() => importer().then((m) => ({ default: m[name] as React.ComponentType })));
const Register = load(() => import('./pages/Register'), 'Register');
const ForgotPassword = load(() => import('./pages/ForgotPassword'), 'ForgotPassword');
const ChangePassword = load(() => import('./pages/ChangePassword'), 'ChangePassword');
const AdminAccessManager = lazy(() => import('./pages/AdminAccessManager').then((m) => ({ default: m.AdminAccessManager })));
const AdminUsers = () => <AdminAccessManager initialTab="accounts" title="Manajemen User" />;
const AdminAccess = () => <AdminAccessManager initialTab="modules" />;
const MasterData = load(() => import('./pages/MasterData'), 'MasterData');
const Profile = load(() => import('./pages/Profile'), 'Profile');
const CreateModule = load(() => import('./pages/CreateModule'), 'CreateModule');
const ExecutiveDashboard = load(() => import('./pages/ExecutiveDashboard'), 'ExecutiveDashboard');
const Modules = load(() => import('./pages/Modules'), 'Modules');
const ModuleDetail = load(() => import('./pages/ModuleDetail'), 'ModuleDetail');
const ModuleViewer = lazy(() => import('./pages/ModuleViewer').then((m) => ({ default: m.ModuleViewer })));
const FieldReport = load(() => import('./pages/FieldReport'), 'FieldReport');
const ReportInbox = load(() => import('./pages/ReportInbox'), 'ReportInbox');
const ExecutiveReports = load(() => import('./pages/ExecutiveReports'), 'ExecutiveReports');
const PublicPortal = load(() => import('./pages/PublicPortal'), 'PublicPortal');

function PageFallback() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}
import { ProtectedRoute, RoleHome } from './components/ProtectedRoute';
import { EXECUTIVE_ROLES, ROLE } from './lib/roles';

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Public Learning Portal — approved modules + fullscreen presentation, no login */}
        <Route path="/portal" element={<PublicPortal />} />
        <Route path="/portal/:id/present" element={<ModuleViewer publicMode />} />

        {/* Authenticated but outside the shell (forced after an admin reset) */}
        <Route element={<ProtectedRoute />}>
          <Route path="/change-password" element={<ChangePassword />} />
          {/* Fullscreen presentation: full viewport, no app chrome */}
          <Route path="/modules/:id/present" element={<ModuleViewer />} />
        </Route>

        {/* Authenticated shell: every route below renders inside MainLayout's <Outlet /> */}
        <Route element={<ProtectedRoute />}>
          <Route element={<MainLayout />}>
            <Route path="/" element={<RoleHome />} />

            {/* Shared */}
            <Route path="/modules" element={<Modules />} />
            <Route path="/modules/:id" element={<ModuleDetail />} />
            <Route path="/reports" element={<ReportInbox />} />
            <Route path="/profile" element={<Profile />} />

            {/* Authoring: Trainer & Super Admin */}
            <Route element={<ProtectedRoute allowedRoles={[ROLE.TRAINER, ROLE.SUPER_ADMIN]} />}>
              <Route path="/modules/new" element={<CreateModule />} />
            </Route>

            {/* Executives (0-3) */}
            <Route element={<ProtectedRoute allowedRoles={EXECUTIVE_ROLES} />}>
              <Route path="/dashboard" element={<ExecutiveDashboard />} />
              <Route path="/laporan" element={<ExecutiveReports />} />
            </Route>

            {/* Trainer (4) */}
            <Route element={<ProtectedRoute allowedRoles={[ROLE.TRAINER]} />}>
              <Route path="/reports/new" element={<FieldReport />} />
            </Route>

            {/* Super Admin (0) */}
            <Route element={<ProtectedRoute allowedRoles={[ROLE.SUPER_ADMIN]} />}>
              <Route path="/admin/users" element={<AdminUsers />} />
              <Route path="/admin/access" element={<AdminAccess />} />
              <Route path="/admin/master-data" element={<MasterData />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
