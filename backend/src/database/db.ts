import mysql, { Pool } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const DB_CONFIG = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'db_elearning',
};

/** Legacy master-data database on the same MySQL server (cross-database joins). */
export const LEGACY_DB = process.env.LEGACY_DB_NAME || 'sm_learning';

let pool: Pool | null = null;

/** Lazily-created shared connection pool bound to `db_elearning`. */
export const getPool = (): Pool => {
  pool ??= mysql.createPool({
    ...DB_CONFIG,
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true,
  });
  return pool;
};
