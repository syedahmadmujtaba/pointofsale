import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined');
}

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1,
  connectionTimeoutMillis: 10_000,
});

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const migrationsDirectory = path.resolve(scriptDirectory, '..', 'migrations');
const baselineName = '000_baseline.sql';
const lockId = 527244173;

const client = await pool.connect();

try {
  await client.query('SELECT pg_advisory_lock($1)', [lockId]);
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  // Databases created before the migration runner already contain the baseline.
  const existingSchema = await client.query(`
    SELECT to_regclass('public.products') IS NOT NULL AS exists
  `);

  if (existingSchema.rows[0].exists) {
    await client.query(
      'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
      [baselineName]
    );
  }

  const migrationNames = (await fs.readdir(migrationsDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort();

  const appliedResult = await client.query('SELECT name FROM schema_migrations');
  const applied = new Set(appliedResult.rows.map((row) => row.name));

  for (const name of migrationNames) {
    if (applied.has(name)) continue;

    const sql = await fs.readFile(path.join(migrationsDirectory, name), 'utf8');
    console.log(`Applying ${name}`);

    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }

  console.log('Database migrations are up to date');
} finally {
  await client.query('SELECT pg_advisory_unlock($1)', [lockId]).catch(() => undefined);
  client.release();
  await pool.end();
}
