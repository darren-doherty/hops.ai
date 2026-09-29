import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var ${name} (copy .env.example to .env)`);
  return value;
}

function range(name: string, fallback: string): [number, number] {
  const [min, max] = (process.env[name] ?? fallback).split('-').map(Number);
  return [min, max ?? min];
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: required('DATABASE_URL'),
  testDatabaseUrl: process.env.TEST_DATABASE_URL,
  graceMs: Number(process.env.GRACE_MS ?? 10_000),
  staleMs: Number(process.env.STALE_MS ?? 900_000),
  faults: {
    search: {
      latencyMs: range('SEARCH_LATENCY_MS', '100-800'),
      failureRate: Number(process.env.SEARCH_FAILURE_RATE ?? 0),
    },
    notify: {
      latencyMs: range('NOTIFY_LATENCY_MS', '100-500'),
      failureRate: Number(process.env.NOTIFY_FAILURE_RATE ?? 0),
    },
  },
};
