/**
 * Idempotent seeder: all 38 provinsi + 514 kabupaten/kota of Indonesia into
 * tbl_elearning_provinsi / tbl_elearning_kota (FK kota.provinsi_id -> provinsi.id).
 *
 * Rules that make it safe to run on every boot (and via `npm run db:seed:regions`):
 *   - Existing rows are matched by BPS `kode` first, then by normalised name
 *     ("Jakarta Selatan" == "Kota Jakarta Selatan"); their primary keys are NEVER changed,
 *     because users and field reports reference them.
 *   - Matched rows only get their `kode`/official `nama` filled in.
 *   - Missing rows are inserted with id = Number(kode) (11..96 / 1101..9671), which can
 *     never collide with the small hand-seeded ids.
 */
import 'dotenv/config';
import mysql, { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { DB_CONFIG } from './db';
import { INDONESIA_REGIONS, REGION_TOTALS } from './data/indonesiaRegions';

export interface RegionSeedResult {
  provinsi: { inserted: number; updated: number; total: number };
  kota: { inserted: number; updated: number; total: number };
}

const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/^(kabupaten administrasi|kota administrasi|kabupaten|kab\.?|kota|kotamadya|daerah istimewa|di|dki|provinsi|prov\.?)\s+/i, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const PROVINCE_ALIASES: Record<string, string> = {
  'yogyakarta': 'di yogyakarta',
  'daerah istimewa yogyakarta': 'di yogyakarta',
  'jakarta': 'dki jakarta',
  'bangka belitung': 'kepulauan bangka belitung',
  'ntb': 'nusa tenggara barat',
  'ntt': 'nusa tenggara timur',
};
const provKey = (s: string) => {
  const k = s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return PROVINCE_ALIASES[k] ?? PROVINCE_ALIASES[normalise(s)] ?? normalise(s);
};

export async function seedRegionsFull(conn: Connection, log: (msg: string) => void = () => undefined): Promise<RegionSeedResult> {
  const result: RegionSeedResult = { provinsi: { inserted: 0, updated: 0, total: 0 }, kota: { inserted: 0, updated: 0, total: 0 } };

  const [provRows] = await conn.query<RowDataPacket[]>(`SELECT id, nama, kode FROM tbl_elearning_provinsi`);
  const provByKode = new Map(provRows.filter((r) => r.kode).map((r) => [String(r.kode), r]));
  const provByName = new Map(provRows.map((r) => [provKey(String(r.nama)), r]));

  for (const p of INDONESIA_REGIONS) {
    let row = provByKode.get(p.kode) ?? provByName.get(provKey(p.nama));
    if (row) {
      if (row.kode !== p.kode || row.nama !== p.nama) {
        await conn.query(`UPDATE tbl_elearning_provinsi SET kode = ?, nama = ? WHERE id = ?`, [p.kode, p.nama, row.id]);
        result.provinsi.updated++;
      }
    } else {
      const id = Number(p.kode);
      await conn.query<ResultSetHeader>(`INSERT IGNORE INTO tbl_elearning_provinsi (id, nama, kode) VALUES (?, ?, ?)`, [id, p.nama, p.kode]);
      row = { id, nama: p.nama, kode: p.kode } as RowDataPacket;
      provByKode.set(p.kode, row);
      result.provinsi.inserted++;
    }
    const provinsiId = Number(row.id);

    const [kotaRows] = await conn.query<RowDataPacket[]>(`SELECT id, nama, kode FROM tbl_elearning_kota WHERE provinsi_id = ?`, [provinsiId]);
    const kotaByKode = new Map(kotaRows.filter((r) => r.kode).map((r) => [String(r.kode), r]));
    const kotaByName = new Map(kotaRows.map((r) => [normalise(String(r.nama)), r]));
    const inserts: Array<[number, number, string, string]> = [];

    for (const [kode, nama] of p.kota) {
      const existing = kotaByKode.get(kode) ?? kotaByName.get(normalise(nama));
      if (existing) {
        // Kabupaten vs Kota with the same base name (e.g. Bogor) are distinct: only adopt the
        // official name when the existing row has no code yet or already carries this code.
        const sameKind = !existing.kode || String(existing.kode) === kode;
        if (sameKind && (existing.kode !== kode || existing.nama !== nama)) {
          await conn.query(`UPDATE tbl_elearning_kota SET kode = ?, nama = ? WHERE id = ?`, [kode, nama, existing.id]);
          kotaByKode.set(kode, existing);
          result.kota.updated++;
        } else if (!sameKind) {
          inserts.push([Number(kode), provinsiId, nama, kode]);
        }
      } else {
        inserts.push([Number(kode), provinsiId, nama, kode]);
      }
    }
    if (inserts.length) {
      await conn.query(`INSERT IGNORE INTO tbl_elearning_kota (id, provinsi_id, nama, kode) VALUES ?`, [inserts]);
      result.kota.inserted += inserts.length;
    }
  }

  const [[pc]] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM tbl_elearning_provinsi`);
  const [[kc]] = await conn.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM tbl_elearning_kota`);
  result.provinsi.total = Number(pc.n);
  result.kota.total = Number(kc.n);
  log(
    `  * wilayah: provinsi +${result.provinsi.inserted} / ~${result.provinsi.updated} (total ${result.provinsi.total}/${REGION_TOTALS.provinsi}) · ` +
      `kota +${result.kota.inserted} / ~${result.kota.updated} (total ${result.kota.total}/${REGION_TOTALS.kota})`,
  );
  return result;
}

// ── CLI: npm run db:seed:regions ─────────────────────────────────────────────
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('seedRegionsFull.ts');
if (isDirectRun) {
  (async () => {
    const conn = await mysql.createConnection(DB_CONFIG);
    try {
      const r = await seedRegionsFull(conn, console.log);
      console.log(JSON.stringify(r));
    } finally {
      await conn.end();
    }
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
