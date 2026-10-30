/**
 * Persistence with a synchronous read API over a pluggable async backend.
 *
 * Web: localStorage. Native (iOS via Capacitor): JSON files in the app's data directory, because
 * the OS may clear a web view's localStorage. `initStorage` loads every key into memory before the
 * app renders, so components can keep reading synchronously; writes go to memory immediately and
 * reach the backend shortly after (or at once on `flushStorage`, e.g. when the app is backgrounded).
 * All data stays on the device.
 */

export interface StorageBackend {
  read(key: string): Promise<string | null>;
  write(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

const PREFIX = 'hml.';

export const KEYS = {
  settings: 'settings.v1',
  hands: 'hands.v1',
  drills: 'drills.v1',
  session: 'session.v1',
  ranges: 'ranges.current',
} as const;

export const MAX_STORED_HANDS = 300;
export const MAX_STORED_DRILLS = 2000;
const WRITE_DELAY_MS = 400;

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export const localStorageBackend: StorageBackend = {
  read: async (key) => safeLocalStorage()?.getItem(PREFIX + key) ?? null,
  write: async (key, value) => safeLocalStorage()?.setItem(PREFIX + key, value),
  remove: async (key) => safeLocalStorage()?.removeItem(PREFIX + key),
};

let backend: StorageBackend = localStorageBackend;
const cache = new Map<string, string>();
const pending = new Map<string, string | null>();
let timer: ReturnType<typeof setTimeout> | null = null;

/**
 * Select the backend and load all known keys into memory. When `migrateFrom` is given, keys the
 * backend does not have yet are copied from it (first launch after switching storage).
 */
export async function initStorage(b: StorageBackend = localStorageBackend, migrateFrom?: StorageBackend): Promise<void> {
  backend = b;
  cache.clear();
  for (const key of Object.values(KEYS)) {
    let value = await b.read(key).catch(() => null);
    if (value === null && migrateFrom) {
      value = await migrateFrom.read(key).catch(() => null);
      if (value !== null) await b.write(key, value).catch(() => {});
    }
    if (value !== null) cache.set(key, value);
  }
}

export function load<T>(key: string, fallback: T): T {
  // Before initStorage (and in tests) fall back to localStorage directly.
  const raw = cache.has(key) ? cache.get(key)! : (safeLocalStorage()?.getItem(PREFIX + key) ?? null);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T): void {
  const raw = JSON.stringify(value);
  if (cache.get(key) === raw) return;
  cache.set(key, raw);
  schedule(key, raw);
}

export function remove(key: string): void {
  cache.delete(key);
  schedule(key, null);
}

function schedule(key: string, raw: string | null) {
  pending.set(key, raw);
  if (!timer) timer = setTimeout(() => void flushStorage(), WRITE_DELAY_MS);
}

/** Write all pending changes to the backend now. Failures are swallowed: the app keeps working in memory. */
export async function flushStorage(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  const batch = [...pending];
  pending.clear();
  await Promise.all(batch.map(([k, v]) => (v === null ? backend.remove(k) : backend.write(k, v)).catch(() => {})));
}
