import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes';
import modulesRoutes from './routes/modulesRoutes';
import reportsRoutes from './routes/reportsRoutes';
import notificationsRoutes from './routes/notificationsRoutes';
import aleshaRoutes from './routes/aleshaRoutes';
import analyticsRoutes from './routes/analyticsRoutes';
import adminRoutes from './routes/adminRoutes';
import masterRoutes from './routes/masterRoutes';
import { runMigration } from './database/migrate';
import { UPLOAD_ROOT } from './controllers/authController';
import { getPublicModule, listPublicModules } from './controllers/modulesController';
import { tenantResolver } from './middlewares/tenantResolver';
import { authenticate } from './middlewares/authenticate';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT_BE || process.env.PORT || 4006);

app.use(cors({ origin: process.env.CORS_ORIGIN?.split(',').map((o) => o.trim()).filter(Boolean) ?? true }));
app.use(express.json({ limit: '24mb' })); // base64 uploads: avatar (<= 2 MB) and 2-4 report photos (<= 4 MB each, decoded)

// Uploaded files (profile photos)
app.use('/uploads', express.static(UPLOAD_ROOT, { maxAge: '7d', index: false }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public auth routes — tenant is derived from header/subdomain inside the controller.
app.use('/api/auth', authRoutes);

// Public cascading reference data (provinsi/kota, instansi -> organisasi -> satker -> sub-org).
app.use('/api/master', masterRoutes);

// Alesha AI assistant (chat + voice). Dummy engine until ALESHA_API_URL / an LLM is wired in.
app.use('/api/alesha', aleshaRoutes);

// Public share link — counts public_view_count, exposes quiz without answers.
app.get('/api/public/modules', listPublicModules);
app.get('/api/public/modules/:id', getPublicModule);

// Protected, tenant-scoped feature routes.
const protectedChain = [tenantResolver, authenticate];
app.use('/api/modules', protectedChain, modulesRoutes);
app.use('/api/reports', protectedChain, reportsRoutes);
app.use('/api/notifications', protectedChain, notificationsRoutes);
app.use('/api/analytics', protectedChain, analyticsRoutes);
app.use('/api/admin', protectedChain, adminRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found', message: 'Route does not exist' });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Idempotent schema/seed on every boot: CREATE IF NOT EXISTS + count-guarded seeds; never resets data.
runMigration()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`API server listening on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Database initialisation failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
