#!/usr/bin/env bash
# Update the running deployment to the latest `main`:
#   git pull → build backend → migrate DB (idempotent) → build frontend → (re)start both pm2 apps.
#
#   bash /mnt/database/apps/e-learning/deploy/update.sh
#
# Safe to run repeatedly. Never touches backend/.env, frontend/.env, uploads/ or outbox/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== [1/5] git pull"
git pull --ff-only

echo "== [2/5] backend: install + build"
cd "$ROOT/backend"
[ -f .env ] || { echo "!! backend/.env tidak ada — salin dari .env.example dan isi dulu."; exit 1; }
npm ci --no-audit --no-fund
npm run build

echo "== [3/5] database migrate (idempotent)"
npm run db:migrate

echo "== [4/5] frontend: install + build"
cd "$ROOT/frontend"
[ -f .env ] || { echo "!! frontend/.env tidak ada — salin dari .env.example dan isi VITE_API_URL dulu."; exit 1; }
npm ci --no-audit --no-fund
npm run build

echo "== [5/5] pm2 (re)start"
cd "$ROOT"
mkdir -p backend/logs frontend/logs
# `startOrRestart` = start if missing, restart if already registered → survives the "pm2 list is empty" case.
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save

echo
pm2 ls
echo "== selesai. Cek: curl -s http://localhost:4006/api/public/modules | head -c 120; echo"
