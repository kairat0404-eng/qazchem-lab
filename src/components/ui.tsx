import { useId, type ReactNode } from 'react';
import type { Equation, Species, Measurement } from '../lab/engine/types';
import { fmt } from '../lab/engine/chem';

/** Формула: "Ca(OH)2" → Ca(OH)₂, заряд жоғарғы индекспен. */
export function Chem({ f, charge, phase }: { f: string; charge?: number; phase?: string }) {
  if (f === 'e') return <span className="chem">e<sup>−</sup></span>;
  const parts: ReactNode[] = []; let i = 0, k = 0;
  while (i < f.length) {
    if (/[0-9]/.test(f[i]) && i > 0) { let n = ''; while (i < f.length && /[0-9]/.test(f[i])) n += f[i++]; parts.push(<sub key={k++}>{n}</sub>); }
    else { parts.push(f[i]); i++; }
  }
  const q = charge ? `${Math.abs(charge) > 1 ? Math.abs(charge) : ''}${charge > 0 ? '+' : '−'}` : '';
  return <span className="chem">{parts}{q && <sup>{q}</sup>}{phase && <span className="phase">({phase})</span>}</span>;
}

function Side({ s }: { s: Species[] }) {
  return <>{s.map((sp, i) => <span key={i}>{i > 0 && <span className="op"> + </span>}{sp.coef !== 1 && <span className="coef">{sp.coef}</span>}<Chem f={sp.f} charge={sp.charge} phase={sp.phase} /></span>)}</>;
}
export function EquationView({ eq }: { eq: Equation }) {
  return <div className="equation">
    <span className="eq-label">{eq.label}</span>
    <span className="eq-body" aria-label={eq.label}>
      <Side s={eq.reactants} /> <span className="arrow">{eq.reversible ? '⇌' : '→'}{eq.catalyst && <span className="cat"><Chem f={eq.catalyst} /></span>}</span> <Side s={eq.products} />
    </span>
    {eq.conditions && <span className="eq-cond">{eq.conditions}</span>}
  </div>;
}

export function showValue(m: Measurement) {
  if (typeof m.value === 'string') return m.value;
  return fmt(m.value, m.digits ?? 3);
}

export const KIND_LABEL = { calc: 'есептелді', qual: 'бақылау', cond: 'шартты' } as const;

export function MeasureTable({ items }: { items: Measurement[] }) {
  return <table className="mtable">
    <thead><tr><th scope="col">Шама</th><th scope="col">Мәні</th><th scope="col">Түрі</th></tr></thead>
    <tbody>{items.map(m => <tr key={m.key}><th scope="row">{m.label}</th><td className="num">{showValue(m)}{m.unit && typeof m.value === 'number' ? ' ' + m.unit : ''}</td><td><span className={'kind k-' + m.kind}>{KIND_LABEL[m.kind]}</span></td></tr>)}</tbody>
  </table>;
}

/** Қарапайым SVG сызықтық графигі. */
export function LineChart({ points, xLabel, yLabel, yMin, yMax, mark }: { points: { x: number; y: number }[]; xLabel: string; yLabel: string; yMin?: number; yMax?: number; mark?: { x: number; label: string } }) {
  const id = useId();
  if (points.length < 2) return <p className="muted">График үшін кемінде 2 нүкте қажет.</p>;
  const W = 520, H = 240, L = 46, B = 34, T = 12, R = 14;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) || 1, y0 = yMin ?? Math.min(...ys), y1 = yMax ?? Math.max(...ys);
  const sx = (x: number) => L + (x - x0) / (x1 - x0 || 1) * (W - L - R), sy = (y: number) => H - B - (y - y0) / (y1 - y0 || 1) * (H - B - T);
  const ticks = (a: number, b: number) => {
    const raw = (b - a) / 5 || 1, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
    const out: number[] = []; for (let v = Math.ceil(a / step - 1e-9) * step; v <= b + 1e-9; v += step) out.push(Number(v.toPrecision(10))); return out;
  };
  return <figure className="chart" aria-labelledby={id}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel} мен ${xLabel} графигі, ${points.length} нүкте`}>
      {ticks(y0, y1).map((t, i) => <g key={'y' + i}><line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} className="grid" /><text x={L - 6} y={sy(t) + 4} textAnchor="end" className="tick">{fmt(t, 2)}</text></g>)}
      {ticks(x0, x1).map((t, i) => <text key={'x' + i} x={sx(t)} y={H - B + 16} textAnchor="middle" className="tick">{fmt(t, 3)}</text>)}
      {mark && <g><line x1={sx(mark.x)} x2={sx(mark.x)} y1={T} y2={H - B} className="mark" /><text x={sx(mark.x) + 4} y={T + 10} className="tick">{mark.label}</text></g>}
      <polyline fill="none" className="line" points={points.map(p => `${sx(p.x)},${sy(p.y)}`).join(' ')} />
      {points.map((p, i) => <circle key={i} cx={sx(p.x)} cy={sy(p.y)} r="2.6" className="dot" />)}
      <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" className="axis">{xLabel}</text>
      <text x={12} y={(T + H - B) / 2} textAnchor="middle" className="axis" transform={`rotate(-90 12 ${(T + H - B) / 2})`}>{yLabel}</text>
    </svg>
    <figcaption id={id} className="sr-only">{yLabel} — {xLabel}</figcaption>
  </figure>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><div className="empty-icon" aria-hidden="true">⌀</div><h3>{title}</h3>{children}</div>;
}

export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const p: Record<string, ReactNode> = {
    play: <path d="M7 5l12 7-12 7z" />, pause: <path d="M7 5h4v14H7zM13 5h4v14h-4z" />, reset: <path d="M4 12a8 8 0 1 0 3-6.3M4 4v5h5" fill="none" strokeWidth="2" />,
    cam: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" fill="none" strokeWidth="2" />,
    flask: <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" fill="none" strokeWidth="2" />,
    table: <path d="M3 5h4v4H3zM10 5h4v4h-4zM17 5h4v4h-4zM3 12h4v4H3zM10 12h4v4h-4z" />, book: <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM8 7h8" fill="none" strokeWidth="2" />,
    check: <path d="M5 12l5 5 9-10" fill="none" strokeWidth="2.4" />, download: <path d="M12 4v11M7 10l5 5 5-5M5 20h14" fill="none" strokeWidth="2" />, upload: <path d="M12 20V9M7 14l5-5 5 5M5 4h14" fill="none" strokeWidth="2" />,
    plus: <path d="M12 5v14M5 12h14" fill="none" strokeWidth="2.2" />, up: <path d="M6 15l6-6 6 6" fill="none" strokeWidth="2.2" />, down: <path d="M6 9l6 6 6-6" fill="none" strokeWidth="2.2" />, trash: <path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13" fill="none" strokeWidth="2" />,
    copy: <path d="M8 8h11v11H8zM5 16V5h11" fill="none" strokeWidth="2" />, print: <path d="M7 9V3h10v6M6 17H4v-7h16v7h-2M7 14h10v7H7z" fill="none" strokeWidth="2" />,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" className="icon" fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">{p[name]}</svg>;
}
