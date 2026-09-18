#!/usr/bin/env bash
# Use when `pm2 ls` is empty / the apps "disappeared" (reboot without pm2 startup, pm2 daemon
# killed, or pm2 run as a different user). Re-registers both services from ecosystem.config.cjs
# and installs the systemd unit so pm2 comes back after every reboot.
#
#   bash /mnt/database/apps/e-learning/deploy/restore-pm2.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

command -v pm2 >/dev/null || { echo "pm2 tidak ada → npm i -g pm2"; npm i -g pm2; }

# Build outputs must exist; rebuild if missing (e.g. fresh clone).
[ -f backend/dist/server.js ] || (cd backend && npm ci --no-audit --no-fund && npm run build)
[ -f frontend/dist/index.html ] || (cd frontend && npm ci --no-audit --no-fund && npm run build)

mkdir -p backend/logs frontend/logs
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 save

# Persist across reboots: systemd unit for the CURRENT user (root → /root/.pm2).
# pm2 prints a `sudo env PATH=... pm2 startup ...` line only when it cannot do it itself.
pm2 startup systemd -u "$(id -un)" --hp "$HOME" >/dev/null 2>&1 || pm2 startup
pm2 save

echo
pm2 ls
systemctl is-enabled "pm2-$(id -un)" 2>/dev/null && echo "systemd unit pm2-$(id -un): enabled (auto-start saat reboot)" || true
