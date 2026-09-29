// Recreates the database (if missing) and applies db/schema.sql.
// Usage: pnpm db:reset          → DATABASE_URL
//        pnpm db:reset:test     → TEST_DATABASE_URL
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import pg from 'pg';

const useTest = process.argv.includes('--test');
const url = useTest ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
if (!url) throw new Error(`Missing ${useTest ? 'TEST_DATABASE_URL' : 'DATABASE_URL'} (copy .env.example to .env)`);

const target = new URL(url);
const dbName = target.pathname.slice(1);

// Create the database if it doesn't exist, via the default "postgres" database.
const adminUrl = new URL(url);
adminUrl.pathname = '/postgres';
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
if (exists.rowCount === 0) {
  await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '')}"`);
  console.log(`Created database ${dbName}`);
}
await admin.end();

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
await client.end();
console.log(`Schema applied to ${dbName}`);
