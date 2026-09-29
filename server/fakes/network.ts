// Makes in-process fakes behave like services across a network: random
// latency, and injected failures. Settings are mutable so tests and
// /debug/faults can change them at runtime.
import { config } from '../config.js';

export class ExternalUnavailableError extends Error {
  name = 'ExternalUnavailableError';
}

export type FaultSettings = { latencyMs: [number, number]; failureRate: number };
export type Service = 'search' | 'notify';

export const faults: Record<Service, FaultSettings> = {
  search: { ...config.faults.search },
  notify: { ...config.faults.notify },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Calls `effect` as if it were a remote request. A failure is equally likely
 * to be:
 *  - request lost: the effect never happens, or
 *  - response lost: the effect DID happen, but the caller sees an error.
 * The second case is the one that makes retries repeat work, so it is what
 * really exercises idempotency (version checks, idempotency keys).
 */
export async function callExternal<T>(service: Service, effect: () => Promise<T>): Promise<T> {
  const { latencyMs: [min, max], failureRate } = faults[service];
  await sleep(min + Math.random() * (max - min));
  const fail = Math.random() < failureRate;
  if (fail && Math.random() < 0.5) throw new ExternalUnavailableError(`${service} unavailable (request lost)`);
  const result = await effect();
  if (fail) throw new ExternalUnavailableError(`${service} unavailable (response lost after the call succeeded)`);
  return result;
}
