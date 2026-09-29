// Makes in-process fakes behave like services across a network: random
// latency, and injected failures. Settings are mutable so tests and
// /debug/faults can change them at runtime.
import { config } from '../config.js';

export class ExternalUnavailableError extends Error {
  name = 'ExternalUnavailableError';
}

export type FaultSettings = { latencyMs: [number, number]; failureRate: number };

export const faults: Record<'search' | 'notify', FaultSettings> = {
  search: { ...config.faults.search },
  notify: { ...config.faults.notify },
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function simulateNetwork(service: keyof typeof faults): Promise<void> {
  const { latencyMs: [min, max], failureRate } = faults[service];
  await sleep(min + Math.random() * (max - min));
  if (Math.random() < failureRate) {
    throw new ExternalUnavailableError(`${service} unavailable (injected failure)`);
  }
}
