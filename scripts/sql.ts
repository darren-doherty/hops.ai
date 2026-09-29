// Dev helper: run an ad-hoc SQL query against DATABASE_URL and print the rows.
// Usage: pnpm sql "select consumer, status, count(*) from event_deliveries group by 1, 2"
import { pool } from '../server/db.js';

const { rows } = await pool.query(process.argv[2]);
console.table(rows);
await pool.end();
