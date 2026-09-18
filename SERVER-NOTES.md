# Catatan Server — E-Learning (djalu)

Referensi cepat untuk server yang sedang berjalan. Panduan instalasi dari nol ada di `DEPLOY.md`.

| Item | Nilai |
|---|---|
| Lokasi proyek | `/mnt/database/apps/e-learning` |
| Repo | `https://github.com/sabarateguh04/e-learning` (branch `main`) |
| Backend | pm2 `elearning-api` → `backend/dist/server.js`, port **4006** |
| Frontend | pm2 `elearning-web` → `frontend/dist` (static SPA), port **4007** |
| URL | `http://172.20.4.220:4007` (app) · `http://172.20.4.220:4007/portal` (portal publik) · `http://172.20.4.220:4006/api` (API) |
| Database | MySQL 8, db `db_elearning`, user `db_elearning` (localhost) |
| Config rahasia | `backend/.env`, `frontend/.env` — **tidak** ada di git, jangan dihapus |
| Data upload | `backend/uploads/` (foto profil & bukti lap kegiatan), `backend/outbox/mail.log` (e-mail simulasi) |
| Proses definisi | `ecosystem.config.cjs` (root repo) |

## Perintah harian

```bash
cd /mnt/database/apps/e-learning

pm2 ls                              # status kedua service
pm2 logs elearning-api --lines 100  # log backend
pm2 logs elearning-web --lines 50   # log frontend
pm2 restart elearning-api           # setelah ubah backend/.env
pm2 restart elearning-web
```

## Update ke versi terbaru

```bash
bash /mnt/database/apps/e-learning/deploy/update.sh
```
Isinya: `git pull` → build backend → `db:migrate` (idempoten) → build frontend → `pm2 startOrRestart ecosystem.config.cjs` → `pm2 save`.

## Kalau pm2 "hilang" (`pm2 ls` kosong / service tidak ada setelah reboot)

Penyebab umum: `pm2 startup` belum dipasang (setelah reboot daemon pm2 mulai dari daftar kosong),
daemon pm2 dimatikan, atau login sebagai user lain (pm2 milik `root` ada di `/root/.pm2`, user lain punya daftar sendiri).

```bash
bash /mnt/database/apps/e-learning/deploy/restore-pm2.sh
```
Skrip ini: mendaftarkan ulang kedua service dari `ecosystem.config.cjs`, `pm2 save`, dan memasang unit systemd
`pm2-root` supaya otomatis naik saat reboot. Setelahnya `pm2 ls` harus menampilkan `elearning-api` dan `elearning-web` **online**.

Manual (kalau skrip tidak bisa dijalankan):
```bash
cd /mnt/database/apps/e-learning
pm2 start ecosystem.config.cjs      # atau: pm2 resurrect   (memuat daftar terakhir dari `pm2 save`)
pm2 save
pm2 startup systemd -u root --hp /root   # jalankan perintah yang dicetak jika diminta
```

Cek auto-start sudah terpasang:
```bash
systemctl status pm2-root --no-pager | head -5
```

## Cek kesehatan cepat

```bash
ss -ltnp | grep -E '4006|4007'
curl -s http://localhost:4006/api/public/modules | head -c 200; echo
curl -sI http://localhost:4007 | head -1
curl -sI -H "Origin: http://172.20.4.220:4007" http://localhost:4006/api/public/modules | grep -i access-control
```

## Ubah alamat / domain

- Frontend memanggil API dari nilai `VITE_API_URL` di `frontend/.env` — **di-bake saat build**, jadi setelah diubah: `cd frontend && npm run build && pm2 restart elearning-web`.
- Backend hanya menerima origin di `CORS_ORIGIN` (`backend/.env`, pisahkan koma) → `pm2 restart elearning-api`.
- Pindah ke domain + HTTPS: lihat `DEPLOY.md` bagian 6 (Nginx reverse proxy, `client_max_body_size 30m` untuk unggah foto).

## Database

```bash
cd /mnt/database/apps/e-learning/backend
npm run db:migrate        # skema + wilayah 38 provinsi/514 kab-kota — aman diulang kapan pun
npm run db:seed           # hierarki Korlantas/Dikmas, akun operasional, 3 modul — upsert, tanpa hapus
npm run db:seed:regions   # hanya wilayah
# npm run db:seed:clean   # BAHAYA: menghapus laporan/modul/akun non-admin lalu seed ulang
```
Backup cepat: `mysqldump -u db_elearning -p db_elearning > /mnt/database/backup/db_elearning-$(date +%F).sql`

## Akun awal
`adm-0001` (Super Admin), `kapolri`, `kapolda_jabar`, `kapolres_depok`, `trainer_depok` — password awal `password123`, wajib diganti saat login pertama. Modul seed berstatus PENDING sampai disetujui Super Admin (*Access Management → Persetujuan Materi*).
