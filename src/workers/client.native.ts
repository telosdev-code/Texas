import { computeEquity, type EquityRequest, type EquityResult } from '../core/equity';
import { reviewHand, type HandReview, type StoredHand } from '../review/analysis';
import { solveCfr, type CfrResult } from '../solver/cfr';
import { kuhnPoker } from '../solver/kuhn';
import { generateDrill, type Drill, type DrillKind } from '../trainer/drills';

/**
 * React Native counterpart of client.ts (Metro picks *.native.ts on iOS/Android).
 *
 * There are no Web Workers in React Native, so this runs the same shared functions on the JS thread
 * after yielding a frame, so a spinner can render first. Hermes runs this code roughly 14× slower
 * than a browser JIT, so exact enumeration and sample counts are capped to keep each call short.
 * TODO: move to a background JS runtime (react-native-worklets) or a native evaluator.
 */
export const NATIVE_LIMITS = {
  maxExactEvaluations: 400_000,
  maxSamples: 8_000,
  reviewSamples: 2_500,
  reviewMaxExact: 250_000,
  maxCfrIterations: 2_000,
};

const later = <T>(fn: () => T): Promise<T> =>
  new Promise((resolve, reject) =>
    setTimeout(() => {
      try {
        resolve(fn());
      } catch (e) {
        reject(e);
      }
    }, 16),
  );

export const compute = {
  equity: (args: EquityRequest) =>
    later<EquityResult>(() =>
      computeEquity({
        ...args,
        maxExactEvaluations: Math.min(args.maxExactEvaluations ?? NATIVE_LIMITS.maxExactEvaluations, NATIVE_LIMITS.maxExactEvaluations),
        samples: Math.min(args.samples ?? NATIVE_LIMITS.maxSamples, NATIVE_LIMITS.maxSamples),
      }),
    ),
  drill: (kind: DrillKind, seed: number) => later<Drill>(() => generateDrill(kind, seed)),
  review: (hand: StoredHand) =>
    later<HandReview>(() => reviewHand(hand, NATIVE_LIMITS.reviewSamples, NATIVE_LIMITS.reviewMaxExact)),
  kuhn: (iterations: number, variant: 'CFR' | 'CFR+') =>
    later(() => {
      const n = Math.min(iterations, NATIVE_LIMITS.maxCfrIterations);
      const curve: { iteration: number; exploitability: number }[] = [];
      const r: CfrResult = solveCfr(kuhnPoker, {
        iterations: n,
        variant,
        reportEvery: Math.max(1, Math.floor(n / 40)),
        onProgress: (iteration, exploitability) => curve.push({ iteration, exploitability }),
      });
      return { ...r, curve };
    }),
};
