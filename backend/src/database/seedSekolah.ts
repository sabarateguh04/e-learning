/**
 * Demo SCHOOL tenant for the multi-tenant (main-tenant) branch — a self-contained workspace that
 * exercises the "pendidikan" vocabulary and the UNIT_HEAD approval flow:
 *
 *   tenant  "SMA Negeri 1 Depok" (subdomain: sma1depok, vertical: pendidikan, approval: UNIT_HEAD)
 *   mapping ins-kemendikdasmen -> org-kemendikdasmen-paud -> stk-sma1-depok (the school) -> sub-sma1-{ipa,ips}
 *   akun    kepsek_sma1 (Kepala Sekolah / Pimpinan Unit), guru_sma1_ani, guru_sma1_budi (Guru / Trainer)
 *   materi  2 bahan ajar APPROVED authored by the teachers (the public catalogue stays instansi-fenced)
 *
 *   npm run db:seed:sekolah     (idempotent: INSERT IGNORE / ON DUPLICATE KEY UPDATE — never deletes)
 *
 * Passwords: SEED_PASSWORD (default "password123"), must_change_password = 1.
 */
import 'dotenv/config';
import mysql, { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { DB_CONFIG } from './db';

const PASSWORD = process.env.SEED_PASSWORD || 'password123';

const TENANT = { id: 'tenant-sma1-depok', name: 'SMA Negeri 1 Depok', subdomain: 'sma1depok', instansi_id: 'ins-kemendikdasmen', theme_color: '#16a34a' };
const SETTINGS = { vertical: 'pendidikan', approval_flow: 'UNIT_HEAD' };

const MASTER = {
  instansi: { id: 'ins-kemendikdasmen', nama: 'Kementerian Pendidikan Dasar dan Menengah' },
  organisasi: { id: 'org-kemendikdasmen-paud', instansi_id: 'ins-kemendikdasmen', nama: 'Direktorat Jenderal Pendidikan Anak Usia Dini, Pendidikan Dasar, dan Pendidikan Menengah' },
  satker: { id: 'stk-sma1-depok', organisasi_id: 'org-kemendikdasmen-paud', nama: 'SMA Negeri 1 Depok' },
  sub_org: [
    { id: 'sub-sma1-ipa', satker_id: 'stk-sma1-depok', nama: 'Rumpun MIPA' },
    { id: 'sub-sma1-ips', satker_id: 'stk-sma1-depok', nama: 'Rumpun IPS & Bahasa' },
  ],
};

const PROVINSI_KODE = '32'; // Jawa Barat
const KOTA_KODE = '3276'; // Kota Depok

interface Account { id: string; username: string; employee_id: string; full_name: string; role_level: number; sub: string }
const ACCOUNTS: Account[] = [
  { id: 'usr-sma1-kepsek', username: 'kepsek_sma1', employee_id: 'SMA1-KS-001', full_name: 'Dra. Sri Wahyuni, M.Pd. (Kepala Sekolah)', role_level: 5, sub: 'sub-sma1-ipa' },
  { id: 'usr-sma1-guru-ani', username: 'guru_sma1_ani', employee_id: 'SMA1-GR-001', full_name: 'Ani Lestari, S.Pd. (Guru Biologi)', role_level: 4, sub: 'sub-sma1-ipa' },
  { id: 'usr-sma1-guru-budi', username: 'guru_sma1_budi', employee_id: 'SMA1-GR-002', full_name: 'Budi Santoso, S.Pd. (Guru Sejarah)', role_level: 4, sub: 'sub-sma1-ips' },
];

const q4 = (id: string, question: string, options: string[], answer_index: number) => ({ id, question, options, answer_index });

const MODULES = [
  {
    id: 'mod-sma1-fotosintesis',
    author: 'usr-sma1-guru-ani',
    title: 'Fotosintesis: Bagaimana Tumbuhan Membuat Makanan',
    description: 'Reaksi terang dan siklus Calvin dijelaskan dengan animasi, percobaan sederhana daun & cahaya, serta kuis pemahaman untuk kelas XII MIPA.',
    category: 'Biologi',
    target_audience: 'SMA/SMK',
    duration_minutes: 45,
    video_url: 'https://www.youtube.com/watch?v=sQK3Yr4Sc_k', // Amoeba Sisters — Photosynthesis
    content_text: `# Tujuan pembelajaran

Setelah sesi ini siswa mampu:

- Menjelaskan persamaan umum fotosintesis dan peran klorofil.
- Membedakan **reaksi terang** (membran tilakoid) dan **reaksi gelap / siklus Calvin** (stroma).
- Merancang percobaan sederhana untuk membuktikan bahwa fotosintesis membutuhkan cahaya.

## Ringkasan

1. Fotosintesis: 6CO₂ + 6H₂O + cahaya → C₆H₁₂O₆ + 6O₂.
2. Reaksi terang menghasilkan ATP dan NADPH; oksigen dilepas dari pemecahan air.
3. Siklus Calvin memakai ATP & NADPH untuk mengikat CO₂ menjadi glukosa.
4. Faktor pembatas: intensitas cahaya, kadar CO₂, suhu, dan air.

## Kegiatan

- Percobaan Sachs: tutup sebagian daun dengan aluminium foil, uji amilum dengan iodin.
- Diskusi kelompok: mengapa daun yang ditutup tidak berwarna biru kehitaman?`,
    quiz: {
      pass_score: 70,
      time_limit_minutes: 10,
      questions: [
        q4('q1', 'Di bagian kloroplas manakah reaksi terang berlangsung?', ['Stroma', 'Membran tilakoid', 'Membran luar'], 1),
        q4('q2', 'Gas yang dilepaskan tumbuhan saat fotosintesis adalah…', ['Karbon dioksida', 'Nitrogen', 'Oksigen'], 2),
        q4('q3', 'Produk reaksi terang yang dipakai dalam siklus Calvin adalah…', ['ATP dan NADPH', 'Glukosa dan air', 'Klorofil dan CO₂'], 0),
      ],
    },
  },
  {
    id: 'mod-sma1-proklamasi',
    author: 'usr-sma1-guru-budi',
    title: 'Detik-Detik Proklamasi 17 Agustus 1945',
    description: 'Kronologi peristiwa Rengasdengklok hingga pembacaan teks proklamasi, tokoh-tokoh yang terlibat, dan makna kemerdekaan bagi generasi sekarang.',
    category: 'Sejarah',
    target_audience: 'SMA/SMK',
    duration_minutes: 40,
    video_url: 'https://www.youtube.com/watch?v=3jUaOvIkFXM', // Arsip Nasional / Kemdikbud — Proklamasi
    content_text: `# Tujuan pembelajaran

- Menyusun kronologi 15–17 Agustus 1945 secara runtut.
- Menjelaskan peran Soekarno, Hatta, Sayuti Melik, dan golongan muda.
- Merefleksikan makna proklamasi dalam kehidupan sehari-hari.

## Kronologi singkat

1. **15 Agustus** — Jepang menyerah kepada Sekutu; golongan muda mendesak proklamasi segera.
2. **16 Agustus** — Peristiwa Rengasdengklok; malamnya naskah disusun di rumah Laksamana Maeda.
3. **17 Agustus, 10.00 WIB** — Teks proklamasi dibacakan di Jl. Pegangsaan Timur 56, Jakarta.

## Kegiatan

- Bermain peran: siswa memerankan tokoh dalam perumusan naskah.
- Tulis refleksi 1 paragraf: "Merdeka bagi saya berarti…"`,
    quiz: {
      pass_score: 70,
      time_limit_minutes: 10,
      questions: [
        q4('q1', 'Siapa yang mengetik naskah proklamasi?', ['Sayuti Melik', 'Ahmad Soebardjo', 'Sukarni'], 0),
        q4('q2', 'Di mana teks proklamasi dibacakan?', ['Lapangan Ikada', 'Jl. Pegangsaan Timur 56', 'Rumah Laksamana Maeda'], 1),
        q4('q3', 'Peristiwa Rengasdengklok terjadi pada tanggal…', ['15 Agustus 1945', '16 Agustus 1945', '18 Agustus 1945'], 1),
      ],
    },
  },
];

async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  const hash = await bcrypt.hash(PASSWORD, 10);
  try {
    await conn.beginTransaction();

    const [[prov]] = await conn.query<RowDataPacket[]>(`SELECT id FROM tbl_elearning_provinsi WHERE kode = ? LIMIT 1`, [PROVINSI_KODE]);
    const [[kota]] = await conn.query<RowDataPacket[]>(`SELECT id FROM tbl_elearning_kota WHERE kode = ? LIMIT 1`, [KOTA_KODE]);
    if (!prov || !kota) throw new Error('Wilayah belum ada — jalankan "npm run db:migrate" dulu.');

    // master mapping (upsert; never deletes)
    await conn.query(`INSERT INTO tbl_elearning_master_instansi (id, nama) VALUES (?, ?) ON DUPLICATE KEY UPDATE nama = VALUES(nama)`, [MASTER.instansi.id, MASTER.instansi.nama]);
    await conn.query(`INSERT INTO tbl_elearning_master_organisasi (id, instansi_id, nama) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE instansi_id = VALUES(instansi_id), nama = VALUES(nama)`, [MASTER.organisasi.id, MASTER.organisasi.instansi_id, MASTER.organisasi.nama]);
    await conn.query(`INSERT INTO tbl_elearning_master_satker (id, organisasi_id, nama) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE organisasi_id = VALUES(organisasi_id), nama = VALUES(nama)`, [MASTER.satker.id, MASTER.satker.organisasi_id, MASTER.satker.nama]);
    for (const x of MASTER.sub_org) await conn.query(`INSERT INTO tbl_elearning_master_sub_org (id, satker_id, nama) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE satker_id = VALUES(satker_id), nama = VALUES(nama)`, [x.id, x.satker_id, x.nama]);

    // tenant + settings
    await conn.query(
      `INSERT INTO tbl_elearning_tenants (id, name, subdomain, legacy_instansi_id, theme_color) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name), legacy_instansi_id = VALUES(legacy_instansi_id), theme_color = VALUES(theme_color)`,
      [TENANT.id, TENANT.name, TENANT.subdomain, TENANT.instansi_id, TENANT.theme_color],
    );
    await conn.query(
      `INSERT INTO tbl_tenant_settings (tenant_id, vertical, approval_flow) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE vertical = VALUES(vertical), approval_flow = VALUES(approval_flow)`,
      [TENANT.id, SETTINGS.vertical, SETTINGS.approval_flow],
    );

    // accounts
    let created = 0;
    for (const a of ACCOUNTS) {
      const [[exists]] = await conn.query<RowDataPacket[]>(`SELECT 1 AS x FROM tbl_elearning_users WHERE tenant_id = ? AND username = ? LIMIT 1`, [TENANT.id, a.username]);
      if (!exists) created++;
      await conn.query(
        `INSERT INTO tbl_elearning_users
           (id, tenant_id, username, employee_id, full_name, email, password_hash, role_level, account_status, provinsi_id, kota_id,
            legacy_instansi_id, legacy_org_id, legacy_satker_id, legacy_sub_org_id, must_change_password, approved_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, ?, ?, 1, NOW())
         ON DUPLICATE KEY UPDATE full_name = VALUES(full_name), role_level = VALUES(role_level), provinsi_id = VALUES(provinsi_id), kota_id = VALUES(kota_id),
           legacy_instansi_id = VALUES(legacy_instansi_id), legacy_org_id = VALUES(legacy_org_id), legacy_satker_id = VALUES(legacy_satker_id), legacy_sub_org_id = VALUES(legacy_sub_org_id)`,
        [a.id, TENANT.id, a.username, a.employee_id, a.full_name, `${a.username}@sinau.local`, hash, a.role_level, Number(prov.id), Number(kota.id), MASTER.instansi.id, MASTER.organisasi.id, MASTER.satker.id, a.sub],
      );
    }

    // modules (APPROVED so the trial has content on day one; INSERT IGNORE never overwrites edits)
    let modulesCreated = 0;
    for (const m of MODULES) {
      const [[author]] = await conn.query<RowDataPacket[]>(`SELECT full_name FROM tbl_elearning_users WHERE id = ?`, [m.author]);
      const [res] = await conn.query<ResultSetHeader>(
        `INSERT IGNORE INTO tbl_elearning_modules
           (id, tenant_id, created_by, author_id, title, description, content_text, quiz_data, category, target_audience, instructor_name,
            video_url, duration_minutes, has_quiz, approval_status, published_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'APPROVED', NOW())`,
        [m.id, TENANT.id, m.author, m.author, m.title, m.description, m.content_text, JSON.stringify(m.quiz), m.category, m.target_audience, author?.full_name ?? 'Guru', m.video_url, m.duration_minutes],
      );
      modulesCreated += res.affectedRows;
    }
    await conn.commit();

    console.log(`Tenant ${TENANT.name} (subdomain ${TENANT.subdomain}) · vertical ${SETTINGS.vertical} · approval ${SETTINGS.approval_flow}`);
    console.log(`  akun +${created}/${ACCOUNTS.length} · bahan ajar +${modulesCreated}/${MODULES.length} (APPROVED)`);
    console.table(ACCOUNTS.map((a) => ({ username: a.username, peran: a.role_level === 5 ? 'Kepala Sekolah (Pimpinan Unit)' : 'Guru (Trainer)', nama: a.full_name })));
    console.log(`\nLogin: pilih workspace "${TENANT.name}" di halaman login, password "${PASSWORD}" (wajib ganti saat login pertama).`);
    console.log('Alur: Guru mengisi jurnal -> Kepala Sekolah menyetujui. Pengawas/Kementerian belum ada di tenant ini.');
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error('Seed failed:', err.message ?? err);
  process.exit(1);
});
