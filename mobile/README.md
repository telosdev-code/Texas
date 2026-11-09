# Hold'em Math Lab — React Native app

The native iOS/Android app, built with **Expo SDK 58** (React Native 0.88) and Expo Router.
It reuses the web app's platform-independent code from `../src` unchanged: the math core, game engine, bots,
CFR solver, trainer, review analysis, and the React state hooks (`ui/store.tsx`, `ui/useGame.ts`).

## Run it
```bash
cd mobile
npm install
npm run ios        # Expo dev server; press i for the iOS simulator (macOS + Xcode), or scan the QR code with Expo Go
npm run typecheck
```
`npx expo export --platform ios` builds the production JavaScript bundle (works on any OS; CI runs it).

## How code is shared
| Layer | Where | Notes |
|---|---|---|
| Math, engine, bots, solver, trainer, review | `../src/{core,engine,bots,solver,trainer,review}` | Pure TypeScript, no DOM; covered by the root Vitest suite |
| App state (`StoreProvider`, `useGame`), log formatting | `../src/ui/{store.tsx,useGame.ts,format.ts}` | Plain React; shared as-is |
| Storage | `../src/storage/storage.native.ts` | AsyncStorage, loaded into memory before first render |
| Heavy computation | `../src/workers/client.native.ts` | No Web Workers in React Native: runs after yielding a frame, with smaller budgets |
| Screens and components | `mobile/src` | React Native UI |

`metro.config.js` lets Metro read `../src`, routes every package import from shared files to this app's
`node_modules` (so there is exactly one React), and always selects the `.native` storage and compute modules,
including in the web preview build. `tsconfig.json` mirrors this with `paths` and `moduleSuffixes`.

## Performance note
Hermes (React Native's JavaScript engine) has no JIT. A benchmark of the shared evaluator ran about **14× slower** than
in Node/V8 on the same machine (exact AA vs KK: ~5 s vs 0.3 s), with identical results. Mobile therefore caps exact
enumeration at 400k hand evaluations and Monte Carlo at 8k samples per call (`NATIVE_LIMITS`), and everything still runs
on the JS thread. Moving it to a background runtime (react-native-worklets) or a native evaluator is the next
infrastructure task.

## Status
| Area | Status |
|---|---|
| Shared logic and state hooks | ✅ reused unchanged |
| Expo project, tabs navigation, theme, icons, splash | ✅ |
| Persistent storage (AsyncStorage) | ✅ |
| Play: table, betting with sizing presets/slider, decision-math panel, hand log, table settings, haptics | ✅ |
| Trainer: all five drills with step-by-step explanations | ✅ |
| Review: hand list, per-decision analysis, progress tiles, drill accuracy | ✅ (no trend charts yet) |
| Equity calculator | ⬜ placeholder screen |
| Range matrix (drag-to-paint gestures) | ⬜ placeholder screen |
| Learn: lessons and CFR demo | ⬜ placeholder screen |
| Backup export/import | ⬜ |
| Heavy math off the JS thread | ⬜ |
| Tested on a real iPhone / Android device | ⬜ only checked via the iOS bundle build and the web preview build in Chromium |
| iPad layout, VoiceOver and Dynamic Type pass | ⬜ |
| EAS build, signing, store submission | ⬜ bundle ID `dev.telos.holdemmathlab` is a placeholder |
