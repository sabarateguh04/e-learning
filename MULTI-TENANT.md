# SINAU — Branch `main-tenant` (multi-tenant & SaaS)

Branch ini menyiapkan SINAU menjadi SaaS multi-tenant **tanpa mengganggu `main`** yang berjalan di server.
Aturan branch:

- Tabel lama (`tbl_elearning_*`) **tidak diubah strukturnya**. Tambahan hanya berupa baris data (mis. matriks menu untuk role baru).
- Tabel baru memakai prefix **`tbl_tenant_*`**.
- Migrasi tetap idempoten; menjalankan branch ini di DB `main` aman, tetapi untuk uji coba **disarankan DB terpisah** (`DB_NAME=db_sinau_tenant`).

## Model yang dipakai

| Konsep | Arti | Contoh |
|---|---|---|
| **Tenant** | Organisasi yang berlangganan & mengelola — batas isolasi data | Korlantas POLRI, SMA Negeri 1 Depok, Dinas Pendidikan Kota X |
| **Unit** (= *satker*) | Tempat orang bekerja; setiap akun milik satu unit | SMA Negeri 1 Depok, Polres Depok |
| **Wilayah** | Cakupan pengawasan (provinsi/kota) | Jawa Barat, Kota Depok |

Kementerian membeli → 1 tenant besar berisi ribuan unit (sekolah). Sekolah membeli sendiri → 1 tenant kecil berisi 1 unit.
Kode sama; yang beda hanya siapa membuat tenant dan berapa unit di dalamnya.

## Hierarki peran (6 tingkat)

| Level | Kode | Generik | Vertikal *pendidikan* | Cakupan |
|---|---|---|---|---|
| 0 | `SUPER_ADMIN` | Super Admin | Super Admin | platform, semua tenant |
| 1 | `EXEC_NATIONAL` | Eksekutif Nasional | Kementerian | seluruh tenant |
| 2 | `EXEC_PROVINCE` | Eksekutif Provinsi | Pengawas Provinsi | provinsi + instansinya |
| 3 | `EXEC_CITY` | Eksekutif Kota | Pengawas Kota/Kabupaten | kota + instansinya |
| **5** | **`UNIT_HEAD`** | **Pimpinan Unit** | **Kepala Sekolah** | **1 unit (satker)** — memantau & menyetujui trainer di unitnya |
| 4 | `TRAINER` | Trainer | Guru | laporannya sendiri |

Nomor **5** dipakai untuk Pimpinan Unit agar data `role_level` yang sudah ada tidak perlu diubah; urutan tampilan memakai `ROLE_ORDER` / `ROLE_RANK`, bukan angka mentahnya.

## Tahap 1 — SELESAI di branch ini

- Level **Pimpinan Unit** (backend + frontend): pagar data ke unitnya (laporan, trainer, akses materi, filter terkunci), muncul di form Register & Manajemen User (wajib memilih unit), matriks menu (`dashboard, executive_reports, reports_inbox, modules`).
- **`tbl_tenant_settings`** (`tenant_id`, `vertical`, `approval_flow`):
  - `vertical` = `pemerintahan` (default) | `pendidikan` | `korporasi` → memilih kosakata (`backend/src/services/vocabulary.ts`, `frontend/src/lib/vocab.ts`). Label peran, menu sidebar, judul halaman, filter bar mengikuti kosakata tenant (Guru / Sekolah / Isi Jurnal / Bahan Ajar …).
  - `approval_flow` = `TERRITORY` (default, seperti `main`: trainer → eksekutif kota/provinsi) | `UNIT_HEAD` (trainer → Pimpinan Unit). Level penyetuju direkam saat laporan dikirim.
- **Isolasi tenant** pada katalog materi (akun hanya melihat materi tenant-nya; portal publik tetap global).
- **Pemilih workspace** di halaman login (`GET /api/auth/tenants`), tampil bila tenant lebih dari satu.
- Seed tenant sekolah demo: `npm run db:seed:sekolah` → tenant *SMA Negeri 1 Depok* (`pendidikan`, `UNIT_HEAD`), akun `kepsek_sma1` (Kepala Sekolah), `guru_sma1_ani`, `guru_sma1_budi`, 2 bahan ajar APPROVED. Password `password123`, wajib ganti.

### Menjalankan uji coba sekolah

```bash
git checkout main-tenant
cd backend && npm ci && npm run build
# .env: arahkan DB_NAME ke database terpisah, mis. db_sinau_tenant (buat dulu di MySQL)
npm run db:migrate && npm run db:seed && npm run db:seed:sekolah
# frontend: npm ci && npm run build, lalu jalankan keduanya (pm2 dengan nama berbeda dari main, port berbeda)
```
Login → pilih workspace **SMA Negeri 1 Depok** → `guru_sma1_ani` mengisi jurnal → `kepsek_sma1` menyetujui.

## Tahap berikutnya

| Tahap | Isi |
|---|---|
| 2 | Master pemetaan per tenant (`tbl_tenant_master_*` atau kolom `tenant_id` + template), panel Super Admin **Kelola Tenant** (buat tenant, salin template, set vertical/approval, masa trial), Super Admin lintas tenant |
| 3 | **Langganan**: `tbl_tenant_plans`, `tbl_tenant_subscriptions` (plan, status trialing/active/past_due/cancelled, kuota akun & unit, tanggal berakhir), pembayaran manual, notifikasi masa habis |
| 4 | Pendaftaran mandiri "Daftarkan sekolah Anda" + subdomain per tenant |
| 5 | Tenant bertingkat (gabungkan sekolah ke Dinas), payment gateway, akun siswa / Digital Handbook individu |
