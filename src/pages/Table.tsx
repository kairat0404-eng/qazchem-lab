import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, go } from '../app/store';
import { ELEMENTS } from '../data/elements';
import { CATEGORY, STATE_NAME, isotopeNote, type ElementData, type Category } from '../data/elementTypes';
import { AtomViewer } from '../lab/scenes/models3d';
import { SRC, SOURCES_ACCESSED } from '../lab/engine/sources';

/** Кестедегі орны: [жол, баған] (1-ден басталады; f-блок 9–10 жолдарда). */
export function cellPos(e: ElementData): [number, number] {
  if (e.group !== null) return [e.period, e.group];
  const base = e.period === 6 ? 57 : 89;
  return [e.period === 6 ? 9 : 10, 3 + (e.z - base)];
}
const dec = (x: string) => x.replace('.', ',');
function cfgHtml(c: string) { return c.split(' ').map((p, i) => { const m = p.match(/^(\d[spdf])(\d+)$/); return m ? <span key={i}>{m[1]}<sup>{m[2]}</sup> </span> : <span key={i}>{p} </span>; }); }

export function TablePage({ z }: { z?: number }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<Category | ''>('');
  const [grp, setGrp] = useState<string>('');
  const [per, setPer] = useState<string>('');
  const [view, setView] = useState<'table' | 'list'>(() => (window.innerWidth < 720 ? 'list' : 'table'));
  const [focusZ, setFocusZ] = useState(z || 1);
  const sel = z ? ELEMENTS[z - 1] : undefined;
  const gridRef = useRef<HTMLDivElement>(null);

  const match = useMemo(() => {
    const t = q.trim().toLowerCase();
    return new Set(ELEMENTS.filter(e =>
      (!t || e.kk.toLowerCase().includes(t) || e.en.toLowerCase().includes(t) || e.s.toLowerCase() === t || String(e.z) === t) &&
      (!cat || e.cat === cat) && (!grp || String(e.group) === grp || (grp === 'f' && e.group === null)) && (!per || String(e.period) === per)).map(e => e.z));
  }, [q, cat, grp, per]);
  const filtered = q || cat || grp || per;

  const byPos = useMemo(() => { const m = new Map<string, ElementData>(); ELEMENTS.forEach(e => { const [r, c] = cellPos(e); m.set(r + ':' + c, e); }); return m; }, []);
  const move = (dr: number, dc: number) => {
    const [r, c] = cellPos(ELEMENTS[focusZ - 1]);
    for (let step = 1; step < 20; step++) {
      const e = byPos.get((r + dr * step) + ':' + (c + dc * step));
      if (e) { setFocusZ(e.z); return; }
      if (r + dr * step < 1 || r + dr * step > 10 || c + dc * step < 1 || c + dc * step > 18) return;
    }
  };
  useEffect(() => { if (view === 'table') (gridRef.current?.querySelector(`[data-z="${focusZ}"]`) as HTMLElement | null)?.focus({ preventScroll: false }); }, [focusZ]); // eslint-disable-line

  return <section className="page ptable">
    <h1>Периодтық кесте</h1>
    <p className="lead">118 элемент. Іздеу: қазақша атауы, халықаралық таңбасы немесе атомдық нөмірі. Элементті ашу үшін басыңыз немесе Enter пернесін басыңыз; кесте ішінде бағыт пернелерімен жүруге болады.</p>
    <div className="filters">
      <label className="field inline"><span>Іздеу</span><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Темір, Fe, 26" /></label>
      <label className="field inline"><span>Санат</span><select value={cat} onChange={e => setCat(e.target.value as any)}><option value="">барлығы</option>{Object.entries(CATEGORY).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></label>
      <label className="field inline"><span>Топ</span><select value={grp} onChange={e => setGrp(e.target.value)}><option value="">барлығы</option>{Array.from({ length: 18 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}<option value="f">f-блок</option></select></label>
      <label className="field inline"><span>Период</span><select value={per} onChange={e => setPer(e.target.value)}><option value="">барлығы</option>{Array.from({ length: 7 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label>
      <div className="seg" role="group" aria-label="Көрініс"><button aria-pressed={view === 'table'} onClick={() => setView('table')}>Кесте</button><button aria-pressed={view === 'list'} onClick={() => setView('list')}>Тізім</button></div>
    </div>
    <p className="muted small" aria-live="polite">{filtered ? `${match.size} элемент сәйкес келді` : '118 элемент'}</p>

    <div className={'pt-layout' + (sel ? ' with-card' : '')}>
      {view === 'table' ? <div className="pt-scroll">
        <div className="pt-grid" ref={gridRef} role="grid" aria-label="Элементтердің периодтық кестесі" aria-rowcount={10} aria-colcount={18}
          onKeyDown={e => {
            const k = e.key; const d: Record<string, [number, number]> = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
            if (d[k]) { e.preventDefault(); move(...d[k]); }
            if (k === 'Home') { e.preventDefault(); setFocusZ(1); } if (k === 'End') { e.preventDefault(); setFocusZ(118); }
          }}>
          {ELEMENTS.map(e => { const [r, c] = cellPos(e); const dim = filtered && !match.has(e.z);
            return <button key={e.z} role="gridcell" data-z={e.z} tabIndex={e.z === focusZ ? 0 : -1} className={'el' + (dim ? ' dim' : '') + (sel?.z === e.z ? ' on' : '')} style={{ gridRow: r, gridColumn: c, ['--c' as any]: CATEGORY[e.cat].color }}
              onFocus={() => setFocusZ(e.z)} onClick={() => go('#/table/' + e.z)} aria-label={`${e.z}, ${e.kk} (${e.en}), ${e.s}`}>
              <span className="z">{e.z}</span><span className="sym">{e.s}</span><span className="nm">{e.kk}</span>
            </button>; })}
          <div className="el ph" style={{ gridRow: 6, gridColumn: 3 }} aria-hidden="true">57–71</div>
          <div className="el ph" style={{ gridRow: 7, gridColumn: 3 }} aria-hidden="true">89–103</div>
          <div className="f-gap" style={{ gridRow: 8, gridColumn: '1 / span 18' }} aria-hidden="true" />
          <div className="f-label" style={{ gridRow: 9, gridColumn: '1 / span 2' }}>Лантаноидтар</div>
          <div className="f-label" style={{ gridRow: 10, gridColumn: '1 / span 2' }}>Актиноидтар</div>
        </div>
      </div>
        : <ul className="pt-list">{ELEMENTS.filter(e => !filtered || match.has(e.z)).map(e => <li key={e.z}><button className={'row-el' + (sel?.z === e.z ? ' on' : '')} onClick={() => go('#/table/' + e.z)} style={{ ['--c' as any]: CATEGORY[e.cat].color }}>
          <span className="z">{e.z}</span><span className="sym">{e.s}</span><span>{e.kk}</span><span className="muted">{CATEGORY[e.cat].name}</span></button></li>)}</ul>}

      {sel && <ElementCard e={sel} />}
    </div>
    <ul className="legend" aria-label="Санаттар түсі">{Object.entries(CATEGORY).map(([k, v]) => <li key={k}><span style={{ background: v.color }} aria-hidden="true" />{v.name}</li>)}</ul>
  </section>;
}

function ElementCard({ e }: { e: ElementData }) {
  const s = useStore();
  const headRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headRef.current?.focus(); }, [e.z]);
  const N = e.A - e.z;
  return <aside className="el-card card" aria-labelledby="elc-h">
    <div className="elc-top" style={{ ['--c' as any]: CATEGORY[e.cat].color }}>
      <div className="big"><span className="z">{e.z}</span><span className="sym">{e.s}</span></div>
      <div><h2 id="elc-h" ref={headRef} tabIndex={-1}>{e.kk}</h2><p className="muted">{e.en} · {CATEGORY[e.cat].name}</p></div>
      <a className="x" href="#/table" aria-label="Карточканы жабу">×</a>
    </div>
    <dl className="props">
      <dt>Атомдық нөмірі (Z)</dt><dd>{e.z}</dd>
      <dt>Топ / период</dt><dd>{e.group ?? 'f-блок'} / {e.period}</dd>
      <dt>Стандартты атомдық масса</dt><dd>{e.awType === 'none' ? <>берілмейді <span className="muted">(тұрақты изотоптары жоқ)</span></> : e.awType === 'interval' ? <>{dec(e.aw!)} <span className="muted">(шартты мән; IUPAC аралығы [{dec(e.interval![0])}; {dec(e.interval![1])}])</span></> : dec(e.aw!)}</dd>
      <dt>Агрегаттық күйі</dt><dd>{STATE_NAME[e.state]} <span className="muted">(25 °C, 100 кПа)</span></dd>
      <dt>Электрондық конфигурация</dt><dd>{cfgHtml(e.cfg)}{e.cfgStatus !== 'measured' && <span className="tag warn">{e.cfgStatus === 'predicted' ? 'болжамды' : 'тәжірибелік дерек шектеулі'}</span>}</dd>
      <dt>Қабаттар бойынша</dt><dd>{e.shells.join(', ')}</dd>
      <dt>Көрсетілген изотоп</dt><dd><sup>{e.A}</sup>{e.s} — {isotopeNote(e)}: p = {e.z}, n = A − Z = {N}, e = {e.z}</dd>
      <dt>Қолданылуы</dt><dd>{e.use}</dd>
    </dl>
    <AtomViewer e={e} use3D={s.use3D} reducedMotion={s.reducedMotion} onFail={s.setGLFailed} />
    <p className="small muted">Атом моделі масштабталмаған: ядро шын мәнінде қабаттардан ~10⁵ есе кіші. Шеңберлер — энергетикалық қабаттардың шартты бейнесі; электрондар шеңбер бойымен айналмайды, олардың орны ықтималдықпен сипатталады.</p>
    <p className="small muted">Дереккөздер: <a href={SRC.iupac.url} target="_blank" rel="noreferrer">IUPAC</a>, <a href={SRC.ciaaw.url} target="_blank" rel="noreferrer">CIAAW</a> (атомдық массалар), <a href={SRC.nist.url} target="_blank" rel="noreferrer">NIST</a> (конфигурациялар). Деректер жиналған күні: {SOURCES_ACCESSED}; онлайн салыстыру жүргізілмеген.</p>
  </aside>;
}
