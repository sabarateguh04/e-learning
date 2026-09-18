import { Connection, RowDataPacket } from 'mysql2/promise';

/**
 * Runs schema-upgrade statements written with MariaDB's convenient
 * `ADD COLUMN / ADD INDEX / ADD CONSTRAINT ... IF NOT EXISTS` clauses on ANY MySQL-family server.
 *
 * MySQL 5.7/8.x does not accept `IF NOT EXISTS` inside ALTER TABLE, so each clause is checked
 * against information_schema first and only applied when missing. Plain clauses (MODIFY, …)
 * and non-ALTER statements (UPDATE …) run unchanged. Result: identical, idempotent behaviour on
 * MariaDB (local dev) and MySQL (server).
 */
export async function runPortableDdl(conn: Connection, sql: string): Promise<void> {
  const m = /^\s*ALTER\s+TABLE\s+`?(\w+)`?\s+([\s\S]+?)\s*;?\s*$/i.exec(sql);
  if (!m || !/IF\s+NOT\s+EXISTS/i.test(sql)) {
    await conn.query(sql);
    return;
  }
  const table = m[1];
  for (const clause of splitTopLevel(m[2])) {
    let c: RegExpExecArray | null;
    if ((c = /^ADD\s+COLUMN\s+IF\s+NOT\s+EXISTS\s+`?(\w+)`?\s+([\s\S]+)$/i.exec(clause))) {
      if (!(await columnExists(conn, table, c[1]))) await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${c[1]}\` ${c[2]}`);
    } else if ((c = /^ADD\s+(UNIQUE\s+)?(?:INDEX|KEY)\s+IF\s+NOT\s+EXISTS\s+`?(\w+)`?\s*([\s\S]+)$/i.exec(clause))) {
      if (!(await indexExists(conn, table, c[2]))) await conn.query(`ALTER TABLE \`${table}\` ADD ${c[1] ? 'UNIQUE ' : ''}INDEX \`${c[2]}\` ${c[3]}`);
    } else if ((c = /^ADD\s+CONSTRAINT\s+`?(\w+)`?\s+FOREIGN\s+KEY\s+IF\s+NOT\s+EXISTS\s*([\s\S]+)$/i.exec(clause))) {
      if (!(await constraintExists(conn, table, c[1]))) await conn.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${c[1]}\` FOREIGN KEY ${c[2]}`);
    } else {
      await conn.query(`ALTER TABLE \`${table}\` ${clause}`);
    }
  }
}

/** Splits ALTER clauses on commas that are not inside parentheses or quotes. */
function splitTopLevel(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = '';
  for (const ch of body) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const exists = async (conn: Connection, sql: string, params: unknown[]) => {
  const [rows] = await conn.query<RowDataPacket[]>(sql, params);
  return rows.length > 0;
};
const columnExists = (conn: Connection, table: string, column: string) =>
  exists(conn, `SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? LIMIT 1`, [table, column]);
const indexExists = (conn: Connection, table: string, index: string) =>
  exists(conn, `SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`, [table, index]);
const constraintExists = (conn: Connection, table: string, name: string) =>
  exists(conn, `SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? LIMIT 1`, [table, name]);
