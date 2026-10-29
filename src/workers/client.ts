import type { EquityRequest, EquityResult } from '../core/equity';
import type { HandReview, StoredHand } from '../review/analysis';
import type { CfrResult } from '../solver/cfr';
import type { Drill, DrillKind } from '../trainer/drills';
import type { WorkerRequest } from './compute.worker';

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./compute.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (ev: MessageEvent<{ id: number; ok: boolean; result?: unknown; error?: string }>) => {
      const p = pending.get(ev.data.id);
      if (!p) return;
      pending.delete(ev.data.id);
      if (ev.data.ok) p.resolve(ev.data.result);
      else p.reject(new Error(ev.data.error));
    };
  }
  return worker;
}

function call<T>(req: WorkerRequest): Promise<T> {
  const id = nextId++;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    getWorker().postMessage({ id, req });
  });
}

export const compute = {
  equity: (args: EquityRequest) => call<EquityResult>({ fn: 'equity', args }),
  drill: (kind: DrillKind, seed: number) => call<Drill>({ fn: 'drill', args: { kind, seed } }),
  review: (hand: StoredHand) => call<HandReview>({ fn: 'review', args: hand }),
  kuhn: (iterations: number, variant: 'CFR' | 'CFR+') =>
    call<CfrResult & { curve: { iteration: number; exploitability: number }[] }>({ fn: 'kuhn', args: { iterations, variant } }),
};
