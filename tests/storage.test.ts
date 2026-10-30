import { describe, expect, it } from 'vitest';
import { createBackup, mergeBackup, parseBackup } from '../src/storage/backup';
import { flushStorage, initStorage, KEYS, load, remove, save, type StorageBackend } from '../src/storage/storage';
import type { StoredHand } from '../src/review/analysis';
import type { DrillRecord } from '../src/review/progress';

function memoryBackend(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const writes: string[] = [];
  const b: StorageBackend = {
    read: async (k) => data.get(k) ?? null,
    write: async (k, v) => {
      writes.push(k);
      data.set(k, v);
    },
    remove: async (k) => void data.delete(k),
  };
  return { b, data, writes };
}

describe('storage', () => {
  it('loads every known key before first use and reads synchronously', async () => {
    const { b } = memoryBackend({ [KEYS.settings]: '{"bigBlind":20}', [KEYS.drills]: '[1,2]' });
    await initStorage(b);
    expect(load(KEYS.settings, {})).toEqual({ bigBlind: 20 });
    expect(load(KEYS.drills, [])).toEqual([1, 2]);
    expect(load(KEYS.hands, 'fallback')).toBe('fallback');
  });

  it('batches writes and persists them on flush', async () => {
    const { b, data, writes } = memoryBackend();
    await initStorage(b);
    save(KEYS.settings, { a: 1 });
    save(KEYS.settings, { a: 2 });
    save(KEYS.hands, []);
    expect(load(KEYS.settings, null)).toEqual({ a: 2 }); // visible immediately
    expect(writes).toEqual([]); // not yet written
    await flushStorage();
    expect(JSON.parse(data.get(KEYS.settings)!)).toEqual({ a: 2 });
    expect(writes.filter((k) => k === KEYS.settings)).toHaveLength(1);
    remove(KEYS.hands);
    await flushStorage();
    expect(data.has(KEYS.hands)).toBe(false);
  });

  it('migrates data from the old backend on first native launch', async () => {
    const old = memoryBackend({ [KEYS.hands]: '[{"id":"x"}]', [KEYS.settings]: '{"old":true}' });
    const fresh = memoryBackend({ [KEYS.settings]: '{"new":true}' });
    await initStorage(fresh.b, old.b);
    expect(load(KEYS.hands, [])).toEqual([{ id: 'x' }]);
    expect(fresh.data.get(KEYS.hands)).toBe('[{"id":"x"}]');
    // Existing data in the new backend wins.
    expect(load(KEYS.settings, {})).toEqual({ new: true });
  });

  it('keeps working in memory when the backend fails', async () => {
    const failing: StorageBackend = {
      read: async () => { throw new Error('io'); },
      write: async () => { throw new Error('io'); },
      remove: async () => { throw new Error('io'); },
    };
    await initStorage(failing);
    save(KEYS.session, { n: 1 });
    await expect(flushStorage()).resolves.toBeUndefined();
    expect(load(KEYS.session, null)).toEqual({ n: 1 });
  });
});

const hand = (id: string, timestamp: number) =>
  ({ id, timestamp, humanSeat: 0, players: [], log: [], net: [0, 0], config: { smallBlind: 5, bigBlind: 10 } }) as unknown as StoredHand;
const drill = (timestamp: number): DrillRecord => ({ kind: 'combos', timestamp, correct: true, score: 1 });

describe('backup', () => {
  it('round-trips through JSON', () => {
    const b = createBackup([hand('a', 1)], [drill(5)], new Date('2026-10-30T12:00:00Z'));
    const parsed = parseBackup(JSON.stringify(b));
    expect(parsed.hands[0].id).toBe('a');
    expect(parsed.drills).toHaveLength(1);
    expect(parsed.exportedAt).toBe('2026-10-30T12:00:00.000Z');
  });

  it('rejects files that are not valid backups', () => {
    expect(() => parseBackup('not json')).toThrow(/not valid JSON/);
    expect(() => parseBackup('{"app":"other"}')).toThrow(/not a Hold'em Math Lab backup/);
    expect(() => parseBackup('{"app":"holdem-math-lab","version":2,"hands":[],"drills":[]}')).toThrow(/version/);
    expect(() => parseBackup('{"app":"holdem-math-lab","version":1,"hands":[{"id":1}],"drills":[]}')).toThrow(/Hand 1/);
  });

  it('merges without duplicates, in time order, within limits', () => {
    const b = createBackup([hand('a', 1), hand('c', 3)], [drill(1), drill(9)]);
    const m = mergeBackup([hand('a', 1), hand('b', 2)], [drill(9)], b, { hands: 10, drills: 10 });
    expect(m.hands.map((h) => h.id)).toEqual(['a', 'b', 'c']);
    expect(m.addedHands).toBe(1);
    expect(m.drills.map((d) => d.timestamp)).toEqual([1, 9]);
    expect(m.addedDrills).toBe(1);
    const capped = mergeBackup([], [], b, { hands: 1, drills: 1 });
    expect(capped.hands.map((h) => h.id)).toEqual(['c']);
  });
});
