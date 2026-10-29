/** Versioned, failure-tolerant localStorage persistence. All data stays on the device. */

const PREFIX = 'hml.';

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage full or unavailable (private mode): the app keeps working without persistence.
  }
}

export function remove(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

export const KEYS = {
  settings: 'settings.v1',
  hands: 'hands.v1',
  drills: 'drills.v1',
  session: 'session.v1',
} as const;

export const MAX_STORED_HANDS = 300;
export const MAX_STORED_DRILLS = 2000;
