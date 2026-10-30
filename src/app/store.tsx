import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { loadDB, saveDB, storageAvailable, type DB, type Attempt, type Settings } from '../storage/storage';
import { BUILTIN, BUILTIN_BY_ID, type ExperimentTemplate } from '../data/experiments';
import { webglAvailable } from '../lab/scenes/gl';

interface Ctx {
  db: DB;
  update(fn: (d: DB) => DB): void;
  saveOk: boolean;              // соңғы сақтау сәтті ме
  storageOk: boolean;           // браузер сақтауы қолжетімді ме
  loadError?: string;
  gl: boolean;                  // WebGL қолжетімді ме
  setGLFailed(): void;
  use3D: boolean;
  reducedMotion: boolean;
  setSettings(p: Partial<Settings>): void;
  templates: ExperimentTemplate[];          // белсенді шаблондар (кіріктірілген + мұғалім)
  getTemplate(id: string): ExperimentTemplate | undefined;
  upsertAttempt(a: Attempt): void;
}
const C = createContext<Ctx>(null as any);
export const useStore = () => useContext(C);

export function StoreProvider({ children }: { children: ReactNode }) {
  const initial = useMemo(() => loadDB(), []);
  const [db, setDb] = useState<DB>(initial.db);
  const [saveOk, setSaveOk] = useState(true);
  const [storageOk] = useState(() => storageAvailable());
  const [gl, setGl] = useState(() => webglAvailable());
  const [prefersRM, setPrefersRM] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const f = () => setPrefersRM(mq.matches); mq?.addEventListener?.('change', f); return () => mq?.removeEventListener?.('change', f);
  }, []);
  useEffect(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaveOk(storageOk && saveDB(db)), 250);
    return () => window.clearTimeout(timer.current);
  }, [db, storageOk]);
  useEffect(() => {
    const flush = () => { if (storageOk) saveDB(db); };
    window.addEventListener('pagehide', flush); return () => window.removeEventListener('pagehide', flush);
  }, [db, storageOk]);

  const reducedMotion = db.settings.reducedMotion || prefersRM;
  useEffect(() => { document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'full'; }, [reducedMotion]);

  const ctx: Ctx = {
    db, saveOk, storageOk, loadError: initial.error, gl,
    update: fn => setDb(d => fn(d)),
    setGLFailed: () => setGl(false),
    use3D: gl && !db.settings.force2D,
    reducedMotion,
    setSettings: p => setDb(d => ({ ...d, settings: { ...d.settings, ...p } })),
    templates: [...BUILTIN, ...db.templates.filter(t => !t.deleted)],
    getTemplate: id => BUILTIN_BY_ID[id] || db.templates.find(t => t.id === id),
    upsertAttempt: a => setDb(d => {
      const i = d.attempts.findIndex(x => x.id === a.id);
      const attempts = i >= 0 ? d.attempts.map(x => x.id === a.id ? a : x) : [...d.attempts, a];
      return { ...d, attempts, lastAttemptId: a.id };
    }),
  };
  return <C.Provider value={ctx}>{children}</C.Provider>;
}

/* ───────── Хэш-маршрутизатор ───────── */
export function parseHash(h: string) {
  const [path, qs] = h.replace(/^#/, '').split('?');
  const parts = (path || '/').split('/').filter(Boolean);
  return { parts, query: new URLSearchParams(qs || '') };
}
export function useRoute() {
  const [h, setH] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const f = () => setH(window.location.hash || '#/');
    window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f);
  }, []);
  return parseHash(h);
}
export const go = (path: string) => { window.location.hash = path; };
