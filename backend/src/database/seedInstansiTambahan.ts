/**
 * Seed 4 additional institutions (multi-instansi portal), each with the same operational
 * hierarchy as POLRI/Korlantas: instansi -> organisasi -> satker -> sub-organisasi, four
 * accounts (Eksekutif Nasional, Provinsi, Kota, Trainer) and three training modules whose
 * videos come from the institutions' OFFICIAL YouTube channels. Modules are created PENDING so
 * the Super Admin approves them from "Access Management -> Persetujuan Materi".
 *
 *   npm run db:seed:instansi      (idempotent: ON DUPLICATE KEY UPDATE / INSERT IGNORE)
 *
 * Passwords: SEED_PASSWORD (default "password123"), must_change_password = 1.
 * Territories are resolved by BPS code at runtime, so the script works on any install.
 */
import mysql, { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { DB_CONFIG } from './db';
import { PRIMARY_TENANT } from './migrate';

const PASSWORD = process.env.SEED_PASSWORD || 'password123';
const T = PRIMARY_TENANT.id;

type Audience = 'TK/SD' | 'MTS/SMP' | 'SMA/SMK' | 'Mahasiswa' | 'Umum';
interface Quiz { pass_score: number; time_limit_minutes: number; questions: Array<{ id: string; question: string; options: string[]; answer_index: number }> }
interface ModuleSeed { id: string; title: string; description: string; category: string; target_audience: Audience; duration_minutes: number; video_url: string; content_text: string; quiz: Quiz }
interface Account { id: string; username: string; employee_id: string; full_name: string; role_level: 1 | 2 | 3 | 4 }
interface Institution {
  instansi: { id: string; nama: string };
  organisasi: { id: string; nama: string };
  satker: Array<{ id: string; nama: string }>;
  sub_org: Array<{ id: string; nama: string; satker_id: string }>;
  /** chain assigned to every seeded account of this institution */
  chain: { satker: string; sub: string };
  /** BPS codes — resolved to ids at runtime */
  provinsi_kode: string;
  kota_kode: string;
  accounts: [Account, Account, Account, Account];
  modules: ModuleSeed[];
}

const q4 = (id: string, question: string, options: string[], answer_index: number) => ({ id, question, options, answer_index });

// ═══════════════════════════════════════════════════════════════════════════
// 1. KEMENTERIAN KESEHATAN — Jawa Tengah / Kota Semarang
// ═══════════════════════════════════════════════════════════════════════════
const KEMENKES: Institution = {
  instansi: { id: 'ins-kemenkes', nama: 'Kementerian Kesehatan Republik Indonesia' },
  organisasi: { id: 'org-kemenkes-kesmas', nama: 'Direktorat Jenderal Kesehatan Masyarakat' },
  satker: [
    { id: 'stk-kemenkes-promkes', nama: 'Direktorat Promosi Kesehatan dan Pemberdayaan Masyarakat' },
    { id: 'stk-kemenkes-gizi', nama: 'Direktorat Gizi dan Kesehatan Ibu dan Anak' },
  ],
  sub_org: [
    { id: 'sub-promkes-advokasi', nama: 'Subdit Advokasi dan Kemitraan', satker_id: 'stk-kemenkes-promkes' },
    { id: 'sub-promkes-pemberdayaan', nama: 'Subdit Pemberdayaan Masyarakat', satker_id: 'stk-kemenkes-promkes' },
  ],
  chain: { satker: 'stk-kemenkes-promkes', sub: 'sub-promkes-pemberdayaan' },
  provinsi_kode: '33',
  kota_kode: '3374',
  accounts: [
    { id: 'usr-kemenkes-nas', username: 'menkes', employee_id: 'KMK-NAS-001', full_name: 'Eksekutif Nasional Kemenkes', role_level: 1 },
    { id: 'usr-kemenkes-jateng', username: 'kadinkes_jateng', employee_id: 'KMK-JTG-001', full_name: 'Eksekutif Provinsi Jawa Tengah (Dinkes)', role_level: 2 },
    { id: 'usr-kemenkes-semarang', username: 'kadinkes_semarang', employee_id: 'KMK-SMG-001', full_name: 'Eksekutif Kota Semarang (Dinkes)', role_level: 3 },
    { id: 'usr-kemenkes-trainer', username: 'trainer_semarang', employee_id: 'KMK-SMG-TRN-001', full_name: 'Penyuluh Kesehatan Kota Semarang', role_level: 4 },
  ],
  modules: [
    {
      id: 'mod-kemenkes-phbs',
      title: 'Perilaku Hidup Bersih dan Sehat (PHBS) di Sekolah',
      description: 'Delapan indikator PHBS di sekolah, cara membiasakannya lewat 5 Gerakan Sehat, dan peran guru, siswa, serta orang tua dalam mewujudkan sekolah sehat. Video animasi resmi Ayo Sehat Kemenkes.',
      category: 'Promosi Kesehatan',
      target_audience: 'TK/SD',
      duration_minutes: 30,
      video_url: 'https://www.youtube.com/watch?v=jkS6glRPD_o', // Ayo Sehat Kementerian Kesehatan RI — "Animasi 5 Gerakan Sehat"
      content_text: `# Tujuan pembelajaran

Setelah sesi ini peserta mampu:

- Menyebutkan pengertian PHBS dan mengapa dimulai dari sekolah.
- Menyebutkan **8 indikator PHBS di sekolah** dan mempraktikkan minimal cuci tangan pakai sabun dengan benar.
- Menyusun kegiatan sederhana agar PHBS menjadi kebiasaan di kelas.

## Apa itu PHBS

PHBS adalah semua perilaku kesehatan yang dilakukan atas kesadaran sendiri sehingga keluarga dan anggotanya mampu menolong diri sendiri di bidang kesehatan. Di sekolah, PHBS memberdayakan siswa, guru, dan warga sekolah untuk menciptakan **sekolah sehat**.

## 8 indikator PHBS di sekolah

- Mencuci tangan dengan air mengalir dan sabun.
- Mengonsumsi jajanan sehat di kantin sekolah.
- Menggunakan jamban yang bersih dan sehat.
- Berolahraga secara teratur dan terukur.
- Memberantas jentik nyamuk.
- Tidak merokok di sekolah.
- Membuang sampah pada tempatnya.
- Menimbang berat badan dan mengukur tinggi badan secara berkala.

## 5 Gerakan Sehat (versi animasi Ayo Sehat)

- **Cuci tangan pakai sabun** – 6 langkah, 20–40 detik, sebelum makan dan setelah dari toilet.
- **Sikat gigi** – pagi setelah sarapan dan malam sebelum tidur.
- **Aktivitas fisik** – minimal 30 menit setiap hari.
- **Makan buah dan sayur** – setiap kali makan.
- **Tidak merokok / hindari asap rokok**.

---

# Cuci tangan pakai sabun: 6 langkah

1. Basahi tangan, beri sabun, gosok kedua telapak.
2. Gosok punggung tangan bergantian.
3. Gosok sela-sela jari.
4. Kunci jari dan gosok buku-buku jari.
5. Gosok ibu jari berputar bergantian.
6. Gosok ujung jari ke telapak, bilas, keringkan.

## Peran warga sekolah

- **Guru:** teladan, integrasi PHBS ke pembelajaran, jadwal piket kebersihan.
- **Siswa / dokter kecil:** mengingatkan teman, memantau kantin dan jamban.
- **Orang tua & komite:** sarana CTPS, kantin sehat, bebas asap rokok.
- **Puskesmas:** pembinaan UKS, penjaringan kesehatan, imunisasi.

## Praktik di kelas

- Buat **jadwal cuci tangan bersama** sebelum jam istirahat.
- Lomba kelas terbersih tiap bulan; papan pantau jentik di pot dan bak air.
- Laporkan kegiatan sebagai Lap Kegiatan dengan foto dokumentasi.

## Referensi

- Kemenkes RI – Ayo Sehat: *Perilaku Hidup Bersih dan Sehat* (ayosehat.kemkes.go.id/phbs).
- Kemenkes RI – Direktorat Promosi Kesehatan: *PHBS di Sekolah* (promkes.kemkes.go.id).
- Video: Ayo Sehat Kementerian Kesehatan RI, "Animasi 5 Gerakan Sehat".`,
      quiz: {
        pass_score: 70, time_limit_minutes: 10,
        questions: [
          q4('q1', 'Berapa jumlah indikator PHBS di sekolah menurut Kemenkes?', ['5', '8', '10'], 1),
          q4('q2', 'Kapan waktu paling penting untuk mencuci tangan pakai sabun?', ['Sebelum makan dan setelah dari toilet', 'Hanya saat tangan terlihat kotor', 'Sekali sehari saat mandi'], 0),
          q4('q3', 'Aktivitas fisik yang dianjurkan bagi anak sekolah setiap hari minimal…', ['10 menit', '30 menit', '2 jam'], 1),
          q4('q4', 'Kegiatan memberantas jentik nyamuk di sekolah termasuk…', ['Indikator PHBS di sekolah', 'Tugas Puskesmas saja', 'Bukan urusan sekolah'], 0),
        ],
      },
    },
    {
      id: 'mod-kemenkes-isi-piringku',
      title: 'Gizi Seimbang untuk Remaja: Isi Piringku',
      description: 'Pedoman Gizi Seimbang dan porsi Isi Piringku, batas gula-garam-lemak harian, serta cara membaca label pangan. Untuk siswa MTS/SMP agar terhindar dari anemia, obesitas, dan stunting generasi berikutnya.',
      category: 'Gizi Masyarakat',
      target_audience: 'MTS/SMP',
      duration_minutes: 35,
      video_url: 'https://www.youtube.com/watch?v=1bcI39ssaaw', // Ayo Sehat Kementerian Kesehatan RI — "ILM Edukasi Gizi Seimbang"
      content_text: `# Tujuan pembelajaran

- Menjelaskan 4 pilar Gizi Seimbang.
- Menyusun satu piring makan sesuai **Isi Piringku**.
- Mengenali batas konsumsi gula, garam, dan lemak harian serta membaca label kemasan.

## Empat pilar Gizi Seimbang

- Mengonsumsi **aneka ragam pangan**.
- Membiasakan **perilaku hidup bersih**.
- Melakukan **aktivitas fisik**.
- Memantau **berat badan** secara teratur.

## Isi Piringku dalam satu kali makan

- **½ piring**: sayur dan buah (sayur lebih banyak dari buah).
- **⅓ piring**: makanan pokok (nasi, jagung, singkong, roti, mi).
- **⅙ piring**: lauk-pauk sumber protein (ikan, telur, ayam, tempe, tahu).
- Minum **8 gelas air putih** per hari; cuci tangan sebelum makan.

## Batasi gula, garam, lemak (G4 G1 L5)

- Gula maksimal **4 sendok makan** (50 g) per hari.
- Garam maksimal **1 sendok teh** (5 g) per hari.
- Lemak/minyak maksimal **5 sendok makan** (67 g) per hari.
- Minuman manis kemasan bisa mengandung 20–30 g gula per botol — setengah jatah harian!

---

# Masalah gizi remaja

- **Anemia** pada remaja putri: minum Tablet Tambah Darah 1 tablet/minggu, konsumsi lauk kaya zat besi.
- **Obesitas**: jajanan tinggi gula & gorengan, kurang gerak.
- **Kurus / stunting**: sarapan tidak teratur, pola makan tidak beragam.

## Membaca label pangan

- Perhatikan **takaran saji** — angka gizi berlaku per saji, bukan per kemasan.
- Bandingkan kandungan gula, natrium (garam), dan lemak jenuh.
- Pilih produk dengan logo **"Pilihan Lebih Sehat"** bila tersedia.

## Praktik

- Susun menu sarapan, makan siang, dan makan malam versi Isi Piringku dari bahan lokal.
- Hitung gula dalam 3 minuman kemasan favorit teman sekelas.

## Referensi

- Kemenkes RI – *Pedoman Gizi Seimbang* (Permenkes No. 41 Tahun 2014).
- Kemenkes RI – Ayo Sehat: *Isi Piringku* dan kampanye *Batasi Gula, Garam, Lemak*.
- Video: Ayo Sehat Kementerian Kesehatan RI, "ILM Edukasi Gizi Seimbang".`,
      quiz: {
        pass_score: 70, time_limit_minutes: 10,
        questions: [
          q4('q1', 'Porsi sayur dan buah dalam Isi Piringku adalah…', ['Seperempat piring', 'Setengah piring', 'Sepertiga piring'], 1),
          q4('q2', 'Batas konsumsi gula per hari yang dianjurkan Kemenkes…', ['4 sendok makan', '10 sendok makan', 'Tidak dibatasi'], 0),
          q4('q3', 'Tablet Tambah Darah untuk remaja putri diminum…', ['1 tablet setiap minggu', '1 tablet setiap jam', 'Hanya saat sakit'], 0),
          q4('q4', 'Angka gizi pada label kemasan berlaku untuk…', ['Per takaran saji', 'Per kemasan selalu', 'Per hari'], 0),
        ],
      },
    },
    {
      id: 'mod-kemenkes-dbd',
      title: 'Cegah Demam Berdarah Dengue dengan 3M Plus',
      description: 'Siklus hidup nyamuk Aedes aegypti, gejala DBD yang harus diwaspadai, dan gerakan 3M Plus serta Gerakan 1 Rumah 1 Jumantik untuk masyarakat umum. Video animasi resmi Ayo Sehat Kemenkes.',
      category: 'Pencegahan Penyakit',
      target_audience: 'Umum',
      duration_minutes: 30,
      video_url: 'https://www.youtube.com/watch?v=YD2okQKjoyw', // Ayo Sehat Kementerian Kesehatan RI — "Animasi Demam Berdarah versi 3M Plus"
      content_text: `# Tujuan pembelajaran

- Menjelaskan cara penularan DBD dan tempat perindukan nyamuk *Aedes aegypti*.
- Mengenali gejala DBD dan tanda bahaya yang harus segera dibawa ke fasilitas kesehatan.
- Menerapkan **3M Plus** dan menjadi **Jumantik** di rumah masing-masing.

## Mengenal DBD

- Ditularkan oleh nyamuk *Aedes aegypti* betina yang menggigit pada **pagi dan sore hari**.
- Nyamuk berkembang biak di **air bersih yang tergenang**: bak mandi, tempayan, vas bunga, ban bekas, talang air.
- Kasus meningkat pada **musim hujan** — pencegahan harus dimulai sebelum musim hujan.

## Gejala dan tanda bahaya

- Demam tinggi mendadak 2–7 hari, nyeri kepala, nyeri otot, mual, bintik merah.
- **Tanda bahaya:** nyeri perut hebat, muntah terus-menerus, mimisan/gusi berdarah, lemas, tangan-kaki dingin, terutama saat demam turun (hari ke-3 s.d. 5) — **segera ke Puskesmas/RS**.
- Beri minum yang banyak; jangan beri obat aspirin/ibuprofen tanpa anjuran dokter.

---

# 3M Plus

- **Menguras** dan menyikat tempat penampungan air seminggu sekali.
- **Menutup** rapat tempat penampungan air.
- **Mendaur ulang / memanfaatkan** barang bekas yang dapat menampung air.

**Plus:** menaburkan larvasida, memelihara ikan pemakan jentik, memakai kelambu dan obat anti nyamuk, menanam tanaman pengusir nyamuk, memasang kawat kasa, tidak menggantung pakaian, dan **gotong royong** membersihkan lingkungan.

## Gerakan 1 Rumah 1 Jumantik

- Satu anggota keluarga menjadi **Juru Pemantau Jentik**: memeriksa semua tempat air **setiap minggu** dan mencatat di kartu jentik.
- Target **Angka Bebas Jentik ≥ 95 %** di RT/RW.
- Fogging hanya memutus nyamuk dewasa saat ada kasus — **tidak menggantikan** 3M Plus.

## Praktik lapangan

- Lakukan pemeriksaan jentik di 10 rumah sekitar lokasi kegiatan, catat hasilnya dalam Lap Kegiatan.

## Referensi

- Kemenkes RI – *Pencegahan dan Pengendalian DBD*: Gerakan 3M Plus dan 1 Rumah 1 Jumantik (kemkes.go.id).
- Kemenkes RI – Ayo Sehat: *Demam Berdarah Dengue*.
- Video: Ayo Sehat Kementerian Kesehatan RI, "Animasi Demam Berdarah versi 3M Plus".`,
      quiz: {
        pass_score: 70, time_limit_minutes: 10,
        questions: [
          q4('q1', 'Nyamuk penular DBD berkembang biak di…', ['Air bersih yang tergenang', 'Air kotor selokan', 'Air laut'], 0),
          q4('q2', '"Menguras" pada 3M Plus dilakukan minimal…', ['Sebulan sekali', 'Seminggu sekali', 'Setahun sekali'], 1),
          q4('q3', 'Tanda bahaya DBD yang harus segera dibawa ke fasilitas kesehatan adalah…', ['Nafsu makan bertambah', 'Mimisan, muntah terus-menerus, tangan-kaki dingin', 'Batuk ringan'], 1),
          q4('q4', 'Fogging berfungsi untuk…', ['Membunuh jentik', 'Membunuh nyamuk dewasa saat ada kasus', 'Menggantikan 3M Plus'], 1),
        ],
      },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// 2. BNPB — DI Yogyakarta / Kota Yogyakarta
// ═══════════════════════════════════════════════════════════════════════════
const BNPB: Institution = {
  instansi: { id: 'ins-bnpb', nama: 'Badan Nasional Penanggulangan Bencana' },
  organisasi: { id: 'org-bnpb-pencegahan', nama: 'Deputi Bidang Pencegahan' },
  satker: [
    { id: 'stk-bnpb-kesiapsiagaan', nama: 'Direktorat Kesiapsiagaan' },
    { id: 'stk-bnpb-mitigasi', nama: 'Direktorat Mitigasi Bencana' },
  ],
  sub_org: [
    { id: 'sub-bnpb-kapasitas', nama: 'Subdit Peningkatan Kapasitas Masyarakat', satker_id: 'stk-bnpb-kesiapsiagaan' },
    { id: 'sub-bnpb-edukasi', nama: 'Subdit Edukasi dan Budaya Sadar Bencana', satker_id: 'stk-bnpb-kesiapsiagaan' },
  ],
  chain: { satker: 'stk-bnpb-kesiapsiagaan', sub: 'sub-bnpb-edukasi' },
  provinsi_kode: '34',
  kota_kode: '3471',
  accounts: [
    { id: 'usr-bnpb-nas', username: 'kabnpb', employee_id: 'BNPB-NAS-001', full_name: 'Eksekutif Nasional BNPB', role_level: 1 },
    { id: 'usr-bnpb-diy', username: 'kabpbd_diy', employee_id: 'BNPB-DIY-001', full_name: 'Eksekutif Provinsi DI Yogyakarta (BPBD)', role_level: 2 },
    { id: 'usr-bnpb-yogya', username: 'kabpbd_yogyakarta', employee_id: 'BNPB-YGY-001', full_name: 'Eksekutif Kota Yogyakarta (BPBD)', role_level: 3 },
    { id: 'usr-bnpb-trainer', username: 'trainer_yogyakarta', employee_id: 'BNPB-YGY-TRN-001', full_name: 'Fasilitator Kebencanaan Kota Yogyakarta', role_level: 4 },
  ],
  modules: [
    {
      id: 'mod-bnpb-gempa',
      title: 'Tanggap, Tangkas, Tangguh Menghadapi Gempa Bumi',
      description: 'Langkah sebelum, saat, dan sesudah gempa bumi berdasarkan Buku Saku BNPB: Drop-Cover-Hold On, titik kumpul, dan simulasi evakuasi di sekolah. Video animasi resmi Humas BNPB.',
      category: 'Kesiapsiagaan Bencana',
      target_audience: 'SMA/SMK',
      duration_minutes: 40,
      video_url: 'https://www.youtube.com/watch?v=nk38uvgEWkM', // HUMAS BNPB — "Tanggap, Tangkas, Tangguh Menghadapi Bencana Gempa Bumi"
      content_text: `# Tujuan pembelajaran

- Menjelaskan mengapa Indonesia rawan gempa dan apa itu *Ring of Fire*.
- Melakukan **Drop – Cover – Hold On** dengan benar dan mengenali jalur evakuasi serta titik kumpul.
- Memimpin simulasi evakuasi gempa di sekolah.

## Mengapa harus siap

- Indonesia berada di pertemuan tiga lempeng tektonik; gempa dapat terjadi **kapan saja tanpa peringatan**.
- Korban umumnya bukan karena getaran, tetapi karena **reruntuhan bangunan dan benda jatuh**.
- Kesiapsiagaan keluarga dan sekolah terbukti menekan korban jiwa.

## Sebelum gempa

- Kenali struktur bangunan, tempat aman (bawah meja kokoh, jauh dari kaca), dan jalur evakuasi.
- Amankan lemari dan benda berat ke dinding; simpan barang berat di rak bawah.
- Siapkan **Tas Siaga Bencana** dan sepakati **titik kumpul** keluarga/sekolah.
- Ikuti simulasi berkala.

---

# Saat gempa: Drop – Cover – Hold On

- **Drop** – segera merunduk agar tidak terjatuh.
- **Cover** – lindungi kepala dan leher, berlindung di bawah meja yang kokoh.
- **Hold On** – pegang kaki meja sampai guncangan berhenti.
- Di luar ruangan: jauhi bangunan, tiang listrik, dan pohon. Di kendaraan: menepi dan berhenti.
- **Jangan** gunakan lift; jangan berlari saat guncangan masih berlangsung.

## Sesudah gempa

- Keluar dengan tertib melalui jalur evakuasi ke titik kumpul; waspadai gempa susulan.
- Periksa cedera, beri pertolongan pertama; matikan listrik dan gas jika aman.
- Di pesisir: bila guncangan kuat/lama, **segera menjauh dari pantai** ke tempat tinggi — potensi tsunami.
- Dengarkan informasi resmi BMKG/BPBD; hindari penyebaran hoaks.

## Simulasi di sekolah

- Tentukan koordinator lantai, pemandu jalur, dan petugas P3K.
- Bunyikan tanda, hitung waktu evakuasi, evaluasi hambatan (pintu terkunci, lorong sempit).
- Dokumentasikan sebagai Lap Kegiatan.

## Referensi

- BNPB – *Buku Saku Tanggap Tangkas Tangguh Menghadapi Bencana* (bnpb.go.id).
- BMKG – Info gempabumi dan peringatan dini tsunami (bmkg.go.id).
- Video: Humas BNPB, "Tanggap, Tangkas, Tangguh Menghadapi Bencana Gempa Bumi".`,
      quiz: {
        pass_score: 70, time_limit_minutes: 10,
        questions: [
          q4('q1', 'Urutan tindakan yang benar saat terjadi guncangan gempa di dalam ruangan…', ['Lari keluar secepatnya', 'Drop – Cover – Hold On', 'Naik lift ke lantai dasar'], 1),
          q4('q2', 'Setelah guncangan kuat dan lama di daerah pantai, yang harus dilakukan…', ['Menunggu pengumuman di pantai', 'Segera menjauh ke tempat tinggi', 'Memotret gelombang'], 1),
          q4('q3', 'Penyebab utama korban jiwa saat gempa umumnya adalah…', ['Getaran tanah itu sendiri', 'Reruntuhan bangunan dan benda jatuh', 'Suara gemuruh'], 1),
          q4('q4', 'Sumber informasi resmi gempa dan tsunami di Indonesia adalah…', ['BMKG dan BPBD', 'Grup chat keluarga', 'Media sosial anonim'], 0),
        ],
      },
    },
    {
      id: 'mod-bnpb-banjir',
      title: 'SiAGA Banjir: Kesiapsiagaan Keluarga dan Sekolah',
      description: 'Penyebab banjir, peringatan dini, tindakan sebelum-saat-sesudah banjir, dan bahaya arus serta listrik. Video animasi resmi BNPB Indonesia "SiAGA Banjir".',
      category: 'Kesiapsiagaan Bencana',
      target_audience: 'MTS/SMP',
      duration_minutes: 35,
      video_url: 'https://www.youtube.com/watch?v=nJeNMDZvcrQ', // BNPB Indonesia — "SiAGA Banjir"
      content_text: `# Tujuan pembelajaran

- Menjelaskan penyebab banjir dan peran perilaku manusia (sampah, alih fungsi lahan).
- Mengenali tanda peringatan dini dan mengetahui tindakan sebelum, saat, dan sesudah banjir.
- Menghindari bahaya utama saat banjir: arus deras, listrik, dan penyakit pascabanjir.

## Penyebab banjir

- Curah hujan tinggi dan luapan sungai; pasang laut (rob) di pesisir.
- **Sampah** menyumbat saluran; berkurangnya daerah resapan; bangunan di bantaran sungai.
- Deforestasi di hulu mempercepat aliran air ke hilir.

## Sebelum banjir

- Kenali riwayat banjir di lingkungan, jalur evakuasi, dan lokasi pengungsian.
- Simpan dokumen penting dalam plastik kedap air; siapkan Tas Siaga Bencana.
- Bersihkan saluran air secara gotong royong; buat biopori/sumur resapan.
- Pantau peringatan dini BMKG/BPBD dan ketinggian air.

---

# Saat banjir

- Matikan **listrik** dari MCB utama dan **gas** sebelum air masuk rumah.
- Pindah ke tempat lebih tinggi; utamakan anak-anak, lansia, dan penyandang disabilitas.
- **Jangan berjalan atau berkendara menerobos arus** — air setinggi lutut yang mengalir sudah dapat menjatuhkan orang dewasa.
- Jauhi tiang listrik dan kabel yang menjuntai; gunakan pelampung/benda mengapung bila terpaksa menyeberang.

## Sesudah banjir

- Kembali ke rumah setelah dinyatakan aman; periksa struktur bangunan dan instalasi listrik.
- Bersihkan lumpur dengan alat pelindung; waspadai ular dan benda tajam.
- Cegah penyakit: cuci tangan, air minum yang dimasak, waspada **leptospirosis, diare, DBD**.

## Praktik

- Buat peta risiko banjir sederhana lingkungan sekolah beserta jalur evakuasi dan titik kumpul.

## Referensi

- BNPB – *Buku Saku Tanggap Tangkas Tangguh Menghadapi Bencana*, bab Banjir.
- BNPB – InaRISK Personal (inarisk.bnpb.go.id) untuk mengecek risiko bencana lokasi.
- Video: BNPB Indonesia, "SiAGA Banjir".`,
      quiz: {
        pass_score: 70, time_limit_minutes: 10,
        questions: [
          q4('q1', 'Hal pertama yang dilakukan sebelum air banjir masuk rumah…', ['Menyalakan semua lampu', 'Mematikan listrik dari MCB utama dan gas', 'Mengunci pintu rapat-rapat'], 1),
          q4('q2', 'Air mengalir setinggi lutut…', ['Aman diterobos berjalan kaki', 'Dapat menjatuhkan orang dewasa', 'Hanya berbahaya bagi anak-anak'], 1),
          q4('q3', 'Penyakit yang perlu diwaspadai setelah banjir antara lain…', ['Leptospirosis dan diare', 'Rabun jauh', 'Asam urat'], 0),
          q4('q4', 'Aplikasi BNPB untuk mengecek risiko bencana di lokasi kita adalah…', ['InaRISK', 'InaTV', 'InaMaps'], 0),
        ],
      },
    },
    {
      id: 'mod-bnpb-tas-siaga',
      title: 'Tas Siaga Bencana dan Rencana Darurat Keluarga',
      description: 'Isi Tas Siaga Bencana untuk 72 jam pertama, rencana darurat keluarga, nomor penting, dan cara menyimpan dokumen. Video resmi BNPB Indonesia "SiAGA Perlengkapan Bencana".',
      category: 'Kesiapsiagaan Bencana',
      target_audience: 'Umum',
      duration_minutes: 25,
      video_url: 'https://www.youtube.com/watch?v=73_zCmA5yWg', // BNPB Indonesia — "SiAGA Perlengkapan Bencana"
      content_text: `# Tujuan pembelajaran

- Menyusun Tas Siaga Bencana keluarga untuk bertahan **72 jam pertama**.
- Membuat rencana darurat keluarga: titik kumpul, kontak darurat, pembagian tugas.
- Menyimpan dokumen dan obat dengan benar.

## Mengapa 72 jam

Pada bencana besar, bantuan bisa baru tiba setelah 1–3 hari. Keluarga yang siap **menolong dirinya sendiri** lebih dulu.

## Isi Tas Siaga Bencana

- **Dokumen penting** (KTP, KK, akta, sertifikat, polis) dalam plastik kedap air + salinan digital.
- **Air minum** ± 3 liter/orang/hari dan **makanan tahan lama** (biskuit, makanan kaleng, energi bar).
- **Obat-obatan pribadi** dan kotak P3K.
- **Senter + baterai cadangan**, **peluit**, radio portabel, power bank, korek api.
- Pakaian ganti, jas hujan, selimut/jaket, masker, perlengkapan kebersihan dan kebutuhan bayi/lansia.
- **Uang tunai** secukupnya, kunci cadangan, catatan nomor penting.

---

# Rencana darurat keluarga

- Tentukan **dua titik kumpul**: dekat rumah dan di luar lingkungan.
- Tulis kontak darurat (112, BPBD, Basarnas 115, PMI 118, PLN 123) dan kerabat di luar kota.
- Bagi tugas: siapa membawa tas, siapa menggendong balita, siapa mematikan listrik/gas.
- Latih **setahun dua kali**; periksa masa kedaluwarsa makanan dan obat tiap 6 bulan.

## Letakkan di tempat yang mudah dijangkau

- Dekat pintu keluar utama; satu tas kecil di kendaraan/kantor.
- Beritahu seluruh anggota keluarga letaknya.

## Praktik

- Susun daftar isi tas siaga untuk keluarga Anda dan tentukan siapa pemegang masing-masing barang.

## Referensi

- BNPB – *Buku Saku Tanggap Tangkas Tangguh Menghadapi Bencana*, bagian "Tas Siaga Bencana".
- BNPB – Siaga Bencana: "Apa Saja Isi Tas Siaga Bencana?".
- Video: BNPB Indonesia, "SiAGA Perlengkapan Bencana".`,
      quiz: {
        pass_score: 70, time_limit_minutes: 10,
        questions: [
          q4('q1', 'Tas Siaga Bencana disiapkan untuk bertahan selama…', ['3 jam', '72 jam pertama', '3 bulan'], 1),
          q4('q2', 'Kebutuhan air minum per orang per hari dalam tas siaga…', ['± 3 liter', '± 500 ml', '± 10 liter'], 0),
          q4('q3', 'Dokumen penting sebaiknya disimpan…', ['Di laci meja', 'Dalam plastik kedap air + salinan digital', 'Di atas lemari'], 1),
          q4('q4', 'Nomor darurat Basarnas adalah…', ['115', '110', '119'], 0),
        ],
      },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// 3. BNN — Jawa Timur / Kota Surabaya
// ═══════════════════════════════════════════════════════════════════════════
const BNN: Institution = {
  instansi: { id: 'ins-bnn', nama: 'Badan Narkotika Nasional' },
  organisasi: { id: 'org-bnn-pencegahan', nama: 'Deputi Bidang Pencegahan' },
  satker: [
    { id: 'stk-bnn-diseminasi', nama: 'Direktorat Diseminasi Informasi' },
    { id: 'stk-bnn-advokasi', nama: 'Direktorat Advokasi' },
  ],
  sub_org: [
    { id: 'sub-bnn-pendidikan', nama: 'Subdit Diseminasi Informasi Pendidikan', satker_id: 'stk-bnn-diseminasi' },
    { id: 'sub-bnn-masyarakat', nama: 'Subdit Diseminasi Informasi Masyarakat', satker_id: 'stk-bnn-diseminasi' },
  ],
  chain: { satker: 'stk-bnn-diseminasi', sub: 'sub-bnn-pendidikan' },
  provinsi_kode: '35',
  kota_kode: '3578',
  accounts: [
    { id: 'usr-bnn-nas', username: 'kabnn', employee_id: 'BNN-NAS-001', full_name: 'Eksekutif Nasional BNN', role_level: 1 },
    { id: 'usr-bnn-jatim', username: 'kabnnp_jatim', employee_id: 'BNN-JTM-001', full_name: 'Eksekutif Provinsi Jawa Timur (BNNP)', role_level: 2 },
    { id: 'usr-bnn-surabaya', username: 'kabnnk_surabaya', employee_id: 'BNN-SBY-001', full_name: 'Eksekutif Kota Surabaya (BNNK)', role_level: 3 },
    { id: 'usr-bnn-trainer', username: 'trainer_surabaya', employee_id: 'BNN-SBY-TRN-001', full_name: 'Penyuluh Narkoba Kota Surabaya', role_level: 4 },
  ],
  modules: [
    {
      id: 'mod-bnn-sejak-dini',
      title: 'Mencegah Penyalahgunaan Narkoba Sejak Dini',
      description: 'Mengenal NAPZA, alasan remaja terjerumus, tanda-tanda awal, dan peran keluarga serta sekolah dalam pencegahan. Video resmi Info BNN RI.',
      category: 'P4GN',
      target_audience: 'MTS/SMP',
      duration_minutes: 35,
      video_url: 'https://www.youtube.com/watch?v=NSDUFfzpB-k', // Info BNN RI — "BNN News: Mencegah Penyalahgunaan Narkoba Sejak Dini"
      content_text: `# Tujuan pembelajaran

- Menjelaskan apa itu NAPZA dan mengapa satu kali mencoba bisa berujung ketergantungan.
- Mengenali faktor risiko dan tanda awal penyalahgunaan pada remaja.
- Menjelaskan peran keluarga, sekolah, dan teman sebaya dalam pencegahan (P4GN).

## Apa itu NAPZA

- **Narkotika, Psikotropika, dan Zat Adiktif** lainnya — zat yang memengaruhi kerja otak, perasaan, dan perilaku.
- Golongan efek: **stimulan** (sabu, ekstasi), **depresan** (obat penenang, alkohol), **halusinogen** (LSD, ganja pada dosis tertentu).
- Termasuk zat baru (*new psychoactive substances*), lem/inhalan, dan penyalahgunaan obat resep.

## Mengapa remaja terjerumus

- Rasa ingin tahu dan **tekanan teman sebaya**.
- Masalah keluarga, stres sekolah, mencari pelarian.
- Iklan gaya hidup dan tawaran "gratis" pertama dari pengedar.
- Otak remaja masih berkembang hingga usia ± 25 tahun — lebih rentan kecanduan.

---

# Tanda-tanda awal

- Perubahan teman bergaul, sering menyendiri, prestasi menurun.
- Pola tidur dan nafsu makan berubah; mata merah, bicara cadel.
- Sering minta uang, barang di rumah hilang.
- Bila melihat tanda ini: **dekati, jangan hakimi**, ajak bicara, hubungi guru BK/BNN.

## Peran keluarga dan sekolah

- Komunikasi terbuka, aturan yang jelas, dan kegiatan positif (olahraga, seni, organisasi).
- Sekolah: **Sekolah Bersinar** (Bersih Narkoba), kurikulum P4GN, kader anti-narkoba.
- Laporan/konsultasi: **BNN 184** (call center) atau layanan rehabilitasi terdekat — pengguna yang melapor mendapat rehabilitasi, bukan pidana.

## Praktik

- Buat peta "lingkaran pendukung" siswa: 3 orang dewasa yang bisa dihubungi saat ada tawaran narkoba.

## Referensi

- BNN RI – *Peran Pelajar dalam Mendukung Program P4GN* (bnn.go.id).
- BNN RI – *Model Pendidikan Anti Narkoba untuk Kalangan Remaja (REAN.ID)*.
- Video: Info BNN RI, "Mencegah Penyalahgunaan Narkoba Sejak Dini".`,
      quiz: {
        pass_score: 70, time_limit_minutes: 10,
        questions: [
          q4('q1', 'NAPZA adalah singkatan dari…', ['Narkotika, Psikotropika, dan Zat Adiktif', 'Narkoba, Pil, dan Zat Aman', 'Nikotin, Psikologi, Zat Alami'], 0),
          q4('q2', 'Otak manusia masih berkembang hingga usia sekitar…', ['12 tahun', '25 tahun', '50 tahun'], 1),
          q4('q3', 'Bila menemukan teman dengan tanda awal penyalahgunaan, sikap yang tepat…', ['Menjauhi dan menyebarkan ke teman lain', 'Mendekati tanpa menghakimi dan menghubungi guru BK/BNN', 'Membiarkan saja'], 1),
          q4('q4', 'Nomor call center BNN untuk konsultasi dan pelaporan…', ['184', '110', '123'], 0),
        ],
      },
    },
    {
      id: 'mod-bnn-film-pendek',
      title: 'Bahaya Narkoba bagi Pelajar: Belajar dari Film Pendek',
      description: 'Dampak narkoba pada kesehatan, prestasi, hukum, dan masa depan; jerat pengedar di sekitar sekolah; keterampilan menolak. Film pendek resmi Info BNN RI sebagai bahan diskusi kelas.',
      category: 'P4GN',
      target_audience: 'SMA/SMK',
      duration_minutes: 45,
      video_url: 'https://www.youtube.com/watch?v=WXn_-kpMA2M', // Info BNN RI — "BNN News : Film Pendek NARKOBA"
      content_text: `# Tujuan pembelajaran

- Menganalisis dampak penyalahgunaan narkoba: kesehatan, prestasi, hukum, dan keluarga.
- Mengenali modus pengedar di sekitar sekolah dan media sosial.
- Mempraktikkan **keterampilan menolak** dengan tegas dan percaya diri.

## Dampak yang nyata

- **Kesehatan:** kerusakan otak dan organ, gangguan jiwa, overdosis, penularan HIV/hepatitis lewat jarum.
- **Prestasi & masa depan:** putus sekolah, gagal tes kesehatan kerja/kampus.
- **Hukum:** UU No. 35 Tahun 2009 — pengguna dapat direhabilitasi, namun **pengedar** dan kurir dipidana berat.
- **Keluarga & sosial:** kepercayaan hilang, stigma, biaya rehabilitasi.

## Modus yang perlu diwaspadai

- Tawaran "coba sekali saja, gratis"; dititipkan "paket" oleh kenalan.
- Permen, vape, atau minuman yang dicampur zat; tembakau sintetis.
- Perekrutan sebagai kurir lewat media sosial dengan iming-iming uang cepat.

---

# Cara menolak (refusal skills)

- **Katakan "tidak"** dengan jelas, tatap mata, tanpa perlu menjelaskan panjang.
- Beri alasan singkat: "Aku ada latihan besok", "Aku nggak mau."
- **Alihkan** ke kegiatan lain atau **tinggalkan** tempat.
- Berteman dengan yang punya tujuan sama; ceritakan pada orang dewasa yang dipercaya.

## Diskusi setelah film

- Apa titik keputusan tokoh utama yang bisa berbeda?
- Siapa saja yang seharusnya menyadari tanda-tanda lebih awal?
- Apa yang akan kamu lakukan jika berada di posisi teman tokoh?

## Praktik

- Bermain peran (role play) tiga skenario tawaran narkoba dan latih kalimat penolakan.
- Dokumentasikan kegiatan sebagai Lap Kegiatan dengan foto.

## Referensi

- Undang-Undang No. 35 Tahun 2009 tentang Narkotika.
- BNN RI – *Model Pendidikan Anti Narkoba untuk Kalangan Remaja (REAN.ID)*.
- Video: Info BNN RI, "Film Pendek NARKOBA".`,
      quiz: {
        pass_score: 70, time_limit_minutes: 10,
        questions: [
          q4('q1', 'Undang-undang yang mengatur narkotika di Indonesia adalah…', ['UU No. 35 Tahun 2009', 'UU No. 22 Tahun 2009', 'UU No. 11 Tahun 2008'], 0),
          q4('q2', 'Modus pengedar yang sering menyasar pelajar antara lain…', ['Menawarkan "coba gratis sekali saja"', 'Mengajak belajar kelompok', 'Membagikan buku pelajaran'], 0),
          q4('q3', 'Cara menolak tawaran narkoba yang efektif…', ['Menjelaskan panjang lebar sampai mereka mengerti', 'Berkata tidak dengan tegas lalu meninggalkan tempat', 'Menerima dulu agar tidak dimusuhi'], 1),
          q4('q4', 'Pengguna narkoba yang melapor secara sukarela…', ['Langsung dipenjara seumur hidup', 'Mendapat layanan rehabilitasi', 'Didenda tanpa bantuan'], 1),
        ],
      },
    },
    {
      id: 'mod-bnn-kader',
      title: 'Kader Anti-Narkoba: Peran Mahasiswa dalam P4GN',
      description: 'Strategi P4GN di kampus, membangun kader dan kampanye kreatif, deteksi dini, serta alur rujukan rehabilitasi. Video diskusi resmi Info BNN RI.',
      category: 'P4GN',
      target_audience: 'Mahasiswa',
      duration_minutes: 40,
      video_url: 'https://www.youtube.com/watch?v=oFI47spCkww', // Info BNN RI — "BNN News : Diskusi Bahaya Narkoba dilingkungan Pelajar"
      content_text: `# Tujuan pembelajaran

- Menjelaskan empat pilar **P4GN**: Pencegahan, Pemberantasan, Penyalahgunaan, dan Peredaran Gelap Narkotika.
- Merancang program kader anti-narkoba dan kampanye kreatif di kampus.
- Memahami alur deteksi dini, asesmen, dan rujukan rehabilitasi.

## Mengapa mahasiswa

- Usia 18–25 tahun adalah kelompok dengan **prevalensi tertinggi** penyalahgunaan.
- Mahasiswa adalah *opinion leader* bagi remaja dan komunitasnya — efektif sebagai **penyuluh sebaya**.
- Kampus Bersinar (Bersih Narkoba) menjadi target nasional BNN.

## Membangun kader

- Rekrut lintas fakultas; latih materi dasar NAPZA, komunikasi, dan konseling sebaya.
- Program: seminar orientasi mahasiswa baru, tes urine sukarela, *drug-free campus pledge*.
- Kampanye kreatif: konten media sosial, film pendek, mural, kompetisi *public speaking*.

---

# Deteksi dini dan rujukan

- Kenali tanda: penurunan akademik, isolasi sosial, perubahan fisik.
- **Skrining** (mis. ASSIST) oleh konselor/klinik kampus.
- Rujuk ke **IPWL** (Institusi Penerima Wajib Lapor) atau klinik rehabilitasi BNN — wajib lapor melindungi dari pemidanaan.
- Dampingi pemulihan: kelompok dukungan, cegah relaps.

## Mengukur dampak

- Jumlah kader aktif, jangkauan kampanye, hasil pre/post-test pengetahuan.
- Perubahan sikap (survei) dan jumlah rujukan yang berhasil.

## Praktik

- Susun proposal program P4GN satu semester untuk kampus/organisasi Anda, lengkap dengan indikator keberhasilan.

## Referensi

- BNN RI – *Peran Pelajar dalam Mendukung Program P4GN*; Instruksi Presiden No. 2 Tahun 2020 tentang Rencana Aksi Nasional P4GN.
- BNN RI – *Model Pendidikan Anti Narkoba untuk Kalangan Remaja (REAN.ID)*.
- Video: Info BNN RI, "Diskusi Bahaya Narkoba di Lingkungan Pelajar".`,
      quiz: {
        pass_score: 70, time_limit_minutes: 10,
        questions: [
          q4('q1', 'P4GN adalah singkatan dari…', ['Pencegahan, Pemberantasan, Penyalahgunaan, dan Peredaran Gelap Narkotika', 'Program Pemuda Peduli Gaya Hidup Nasional', 'Pusat Pelatihan Pemberantasan Gerakan Narkoba'], 0),
          q4('q2', 'Kelompok usia dengan prevalensi penyalahgunaan tertinggi…', ['5–12 tahun', '18–25 tahun', '60 tahun ke atas'], 1),
          q4('q3', 'Lembaga tempat pecandu dapat melapor untuk rehabilitasi tanpa dipidana…', ['IPWL', 'KPU', 'BPJS'], 0),
          q4('q4', 'Indikator keberhasilan program kader anti-narkoba antara lain…', ['Jumlah pengikut pribadi ketua kader', 'Hasil pre/post-test dan jumlah rujukan yang berhasil', 'Jumlah spanduk yang dicetak'], 1),
        ],
      },
    },
  ],
};

// ═══════════════════════════════════════════════════════════════════════════
// 4. BASARNAS — Bali / Kota Denpasar
// ═══════════════════════════════════════════════════════════════════════════
const BASARNAS: Institution = {
  instansi: { id: 'ins-basarnas', nama: 'Badan Nasional Pencarian dan Pertolongan (Basarnas)' },
  organisasi: { id: 'org-basarnas-binpotensi', nama: 'Deputi Bidang Bina Tenaga dan Potensi Pencarian dan Pertolongan' },
  satker: [
    { id: 'stk-basarnas-potensi', nama: 'Direktorat Bina Potensi' },
    { id: 'stk-basarnas-tenaga', nama: 'Direktorat Bina Tenaga' },
  ],
  sub_org: [
    { id: 'sub-basarnas-masyarakat', nama: 'Subdit Pembinaan Potensi Masyarakat', satker_id: 'stk-basarnas-potensi' },
    { id: 'sub-basarnas-diklat', nama: 'Subdit Pendidikan dan Pelatihan', satker_id: 'stk-basarnas-tenaga' },
  ],
  chain: { satker: 'stk-basarnas-potensi', sub: 'sub-basarnas-masyarakat' },
  provinsi_kode: '51',
  kota_kode: '5171',
  accounts: [
    { id: 'usr-basarnas-nas', username: 'kabasarnas', employee_id: 'SAR-NAS-001', full_name: 'Eksekutif Nasional Basarnas', role_level: 1 },
    { id: 'usr-basarnas-bali', username: 'kakansar_bali', employee_id: 'SAR-BAL-001', full_name: 'Eksekutif Provinsi Bali (Kantor SAR)', role_level: 2 },
    { id: 'usr-basarnas-denpasar', username: 'kapos_sar_denpasar', employee_id: 'SAR-DPS-001', full_name: 'Eksekutif Kota Denpasar (Pos SAR)', role_level: 3 },
    { id: 'usr-basarnas-trainer', username: 'trainer_denpasar', employee_id: 'SAR-DPS-TRN-001', full_name: 'Instruktur Potensi SAR Kota Denpasar', role_level: 4 },
  ],
  modules: [
    {
      id: 'mod-basarnas-survival-air',
      title: 'Teknik Bertahan Hidup di Air (Water Survival)',
      description: 'Keselamatan di pantai, sungai, dan kolam: mengenali arus balik (rip current), teknik mengapung dan bertahan, serta cara menolong tanpa ikut tenggelam. Video resmi Pembinaan Potensi Basarnas.',
      category: 'Keselamatan Air',
      target_audience: 'SMA/SMK',
      duration_minutes: 35,
      video_url: 'https://www.youtube.com/watch?v=BjaKD8zdSHE', // Pembinaan Potensi BASARNAS — "Teknik Bertahan Hidup di Air"
      content_text: `# Tujuan pembelajaran

- Mengenali bahaya perairan: arus balik, arus sungai, kelelahan, dan hipotermia.
- Mempraktikkan **teknik mengapung** (back float / survival float) dan menghemat energi.
- Menerapkan prinsip pertolongan **"Reach – Throw – Row – Go"** tanpa membahayakan diri.

## Bahaya utama di perairan

- **Rip current** (arus balik) di pantai: jangan melawan arus menuju pantai — berenang **sejajar pantai** lalu keluar dari arus.
- Sungai: arus deras di permukaan tenang, batu licin, banjir bandang dari hulu.
- Kolam/waduk: kedalaman tidak diketahui, kram, dan panik.
- Kelelahan dan **hipotermia** lebih cepat terjadi daripada dugaan.

## Sebelum masuk air

- Kenali kemampuan renang diri; jangan berenang sendirian atau setelah konsumsi alkohol.
- Perhatikan bendera peringatan/petugas penjaga pantai; kenakan **pelampung (life jacket)** saat berperahu.
- Berenang di area yang diawasi; jaga anak-anak dalam jangkauan lengan.

---

# Teknik bertahan

- **Tenang, jangan panik** — panik menghabiskan oksigen dan tenaga.
- **Back float:** telentang, kepala menengadah, tangan direntangkan, bernapas teratur.
- **Survival float (uitemate):** mengapung telentang dengan alas kaki mengarah ke atas, tunggu pertolongan.
- Gunakan benda apung apa pun: jeriken, ban, botol kosong, tas berisi udara.
- Bila terseret arus sungai: kaki di depan, telentang, arahkan ke tepi.

## Menolong korban tenggelam

- **Reach** – ulurkan tongkat/kayu. **Throw** – lempar pelampung/tali. **Row** – gunakan perahu.
- **Go** – masuk air hanya jika terlatih, bawa alat apung, dekati dari belakang.
- Hubungi **Basarnas 115** dan petugas terdekat; siapkan pertolongan pertama.

## Praktik

- Simulasi mengapung 3 menit dan teknik *Reach – Throw* di kolam yang diawasi; dokumentasikan sebagai Lap Kegiatan.

## Referensi

- Basarnas – Pembinaan Potensi Pencarian dan Pertolongan; materi *SAR Pemula* dan *SAR Lanjutan* (basarnas.go.id).
- Basarnas – nomor darurat 115.
- Video: Pembinaan Potensi BASARNAS, "Teknik Bertahan Hidup di Air".`,
      quiz: {
        pass_score: 70, time_limit_minutes: 10,
        questions: [
          q4('q1', 'Saat terseret arus balik (rip current) di pantai, sebaiknya…', ['Berenang sekuat tenaga melawan arus ke pantai', 'Berenang sejajar pantai untuk keluar dari arus', 'Berhenti berenang dan tenggelam'], 1),
          q4('q2', 'Urutan pertolongan korban di air yang paling aman bagi penolong…', ['Go – Row – Throw – Reach', 'Reach – Throw – Row – Go', 'Throw – Go – Reach – Row'], 1),
          q4('q3', 'Posisi tubuh saat terseret arus sungai…', ['Telungkup, kepala di depan', 'Telentang, kaki di depan mengarah ke hilir', 'Berdiri melawan arus'], 1),
          q4('q4', 'Nomor darurat Basarnas…', ['115', '113', '117'], 0),
        ],
      },
    },
    {
      id: 'mod-basarnas-rjp',
      title: 'Bantuan Hidup Dasar dan Resusitasi Jantung Paru (RJP)',
      description: 'Rantai keselamatan, langkah DR-CAB, kompresi dada 100–120 kali/menit, dan penggunaan AED untuk masyarakat umum. Video resmi Pembinaan Potensi Basarnas.',
      category: 'Pertolongan Pertama',
      target_audience: 'Umum',
      duration_minutes: 40,
      video_url: 'https://www.youtube.com/watch?v=-f57iMLM2g8', // Pembinaan Potensi BASARNAS — "RESUSITASI JANTUNG PARU (RJP)"
      content_text: `# Tujuan pembelajaran

- Mengenali henti jantung dan pentingnya bertindak dalam **4 menit pertama**.
- Melakukan RJP (kompresi dada + napas bantuan) dengan kualitas tinggi.
- Menggunakan **AED** dan mengetahui kapan menghentikan RJP.

## Rantai keselamatan

- Kenali kondisi darurat & panggil bantuan (**112 / 115 / 119**).
- RJP segera oleh orang terdekat.
- Defibrilasi cepat (AED).
- Bantuan medis lanjut dan perawatan pascahenti jantung.

## Langkah D-R-S-C-A-B

- **Danger** – pastikan lokasi aman bagi penolong dan korban.
- **Response** – tepuk bahu, panggil keras. Tidak merespons?
- **Shout for help** – minta orang lain menelepon 112/119 dan mencari AED.
- **Circulation** – tidak bernapas normal → mulai **kompresi dada**.
- **Airway** – buka jalan napas (head tilt–chin lift).
- **Breathing** – 2 napas bantuan bila terlatih; jika tidak, kompresi terus-menerus (*hands-only*).

---

# Kompresi dada berkualitas

- Tumit tangan di **tengah dada** (setengah bawah tulang dada), lengan lurus, bahu di atas tangan.
- Kedalaman **5–6 cm**, kecepatan **100–120 kali/menit** (irama lagu *Stayin' Alive*).
- Biarkan dada mengembang penuh; minimalkan jeda.
- Rasio **30 kompresi : 2 napas**; bergantian penolong setiap 2 menit.

## AED

- Nyalakan, tempel bantalan sesuai gambar, **jangan sentuh korban** saat analisis dan kejut.
- Lanjutkan RJP segera setelah kejut sampai petugas datang.

## Kapan berhenti

- Korban bernapas/bergerak, petugas medis mengambil alih, AED memerintahkan, atau penolong kelelahan.

## Praktik

- Latihan 2 menit kompresi pada manekin dengan umpan balik kecepatan; dokumentasikan sebagai Lap Kegiatan.

## Referensi

- Basarnas – *eModul Medical First Responder (MFR): Bantuan Hidup Dasar*.
- Pedoman RJP internasional (AHA/ILCOR) sebagaimana diadopsi PMI dan Kemenkes.
- Video: Pembinaan Potensi BASARNAS, "Resusitasi Jantung Paru (RJP)".`,
      quiz: {
        pass_score: 70, time_limit_minutes: 10,
        questions: [
          q4('q1', 'Kecepatan kompresi dada yang benar…', ['60–80 kali/menit', '100–120 kali/menit', '150–200 kali/menit'], 1),
          q4('q2', 'Kedalaman kompresi dada pada orang dewasa…', ['1–2 cm', '5–6 cm', '10 cm'], 1),
          q4('q3', 'Rasio kompresi dan napas bantuan…', ['30 : 2', '15 : 5', '5 : 1'], 0),
          q4('q4', 'Saat AED menganalisis irama jantung, penolong harus…', ['Terus menekan dada', 'Tidak menyentuh korban', 'Memberi napas bantuan'], 1),
        ],
      },
    },
    {
      id: 'mod-basarnas-sgts',
      title: 'SAR Goes to School: Budaya Keselamatan Sejak Dini',
      description: 'Pengenalan profesi SAR, nomor darurat 115, cara meminta tolong, dan latihan keselamatan sederhana untuk anak TK/SD melalui cerita dan permainan. Video resmi BASARNAS OFFICIAL.',
      category: 'Edukasi Keselamatan',
      target_audience: 'TK/SD',
      duration_minutes: 25,
      video_url: 'https://www.youtube.com/watch?v=UevQd1dsFFc', // BASARNAS OFFICIAL — "SAR Goes to School, Cetak Generasi Siaga"
      content_text: `# Tujuan pembelajaran

- Anak mengenal siapa **petugas SAR** dan apa tugasnya.
- Anak hafal nomor darurat **115** dan cara meminta tolong yang benar.
- Anak mempraktikkan aturan keselamatan sederhana di rumah, sekolah, dan air.

## Siapa itu Basarnas

- Badan yang **mencari dan menolong** orang yang hilang atau dalam bahaya: di laut, gunung, banjir, gempa, dan kecelakaan.
- Petugasnya disebut *rescuer*; punya perahu karet, helikopter, dan anjing pelacak.
- Kamu bisa membantu dengan **tidak panik** dan tahu cara memanggil bantuan.

## Cara meminta tolong

- Teriak **"TOLONG!"** dan cari orang dewasa terdekat.
- Telepon **115** (Basarnas) atau **112**: sebutkan nama, di mana kamu berada, apa yang terjadi.
- Jangan menutup telepon sebelum petugas selesai bertanya.

---

# Aturan keselamatan si kecil

- **Di air:** berenang hanya bila ada orang dewasa; pakai pelampung di perahu; jangan main di sungai saat hujan.
- **Saat gempa:** merunduk, lindungi kepala, berlindung di bawah meja — lalu keluar dengan tertib.
- **Saat tersesat:** berhenti, tetap di tempat, tiup **peluit** tiga kali, tunggu dijemput.
- Hafal nama lengkap orang tua dan alamat rumah.

## Permainan di kelas

- Lagu "Merunduk, Lindungi, Pegang" dengan gerakan.
- Lomba menyebut 115 dan alamat rumah; mewarnai *rescuer* dan perahu karet.
- Simulasi memanggil bantuan dengan telepon mainan.

## Untuk guru dan orang tua

- Ulangi latihan setiap semester; pasang stiker 115 di kelas.
- Laporkan kegiatan sebagai Lap Kegiatan dengan foto.

## Referensi

- Basarnas – Pembinaan Potensi: materi *Cerita Gambar untuk TK–SD* dan program *SAR Goes to School* (basarnas.go.id).
- Basarnas – nomor darurat 115.
- Video: BASARNAS OFFICIAL, "SAR Goes to School, Cetak Generasi Siaga".`,
      quiz: {
        pass_score: 60, time_limit_minutes: 10,
        questions: [
          q4('q1', 'Nomor telepon Basarnas untuk meminta tolong…', ['115', '911', '100'], 0),
          q4('q2', 'Saat gempa di dalam kelas, yang harus dilakukan…', ['Lari sambil berteriak', 'Merunduk, lindungi kepala, berlindung di bawah meja', 'Naik ke atas meja'], 1),
          q4('q3', 'Jika tersesat di tempat ramai…', ['Terus berjalan mencari jalan pulang', 'Berhenti, tetap di tempat, tiup peluit, tunggu dijemput', 'Ikut orang asing yang menawari bantuan'], 1),
          q4('q4', 'Naik perahu harus memakai…', ['Topi', 'Pelampung', 'Sepatu bot'], 1),
        ],
      },
    },
  ],
};

const INSTITUTIONS: Institution[] = [KEMENKES, BNPB, BNN, BASARNAS];

// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  const conn = await mysql.createConnection(DB_CONFIG);
  const hash = await bcrypt.hash(PASSWORD, 10);
  try {
    await conn.beginTransaction();
    for (const inst of INSTITUTIONS) {
      // territory by BPS code (ids differ between installs)
      const [[prov]] = await conn.query<RowDataPacket[]>(`SELECT id FROM tbl_elearning_provinsi WHERE kode = ? LIMIT 1`, [inst.provinsi_kode]);
      const [[kota]] = await conn.query<RowDataPacket[]>(`SELECT id FROM tbl_elearning_kota WHERE kode = ? LIMIT 1`, [inst.kota_kode]);
      if (!prov || !kota) throw new Error(`Wilayah ${inst.provinsi_kode}/${inst.kota_kode} belum ada — jalankan "npm run db:migrate" dulu (seed wilayah).`);
      const provinsiId = Number(prov.id);
      const kotaId = Number(kota.id);

      // hierarchy (upsert)
      await conn.query(`INSERT INTO tbl_elearning_master_instansi (id, nama) VALUES (?, ?) ON DUPLICATE KEY UPDATE nama = VALUES(nama)`, [inst.instansi.id, inst.instansi.nama]);
      await conn.query(`INSERT INTO tbl_elearning_master_organisasi (id, instansi_id, nama) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE instansi_id = VALUES(instansi_id), nama = VALUES(nama)`, [inst.organisasi.id, inst.instansi.id, inst.organisasi.nama]);
      for (const s of inst.satker) await conn.query(`INSERT INTO tbl_elearning_master_satker (id, organisasi_id, nama) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE organisasi_id = VALUES(organisasi_id), nama = VALUES(nama)`, [s.id, inst.organisasi.id, s.nama]);
      for (const x of inst.sub_org) await conn.query(`INSERT INTO tbl_elearning_master_sub_org (id, satker_id, nama) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE satker_id = VALUES(satker_id), nama = VALUES(nama)`, [x.id, x.satker_id, x.nama]);

      // accounts (upsert by tenant+username)
      let created = 0;
      for (const a of inst.accounts) {
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
            a.role_level === 1 ? null : provinsiId,
            a.role_level >= 3 ? kotaId : null,
            inst.instansi.id, inst.organisasi.id, inst.chain.satker, inst.chain.sub,
          ],
        );
      }

      // modules (PENDING, authored by the institution's trainer; INSERT IGNORE = never overwrite edits)
      const trainer = inst.accounts[3];
      let modulesCreated = 0;
      for (const m of inst.modules) {
        const [res] = await conn.query<ResultSetHeader>(
          `INSERT IGNORE INTO tbl_elearning_modules
             (id, tenant_id, created_by, author_id, title, description, content_text, quiz_data, category, target_audience, instructor_name,
              video_url, duration_minutes, has_quiz, approval_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'PENDING')`,
          [m.id, T, trainer.id, trainer.id, m.title, m.description, m.content_text, JSON.stringify(m.quiz), m.category, m.target_audience, trainer.full_name, m.video_url, m.duration_minutes],
        );
        modulesCreated += res.affectedRows;
      }
      console.log(`${inst.instansi.nama}: akun +${created}/${inst.accounts.length} · modul +${modulesCreated}/${inst.modules.length} (PENDING)`);
    }
    await conn.commit();

    const [rows] = await conn.query<RowDataPacket[]>(
      `SELECT u.username, u.role_level, li.nama AS instansi, p.nama AS provinsi, k.nama AS kota
         FROM tbl_elearning_users u
         LEFT JOIN tbl_elearning_master_instansi li ON li.id = u.legacy_instansi_id
         LEFT JOIN tbl_elearning_provinsi p ON p.id = u.provinsi_id
         LEFT JOIN tbl_elearning_kota k ON k.id = u.kota_id
        WHERE u.role_level <> 0 ORDER BY li.nama, u.role_level`,
    );
    console.table(rows);
    console.log(`\nSemua akun masuk dengan password "${PASSWORD}" dan wajib mengganti password saat login pertama.`);
    console.log('Modul berstatus PENDING — setujui lewat Access Management -> Persetujuan Materi.');
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
