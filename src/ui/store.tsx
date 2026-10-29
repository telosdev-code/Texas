import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { HandReview, StoredHand } from '../review/analysis';
import type { DrillRecord } from '../review/progress';
import { KEYS, load, MAX_STORED_DRILLS, MAX_STORED_HANDS, save } from '../storage/storage';

export interface TableSettings {
  /** One entry per computer opponent (1–8). */
  opponents: { profileId: string }[];
  startingStackBB: number;
  bigBlind: number;
  botDelayMs: number;
  showBotCards: boolean;
  showHud: boolean;
  autoReview: boolean;
}

export const DEFAULT_SETTINGS: TableSettings = {
  opponents: [{ profileId: 'tag' }, { profileId: 'station' }, { profileId: 'lag' }, { profileId: 'rock' }, { profileId: 'maniac' }],
  startingStackBB: 100,
  bigBlind: 10,
  botDelayMs: 650,
  showBotCards: false,
  showHud: true,
  autoReview: true,
};

interface Store {
  settings: TableSettings;
  setSettings: (s: TableSettings) => void;
  hands: StoredHand[];
  addHand: (h: StoredHand) => void;
  setReview: (id: string, r: HandReview) => void;
  clearHands: () => void;
  drills: DrillRecord[];
  addDrill: (d: DrillRecord) => void;
  clearDrills: () => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettingsState] = useState<TableSettings>(() => ({ ...DEFAULT_SETTINGS, ...load(KEYS.settings, {}) }));
  const [hands, setHands] = useState<StoredHand[]>(() => load(KEYS.hands, []));
  const [drills, setDrills] = useState<DrillRecord[]>(() => load(KEYS.drills, []));

  useEffect(() => save(KEYS.settings, settings), [settings]);
  useEffect(() => save(KEYS.hands, hands), [hands]);
  useEffect(() => save(KEYS.drills, drills), [drills]);

  const addHand = useCallback((h: StoredHand) => setHands((hs) => [...hs, h].slice(-MAX_STORED_HANDS)), []);
  const setReview = useCallback(
    (id: string, review: HandReview) => setHands((hs) => hs.map((h) => (h.id === id ? { ...h, review } : h))),
    [],
  );
  const addDrill = useCallback((d: DrillRecord) => setDrills((ds) => [...ds, d].slice(-MAX_STORED_DRILLS)), []);

  const value = useMemo<Store>(
    () => ({
      settings,
      setSettings: setSettingsState,
      hands,
      addHand,
      setReview,
      clearHands: () => setHands([]),
      drills,
      addDrill,
      clearDrills: () => setDrills([]),
    }),
    [settings, hands, drills, addHand, setReview, addDrill],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}
