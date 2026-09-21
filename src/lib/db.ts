import { Pool } from "pg";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("❌ DATABASE_URL is not defined in .env");
}

// Reuse the pool across Next.js hot reloads and module re-evaluations so cloud
// databases are not flooded with duplicate connections.
const globalForPostgres = globalThis as unknown as { pgPool?: Pool };

export const pool =
  globalForPostgres.pgPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 5_000,
  });

if (!globalForPostgres.pgPool) {
  globalForPostgres.pgPool = pool;
  pool.connect()
    .then((client) => {
      client.release();
      console.log("✅ Database connected");
    })
    .catch((err) => console.error("❌ Database connection error", err));
}
