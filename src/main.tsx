import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { appReady, initPlatform, isNative } from './platform/native';
import { App } from './ui/App';
import './ui/styles.css';

async function start() {
  // Storage must be loaded before the first render, because components read it synchronously.
  await initPlatform();
  if (!isNative()) {
    // Precaches the app shell so the web app works offline. The native app ships its assets, so it skips this.
    const { registerSW } = await import('virtual:pwa-register');
    registerSW({ immediate: true });
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
  requestAnimationFrame(appReady);
}

void start();
