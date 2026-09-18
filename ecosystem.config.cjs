/**
 * PM2 process definition — one command restores BOTH services on the server:
 *
 *   cd /mnt/database/apps/e-learning && pm2 start ecosystem.config.cjs && pm2 save
 *
 * - e-learning-api : Express backend, reads backend/.env (dotenv, cwd = backend), port PORT_BE (4006)
 * - e-learning-web : static frontend build (frontend/dist) served as an SPA on port 4007
 *
 * Override the web port with:  PORT_FE=4007 pm2 start ecosystem.config.cjs
 */
const path = require('node:path');

const ROOT = __dirname;
const WEB_PORT = Number(process.env.PORT_FE || 4007);

module.exports = {
  apps: [
    {
      name: 'e-learning-api',
      cwd: path.join(ROOT, 'backend'),
      script: 'dist/server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      max_memory_restart: '512M',
      time: true,
      env: { NODE_ENV: 'production' },
      out_file: path.join(ROOT, 'backend', 'logs', 'api.out.log'),
      error_file: path.join(ROOT, 'backend', 'logs', 'api.err.log'),
      merge_logs: true,
    },
    {
      name: 'e-learning-web',
      cwd: path.join(ROOT, 'frontend'),
      script: 'serve', // pm2's built-in static server
      autorestart: true,
      time: true,
      env: {
        PM2_SERVE_PATH: path.join(ROOT, 'frontend', 'dist'),
        PM2_SERVE_PORT: WEB_PORT,
        PM2_SERVE_SPA: 'true',
        PM2_SERVE_HOMEPAGE: '/index.html',
      },
      out_file: path.join(ROOT, 'frontend', 'logs', 'web.out.log'),
      error_file: path.join(ROOT, 'frontend', 'logs', 'web.err.log'),
      merge_logs: true,
    },
  ],
};
