/**
 * Schema + seed for `db_elearning`. Safe to run on every boot (server.ts calls runMigration()):
 *   - CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS
 *   - master data copied from the legacy DB only when the local table is EMPTY (INSERT IGNORE)
 *   - seed rows (regions, primary tenant, super admin, menu matrix) written with INSERT IGNORE,
 *     additionally guarded by an "only when the table is EMPTY" check — re-running never
 *     raises "Duplicate entry" and never overwrites rows an admin has edited
 *   - full Indonesian regions (38 provinsi / 514 kab/kota) upserted by seedRegionsFull()
 * Nothing here ever UPDATEs or DELETEs user-entered rows.
 *
 *   npm run db:migrate            (tsx src/database/migrate.ts)
 */
import mysql, { ResultSetHeader } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { DB_CONFIG, LEGACY_DB } from './db';
import { seedRegionsFull } from './seedRegionsFull';

type Conn = mysql.Connection;
type Rows = mysql.RowDataPacket[];
const q = <T extends Rows | mysql.ResultSetHeader = Rows>(conn: Conn, sql: string, params?: unknown[]) => conn.query<T>(sql, params).then(([rows]) => rows);
const count = async (conn: Conn, table: string) => Number((await q(conn, `SELECT COUNT(*) AS n FROM \`${table}\``))[0].n);
const log = (msg: string) => console.log(msg);

// ── DDL (order matters for foreign keys) ─────────────────────────────────────
const TABLES: Array<{ name: string; ddl: string }> = [
  {
    name: 'tbl_elearning_master_instansi',
    ddl: `
      CREATE TABLE IF NOT EXISTS tbl_elearning_master_instansi (
        id         VARCHAR(50)  NOT NULL PRIMARY KEY,
        nama       VARCHAR(255) NOT NULL,
        is_active  TINYINT(1)   NOT NULL DEFAULT 1,
        created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_instansi_nama (nama)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'tbl_elearning_master_organisasi',
    ddl: `
      CREATE TABLE IF NOT EXISTS tbl_elearning_master_organisasi (
        id          VARCHAR(50)  NOT NULL PRIMARY KEY,
        instansi_id VARCHAR(50)  NULL,
        nama        VARCHAR(255) NOT NULL,
        is_active   TINYINT(1)   NOT NULL DEFAULT 1,
        created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_organisasi_instansi (instansi_id),
        CONSTRAINT fk_organisasi_instansi FOREIGN KEY (instansi_id) REFERENCES tbl_elearning_master_instansi (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'tbl_elearning_master_satker',
    ddl: `
      CREATE TABLE IF NOT EXISTS tbl_elearning_master_satker (
        id            VARCHAR(50)  NOT NULL PRIMARY KEY,
        organisasi_id VARCHAR(50)  NULL,
        nama          VARCHAR(255) NOT NULL,
        is_active     TINYINT(1)   NOT NULL DEFAULT 1,
        created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_satker_organisasi (organisasi_id),
        CONSTRAINT fk_satker_organisasi FOREIGN KEY (organisasi_id) REFERENCES tbl_elearning_master_organisasi (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'tbl_elearning_master_sub_org',
    ddl: `
      CREATE TABLE IF NOT EXISTS tbl_elearning_master_sub_org (
        id         VARCHAR(50)  NOT NULL PRIMARY KEY,
        satker_id  VARCHAR(50)  NULL,
        nama       VARCHAR(255) NOT NULL,
        is_active  TINYINT(1)   NOT NULL DEFAULT 1,
        created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_sub_org_satker (satker_id),
        CONSTRAINT fk_sub_org_satker FOREIGN KEY (satker_id) REFERENCES tbl_elearning_master_satker (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'tbl_elearning_provinsi',
    ddl: `
      CREATE TABLE IF NOT EXISTS tbl_elearning_provinsi (
        id         INT UNSIGNED NOT NULL PRIMARY KEY,
        nama       VARCHAR(100) NOT NULL,
        kode       VARCHAR(10)  NULL,
        created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_provinsi_nama (nama)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'tbl_elearning_kota',
    ddl: `
      CREATE TABLE IF NOT EXISTS tbl_elearning_kota (
        id          INT UNSIGNED NOT NULL PRIMARY KEY,
        provinsi_id INT UNSIGNED NOT NULL,
        nama        VARCHAR(100) NOT NULL,
        kode        VARCHAR(10)  NULL,
        created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_kota_provinsi_nama (provinsi_id, nama),
        CONSTRAINT fk_kota_provinsi FOREIGN KEY (provinsi_id) REFERENCES tbl_elearning_provinsi (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'tbl_elearning_tenants',
    ddl: `
      CREATE TABLE IF NOT EXISTS tbl_elearning_tenants (
        id                 CHAR(36)     NOT NULL PRIMARY KEY,
        name               VARCHAR(255) NOT NULL,
        subdomain          VARCHAR(100) NOT NULL,
        legacy_instansi_id VARCHAR(50)  NULL,
        logo_url           TEXT         NULL,
        theme_color        VARCHAR(20)  NOT NULL DEFAULT '#0ea5e9',
        is_active          TINYINT(1)   NOT NULL DEFAULT 1,
        created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_tenants_subdomain (subdomain),
        KEY idx_tenants_legacy_instansi (legacy_instansi_id),
        CONSTRAINT fk_tenants_instansi FOREIGN KEY (legacy_instansi_id) REFERENCES tbl_elearning_master_instansi (id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'tbl_elearning_users',
    ddl: `
      CREATE TABLE IF NOT EXISTS tbl_elearning_users (
        id                 CHAR(36)     NOT NULL PRIMARY KEY,
        tenant_id          CHAR(36)     NOT NULL,
        username           VARCHAR(100) NOT NULL COMMENT 'Login credential (unique per tenant, case-insensitive)',
        employee_id        VARCHAR(100) NOT NULL COMMENT 'NIP / employee number (identity data, not a credential)',
        full_name          VARCHAR(255) NOT NULL,
        email              VARCHAR(255) NULL,
        password_hash      VARCHAR(255) NOT NULL,
        role_level         TINYINT      NOT NULL DEFAULT 4 COMMENT '0=Super Admin, 1=National Exec, 2=Province Exec, 3=City Exec, 4=Trainer',
        account_status     ENUM('PENDING','ACTIVE','REJECTED') NOT NULL DEFAULT 'PENDING',
        provinsi_id        INT UNSIGNED NULL,
        kota_id            INT UNSIGNED NULL,
        legacy_instansi_id VARCHAR(50)  NULL,
        legacy_org_id      VARCHAR(50)  NULL,
        legacy_satker_id   VARCHAR(50)  NULL,
        legacy_sub_org_id  VARCHAR(50)  NULL,
        profile_photo_url  VARCHAR(500) NULL,
        must_change_password TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Set by an admin reset; user must change password at next login',
        password_changed_at  TIMESTAMP  NULL,
        approved_by        CHAR(36)     NULL,
        approved_at        TIMESTAMP    NULL,
        last_login_at      TIMESTAMP    NULL,
        created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uq_users_tenant_employee (tenant_id, employee_id),
        UNIQUE KEY uq_users_tenant_username (tenant_id, username),
        KEY idx_users_tenant_role (tenant_id, role_level),
        KEY idx_users_status (account_status),
        KEY idx_users_provinsi (provinsi_id),
        KEY idx_users_kota (kota_id),
        KEY idx_users_legacy_instansi (legacy_instansi_id),
        KEY idx_users_legacy_org (legacy_org_id),
        KEY idx_users_legacy_satker (legacy_satker_id),
        KEY idx_users_legacy_sub_org (legacy_sub_org_id),
        CONSTRAINT fk_users_tenant   FOREIGN KEY (tenant_id)          REFERENCES tbl_elearning_tenants (id)            ON DELETE CASCADE,
        CONSTRAINT fk_users_provinsi FOREIGN KEY (provinsi_id)        REFERENCES tbl_elearning_provinsi (id)          ON DELETE SET NULL,
        CONSTRAINT fk_users_kota     FOREIGN KEY (kota_id)            REFERENCES tbl_elearning_kota (id)              ON DELETE SET NULL,
        CONSTRAINT fk_users_instansi FOREIGN KEY (legacy_instansi_id) REFERENCES tbl_elearning_master_instansi (id)   ON DELETE SET NULL,
        CONSTRAINT fk_users_org      FOREIGN KEY (legacy_org_id)      REFERENCES tbl_elearning_master_organisasi (id) ON DELETE SET NULL,
        CONSTRAINT fk_users_satker   FOREIGN KEY (legacy_satker_id)   REFERENCES tbl_elearning_master_satker (id)     ON DELETE SET NULL,
        CONSTRAINT fk_users_sub_org  FOREIGN KEY (legacy_sub_org_id)  REFERENCES tbl_elearning_master_sub_org (id)    ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'tbl_elearning_modules',
    ddl: `
      CREATE TABLE IF NOT EXISTS tbl_elearning_modules (
        id                 CHAR(36)     NOT NULL PRIMARY KEY,
        tenant_id          CHAR(36)     NULL COMMENT 'Owning tenant; NULL = master module distributed via tbl_elearning_module_tenants',
        created_by         CHAR(36)     NULL,
        author_id          CHAR(36)     NULL COMMENT 'Trainer/instructor who authored the module',
        title              VARCHAR(255) NOT NULL,
        description        TEXT         NULL,
        content_text       LONGTEXT     NULL COMMENT 'Rich text / markdown lesson body',
        quiz_data          JSON         NULL COMMENT '{ pass_score, time_limit_minutes, questions: [{ id, question, options[], answer_index }] }',
        view_count         INT UNSIGNED NOT NULL DEFAULT 0,
        presentation_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Times used in a field report',
        public_view_count  INT UNSIGNED NOT NULL DEFAULT 0,
        category           VARCHAR(100) NULL,
        target_audience    ENUM('TK/SD','MTS/SMP','SMA/SMK','Mahasiswa','Umum') NOT NULL DEFAULT 'Umum' COMMENT 'Education level the module is designed for',
        instructor_name    VARCHAR(255) NULL,
        video_url          TEXT         NULL,
        pdf_url            TEXT         NULL,
        thumbnail_url      TEXT         NULL,
        attachments_json   JSON         NULL,
        duration_minutes   INT          NOT NULL DEFAULT 0,
        has_quiz           TINYINT(1)   NOT NULL DEFAULT 0,
        approval_status    ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
        approved_by        CHAR(36)     NULL,
        approved_at        TIMESTAMP    NULL,
        published_at       TIMESTAMP    NULL,
        created_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at         TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_modules_tenant_status (tenant_id, approval_status),
        KEY idx_modules_status (approval_status),
        KEY idx_modules_author (author_id),
        CONSTRAINT fk_modules_tenant  FOREIGN KEY (tenant_id)  REFERENCES tbl_elearning_tenants (id) ON DELETE CASCADE,
        CONSTRAINT fk_modules_creator FOREIGN KEY (created_by) REFERENCES tbl_elearning_users (id)   ON DELETE SET NULL,
        CONSTRAINT fk_modules_author  FOREIGN KEY (author_id)  REFERENCES tbl_elearning_users (id)   ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'tbl_elearning_module_tenants',
    ddl: `
      CREATE TABLE IF NOT EXISTS tbl_elearning_module_tenants (
        module_id  CHAR(36)  NOT NULL,
        tenant_id  CHAR(36)  NOT NULL,
        granted_by CHAR(36)  NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (module_id, tenant_id),
        KEY idx_module_tenants_tenant (tenant_id),
        CONSTRAINT fk_mt_module FOREIGN KEY (module_id) REFERENCES tbl_elearning_modules (id) ON DELETE CASCADE,
        CONSTRAINT fk_mt_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_elearning_tenants (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    // Append-only audit of module access, carrying the viewer's territory so
    // executive reports can count viewers per provinsi/kota (bottom-up scoping).
    name: 'tbl_elearning_module_views',
    ddl: `
      CREATE TABLE IF NOT EXISTS tbl_elearning_module_views (
        id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        tenant_id   CHAR(36)      NOT NULL,
        module_id   CHAR(36)      NOT NULL,
        user_id     CHAR(36)      NULL,
        provinsi_id INT UNSIGNED  NULL,
        kota_id     INT UNSIGNED  NULL,
        kind        ENUM('VIEW','PUBLIC','PRESENTATION') NOT NULL DEFAULT 'VIEW',
        created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_views_tenant_created (tenant_id, created_at),
        KEY idx_views_module (module_id),
        KEY idx_views_user (user_id),
        KEY idx_views_provinsi (provinsi_id),
        KEY idx_views_kota (kota_id),
        CONSTRAINT fk_views_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_elearning_tenants (id) ON DELETE CASCADE,
        CONSTRAINT fk_views_module FOREIGN KEY (module_id) REFERENCES tbl_elearning_modules (id) ON DELETE CASCADE,
        CONSTRAINT fk_views_user   FOREIGN KEY (user_id)   REFERENCES tbl_elearning_users (id)   ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    // In-app inbox: one row per recipient (fan-out on write), read_at marks it seen.
    name: 'tbl_elearning_notifications',
    ddl: `
      CREATE TABLE IF NOT EXISTS tbl_elearning_notifications (
        id         CHAR(36)     NOT NULL PRIMARY KEY,
        tenant_id  CHAR(36)     NOT NULL,
        user_id    CHAR(36)     NOT NULL,
        type       VARCHAR(40)  NOT NULL,
        title      VARCHAR(255) NOT NULL,
        body       TEXT         NOT NULL,
        link       VARCHAR(500) NULL,
        report_id  CHAR(36)     NULL,
        read_at    TIMESTAMP    NULL,
        created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        KEY idx_notif_user_read (user_id, read_at, created_at),
        KEY idx_notif_report (report_id),
        CONSTRAINT fk_notif_tenant FOREIGN KEY (tenant_id) REFERENCES tbl_elearning_tenants (id) ON DELETE CASCADE,
        CONSTRAINT fk_notif_user   FOREIGN KEY (user_id)   REFERENCES tbl_elearning_users (id)   ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'tbl_elearning_menu_access',
    ddl: `
      CREATE TABLE IF NOT EXISTS tbl_elearning_menu_access (
        menu_key   VARCHAR(50) NOT NULL,
        role_level TINYINT     NOT NULL,
        allowed    TINYINT(1)  NOT NULL DEFAULT 1,
        updated_by CHAR(36)    NULL,
        updated_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (menu_key, role_level)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
  {
    name: 'tbl_elearning_field_reports',
    ddl: `
      CREATE TABLE IF NOT EXISTS tbl_elearning_field_reports (
        id                CHAR(36)      NOT NULL PRIMARY KEY,
        tenant_id         CHAR(36)      NOT NULL,
        trainer_id        CHAR(36)      NOT NULL,
        module_id         CHAR(36)      NOT NULL,
        provinsi_id       INT UNSIGNED  NULL,
        kota_id           INT UNSIGNED  NULL,
        location_name     VARCHAR(255)  NOT NULL,
        audience_category VARCHAR(100)  NOT NULL,
        participant_count INT           NOT NULL DEFAULT 0,
        latitude          DECIMAL(10,7) NULL,
        longitude         DECIMAL(10,7) NULL,
        notes             TEXT          NULL,
        photo_url         TEXT          NULL,
        status            ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
        reviewed_by       CHAR(36)      NULL,
        reviewed_at       TIMESTAMP     NULL,
        created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY idx_reports_tenant_created (tenant_id, created_at),
        KEY idx_reports_trainer (trainer_id),
        KEY idx_reports_module (module_id),
        KEY idx_reports_provinsi (provinsi_id),
        KEY idx_reports_kota (kota_id),
        CONSTRAINT fk_reports_tenant   FOREIGN KEY (tenant_id)   REFERENCES tbl_elearning_tenants (id)   ON DELETE CASCADE,
        CONSTRAINT fk_reports_trainer  FOREIGN KEY (trainer_id)  REFERENCES tbl_elearning_users (id)     ON DELETE CASCADE,
        CONSTRAINT fk_reports_module   FOREIGN KEY (module_id)   REFERENCES tbl_elearning_modules (id)   ON DELETE RESTRICT,
        CONSTRAINT fk_reports_provinsi FOREIGN KEY (provinsi_id) REFERENCES tbl_elearning_provinsi (id) ON DELETE SET NULL,
        CONSTRAINT fk_reports_kota     FOREIGN KEY (kota_id)     REFERENCES tbl_elearning_kota (id)     ON DELETE SET NULL,
        CONSTRAINT fk_reports_reviewer FOREIGN KEY (reviewed_by) REFERENCES tbl_elearning_users (id)     ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  },
];

/** Column upgrades for installs created before these columns existed. All IF NOT EXISTS. */
const COLUMN_UPGRADES: string[] = [
  // Username becomes the login credential. Existing rows are back-filled from employee_id (lower-cased) so nobody is locked out.
  `ALTER TABLE tbl_elearning_users ADD COLUMN IF NOT EXISTS username VARCHAR(100) NULL AFTER tenant_id`,
  `UPDATE tbl_elearning_users SET username = LOWER(employee_id) WHERE username IS NULL OR username = ''`,
  `ALTER TABLE tbl_elearning_users MODIFY username VARCHAR(100) NOT NULL COMMENT 'Login credential (unique per tenant, case-insensitive)'`,
  `ALTER TABLE tbl_elearning_users ADD UNIQUE INDEX IF NOT EXISTS uq_users_tenant_username (tenant_id, username)`,
  `ALTER TABLE tbl_elearning_users
     ADD COLUMN IF NOT EXISTS account_status ENUM('PENDING','ACTIVE','REJECTED') NOT NULL DEFAULT 'PENDING' AFTER role_level,
     ADD COLUMN IF NOT EXISTS provinsi_id INT UNSIGNED NULL AFTER account_status,
     ADD COLUMN IF NOT EXISTS kota_id INT UNSIGNED NULL AFTER provinsi_id,
     ADD COLUMN IF NOT EXISTS legacy_instansi_id VARCHAR(50) NULL AFTER kota_id,
     ADD COLUMN IF NOT EXISTS legacy_org_id VARCHAR(50) NULL AFTER legacy_instansi_id,
     ADD COLUMN IF NOT EXISTS legacy_satker_id VARCHAR(50) NULL AFTER legacy_org_id,
     ADD COLUMN IF NOT EXISTS legacy_sub_org_id VARCHAR(50) NULL AFTER legacy_satker_id,
     ADD COLUMN IF NOT EXISTS profile_photo_url VARCHAR(500) NULL AFTER legacy_sub_org_id,
     ADD COLUMN IF NOT EXISTS must_change_password TINYINT(1) NOT NULL DEFAULT 0 AFTER profile_photo_url,
     ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP NULL AFTER must_change_password`,
  // Column comments: master tables are local to db_elearning
  `ALTER TABLE tbl_elearning_users
     MODIFY legacy_instansi_id VARCHAR(50) NULL COMMENT 'FK -> tbl_elearning_master_instansi.id',
     MODIFY legacy_org_id      VARCHAR(50) NULL COMMENT 'FK -> tbl_elearning_master_organisasi.id',
     MODIFY legacy_satker_id   VARCHAR(50) NULL COMMENT 'FK -> tbl_elearning_master_satker.id',
     MODIFY legacy_sub_org_id  VARCHAR(50) NULL COMMENT 'FK -> tbl_elearning_master_sub_org.id'`,
  `ALTER TABLE tbl_elearning_modules
     ADD COLUMN IF NOT EXISTS approval_status ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING' AFTER has_quiz,
     ADD COLUMN IF NOT EXISTS approved_by CHAR(36) NULL AFTER approval_status,
     ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP NULL AFTER approved_by,
     ADD COLUMN IF NOT EXISTS author_id CHAR(36) NULL AFTER created_by,
     ADD COLUMN IF NOT EXISTS content_text LONGTEXT NULL AFTER description,
     ADD COLUMN IF NOT EXISTS quiz_data JSON NULL AFTER content_text,
     ADD COLUMN IF NOT EXISTS view_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER quiz_data,
     ADD COLUMN IF NOT EXISTS presentation_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER view_count,
     ADD COLUMN IF NOT EXISTS public_view_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER presentation_count,
     ADD INDEX IF NOT EXISTS idx_modules_author (author_id)`,
  `ALTER TABLE tbl_elearning_modules
     ADD CONSTRAINT fk_modules_author FOREIGN KEY IF NOT EXISTS (author_id) REFERENCES tbl_elearning_users (id) ON DELETE SET NULL`,
  // Hierarchical approval: the role expected to review (one level above the trainer, by territory),
  // who actually reviewed it and through which path, plus an optional note for the trainer.
  `ALTER TABLE tbl_elearning_field_reports
     ADD COLUMN IF NOT EXISTS approver_role_level TINYINT NULL COMMENT '3=Eksekutif Kota, 2=Eksekutif Provinsi, 1=Eksekutif Nasional' AFTER status,
     ADD COLUMN IF NOT EXISTS reviewed_by_role TINYINT NULL AFTER reviewed_by,
     ADD COLUMN IF NOT EXISTS review_path ENUM('DIRECT_SUPERVISOR','SUPER_ADMIN_OVERRIDE') NULL AFTER reviewed_by_role,
     ADD COLUMN IF NOT EXISTS review_note TEXT NULL AFTER review_path,
     ADD INDEX IF NOT EXISTS idx_reports_status_approver (status, approver_role_level)`,
  `UPDATE tbl_elearning_field_reports
      SET approver_role_level = CASE WHEN kota_id IS NOT NULL THEN 3 WHEN provinsi_id IS NOT NULL THEN 2 ELSE 1 END
    WHERE approver_role_level IS NULL`,
  // "Lap Kegiatan": activity date, education-level audience, and 2-4 evidence photos (JSON array of URLs).
  `ALTER TABLE tbl_elearning_field_reports
     ADD COLUMN IF NOT EXISTS report_date DATE NULL AFTER location_name,
     ADD COLUMN IF NOT EXISTS audience ENUM('TK/SD','SMP','SMA/SMK','Mahasiswa','Umum') NULL AFTER audience_category,
     ADD COLUMN IF NOT EXISTS photo_urls JSON NULL AFTER photo_url,
     ADD INDEX IF NOT EXISTS idx_reports_date (report_date)`,
  `UPDATE tbl_elearning_field_reports SET report_date = DATE(created_at) WHERE report_date IS NULL`,
  `UPDATE tbl_elearning_field_reports
      SET audience = CASE WHEN audience_category IN ('TK/SD','SMP','SMA/SMK','Mahasiswa','Umum') THEN audience_category ELSE 'Umum' END
    WHERE audience IS NULL`,
  `UPDATE tbl_elearning_field_reports SET audience_category = audience WHERE audience_category <> audience`,
  `UPDATE tbl_elearning_field_reports SET photo_urls = JSON_ARRAY(photo_url) WHERE photo_urls IS NULL AND photo_url IS NOT NULL`,
  // target_audience becomes an education-level enum. Legacy free-text values are remapped first
  // (Students -> SMA/SMK, everything else -> Umum) so the type change never fails or drops data.
  `UPDATE tbl_elearning_modules SET target_audience = CASE
      WHEN target_audience IN ('TK/SD','MTS/SMP','SMA/SMK','Mahasiswa','Umum') THEN target_audience
      WHEN target_audience = 'Students' THEN 'SMA/SMK'
      ELSE 'Umum' END
    WHERE target_audience IS NULL OR target_audience NOT IN ('TK/SD','MTS/SMP','SMA/SMK','Mahasiswa','Umum')`,
  `ALTER TABLE tbl_elearning_modules
     MODIFY target_audience ENUM('TK/SD','MTS/SMP','SMA/SMK','Mahasiswa','Umum') NOT NULL DEFAULT 'Umum' COMMENT 'Education level the module is designed for'`,
];

// ── Master data: one-time copy from the legacy database + hierarchy inference ──
const MASTER_COPY: Array<{ local: string; legacy: string }> = [
  { local: 'tbl_elearning_master_instansi', legacy: 'master_instansi' },
  { local: 'tbl_elearning_master_organisasi', legacy: 'master_organisasi' },
  { local: 'tbl_elearning_master_satker', legacy: 'master_satker' },
  { local: 'tbl_elearning_master_sub_org', legacy: 'master_sub_org' },
];

/** Second slug segment: 'org-bin-dn' -> 'bin'. Used to infer parents for legacy rows. */
const SEG2 = (col: string) => `SUBSTRING_INDEX(SUBSTRING_INDEX(${col}, '-', 2), '-', -1)`;

async function importMasterData(conn: Conn) {
  const [dbRow] = await q(conn, `SELECT SCHEMA_NAME AS s FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`, [LEGACY_DB]);
  if (!dbRow) {
    log(`  (legacy database ${LEGACY_DB} not present - skipping import)`);
    return;
  }
  for (const { local, legacy } of MASTER_COPY) {
    if ((await count(conn, local)) > 0) continue; // guard: never overwrite a populated table
    const [exists] = await q(conn, `SELECT 1 AS ok FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`, [LEGACY_DB, legacy]);
    if (!exists) continue;
    const res = await q<mysql.ResultSetHeader>(conn, `INSERT IGNORE INTO \`${local}\` (id, nama) SELECT id, nama FROM \`${LEGACY_DB}\`.\`${legacy}\``);
    log(`  + ${local}: imported ${res.affectedRows} rows from ${LEGACY_DB}.${legacy}`);
  }

  // Infer hierarchy ONLY for rows that have no parent yet (admin-set parents are never touched).
  const inferred = [
    await q<mysql.ResultSetHeader>(conn, `UPDATE tbl_elearning_master_organisasi o SET o.instansi_id = CONCAT('ins-', ${SEG2('o.id')})
       WHERE o.instansi_id IS NULL AND EXISTS (SELECT 1 FROM tbl_elearning_master_instansi i WHERE i.id = CONCAT('ins-', ${SEG2('o.id')}))`),
    await q<mysql.ResultSetHeader>(conn, `UPDATE tbl_elearning_master_satker s SET s.organisasi_id =
         (SELECT o.id FROM tbl_elearning_master_organisasi o WHERE ${SEG2('o.id')} = ${SEG2('s.id')} ORDER BY o.id LIMIT 1)
       WHERE s.organisasi_id IS NULL AND EXISTS (SELECT 1 FROM tbl_elearning_master_organisasi o WHERE ${SEG2('o.id')} = ${SEG2('s.id')})`),
    await q<mysql.ResultSetHeader>(conn, `UPDATE tbl_elearning_master_sub_org x SET x.satker_id =
         (SELECT s.id FROM tbl_elearning_master_satker s WHERE ${SEG2('s.id')} = ${SEG2('x.id')} ORDER BY s.id LIMIT 1)
       WHERE x.satker_id IS NULL AND EXISTS (SELECT 1 FROM tbl_elearning_master_satker s WHERE ${SEG2('s.id')} = ${SEG2('x.id')})`),
  ];
  const linked = inferred.reduce((n, r) => n + r.affectedRows, 0);
  if (linked) log(`  + hierarchy inferred for ${linked} master rows`);
}

/** Older installs pointed users/tenants at sm_learning.master_* — swap those FKs for local ones. */
async function relinkForeignKeys(conn: Conn) {
  const crossDb = await q(conn, `SELECT TABLE_NAME AS t, CONSTRAINT_NAME AS c FROM information_schema.REFERENTIAL_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND UNIQUE_CONSTRAINT_SCHEMA <> DATABASE()`);
  for (const row of crossDb) {
    await conn.query(`ALTER TABLE \`${row.t}\` DROP FOREIGN KEY \`${row.c}\``);
    log(`  - dropped cross-database FK ${row.t}.${row.c}`);
  }
  const local: Array<[string, string, string, string]> = [
    ['tbl_elearning_tenants', 'fk_tenants_instansi', 'legacy_instansi_id', 'tbl_elearning_master_instansi'],
    ['tbl_elearning_users', 'fk_users_instansi', 'legacy_instansi_id', 'tbl_elearning_master_instansi'],
    ['tbl_elearning_users', 'fk_users_org', 'legacy_org_id', 'tbl_elearning_master_organisasi'],
    ['tbl_elearning_users', 'fk_users_satker', 'legacy_satker_id', 'tbl_elearning_master_satker'],
    ['tbl_elearning_users', 'fk_users_sub_org', 'legacy_sub_org_id', 'tbl_elearning_master_sub_org'],
  ];
  for (const [table, name, col, ref] of local) {
    await conn.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` FOREIGN KEY IF NOT EXISTS (\`${col}\`) REFERENCES \`${ref}\` (id) ON DELETE SET NULL`);
  }
}

// ── Seed data (inserted only into EMPTY tables) ───────────────────────────────
const PROVINSI = [
  { id: 1, nama: 'DKI Jakarta', kode: '31' },
  { id: 2, nama: 'Jawa Barat', kode: '32' },
  { id: 3, nama: 'Banten', kode: '36' },
];
const KOTA = [
  { id: 1, provinsi_id: 1, nama: 'Jakarta Selatan', kode: '3171' },
  { id: 2, provinsi_id: 1, nama: 'Jakarta Pusat', kode: '3173' },
  { id: 3, provinsi_id: 2, nama: 'Kota Bandung', kode: '3273' },
  { id: 4, provinsi_id: 2, nama: 'Kota Bekasi', kode: '3275' },
  { id: 5, provinsi_id: 3, nama: 'Kota Tangerang', kode: '3671' },
  { id: 6, provinsi_id: 3, nama: 'Kota Serang', kode: '3673' },
];
/** Primary tenant = the organisation that owns this platform (instansi ins-basarnas in master data). */
export const PRIMARY_TENANT = { id: 'dummy-uuid', name: 'Korps Lalu Lintas Polri', subdomain: 'korlantas', instansi_id: 'ins-polri' };

const TENANTS = [{ id: PRIMARY_TENANT.id, name: PRIMARY_TENANT.name, subdomain: PRIMARY_TENANT.subdomain }];
const T = TENANTS[0].id;

/**
 * The ONLY account the boot migration ever creates: the Super Admin, and only when the users table is empty.
 * Operational accounts and learning content come from `npm run db:seed:clean` (src/database/seedProductionClean.ts).
 * No demo modules, reports or tenants are seeded here, so restarting the server never resurrects dummy data.
 */
const SUPER_ADMIN = { id: 'usr-adm-0001', username: process.env.SEED_ADMIN_USERNAME || 'adm-0001', employee_id: 'ADM-0001', full_name: 'Sistem Administrator' };

const MENU_DEFAULTS: Record<string, number[]> = {
  dashboard: [0, 1, 2, 3],
  executive_reports: [0, 1, 2, 3],
  reports_inbox: [0, 1, 2, 3],
  modules: [0, 1, 2, 3, 4],
  submit_report: [4],
  my_reports: [4],
  settings: [0],
  access_management: [0],
};

/** Each block runs only when its table is EMPTY — user-entered rows are never touched. */
async function seed(conn: Conn) {
  const seedIfEmpty = async (table: string, run: () => Promise<void>) => {
    if ((await count(conn, table)) > 0) {
      log(`  = ${table}: has data, seed skipped`);
      return;
    }
    await run();
    log(`  + ${table}: seeded`);
  };

  await seedIfEmpty('tbl_elearning_provinsi', async () => { await conn.query(`INSERT IGNORE INTO tbl_elearning_provinsi (id, nama, kode) VALUES ?`, [PROVINSI.map((p) => [p.id, p.nama, p.kode])]); });
  await seedIfEmpty('tbl_elearning_kota', async () => { await conn.query(`INSERT IGNORE INTO tbl_elearning_kota (id, provinsi_id, nama, kode) VALUES ?`, [KOTA.map((k) => [k.id, k.provinsi_id, k.nama, k.kode])]); });

  const instansiIds = (await q(conn, `SELECT id FROM tbl_elearning_master_instansi ORDER BY id LIMIT 3`)).map((r) => r.id as string);
  const primaryInstansi = instansiIds.includes(PRIMARY_TENANT.instansi_id) ? PRIMARY_TENANT.instansi_id : (instansiIds[0] ?? null);

  await seedIfEmpty('tbl_elearning_tenants', async () => {
    await conn.query(`INSERT IGNORE INTO tbl_elearning_tenants (id, name, subdomain, legacy_instansi_id) VALUES ?`, [TENANTS.map((t) => [t.id, t.name, t.subdomain, primaryInstansi])]);
  });

  await seedIfEmpty('tbl_elearning_users', async () => {
    const hash = bcrypt.hashSync(process.env.SEED_ADMIN_PASSWORD || 'password123', 10);
    await conn.query(
      `INSERT IGNORE INTO tbl_elearning_users
         (id, tenant_id, username, employee_id, full_name, password_hash, role_level, account_status, legacy_instansi_id, must_change_password, approved_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'ACTIVE', ?, 1, NOW())`,
      [SUPER_ADMIN.id, T, SUPER_ADMIN.username, SUPER_ADMIN.employee_id, SUPER_ADMIN.full_name, hash, primaryInstansi],
    );
    log(`  + super admin "${SUPER_ADMIN.username}" created (must change password at first login)`);
  });

  await seedIfEmpty('tbl_elearning_menu_access', async () => {
    const rows = Object.entries(MENU_DEFAULTS).flatMap(([key, roles]) => [0, 1, 2, 3, 4].map((lvl) => [key, lvl, roles.includes(lvl) ? 1 : 0]));
    await conn.query(`INSERT IGNORE INTO tbl_elearning_menu_access (menu_key, role_level, allowed) VALUES ?`, [rows]);
  });

  // Menu keys added after the first boot get their default rows; rows the admin already edited are never touched.
  const menuRows = Object.entries(MENU_DEFAULTS).flatMap(([key, roles]) => [0, 1, 2, 3, 4].map((lvl) => [key, lvl, roles.includes(lvl) ? 1 : 0]));
  const [added] = await conn.query<ResultSetHeader>(`INSERT IGNORE INTO tbl_elearning_menu_access (menu_key, role_level, allowed) VALUES ?`, [menuRows]);
  if (added.affectedRows) log(`  + tbl_elearning_menu_access: ${added.affectedRows} new menu row(s) added`);
}

// ── Entry points ─────────────────────────────────────────────────────────────
export async function runMigration(): Promise<void> {
  const { database, ...serverConfig } = DB_CONFIG;
  const conn = await mysql.createConnection(serverConfig);
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.changeUser({ database });
    log(`-> ${database} @ ${serverConfig.host}:${serverConfig.port}`);

    log('\nTables');
    for (const table of TABLES) {
      await conn.query(table.ddl);
      log(`  + ${table.name}`);
    }

    log('\nColumn upgrades');
    for (const ddl of COLUMN_UPGRADES) await conn.query(ddl);
    log('  + users / modules columns verified');

    log('\nMaster data');
    await importMasterData(conn);
    await relinkForeignKeys(conn);
    for (const { local } of MASTER_COPY) log(`  * ${local}: ${await count(conn, local)} rows`);

    log('\nSeed (empty tables only)');
    await seed(conn);

    log('\nWilayah Indonesia (38 provinsi, 514 kabupaten/kota — idempotent)');
    await seedRegionsFull(conn, log);

    // Rebrand: the primary tenant is the owning organisation. If an older install still points it at a
    // different instansi (placeholder or previous branding), align name/subdomain/instansi in one idempotent step.
    const rebrand = await q<mysql.ResultSetHeader>(
      conn,
      `UPDATE tbl_elearning_tenants SET name = ?, subdomain = ?, legacy_instansi_id = ?
        WHERE id = ? AND (legacy_instansi_id IS NULL OR legacy_instansi_id <> ?)
          AND EXISTS (SELECT 1 FROM tbl_elearning_master_instansi i WHERE i.id = ?)`,
      [PRIMARY_TENANT.name, PRIMARY_TENANT.subdomain, PRIMARY_TENANT.instansi_id, PRIMARY_TENANT.id, PRIMARY_TENANT.instansi_id, PRIMARY_TENANT.instansi_id],
    );
    if (rebrand.affectedRows) log(`  + primary tenant renamed to "${PRIMARY_TENANT.name}"`);

  } finally {
    await conn.end();
  }
}

if (require.main === module) {
  runMigration()
    .then(() => {
      console.log('\nMigration complete.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('\nMigration failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
