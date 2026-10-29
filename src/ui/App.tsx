import { useEffect, useState } from 'react';
import { EquityPage } from './pages/EquityPage';
import { LearnPage } from './pages/LearnPage';
import { PlayPage } from './pages/PlayPage';
import { RangesPage } from './pages/RangesPage';
import { ReviewPage } from './pages/ReviewPage';
import { TrainerPage } from './pages/TrainerPage';
import { StoreProvider } from './store';

const ROUTES = [
  { id: 'play', label: 'Play', icon: '♠', Page: PlayPage },
  { id: 'train', label: 'Train', icon: '🎯', Page: TrainerPage },
  { id: 'equity', label: 'Equity', icon: '⚖', Page: EquityPage },
  { id: 'ranges', label: 'Ranges', icon: '▦', Page: RangesPage },
  { id: 'review', label: 'Review', icon: '📈', Page: ReviewPage },
  { id: 'learn', label: 'Learn', icon: '📖', Page: LearnPage },
] as const;

type RouteId = (typeof ROUTES)[number]['id'];

function useHashRoute(): [RouteId, (r: RouteId) => void] {
  const read = (): RouteId => {
    const h = location.hash.replace(/^#\/?/, '') as RouteId;
    return ROUTES.some((r) => r.id === h) ? h : 'play';
  };
  const [route, setRoute] = useState<RouteId>(read);
  useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [route, (r) => (location.hash = `/${r}`)];
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

export function App() {
  const [route, go] = useHashRoute();
  const online = useOnline();
  const current = ROUTES.find((r) => r.id === route)!;
  useEffect(() => {
    document.title = `${current.label} · Hold'em Math Lab`;
  }, [current]);
  return (
    <StoreProvider>
      <div className="app">
        <header className="topbar">
          <a className="brand" href="#/play">
            <span className="logo" aria-hidden>♠</span> Hold'em Math Lab
          </a>
          <nav className="topnav" aria-label="Main">
            {ROUTES.map((r) => (
              <a key={r.id} href={`#/${r.id}`} className={route === r.id ? 'on' : ''} aria-current={route === r.id ? 'page' : undefined}>
                {r.label}
              </a>
            ))}
          </nav>
          <span className={`net ${online ? 'on' : 'off'}`} title={online ? 'Online' : 'Offline — everything still works'}>
            {online ? '' : 'Offline'}
          </span>
        </header>
        <main className="content">
          <current.Page />
        </main>
        <nav className="bottomnav" aria-label="Main">
          {ROUTES.map((r) => (
            <button key={r.id} className={route === r.id ? 'on' : ''} onClick={() => go(r.id)} aria-current={route === r.id ? 'page' : undefined}>
              <span className="ic" aria-hidden>{r.icon}</span>
              <span>{r.label}</span>
            </button>
          ))}
        </nav>
      </div>
    </StoreProvider>
  );
}
