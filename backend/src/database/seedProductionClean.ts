/**
 * Clean operational seed for db_elearning.
 *
 *   npm run db:seed:clean   ->  WIPES learning data (reports, modules, module grants, every user
 *                               except Super Admins, non-primary tenants) and re-seeds the
 *                               4 operational accounts + 3 real modules.
 *   npm run db:seed         ->  upsert only (idempotent, no deletion).
 *
 * Passwords: SEED_PASSWORD (default "password123"); every seeded account has
 * must_change_password = 1, so each person sets their own password at first login.
 */
import mysql, { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { DB_CONFIG } from './db';
import { PRIMARY_TENANT } from './migrate';

const WIPE = process.argv.includes('--wipe');
const PASSWORD = process.env.SEED_PASSWORD || 'password123';
const T = PRIMARY_TENANT.id;

// ── 4 operational accounts ───────────────────────────────────────────────────
const ACCOUNTS = [
  { id: 'usr-exec-nasional', username: 'kapolri', employee_id: 'EXE-NAS-001', full_name: 'Eksekutif Nasional', role_level: 1, scope: 'national' },
  { id: 'usr-exec-jabar', username: 'kapolda_jabar', employee_id: 'EXE-JBR-001', full_name: 'Eksekutif Provinsi Jawa Barat', role_level: 2, scope: 'provinsi' },
  { id: 'usr-exec-depok', username: 'kapolres_depok', employee_id: 'EXE-DPK-001', full_name: 'Eksekutif Kota Depok', role_level: 3, scope: 'kota' },
  { id: 'usr-trainer-depok', username: 'trainer_depok', employee_id: 'TRN-DPK-001', full_name: 'Trainer Kota Depok', role_level: 4, scope: 'kota' },
] as const;

// ── POLRI -> Korlantas -> Dikmas hierarchy (master rows ensured on every run) ────────────
const HIERARCHY = {
  instansi: { id: 'ins-polri', nama: 'Kepolisian Negara Republik Indonesia' },
  organisasi: { id: 'org-polri-korlantas', nama: 'Korps Lalu Lintas', instansi_id: 'ins-polri' },
  satker: [
    { id: 'stk-korlantas-dikmas', nama: 'Direktorat Pendidikan Masyarakat Lalu Lintas (Dikmas Lantas)', organisasi_id: 'org-polri-korlantas' },
    { id: 'stk-korlantas-gakkum', nama: 'Direktorat Penegakan Hukum (Ditgakkum)', organisasi_id: 'org-polri-korlantas' },
    { id: 'stk-korlantas-kamsel', nama: 'Direktorat Keamanan dan Keselamatan (Ditkamsel)', organisasi_id: 'org-polri-korlantas' },
  ],
  sub_org: [
    { id: 'sub-dikmas-edukasi', nama: 'Subdit Pendidikan dan Edukasi Keselamatan Lalu Lintas', satker_id: 'stk-korlantas-dikmas' },
    { id: 'sub-dikmas-kemitraan', nama: 'Subdit Kemitraan dan Sosialisasi Masyarakat', satker_id: 'stk-korlantas-dikmas' },
    { id: 'sub-gakkum-laka', nama: 'Subdit Penanganan Kecelakaan Lalu Lintas (Laka Lantas)', satker_id: 'stk-korlantas-gakkum' },
    { id: 'sub-gakkum-turjawali', nama: 'Subdit Pengaturan, Penjagaan, Pengawalan dan Patroli (Turjawali)', satker_id: 'stk-korlantas-gakkum' },
  ],
  /** Existing legacy rows re-parented under Korlantas so the cascade shows them. */
  relink: { satker: [{ id: 'stk-satlantas-polres', organisasi_id: 'org-polri-korlantas' }], sub_org: [{ id: 'sub-polri-ditlantas', satker_id: 'stk-korlantas-kamsel' }] },
};
const DEFAULT_CHAIN = { instansi: 'ins-polri', org: 'org-polri-korlantas', satker: 'stk-korlantas-dikmas', sub: 'sub-dikmas-edukasi' };

// ── 3 Korlantas / Dikmas Lantas training modules (PENDING approval) ─────────
interface ModuleSeed {
  id: string;
  title: string;
  description: string;
  category: string;
  target_audience: 'TK/SD' | 'MTS/SMP' | 'SMA/SMK' | 'Mahasiswa' | 'Umum';
  duration_minutes: number;
  video_url: string;
  content_text: string;
  quiz: { pass_score: number; time_limit_minutes: number; questions: Array<{ id: string; question: string; options: string[]; answer_index: number }> } | null;
}

const MODULES: ModuleSeed[] = [
  {
    id: 'mod-dikmas-lantas',
    title: 'Manajemen Pendidikan Masyarakat & Keselamatan Lalu Lintas (Dikmas Lantas)',
    description:
      'Konsep, sasaran, dan metode Pendidikan Masyarakat Lalu Lintas: dari perencanaan program, edukasi ke sekolah dan komunitas, hingga pengukuran dampak pada perilaku berkendara. Dilengkapi video webinar keselamatan berlalu lintas untuk pelajar SLTA.',
    category: 'Facilitation',
    target_audience: 'SMA/SMK',
    duration_minutes: 45,
    // Webinar & Sosialisasi Keselamatan Berlalu Lintas tingkat SLTA/sederajat (2024)
    video_url: 'https://www.youtube.com/watch?v=_CQtsVNiTS8',
    content_text: `# Tujuan pembelajaran

Setelah menyelesaikan modul ini peserta mampu:

- Menjelaskan peran Dikmas Lantas dalam sistem keselamatan jalan (road safety) dan kaitannya dengan penegakan hukum dan rekayasa lalu lintas.
- Menyusun rencana kegiatan edukasi yang tepat sasaran untuk pelajar, komunitas, dan pengguna jalan rentan.
- Memfasilitasi sesi edukasi yang interaktif dan mengukur perubahan pengetahuan serta perilaku peserta.

## Mengapa Dikmas Lantas

- Mayoritas kecelakaan lalu lintas dipicu **faktor manusia**: kelalaian, ketidaktahuan aturan, dan sikap abai terhadap risiko.
- Penegakan hukum menekan pelanggaran sesaat; **pendidikan membangun budaya tertib** yang bertahan lama.
- Dikmas Lantas menjadi pintu masuk kemitraan Polri dengan sekolah, kampus, pemerintah daerah, dan komunitas.

## Lima pilar keselamatan jalan

- **Manajemen keselamatan** – koordinasi lintas instansi, data kecelakaan, target penurunan fatalitas.
- **Jalan yang berkeselamatan** – rambu, marka, penerangan, dan fasilitas penyeberangan.
- **Kendaraan yang berkeselamatan** – laik jalan, helm SNI, sabuk keselamatan.
- **Perilaku pengguna jalan** – fokus utama Dikmas Lantas.
- **Penanganan pra dan pasca kecelakaan** – respons cepat dan pertolongan pertama.

## Sasaran dan pendekatan

- **Pelajar TK/SD:** pengenalan dasar melalui permainan, lagu, dan taman lalu lintas.
- **MTS/SMP dan SMA/SMK:** helm dan kelengkapan kendaraan, larangan berkendara tanpa SIM, bahaya ponsel saat berkendara, *police goes to school*.
- **Mahasiswa dan komunitas:** kampanye kreatif, duta keselamatan, riset perilaku, media sosial.
- **Umum:** sosialisasi di pasar, terminal, dan perusahaan; kemitraan dengan pengemudi angkutan umum dan ojek daring.

## Merancang program edukasi

- Tetapkan **satu perilaku yang ingin diubah** per program (misalnya: pemakaian helm oleh pelajar).
- Gunakan data laka lantas setempat untuk memilih lokasi dan kelompok prioritas.
- Rancang pesan dengan formula **masalah – akibat – solusi – ajakan**; hindari menakut-nakuti tanpa solusi.
- Manfaatkan **Mobil Dikmas** (videotron, simulator) dan media digital untuk menjangkau lebih banyak orang.
- Catat setiap sesi sebagai laporan lapangan: lokasi, jumlah peserta, kategori audiens, dan tindak lanjut.

## Mengukur dampak

- **Pre-test dan post-test** singkat pada setiap sesi (5 pertanyaan).
- Observasi lapangan: persentase pemakaian helm di gerbang sekolah sebelum dan sesudah program.
- Indikator hasil: penurunan pelanggaran dan kecelakaan pada kelompok sasaran dalam 3–6 bulan.

---

# Praktik: rancang sesi 30 menit

Susun rencana sesi edukasi untuk satu SMA/SMK di wilayah Anda:

- Perilaku sasaran dan datanya.
- Pesan kunci (maksimal 3).
- Media dan aktivitas interaktif yang digunakan.
- Cara mengukur hasilnya.`,
    quiz: {
      pass_score: 70,
      time_limit_minutes: 15,
      questions: [
        { id: 'q1', question: 'Faktor penyebab kecelakaan lalu lintas yang paling dominan adalah…', options: ['Kondisi jalan', 'Faktor manusia', 'Cuaca'], answer_index: 1 },
        { id: 'q2', question: 'Pilar keselamatan jalan yang menjadi fokus utama Dikmas Lantas adalah…', options: ['Perilaku pengguna jalan', 'Jalan yang berkeselamatan', 'Kendaraan yang berkeselamatan'], answer_index: 0 },
        { id: 'q3', question: 'Formula pesan edukasi yang dianjurkan adalah…', options: ['Ancaman – sanksi – denda', 'Masalah – akibat – solusi – ajakan', 'Statistik – grafik – tabel'], answer_index: 1 },
        { id: 'q4', question: 'Cara paling sederhana mengukur dampak satu sesi edukasi adalah…', options: ['Menghitung jumlah peserta', 'Pre-test dan post-test singkat', 'Menunggu laporan media'], answer_index: 1 },
      ],
    },
  },
  {
    id: 'mod-turjawali',
    title: 'Teknik Pengaturan, Penjagaan, Pengawalan, dan Patroli Jalan Raya (Turjawali)',
    description:
      'Empat fungsi operasional lalu lintas — pengaturan, penjagaan, pengawalan, dan patroli — beserta isyarat tangan baku, prosedur pos, standar pengawalan, dan pola patroli untuk mencegah kecelakaan dan kemacetan. Untuk mahasiswa dan masyarakat umum.',
    category: 'Operations',
    target_audience: 'Mahasiswa',
    duration_minutes: 40,
    // Polisi Lalu Lintas: Mengenal Tugas-tugas Polantas
    video_url: 'https://www.youtube.com/watch?v=pq8S6UAtARw',
    content_text: `# Apa itu Turjawali

**Turjawali** adalah singkatan dari Pengaturan, Penjagaan, Pengawalan, dan Patroli — empat kegiatan inti fungsi lalu lintas untuk mewujudkan **Kamseltibcarlantas**: keamanan, keselamatan, ketertiban, dan kelancaran lalu lintas.

## 1. Pengaturan (regulating)

- Dilakukan di persimpangan, sekolah, pasar, dan lokasi rawan macet pada jam sibuk.
- **12 gerakan isyarat tangan baku**: berhenti (satu arah/dua arah/semua arah), jalan (dari kanan/kiri/depan), percepat, perlambat, dan berhenti sementara.
- Posisi petugas: terlihat jelas, memakai rompi reflektif, tidak membelakangi arus utama.
- Padukan dengan peluit: satu tiupan panjang = berhenti, dua tiupan pendek = jalan.

## 2. Penjagaan (guarding)

- Pos tetap dan pos sementara pada titik strategis: gerbang tol, jembatan timbang, lokasi acara massal.
- Fungsi: kehadiran polisi yang **mencegah** pelanggaran, memberikan informasi, dan respons awal kejadian.
- Prosedur pos: serah terima tugas, buku mutasi, pengecekan sarana (rambu portabel, traffic cone, senter lalu lintas).

## 3. Pengawalan (escorting)

- Pengawalan dilakukan untuk tamu negara, kegiatan kenegaraan, konvoi kemanusiaan, dan situasi darurat (ambulans, pemadam kebakaran) sesuai ketentuan.
- Prinsip: **keselamatan pengguna jalan lain tetap diutamakan**; gunakan sirene dan lampu isyarat secara proporsional.
- Formasi dasar: kendaraan pembuka, kendaraan penutup, koordinasi dengan pos-pos di sepanjang rute.

## 4. Patroli (patrolling)

- Pola patroli: **rute tetap, rute acak, dan patroli sasaran** (lokasi rawan laka/kriminalitas).
- Sasaran patroli: kecepatan berlebih, kendaraan tidak laik jalan, pelanggaran rambu, serta kondisi jalan yang membahayakan (lubang, penerangan padam).
- Setiap temuan dicatat dan dilaporkan; sistem *e-Turjawali* memungkinkan pemantauan kegiatan secara real-time dari tingkat Polres hingga Korlantas.

## Rekayasa lalu lintas situasional

- **Contraflow, one-way, dan ganjil-genap** diterapkan saat volume melebihi kapasitas.
- Keputusan didasarkan pada data pantauan (CCTV NTMC, laporan pos) dan dikomunikasikan lebih dulu kepada publik.

---

# Latihan lapangan

- Praktikkan 12 isyarat tangan secara berpasangan; satu peserta memberi isyarat, pasangan menebak maknanya.
- Susun rencana patroli sasaran untuk satu ruas jalan rawan di wilayah Anda: jam, pola, sasaran, dan format laporan.`,
    quiz: {
      pass_score: 70,
      time_limit_minutes: 12,
      questions: [
        { id: 'q1', question: 'Turjawali terdiri atas…', options: ['Pengaturan, Penjagaan, Pengawalan, Patroli', 'Pengaturan, Penilangan, Pengawasan, Pelaporan', 'Penjagaan, Penyidikan, Pengawalan, Penindakan'], answer_index: 0 },
        { id: 'q2', question: 'Satu tiupan peluit panjang berarti…', options: ['Jalan', 'Berhenti', 'Percepat'], answer_index: 1 },
        { id: 'q3', question: 'Prinsip utama saat melakukan pengawalan adalah…', options: ['Kecepatan konvoi setinggi mungkin', 'Keselamatan pengguna jalan lain tetap diutamakan', 'Sirene dibunyikan terus-menerus'], answer_index: 1 },
        { id: 'q4', question: 'Pola patroli yang diarahkan pada lokasi rawan disebut…', options: ['Patroli rute tetap', 'Patroli sasaran', 'Patroli acak'], answer_index: 1 },
      ],
    },
  },
  {
    id: 'mod-tkp-laka',
    title: 'Investigasi dan Penanganan TKP Kecelakaan Lalu Lintas Modern',
    description:
      'Tindakan pertama di TKP, pengamanan dan pertolongan korban, olah TKP dengan pendekatan ilmiah, pemanfaatan CCTV dan data digital, hingga analisis penyebab untuk pencegahan. Untuk masyarakat umum.',
    category: 'Compliance',
    target_audience: 'Umum',
    duration_minutes: 50,
    // Penyampaian peristiwa laka lantas dari TKP
    video_url: 'https://www.youtube.com/watch?v=hYQip4SVIn4',
    content_text: `# Prinsip penanganan kecelakaan

Tujuan penanganan kecelakaan lalu lintas: **menyelamatkan jiwa, mengamankan TKP, mengungkap penyebab, dan mencegah keberulangan**. Setiap langkah harus terdokumentasi karena menjadi dasar proses hukum dan analisis keselamatan.

## Tindakan Pertama di TKP (TPTKP)

- **Datangi TKP segera**, catat waktu tiba, kondisi cuaca, dan penerangan.
- **Prioritas 1 – korban:** pertolongan pertama, hubungi ambulans/rumah sakit terdekat, catat identitas.
- **Prioritas 2 – keamanan:** pasang traffic cone dan rambu portabel, atur arus agar tidak terjadi kecelakaan susulan.
- **Prioritas 3 – TKP:** batasi area, jangan memindahkan kendaraan/barang bukti sebelum didokumentasikan (kecuali untuk menyelamatkan korban).

## Olah TKP dengan pendekatan ilmiah

- **Dokumentasi:** foto dari empat sudut, sketsa TKP dengan titik acuan tetap, ukur bekas rem, posisi akhir kendaraan, dan serpihan.
- **Barang bukti:** kendaraan, pecahan lampu/kaca, jejak ban, rekaman CCTV/dashcam, ponsel pengemudi (bila relevan dan sesuai prosedur).
- **Saksi:** pisahkan saksi, catat keterangan secara terpisah, sertakan kontak.
- **Kondisi pengemudi:** tes kesadaran, indikasi kelelahan, alkohol, atau narkotika sesuai prosedur.

## Teknologi pendukung investigasi modern

- **CCTV dan ETLE** untuk merekonstruksi kronologi dan mengidentifikasi kendaraan.
- **Data digital kendaraan** (event data recorder) dan aplikasi navigasi/telematika untuk kecepatan dan waktu.
- **Drone dan fotogrametri** untuk pemetaan TKP luas dengan cepat sehingga jalan lebih cepat dibuka.
- **Sistem pelaporan terintegrasi** (misalnya IRSMS) untuk mengolah data kecelakaan menjadi peta lokasi rawan.

## Analisis penyebab dan tindak lanjut

- Gunakan kerangka **manusia – kendaraan – jalan – lingkungan** untuk menetapkan faktor utama dan faktor pendukung.
- Hasil analisis dikirim ke fungsi Dikmas (edukasi) dan rekayasa lalu lintas (perbaikan rambu/marka) — bukan hanya untuk berkas perkara.
- Klasifikasi laka: ringan, sedang, berat; proses penyelesaian dapat melalui penyidikan atau **restorative justice** pada laka ringan sesuai ketentuan.

---

# Studi kasus

Tabrakan sepeda motor dan mobil di persimpangan tanpa APILL pukul 19.30, hujan, korban luka berat.

- Susun urutan tindakan 30 menit pertama.
- Barang bukti dan rekaman apa yang harus diamankan?
- Faktor apa yang paling mungkin menjadi penyebab, dan rekomendasi pencegahan apa yang Anda usulkan?`,
    quiz: {
      pass_score: 70,
      time_limit_minutes: 15,
      questions: [
        { id: 'q1', question: 'Prioritas pertama saat tiba di TKP kecelakaan adalah…', options: ['Memotret kendaraan', 'Menolong korban', 'Mencari saksi'], answer_index: 1 },
        { id: 'q2', question: 'Kendaraan yang terlibat boleh dipindahkan sebelum didokumentasikan hanya jika…', options: ['Mengganggu arus lalu lintas', 'Diperlukan untuk menyelamatkan korban', 'Pemiliknya meminta'], answer_index: 1 },
        { id: 'q3', question: 'Kerangka analisis penyebab kecelakaan yang digunakan adalah…', options: ['Manusia – kendaraan – jalan – lingkungan', 'Pagi – siang – malam', 'Ringan – sedang – berat'], answer_index: 0 },
        { id: 'q4', question: 'Teknologi yang membantu memetakan TKP luas dengan cepat adalah…', options: ['Peluit', 'Drone dan fotogrametri', 'Traffic cone'], answer_index: 1 },
      ],
    },
  },
];

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    await conn.beginTransaction();

    // ── Wipe ────────────────────────────────────────────────────────────────
    if (WIPE) {
      console.log('WIPE: removing learning data and non-admin accounts…');
      const del = async (sql: string, params: unknown[] = []) => Number((await conn.query<ResultSetHeader>(sql, params))[0].affectedRows);
      const n1 = await del(`DELETE FROM tbl_elearning_field_reports`);
      const n2 = await del(`DELETE FROM tbl_elearning_module_tenants`);
      const n3 = await del(`DELETE FROM tbl_elearning_modules`);
      const n4 = await del(`DELETE FROM tbl_elearning_users WHERE role_level <> 0`);
      const n5 = await del(`DELETE FROM tbl_elearning_tenants WHERE id <> ?`, [T]);
      console.log(`  reports ${n1} · module grants ${n2} · modules ${n3} · users ${n4} · extra tenants ${n5}`);
    }

    // ── Region: Jawa Barat -> Kota Depok ───────────────────────────────────
    const nextId = async (table: string) => Number((await conn.query<RowDataPacket[]>(`SELECT COALESCE(MAX(id), 0) + 1 AS n FROM \`${table}\` FOR UPDATE`))[0][0].n);
    const [[prov]] = await conn.query<RowDataPacket[]>(`SELECT id FROM tbl_elearning_provinsi WHERE nama = 'Jawa Barat' LIMIT 1`);
    let jabar = prov ? Number(prov.id) : 0;
    if (!jabar) {
      jabar = await nextId('tbl_elearning_provinsi');
      await conn.query(`INSERT IGNORE INTO tbl_elearning_provinsi (id, nama, kode) VALUES (?, 'Jawa Barat', '32')`, [jabar]);
    }
    const [[kota]] = await conn.query<RowDataPacket[]>(`SELECT id FROM tbl_elearning_kota WHERE provinsi_id = ? AND nama = 'Kota Depok' LIMIT 1`, [jabar]);
    let depok = kota ? Number(kota.id) : 0;
    if (!depok) {
      depok = await nextId('tbl_elearning_kota');
      await conn.query(`INSERT IGNORE INTO tbl_elearning_kota (id, provinsi_id, nama, kode) VALUES (?, ?, 'Kota Depok', '3276')`, [depok, jabar]);
    }

    // ── POLRI -> Korlantas -> Dikmas hierarchy (idempotent upserts) ────────
    await conn.query(`INSERT INTO tbl_elearning_master_instansi (id, nama) VALUES (?, ?) ON DUPLICATE KEY UPDATE nama = VALUES(nama)`, [HIERARCHY.instansi.id, HIERARCHY.instansi.nama]);
    await conn.query(`INSERT INTO tbl_elearning_master_organisasi (id, instansi_id, nama) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE instansi_id = VALUES(instansi_id)`, [HIERARCHY.organisasi.id, HIERARCHY.organisasi.instansi_id, HIERARCHY.organisasi.nama]);
    for (const s of HIERARCHY.satker) await conn.query(`INSERT INTO tbl_elearning_master_satker (id, organisasi_id, nama) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE organisasi_id = VALUES(organisasi_id), nama = VALUES(nama)`, [s.id, s.organisasi_id, s.nama]);
    for (const x of HIERARCHY.sub_org) await conn.query(`INSERT INTO tbl_elearning_master_sub_org (id, satker_id, nama) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE satker_id = VALUES(satker_id), nama = VALUES(nama)`, [x.id, x.satker_id, x.nama]);
    for (const r of HIERARCHY.relink.satker) await conn.query(`UPDATE tbl_elearning_master_satker SET organisasi_id = ? WHERE id = ? AND organisasi_id IS NULL`, [r.organisasi_id, r.id]);
    for (const r of HIERARCHY.relink.sub_org) await conn.query(`UPDATE tbl_elearning_master_sub_org SET satker_id = ? WHERE id = ? AND satker_id IS NULL`, [r.satker_id, r.id]);
    await conn.query(`UPDATE tbl_elearning_tenants SET name = ?, subdomain = ?, legacy_instansi_id = ? WHERE id = ?`, [PRIMARY_TENANT.name, PRIMARY_TENANT.subdomain, HIERARCHY.instansi.id, T]);
    console.log(`Hierarchy: ${HIERARCHY.instansi.nama} -> ${HIERARCHY.organisasi.nama} -> ${HIERARCHY.satker.length} satker -> ${HIERARCHY.sub_org.length} sub-organisasi`);
    const { instansi, org, satker, sub: subOrg } = DEFAULT_CHAIN;

    // ── 4 accounts (upsert by username; ACTIVE; must change password) ─────
    const hash = await bcrypt.hash(PASSWORD, 10);
    let created = 0;
    for (const a of ACCOUNTS) {
      const [[exists]] = await conn.query<RowDataPacket[]>(`SELECT 1 AS x FROM tbl_elearning_users WHERE tenant_id = ? AND username = ? LIMIT 1`, [T, a.username]);
      if (!exists) created++;
      await conn.query(
        `INSERT INTO tbl_elearning_users
           (id, tenant_id, username, employee_id, full_name, email, password_hash, role_level, account_status, provinsi_id, kota_id,
            legacy_instansi_id, legacy_org_id, legacy_satker_id, legacy_sub_org_id, must_change_password, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, 1, NOW())
         ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), role_level = VALUES(role_level), provinsi_id = VALUES(provinsi_id), kota_id = VALUES(kota_id),
           legacy_instansi_id = VALUES(legacy_instansi_id), legacy_org_id = VALUES(legacy_org_id), legacy_satker_id = VALUES(legacy_satker_id), legacy_sub_org_id = VALUES(legacy_sub_org_id)`,
        [
          a.id, T, a.username, a.employee_id, a.full_name, `${a.username}@e-learning.local`, hash, a.role_level,
          a.scope === 'national' ? null : jabar,
          a.scope === 'kota' ? depok : null,
          instansi, org, satker, subOrg,
        ],
      );
    }
    console.log(`Accounts: ${created} created, ${ACCOUNTS.length - created} already present (updated)`);

    // ── 3 modules (PENDING approval, authored by the Depok trainer) ───────
    const trainer = ACCOUNTS.find((a) => a.role_level === 4)!;
    let modulesCreated = 0;
    for (const m of MODULES) {
      const [res] = await conn.query<ResultSetHeader>(
        `INSERT IGNORE INTO tbl_elearning_modules
           (id, tenant_id, created_by, author_id, title, description, content_text, quiz_data, category, target_audience, instructor_name,
            video_url, duration_minutes, has_quiz, approval_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
        [m.id, T, trainer.id, trainer.id, m.title, m.description, m.content_text, m.quiz ? JSON.stringify(m.quiz) : null, m.category, m.target_audience, trainer.full_name, m.video_url, m.duration_minutes, m.quiz ? 1 : 0],
      );
      modulesCreated += res.affectedRows;
    }
    console.log(`Modules: ${modulesCreated} created, ${MODULES.length - modulesCreated} already present`);

    await conn.commit();

    const [users] = await conn.query<RowDataPacket[]>(
      `SELECT u.username, u.role_level, u.account_status, u.must_change_password AS mcp, p.nama AS provinsi, k.nama AS kota
         FROM tbl_elearning_users u LEFT JOIN tbl_elearning_provinsi p ON p.id = u.provinsi_id LEFT JOIN tbl_elearning_kota k ON k.id = u.kota_id
        ORDER BY u.role_level, u.username`,
    );
    console.table(users);
    const [mods] = await conn.query<RowDataPacket[]>(`SELECT id, LEFT(title, 60) AS title, target_audience, approval_status, video_url FROM tbl_elearning_modules ORDER BY title`);
    console.table(mods);
    console.log(`\nSeeded accounts sign in with password "${PASSWORD}" and must set a new password at first login.`);
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
