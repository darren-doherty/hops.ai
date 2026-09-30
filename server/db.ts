import pg from 'pg';
import { config } from './config.js';

export type Db = pg.Pool | pg.PoolClient;

// Tests drop and recreate the schema, so they must never fall back to the dev database.
if (process.env.VITEST && !config.testDatabaseUrl) throw new Error('TEST_DATABASE_URL must be set to run tests');

export const pool = new pg.Pool({
  connectionString: process.env.VITEST ? config.testDatabaseUrl : config.databaseUrl,
  max: 10,
});

/** Runs fn inside a transaction; commits on success, rolls back on any error. */
export async function withTx<T>(fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
