import type { VisualState, VisualVessel, RGBA } from '../engine/types';

const css = (c: RGBA, aMul = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${Math.min(1, c[3] * aMul).toFixed(2)})`;
function rnd(i: number, k: number) { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }

/** 2D/SVG балама көрініс — 3D-мен бірдей ғылыми күйден салынады. */
export function Lab2D({ v, placed, t, reducedMotion }: { v: VisualState; placed: string[]; t: number; reducedMotion: boolean }) {
  const vessels = v.vessels.filter(x => placed.includes(x.kind));
  const W = 640, H = 360;
  const slots = vessels.filter(x => x.kind !== 'burette');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="lab2d" role="img" aria-label={'2D сызба: ' + vessels.map(x => x.label).join(', ')}>
      <rect x="10" y="300" width={W - 20} height="14" rx="4" fill="#1d2c40" />
      {slots.map((ves, i) => {
        const cx = slots.length === 1 ? W / 2 : 140 + i * ((W - 280) / Math.max(1, slots.length - 1));
        return <Vessel2D key={ves.id} ves={ves} cx={cx} t={t} rm={reducedMotion} />;
      })}
      {vessels.filter(x => x.kind === 'burette').map(b => {
        const frac = b.volume / b.capacity;
        return <g key={b.id}>
          <rect x={W / 2 - 7} y={30} width={14} height={150} rx="3" fill="rgba(200,225,255,0.12)" stroke="#9fb6d1" />
          <rect x={W / 2 - 5} y={30 + 150 * (1 - frac)} width={10} height={150 * frac} fill={css(b.liquid, 1.6)} />
          <text x={W / 2 + 14} y={50} className="svg-label">{b.label}</text>
        </g>;
      })}
      {v.lamp !== undefined && placed.includes('lamp') && <g>
        <circle cx={W - 70} cy={90} r={22} fill={v.lamp ? `rgba(255,220,120,${0.15 + Math.min(1, v.lamp) * 0.85})` : 'rgba(255,255,255,0.08)'} stroke="#9fb6d1" />
        <text x={W - 70} y={132} textAnchor="middle" className="svg-label">{v.lamp === null ? 'Тізбек ажыратулы' : v.lamp > 0.3 ? 'Шам: жарық' : v.lamp > 0.05 ? 'Шам: әлсіз' : 'Шам: жанбайды'}</text>
      </g>}
      {v.timeLabel && <text x={20} y={26} className="svg-label">{v.timeLabel}</text>}
      <text x={W - 16} y={H - 12} textAnchor="end" className="svg-note">2D балама режим (3D емес)</text>
    </svg>
  );
}

function Vessel2D({ ves, cx, t, rm }: { ves: VisualVessel; cx: number; t: number; rm: boolean }) {
  const frac = Math.min(1, ves.capacity > 0 ? ves.volume / ves.capacity : 0);
  if (ves.kind === 'ucell' && ves.electrodes) {
    const e = ves.electrodes;
    return <g>
      {[[-50, e.gasLeft, e.leftLabel], [50, e.gasRight, e.rightLabel]].map(([dx, g, lab]) => {
        const x = cx + (dx as number); const gh = (g as number) * 200;
        return <g key={String(dx)}>
          <rect x={x - 14} y={80} width={28} height={210} rx="6" fill={css(ves.liquid, 1.4)} stroke="#9fb6d1" />
          <rect x={x - 13} y={81} width={26} height={gh} fill="rgba(240,248,255,0.85)" />
          <rect x={x - 3} y={250} width={6} height={36} fill="#333" />
          <text x={x} y={70} textAnchor="middle" className="svg-label">{lab as string}</text>
        </g>;
      })}
      <rect x={cx - 64} y={276} width={128} height={18} rx="4" fill={css(ves.liquid, 1.4)} stroke="#9fb6d1" />
      <text x={cx} y={330} textAnchor="middle" className="svg-label">{ves.label}</text>
    </g>;
  }
  const dims: Record<string, [number, number]> = { beaker: [110, 140], flask: [120, 150], volflask: [90, 200], tube: [30, 150], cylinder: [40, 180], burette: [14, 150] };
  const [w, h] = dims[ves.kind] || [100, 140];
  const top = 300 - h, liqH = h * frac;
  const pathFor = () => {
    if (ves.kind === 'flask') return `M${cx - 14},${top} L${cx - 14},${top + 45} L${cx - w / 2},${300} L${cx + w / 2},${300} L${cx + 14},${top + 45} L${cx + 14},${top} Z`;
    if (ves.kind === 'volflask') return `M${cx - 8},${top} L${cx - 8},${top + 110} C${cx - w / 2 - 10},${top + 120} ${cx - w / 2},${300} ${cx},${300} C${cx + w / 2},${300} ${cx + w / 2 + 10},${top + 120} ${cx + 8},${top + 110} L${cx + 8},${top} Z`;
    return `M${cx - w / 2},${top} L${cx - w / 2},${300 - (ves.kind === 'tube' ? 12 : 0)} Q${cx},${300 + (ves.kind === 'tube' ? 10 : 0)} ${cx + w / 2},${300 - (ves.kind === 'tube' ? 12 : 0)} L${cx + w / 2},${top} Z`;
  };
  const clipId = 'clip-' + ves.id;
  const parts = (ves.particles || []).flatMap((p, k) => Array.from({ length: Math.min(40, p.count) }, (_, i) => ({ k, i, color: p.color })));
  const nb = ves.bubbles ? Math.round(3 + ves.bubbles * 18) : 0;
  return <g>
    <defs><clipPath id={clipId}><path d={pathFor()} /></clipPath></defs>
    <g clipPath={`url(#${clipId})`}>
      <rect x={cx - w} y={300 - liqH} width={w * 2} height={liqH} fill={css(ves.liquid, 1.5)} />
      {ves.precipitate ? <rect x={cx - w} y={300 - 6 - ves.precipitate * 22} width={w * 2} height={6 + ves.precipitate * 22} fill={css(ves.precipitateColor || [0.96, 0.96, 0.96, 1])} /> : null}
      {liqH > 4 && parts.map(({ k, i, color }) => <circle key={k + '-' + i} cx={cx - w / 2 + 6 + rnd(i, k + 1) * (w - 12)} cy={300 - 4 - rnd(i, k + 5) * (liqH - 8)} r={3} fill={css(color)} />)}
      {liqH > 4 && Array.from({ length: nb }, (_, i) => { const prog = rm ? rnd(i, 4) : ((t * (0.3 + rnd(i, 9) * 0.3) + rnd(i, 4)) % 1); return <circle key={'b' + i} cx={cx - w / 2 + 6 + rnd(i, 6) * (w - 12)} cy={300 - 4 - prog * (liqH - 8)} r={2 + rnd(i, 8) * 2.5} fill="none" stroke="rgba(235,245,255,0.8)" />; })}
      {ves.solid && ves.solid.amount > 0 && (ves.solid.kind === 'nail'
        ? <line x1={cx - 20} y1={296} x2={cx + 18} y2={300 - h * 0.75} stroke={css(mixC(ves.solid.color, ves.solid.coatColor || ves.solid.color, ves.solid.coating || 0))} strokeWidth="7" strokeLinecap="round" />
        : <rect x={cx - w / 2 + 6} y={300 - 4 - ves.solid.amount * 16} width={w - 12} height={4 + ves.solid.amount * 16} fill={css(ves.solid.color)} rx="2" />)}
    </g>
    <path d={pathFor()} fill="rgba(200,225,255,0.06)" stroke="#9fb6d1" strokeWidth="1.5" />
    {ves.kind === 'volflask' && <line x1={cx - 9} y1={top + 40} x2={cx + 9} y2={top + 40} stroke="#e8f0ff" />}
    {ves.electrodes && <g><rect x={cx - 26} y={top - 16} width={6} height={h} fill="#333" /><rect x={cx + 20} y={top - 16} width={6} height={h} fill="#333" /></g>}
    <text x={cx} y={330} textAnchor="middle" className="svg-label">{ves.label}</text>
    {ves.meter && <text x={cx} y={top - 24} textAnchor="middle" className="svg-value">{ves.meter.label}: {ves.meter.value}</text>}
  </g>;
}
function mixC(a: RGBA, b: RGBA, t: number): RGBA { return [0, 1, 2, 3].map(i => a[i] + (b[i] - a[i]) * Math.min(1, t * 1.3)) as RGBA; }
