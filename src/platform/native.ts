import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import { flushStorage, initStorage, localStorageBackend, type StorageBackend } from '../storage/storage';

/**
 * Thin wrapper over Capacitor so the rest of the app never imports plugins directly.
 * On the web every function degrades to a browser equivalent or does nothing.
 */
export const isNative = (): boolean => Capacitor.isNativePlatform();
export const platform = (): string => Capacitor.getPlatform();

const DATA_DIR = 'hml';

/** One JSON file per key in the app's private data directory (backed up by iCloud with the app). */
export const filesystemBackend: StorageBackend = {
  async read(key) {
    try {
      const r = await Filesystem.readFile({ path: `${DATA_DIR}/${key}.json`, directory: Directory.Data, encoding: Encoding.UTF8 });
      return typeof r.data === 'string' ? r.data : null;
    } catch {
      return null; // missing file
    }
  },
  async write(key, value) {
    await Filesystem.writeFile({
      path: `${DATA_DIR}/${key}.json`,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      data: value,
      recursive: true,
    });
  },
  async remove(key) {
    await Filesystem.deleteFile({ path: `${DATA_DIR}/${key}.json`, directory: Directory.Data }).catch(() => {});
  },
};

/** Run before the first render. */
export async function initPlatform(): Promise<void> {
  // Persist batched writes whenever the page may be about to go away.
  addEventListener('pagehide', () => void flushStorage());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && void flushStorage());
  if (!isNative()) {
    await initStorage(localStorageBackend);
    return;
  }
  document.documentElement.classList.add('native', `native-${platform()}`);
  // First native launch copies anything the web view had stored.
  await initStorage(filesystemBackend, localStorageBackend);
  App.addListener('pause', () => void flushStorage());
  StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
}

/** Call once the first screen has rendered. */
export function appReady(): void {
  if (isNative()) SplashScreen.hide({ fadeOutDuration: 200 }).catch(() => {});
}

export const haptics = {
  tap(): void {
    if (isNative()) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  },
  firm(): void {
    if (isNative()) Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  },
  success(): void {
    if (isNative()) Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  },
  warning(): void {
    if (isNative()) Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
  },
};

/** Save a text file: the iOS share sheet (Files, AirDrop, …) natively, a download on the web. */
export async function shareTextFile(fileName: string, text: string, mime = 'application/json'): Promise<void> {
  if (isNative()) {
    const { uri } = await Filesystem.writeFile({ path: fileName, directory: Directory.Cache, encoding: Encoding.UTF8, data: text });
    await Share.share({ title: fileName, files: [uri] });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
