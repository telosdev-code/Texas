import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * React Native counterpart of storage.ts (Metro picks *.native.ts on iOS/Android).
 * Same synchronous API, backed by AsyncStorage: `initStorage` must finish before the first render,
 * then reads come from memory and writes go to memory at once and to disk in the background.
 */
const PREFIX = 'hml.';

export const KEYS = {
  settings: 'settings.v1',
  hands: 'hands.v1',
  drills: 'drills.v1',
  session: 'session.v1',
} as const;

export const MAX_STORED_HANDS = 300;
export const MAX_STORED_DRILLS = 2000;

const cache = new Map<string, string>();

export async function initStorage(): Promise<void> {
  try {
    const pairs = await AsyncStorage.multiGet(Object.values(KEYS).map((k) => PREFIX + k));
    for (const [k, v] of pairs) if (v !== null) cache.set(k.slice(PREFIX.length), v);
  } catch {
    // Unreadable storage: start empty; the app keeps working in memory.
  }
}

export function load<T>(key: string, fallback: T): T {
  const raw = cache.get(key);
  if (raw === undefined) return fallback;
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
  AsyncStorage.setItem(PREFIX + key, raw).catch(() => {});
}

export function remove(key: string): void {
  cache.delete(key);
  AsyncStorage.removeItem(PREFIX + key).catch(() => {});
}
