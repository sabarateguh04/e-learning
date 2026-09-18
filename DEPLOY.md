# Deploy — E-Learning & Field Monitoring

Backend: Node 20+ / Express, port **4006** · Frontend: Vite build (static), port **4007** · DB: MySQL 8 (`db_elearning`).

## 1. Prasyarat di server (Ubuntu/Debian)

```bash
sudo apt update && sudo apt install -y git mysql-server nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
sudo npm i -g pm2
node -v && npm -v && mysql --version
```

## 2. Database & user MySQL

```bash
sudo mysql
```
```sql
CREATE DATABASE IF NOT EXISTS db_elearning CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'db_elearning'@'localhost' IDENTIFIED BY 'db_elearning';
GRANT ALL PRIVILEGES ON db_elearning.* TO 'db_elearning'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```
Tabel, kolom, master wilayah (38 provinsi / 514 kab-kota), tenant, Super Admin, dan matriks menu
dibuat otomatis oleh migrasi (idempoten — aman dijalankan berulang).

## 3. Clone proyek

```bash
sudo mkdir -p /var/www && sudo chown $USER:$USER /var/www
cd /var/www && git clone https://github.com/sabarateguh04/e-learning.git
cd e-learning
```

## 4. Backend

```bash
cd /var/www/e-learning/backend
cp .env.example .env && nano .env
```
Isi `.env`:
```env
PORT_BE=4006
JWT_SECRET=<string acak panjang, mis. hasil: openssl rand -hex 32>
JWT_EXPIRES_IN=24h
CORS_ORIGIN=http://IP-ATAU-DOMAIN:4007      # origin frontend (pisahkan koma jika lebih dari satu)

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=db_elearning
DB_PASSWORD=db_elearning
DB_NAME=db_elearning
LEGACY_DB_NAME=                             # kosongkan — proyek ini standalone, tidak menyentuh DB lain

CAPTCHA_DISABLED=false
MAIL_SIMULATE=true                          # e-mail ditulis ke backend/outbox/mail.log
ADMIN_CONTACT_EMAIL=admin@domain.go.id
ADMIN_CONTACT_PHONE=
SEED_ADMIN_USERNAME=adm-0001                # opsional
SEED_ADMIN_PASSWORD=password123             # opsional — ganti, lalu wajib diubah saat login pertama
```
```bash
npm ci
npm run build          # -> dist/
npm run db:migrate     # skema + seed dasar + wilayah Indonesia (idempoten)
npm run db:seed        # hierarki POLRI > Korlantas > Dikmas, 4 akun operasional, 3 modul (idempoten, tanpa wipe)
pm2 start dist/server.js --name e-learning-api
pm2 save && pm2 startup   # jalankan perintah yang ditampilkan agar auto-start saat reboot
curl http://localhost:4006/api/public/modules
```
> `npm run db:seed:clean` = **menghapus** laporan/modul/akun non-admin lalu seed ulang — hanya untuk reset total.

## 5. Frontend

```bash
cd /var/www/e-learning/frontend
cp .env.example .env && nano .env
```
```env
VITE_API_URL=http://IP-ATAU-DOMAIN:4006/api   # harus bisa diakses dari browser pengguna
PORT_FE=4007
```
```bash
npm ci
npm run build          # -> dist/
pm2 serve dist 4007 --name e-learning-web --spa
pm2 save
```
Buka `http://IP-ATAU-DOMAIN:4007`.

## 6. (Disarankan) Nginx + domain + HTTPS

```nginx
# /etc/nginx/sites-available/elearning
server {
    listen 80;
    server_name elearning.domain.go.id;

    location /api/     { proxy_pass http://127.0.0.1:4006/api/;     proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; client_max_body_size 30m; }
    location /uploads/ { proxy_pass http://127.0.0.1:4006/uploads/; }
    location /         { proxy_pass http://127.0.0.1:4007/; }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/elearning /etc/nginx/sites-enabled/ && sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d elearning.domain.go.id
```
Dengan Nginx, set `VITE_API_URL=https://elearning.domain.go.id/api` (rebuild frontend) dan `CORS_ORIGIN=https://elearning.domain.go.id`.
`client_max_body_size 30m` diperlukan untuk unggah 2–4 foto bukti lap kegiatan.

## 7. Firewall

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443
# tanpa Nginx: sudo ufw allow 4006 && sudo ufw allow 4007
sudo ufw enable
```

## 8. Akun awal

| Username | Peran | Password awal |
|---|---|---|
| `adm-0001` | Super Admin | `SEED_ADMIN_PASSWORD` (default `password123`) — wajib ganti saat login pertama |
| `kapolri` | Eksekutif Nasional | `SEED_PASSWORD` (default `password123`) — wajib ganti |
| `kapolda_jabar` | Eksekutif Provinsi (Jawa Barat) | idem |
| `kapolres_depok` | Eksekutif Kota (Depok) | idem |
| `trainer_depok` | Trainer (Depok) | idem |

## 9. Update versi berikutnya

Cara singkat: `bash deploy/update.sh` (lihat juga `SERVER-NOTES.md` untuk pemulihan pm2 dan `ecosystem.config.cjs`). Manual:

```bash
cd /var/www/e-learning && git pull
cd backend  && npm ci && npm run build && npm run db:migrate && pm2 restart e-learning-api
cd ../frontend && npm ci && npm run build && pm2 restart e-learning-web
```
Folder `backend/uploads/` (foto profil & bukti laporan) dan `backend/outbox/` tidak tersentuh oleh `git pull` (di-ignore).
