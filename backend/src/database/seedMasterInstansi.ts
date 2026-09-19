/**
 * Additive seeder for the institution-mapping master data (4 levels):
 *   tbl_elearning_master_instansi -> _organisasi -> _satker -> _sub_org
 *
 * Source: src/database/data/masterInstansi.ts (snapshot of the catalogue that was originally
 * imported from the legacy sm_learning DB), so a standalone install gets the same list.
 *
 *   npm run db:seed:master               insert the rows that are missing
 *   npm run db:seed:master -- --dry-run  only report what would be inserted (no writes)
 *   npm run db:seed:master -- --fill-parents
 *                                        also set the parent of EXISTING rows whose parent is
 *                                        still NULL (never changes a parent that is already set)
 *
 * Guarantees (safe to run repeatedly on a live server):
 *   - matched by primary key `id`; a row that already exists is NEVER modified or deleted —
 *     its nama / is_active / parent stay exactly as they are on the server;
 *   - nothing is ever deleted, so rows the server has that the snapshot lacks are untouched;
 *   - levels are processed parent-first, and a parent id that does not exist (in the DB or the
 *     snapshot) is stored as NULL instead of failing on the foreign key.
 */
import 'dotenv/config';
import mysql, { Connection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { DB_CONFIG } from './db';
import { MASTER_INSTANSI, MASTER_ORGANISASI, MASTER_SATKER, MASTER_SUB_ORG } from './data/masterInstansi';

interface SeedRow { id: string; nama: string; is_active: number; parent: string | null }
interface Level { label: string; table: string; parentCol: string | null; rows: SeedRow[] }

const LEVELS: Level[] = [
  { label: 'instansi', table: 'tbl_elearning_master_instansi', parentCol: null, rows: MASTER_INSTANSI.map((r) => ({ ...r, parent: null })) },
  { label: 'organisasi', table: 'tbl_elearning_master_organisasi', parentCol: 'instansi_id', rows: MASTER_ORGANISASI.map((r) => ({ ...r, parent: r.instansi_id })) },
  { label: 'satker', table: 'tbl_elearning_master_satker', parentCol: 'organisasi_id', rows: MASTER_SATKER.map((r) => ({ ...r, parent: r.organisasi_id })) },
  { label: 'sub_org', table: 'tbl_elearning_master_sub_org', parentCol: 'satker_id', rows: MASTER_SUB_ORG.map((r) => ({ ...r, parent: r.satker_id })) },
];

export interface MasterSeedResult {
  level: string;
  snapshot: number;
  existing: number;
  inserted: number;
  parents_filled: number;
  parent_missing: number;
}

export async function seedMasterInstansi(
  conn: Connection,
  opts: { dryRun?: boolean; fillParents?: boolean } = {},
  log: (msg: string) => void = () => undefined,
): Promise<MasterSeedResult[]> {
  const results: MasterSeedResult[] = [];
  /** ids known to exist per table once this level is done (DB rows + rows we insert) */
  const known = new Map<string, Set<string>>();

  for (const level of LEVELS) {
    const [dbRows] = await conn.query<RowDataPacket[]>(
      `SELECT id${level.parentCol ? `, ${level.parentCol} AS parent` : ''} FROM \`${level.table}\``,
    );
    const existing = new Map<string, string | null>(dbRows.map((r) => [String(r.id), level.parentCol ? (r.parent as string | null) : null]));
    const ids = new Set(existing.keys());
    known.set(level.table, ids);
    const parentIds = level.parentCol ? known.get(LEVELS[LEVELS.indexOf(level) - 1].table)! : null;

    const res: MasterSeedResult = { level: level.label, snapshot: level.rows.length, existing: 0, inserted: 0, parents_filled: 0, parent_missing: 0 };
    const toInsert: Array<[string, string | null, string, number]> = [];

    for (const row of level.rows) {
      const wantedParent = level.parentCol ? row.parent : null;
      const parent = wantedParent && parentIds?.has(wantedParent) ? wantedParent : null;
      if (wantedParent && !parent) {
        res.parent_missing++;
        log(`  ! ${level.label} ${row.id}: parent ${wantedParent} tidak ditemukan -> disimpan tanpa parent`);
      }

      if (existing.has(row.id)) {
        res.existing++;
        if (opts.fillParents && level.parentCol && parent && existing.get(row.id) === null) {
          res.parents_filled++;
          if (!opts.dryRun) await conn.query(`UPDATE \`${level.table}\` SET \`${level.parentCol}\` = ? WHERE id = ? AND \`${level.parentCol}\` IS NULL`, [parent, row.id]);
        }
        continue;
      }
      toInsert.push([row.id, parent, row.nama, row.is_active ?? 1]);
      ids.add(row.id);
    }

    if (toInsert.length && !opts.dryRun) {
      const cols = level.parentCol ? `(id, \`${level.parentCol}\`, nama, is_active)` : `(id, nama, is_active)`;
      const values = level.parentCol ? toInsert : toInsert.map(([id, , nama, active]) => [id, nama, active]);
      const [r] = await conn.query<ResultSetHeader>(`INSERT IGNORE INTO \`${level.table}\` ${cols} VALUES ?`, [values]);
      res.inserted = r.affectedRows;
    } else {
      res.inserted = toInsert.length;
    }
    for (const [id, , nama] of toInsert) log(`  + ${level.label}: ${id} — ${nama}`);
    results.push(res);
  }
  return results;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const fillParents = process.argv.includes('--fill-parents');
  const conn = await mysql.createConnection(DB_CONFIG);
  try {
    if (!dryRun) await conn.beginTransaction();
    console.log(`Seed master pemetaan instansi -> ${DB_CONFIG.database}@${DB_CONFIG.host}${dryRun ? ' (DRY RUN — tidak ada perubahan)' : ''}`);
    const results = await seedMasterInstansi(conn, { dryRun, fillParents }, (m) => console.log(m));
    if (!dryRun) await conn.commit();
    console.table(results);
    const totalInserted = results.reduce((n, r) => n + r.inserted, 0);
    console.log(dryRun ? `Akan menambahkan ${totalInserted} baris. Jalankan tanpa --dry-run untuk menerapkan.` : `Selesai: ${totalInserted} baris ditambahkan, baris yang sudah ada tidak diubah.`);
  } catch (err) {
    if (!dryRun) await conn.rollback();
    throw err;
  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Seed failed:', err.message ?? err);
    process.exit(1);
  });
}
