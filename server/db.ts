import pg from 'pg';
import { config } from './config.js';

export type Db = pg.Pool | pg.PoolClient;

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
