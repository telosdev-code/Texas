import type { StoredHand } from '../review/analysis';
import type { DrillRecord } from '../review/progress';

/** A portable snapshot of everything the learner has done, for export / import. */
export interface Backup {
  app: 'holdem-math-lab';
  version: 1;
  exportedAt: string;
  hands: StoredHand[];
  drills: DrillRecord[];
}

export function createBackup(hands: StoredHand[], drills: DrillRecord[], now = new Date()): Backup {
  return { app: 'holdem-math-lab', version: 1, exportedAt: now.toISOString(), hands, drills };
}

export const backupFileName = (b: Backup) => `holdem-math-lab-${b.exportedAt.slice(0, 10)}.json`;

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

function validHand(h: unknown): h is StoredHand {
  return (
    isObj(h) &&
    typeof h.id === 'string' &&
    typeof h.humanSeat === 'number' &&
    Array.isArray(h.players) &&
    Array.isArray(h.log) &&
    Array.isArray(h.net) &&
    isObj(h.config) &&
    typeof h.config.bigBlind === 'number'
  );
}

function validDrill(d: unknown): d is DrillRecord {
  return isObj(d) && typeof d.kind === 'string' && typeof d.timestamp === 'number' && typeof d.correct === 'boolean';
}

/** Parse and validate a backup file. Throws a readable error if the file is not a valid backup. */
export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON.');
  }
  if (!isObj(data) || data.app !== 'holdem-math-lab') throw new Error("This is not a Hold'em Math Lab backup.");
  if (data.version !== 1) throw new Error(`Unsupported backup version: ${String(data.version)}.`);
  if (!Array.isArray(data.hands) || !Array.isArray(data.drills)) throw new Error('The backup is missing its data.');
  const badHand = data.hands.findIndex((h) => !validHand(h));
  if (badHand >= 0) throw new Error(`Hand ${badHand + 1} in the backup is malformed.`);
  const badDrill = data.drills.findIndex((d) => !validDrill(d));
  if (badDrill >= 0) throw new Error(`Trainer result ${badDrill + 1} in the backup is malformed.`);
  return data as unknown as Backup;
}

/** Merge imported records into existing ones, skipping duplicates and keeping chronological order. */
export function mergeBackup(
  hands: StoredHand[],
  drills: DrillRecord[],
  b: Backup,
  limits: { hands: number; drills: number },
): { hands: StoredHand[]; drills: DrillRecord[]; addedHands: number; addedDrills: number } {
  const handIds = new Set(hands.map((h) => h.id));
  const newHands = b.hands.filter((h) => !handIds.has(h.id));
  const drillKey = (d: DrillRecord) => `${d.kind}:${d.timestamp}`;
  const drillKeys = new Set(drills.map(drillKey));
  const newDrills = b.drills.filter((d) => !drillKeys.has(drillKey(d)));
  return {
    hands: [...hands, ...newHands].sort((a, c) => a.timestamp - c.timestamp).slice(-limits.hands),
    drills: [...drills, ...newDrills].sort((a, c) => a.timestamp - c.timestamp).slice(-limits.drills),
    addedHands: newHands.length,
    addedDrills: newDrills.length,
  };
}
