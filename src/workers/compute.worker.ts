/// <reference lib="webworker" />
import { computeEquity, type EquityRequest } from '../core/equity';
import { reviewHand, type StoredHand } from '../review/analysis';
import { solveCfr } from '../solver/cfr';
import { kuhnPoker } from '../solver/kuhn';
import { generateDrill, type DrillKind } from '../trainer/drills';

/** RPC-style worker: heavy math runs off the UI thread. */
export type WorkerRequest =
  | { fn: 'equity'; args: EquityRequest }
  | { fn: 'drill'; args: { kind: DrillKind; seed: number } }
  | { fn: 'review'; args: StoredHand }
  | { fn: 'kuhn'; args: { iterations: number; variant: 'CFR' | 'CFR+' } };

const handlers = {
  equity: (a: EquityRequest) => computeEquity(a),
  drill: (a: { kind: DrillKind; seed: number }) => generateDrill(a.kind, a.seed),
  review: (h: StoredHand) => reviewHand(h),
  kuhn: (a: { iterations: number; variant: 'CFR' | 'CFR+' }) => {
    const curve: { iteration: number; exploitability: number }[] = [];
    const r = solveCfr(kuhnPoker, {
      ...a,
      reportEvery: Math.max(1, Math.floor(a.iterations / 40)),
      onProgress: (iteration, exploitability) => curve.push({ iteration, exploitability }),
    });
    return { ...r, curve };
  },
};

self.onmessage = (ev: MessageEvent<{ id: number; req: WorkerRequest }>) => {
  const { id, req } = ev.data;
  try {
    const handler = handlers[req.fn] as (a: unknown) => unknown;
    const result = handler(req.args);
    self.postMessage({ id, ok: true, result });
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
