import type { VisualState, VisualVessel } from '../engine/types';
import { Renderer, m4, lathe, sphere, cylinder, box, type DrawItem, type RGBA, type V3 } from './gl';
import type { Label, SceneFrame } from './Viewport3D';

type Prof = [number, number][];
// Ыдыстардың ішкі профилі (r, y), бірлік — шартты метр
const PROFILES: Record<VisualVessel['kind'], { prof: Prof; capY: number; scale: number }> = {
  beaker: { prof: [[0, 0.03], [0.42, 0.03], [0.44, 0.1], [0.44, 1.05], [0.46, 1.1]], capY: 1.0, scale: 1 },
  flask: { prof: [[0, 0.03], [0.5, 0.03], [0.53, 0.1], [0.42, 0.5], [0.18, 0.92], [0.14, 1.05], [0.14, 1.3], [0.17, 1.34]], capY: 1.0, scale: 1 },
  volflask: { prof: [[0, 0.03], [0.25, 0.06], [0.42, 0.25], [0.46, 0.45], [0.4, 0.68], [0.2, 0.86], [0.08, 0.95], [0.08, 1.7], [0.1, 1.74]], capY: 1.4, scale: 1 },
  tube: { prof: [[0, 0.04], [0.08, 0.06], [0.12, 0.14], [0.12, 1.3], [0.135, 1.33]], capY: 1.25, scale: 1 },
  cylinder: { prof: [[0, 0.08], [0.15, 0.08], [0.15, 1.35], [0.17, 1.4]], capY: 1.3, scale: 1 },
  burette: { prof: [[0, 0], [0.065, 0.04], [0.065, 1.9]], capY: 1.85, scale: 1 },
  ucell: { prof: [[0, 0.04], [0.11, 0.08], [0.11, 1.5]], capY: 1.45, scale: 1 },
};

/** Ішкі профиль бойынша көлемді биіктікке айналдыру (дискілермен интегралдау). */
export function heightForFraction(prof: Prof, capY: number, frac: number): number {
  const N = 120; const y0 = prof[0][1]; const dy = (capY - y0) / N;
  const r = (y: number) => { for (let i = 1; i < prof.length; i++) if (y <= prof[i][1]) { const [r0, a] = prof[i - 1], [r1, b] = prof[i]; return r0 + (r1 - r0) * ((y - a) / (b - a || 1)); } return prof[prof.length - 1][0]; };
  const cum: number[] = [0];
  for (let i = 0; i < N; i++) { const rr = r(y0 + (i + 0.5) * dy); cum.push(cum[i] + Math.PI * rr * rr * dy); }
  const target = Math.max(0, Math.min(1, frac)) * cum[N];
  for (let i = 1; i <= N; i++) if (cum[i] >= target) return y0 + (i - 1 + (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1)) * dy;
  return capY;
}
function clip(prof: Prof, h: number, inset = 0.012): Prof {
  const out: Prof = [];
  for (let i = 0; i < prof.length; i++) {
    const [r, y] = prof[i];
    if (y <= h) out.push([Math.max(0, r - inset), y]);
    else { const [r0, y0] = prof[i - 1]; out.push([Math.max(0, r0 + (r - r0) * ((h - y0) / (y - y0)) - inset), h]); break; }
  }
  out.push([0, h]);
  return out;
}
const outer = (p: Prof): Prof => p.map(([r, y]) => [r === 0 ? 0 : r + 0.018, y]);

// Детерминистік жалған кездейсоқ сандар (бөлшектердің тұрақты орны үшін)
function rnd(i: number, k: number) { const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return x - Math.floor(x); }

const GLASS: RGBA = [0.75, 0.88, 1, 0.1];
const TABLE_Y = 0;

export interface LabSceneOpts { placed: string[]; reducedMotion: boolean; running: boolean }

export function buildLabScene(r: Renderer, v: VisualState, t: number, o: LabSceneOpts): SceneFrame {
  const items: DrawItem[] = []; const labels: Label[] = [];
  const M = {
    sph: r.mesh('sph', () => sphere(14, 10)), sphLo: r.mesh('sphLo', () => sphere(8, 6)), cyl: r.mesh('cyl', () => cylinder(20)), box: r.mesh('box', box),
  };
  // Үстел
  items.push({ mesh: M.box, model: m4.trs([0, TABLE_Y - 0.08, -0.5], [16, 0.16, 9]), color: [0.16, 0.23, 0.32, 1], shine: 0.06 });

  const vessels = v.vessels.filter(ves => o.placed.includes(ves.kind) || (ves.kind === 'flask' && o.placed.includes('flask')));
  const hasBurette = vessels.some(x => x.kind === 'burette');
  for (const ves of vessels) {
    const P = PROFILES[ves.kind];
    let base: V3 = [ves.x * 2.4, TABLE_Y, ves.kind === 'burette' ? 0 : 0.2];
    if (ves.kind === 'burette') base = [ves.x * 2.4, 1.55, 0.2];
    const scale = ves.kind === 'burette' ? 1 : 1;
    const key = (s: string) => `${ves.id}-${s}`;
    if (ves.kind === 'ucell') { buildUCell(r, ves, base, t, o, items, labels, M); continue; }
    // Шыны
    const glassMesh = r.mesh('glass-' + ves.kind, () => lathe(outer(P.prof), 40, false, true));
    items.push({ mesh: glassMesh, model: m4.trs(base, [scale, scale, scale]), color: GLASS, glass: true, shine: 0.9, depth: -0.05 });
    // Өлшеуіш колбаның белгі сызығы
    if (ves.kind === 'volflask') items.push({ mesh: M.cyl, model: m4.trs([base[0], base[1] + 1.4, base[2]], [0.105, 0.008, 0.105]), color: [0.9, 0.95, 1, 0.9] });
    // Сұйықтық
    const frac = ves.capacity > 0 ? ves.volume / ves.capacity : 0;
    if (frac > 0.002) {
      const h = heightForFraction(P.prof, P.capY, frac);
      const lm = r.dynamic(key('liq'), h.toFixed(3), () => lathe(clip(P.prof, h), 36, true, true));
      items.push({ mesh: lm, model: m4.trs(base), color: ves.liquid as RGBA, shine: 0.5, glass: false, depth: 0.02 });
      // Тұнба қабаты
      if (ves.precipitate && ves.precipitate > 0) {
        const ph = Math.min(h, 0.03 + ves.precipitate * 0.18);
        const pm = r.dynamic(key('ppt'), ph.toFixed(3), () => lathe(clip(P.prof, P.prof[0][1] + ph, 0.02), 30, true, false));
        items.push({ mesh: pm, model: m4.trs(base), color: ves.precipitateColor as RGBA || [0.96, 0.96, 0.96, 1], shine: 0.05 });
      }
      // Бөлшектер (иондар/молекулалар — шартты көрініс)
      const rIn = (y: number) => { let rr = 0.1; for (let i = 1; i < P.prof.length; i++) if (y <= P.prof[i][1]) { const [r0, a] = P.prof[i - 1], [r1, b] = P.prof[i]; rr = r0 + (r1 - r0) * ((y - a) / (b - a || 1)); break; } return rr; };
      (ves.particles || []).forEach((pt, k) => {
        const n = Math.min(40, pt.count);
        for (let i = 0; i < n; i++) {
          const y = P.prof[0][1] + 0.05 + rnd(i, k + 1) * Math.max(0.02, h - 0.1);
          const rr = rIn(y) * 0.8 * Math.sqrt(rnd(i, k + 7)); const a = rnd(i, k + 3) * Math.PI * 2 + (o.reducedMotion || !o.running ? 0 : t * 0.15 * (k % 2 ? 1 : -1));
          items.push({ mesh: M.sphLo, model: m4.trs([base[0] + Math.cos(a) * rr, base[1] + y, base[2] + Math.sin(a) * rr], [0.028, 0.028, 0.028]), color: pt.color as RGBA, shine: 0.4 });
        }
      });
      // Көпіршіктер
      if (ves.bubbles && ves.bubbles > 0.01) {
        const n = Math.round(4 + ves.bubbles * 26);
        for (let i = 0; i < n; i++) {
          const speed = 0.25 + rnd(i, 9) * 0.35; const phase = rnd(i, 4);
          const prog = o.reducedMotion ? phase : ((t * speed + phase) % 1);
          const y = P.prof[0][1] + 0.05 + prog * (h - 0.08);
          const rr = rIn(y) * 0.75 * Math.sqrt(rnd(i, 5)); const a = rnd(i, 6) * Math.PI * 2;
          items.push({ mesh: M.sphLo, model: m4.trs([base[0] + Math.cos(a) * rr, base[1] + y, base[2] + Math.sin(a) * rr], [0.03, 0.03, 0.03].map(s => s * (0.6 + rnd(i, 8))) as V3), color: [0.92, 0.97, 1, 0.55], glass: true, shine: 1 });
        }
      }
    }
    // Қатты заттар
    if (ves.solid && ves.solid.amount > 0) {
      const s = ves.solid; const y0 = base[1] + P.prof[0][1];
      if (s.kind === 'nail') {
        const cc = s.coating || 0; const col = s.coatColor ? [0, 1, 2, 3].map(i => s.color[i] + (s.coatColor![i] - s.color[i]) * Math.min(1, cc * 1.3)) as RGBA : s.color as RGBA;
        items.push({ mesh: M.cyl, model: m4.trs([base[0] - 0.12, y0 + 0.02, base[2]], [0.035, 0.75 * (0.6 + s.amount * 0.4), 0.035], 0, -0.35), color: col, shine: 0.7 });
        items.push({ mesh: M.cyl, model: m4.trs([base[0] - 0.12 + Math.sin(0.35) * 0.75 * (0.6 + s.amount * 0.4) - 0.04, y0 + 0.02 + Math.cos(0.35) * 0.75 * (0.6 + s.amount * 0.4), base[2]], [0.07, 0.025, 0.07], 0, -0.35), color: col, shine: 0.7 });
      } else if (s.kind === 'chunks' || s.kind === 'crystals') {
        const n = Math.max(1, Math.round(s.amount * (s.kind === 'crystals' ? 22 : 9)));
        for (let i = 0; i < n; i++) {
          const a = rnd(i, 11) * Math.PI * 2, rr = Math.sqrt(rnd(i, 12)) * 0.3 * (ves.kind === 'tube' ? 0.3 : 1), sz = s.kind === 'crystals' ? 0.05 : 0.07 + rnd(i, 13) * 0.04;
          items.push({ mesh: s.kind === 'crystals' ? M.box : M.sph, model: m4.trs([base[0] + Math.cos(a) * rr, y0 + sz * 0.5, base[2] + Math.sin(a) * rr], [sz, sz * (s.kind === 'crystals' ? 1 : 0.75), sz], rnd(i, 14) * 3), color: s.color as RGBA, shine: s.kind === 'crystals' ? 0.9 : 0.1 });
        }
      } else {
        const rr = ves.kind === 'tube' ? 0.09 : 0.36;
        items.push({ mesh: M.cyl, model: m4.trs([base[0], y0, base[2]], [rr, 0.012 + s.amount * 0.04, rr]), color: s.color as RGBA, shine: 0.05 });
      }
    }
    // Электродтар (өткізгіштік)
    if (ves.electrodes) {
      for (const sx of [-1, 1]) items.push({ mesh: M.cyl, model: m4.trs([base[0] + sx * 0.18, base[1] + 0.25, base[2]], [0.025, 1.15, 0.025]), color: [0.18, 0.18, 0.2, 1], shine: 0.3 });
      items.push({ mesh: M.box, model: m4.trs([base[0], base[1] + 1.42, base[2]], [0.55, 0.04, 0.08]), color: [0.35, 0.4, 0.48, 1] });
    }
    const top = ves.kind === 'burette' ? base[1] + 2.0 : base[1] + P.capY + 0.35;
    labels.push({ p: [base[0], ves.kind === 'burette' ? top : base[1] - 0.25, base[2] + 0.5], text: ves.label, tone: 'muted' });
    if (ves.meter) labels.push({ p: [base[0] + 0.62, base[1] + 0.9, base[2]], text: `${ves.meter.label}: ${ves.meter.value}`, tone: 'value' });
  }
  if (hasBurette) {
    items.push({ mesh: M.cyl, model: m4.trs([-0.55, TABLE_Y, -0.3], [0.03, 3.6, 0.03]), color: [0.5, 0.55, 0.62, 1], shine: 0.6 });
    items.push({ mesh: M.box, model: m4.trs([-0.3, 2.3, -0.1], [0.55, 0.05, 0.06]), color: [0.5, 0.55, 0.62, 1] });
    items.push({ mesh: M.box, model: m4.trs([-0.55, TABLE_Y + 0.02, -0.3], [0.9, 0.04, 0.5]), color: [0.3, 0.34, 0.4, 1] });
  }
  // Шам (өткізгіштік)
  if (v.lamp !== undefined && o.placed.includes('lamp')) {
    const on = v.lamp ?? 0; const b = Math.min(1, on * 1.2);
    items.push({ mesh: M.sph, model: m4.trs([1.6, 1.25, 0], [0.2, 0.24, 0.2]), color: [1, 0.85 + 0.1 * b, 0.45 + 0.4 * b, 0.35 + 0.6 * b], emissive: b * 1.6, glass: b < 0.05, shine: 0.8 });
    items.push({ mesh: M.cyl, model: m4.trs([1.6, 0.95, 0], [0.09, 0.12, 0.09]), color: [0.6, 0.6, 0.62, 1], shine: 0.6 });
    items.push({ mesh: M.cyl, model: m4.trs([1.6, TABLE_Y, 0], [0.025, 0.95, 0.025]), color: [0.3, 0.3, 0.35, 1] });
    labels.push({ p: [1.6, 1.7, 0], text: v.lamp === null ? 'Шам: тізбек ажыратулы' : on > 0.3 ? 'Шам: жарық' : on > 0.05 ? 'Шам: әлсіз' : 'Шам: жанбайды', tone: 'value' });
  }
  buildProps(o.placed, items, M, labels);
  if (v.timeLabel) labels.push({ p: [0, 2.75, 0], text: v.timeLabel, tone: 'muted' });
  return { items, labels };
}

function buildUCell(r: Renderer, ves: VisualVessel, base: V3, t: number, o: LabSceneOpts, items: DrawItem[], labels: Label[], M: any) {
  const P = PROFILES.ucell; const e = ves.electrodes!;
  const glass = r.mesh('glass-ucell', () => lathe(outer(P.prof), 30, false, true));
  const tubes: [number, number, string][] = [[-0.5, e.gasLeft, e.leftLabel], [0.5, e.gasRight, e.rightLabel]];
  for (const [dx, gas, lab] of tubes) {
    const b: V3 = [base[0] + dx, base[1] + 0.25, base[2]];
    items.push({ mesh: glass, model: m4.trs(b), color: GLASS, glass: true, shine: 0.9 });
    const gasH = gas * 1.0; const liqTop = P.capY - gasH;
    const lm = r.dynamic(`uc-${dx}`, liqTop.toFixed(3), () => lathe(clip(P.prof, Math.max(0.1, liqTop)), 24, true, true));
    items.push({ mesh: lm, model: m4.trs(b), color: ves.liquid as RGBA, shine: 0.5 });
    if (gasH > 0.01) items.push({ mesh: M.cyl, model: m4.trs([b[0], b[1] + liqTop, b[2]], [0.098, gasH, 0.098]), color: [0.95, 0.97, 1, 0.18], glass: true });
    items.push({ mesh: M.cyl, model: m4.trs([b[0], b[1] + 0.06, b[2]], [0.03, 0.22, 0.03]), color: [0.2, 0.2, 0.22, 1], shine: 0.4 });
    if (e.on && (ves.bubbles || 0) > 0) for (let i = 0; i < 8; i++) {
      const prog = o.reducedMotion ? rnd(i, 2) : ((t * (0.4 + rnd(i, 3) * 0.3) + rnd(i, 2)) % 1);
      items.push({ mesh: M.sphLo, model: m4.trs([b[0] + (rnd(i, 4) - 0.5) * 0.12, b[1] + 0.3 + prog * Math.max(0.05, liqTop - 0.35), b[2]], [0.022, 0.022, 0.022]), color: [0.95, 0.98, 1, 0.6], glass: true });
    }
    labels.push({ p: [b[0] + (dx < 0 ? -0.25 : 0.25), b[1] + P.capY + (dx < 0 ? 0.42 : 0.18), b[2]], text: lab, tone: 'value' });
  }
  // Резервуар және қосқыш түтік
    items.push({ mesh: M.box, model: m4.trs([base[0], base[1] + 0.2, base[2]], [1.1, 0.1, 0.16]), color: [0.75, 0.88, 1, 0.16], glass: true });
  items.push({ mesh: M.box, model: m4.trs([base[0], base[1] + 0.06, base[2]], [1.45, 0.12, 0.5]), color: [0.28, 0.32, 0.38, 1] });
  labels.push({ p: [base[0], base[1] - 0.15, base[2] + 0.5], text: ves.label, tone: 'muted' });
}

/** Үстелдегі қосымша құралдар (артқы қатарда). */
function buildProps(placed: string[], items: DrawItem[], M: any, labels: Label[]) {
  const order = ['balance', 'phmeter', 'thermometer', 'pipette', 'rod', 'cylinder', 'indicator', 'power'];
  let x = -2.5;
  for (const id of order) {
    if (!placed.includes(id)) continue;
    const z = -0.95;
    if (id === 'balance') { items.push({ mesh: M.box, model: m4.trs([x, 0.08, z], [0.6, 0.16, 0.45]), color: [0.85, 0.87, 0.9, 1], shine: 0.4 }); items.push({ mesh: M.cyl, model: m4.trs([x, 0.16, z], [0.2, 0.02, 0.2]), color: [0.7, 0.72, 0.75, 1], shine: 0.9 }); items.push({ mesh: M.box, model: m4.trs([x, 0.1, z + 0.23], [0.3, 0.07, 0.01]), color: [0.1, 0.3, 0.25, 1], emissive: 0.4 }); }
    if (id === 'phmeter') { items.push({ mesh: M.box, model: m4.trs([x, 0.1, z], [0.35, 0.2, 0.25]), color: [0.2, 0.55, 0.7, 1], shine: 0.4 }); items.push({ mesh: M.cyl, model: m4.trs([x + 0.1, 0.2, z], [0.02, 0.6, 0.02]), color: [0.85, 0.9, 0.95, 0.9] }); }
    if (id === 'thermometer') items.push({ mesh: M.cyl, model: m4.trs([x, 0.02, z], [0.02, 0.9, 0.02], 0, 0.25), color: [0.9, 0.95, 1, 0.8], glass: true, shine: 1 });
    if (id === 'pipette') items.push({ mesh: M.cyl, model: m4.trs([x, 0.02, z], [0.02, 1.0, 0.02], 0, 0.2), color: [0.9, 0.95, 1, 0.5], glass: true, shine: 1 });
    if (id === 'rod') items.push({ mesh: M.cyl, model: m4.trs([x, 0.03, z], [0.015, 0.9, 0.015], 1.2, Math.PI / 2 - 0.05), color: [0.9, 0.95, 1, 0.55], glass: true, shine: 1 });
    if (id === 'cylinder') { items.push({ mesh: M.cyl, model: m4.trs([x, 0.06, z], [0.1, 0.9, 0.1]), color: [0.75, 0.88, 1, 0.14], glass: true, shine: 1 }); items.push({ mesh: M.cyl, model: m4.trs([x, 0, z], [0.18, 0.06, 0.18]), color: [0.75, 0.88, 1, 0.3], glass: true }); }
    if (id === 'indicator') { items.push({ mesh: M.cyl, model: m4.trs([x, 0, z], [0.1, 0.28, 0.1]), color: [0.5, 0.3, 0.15, 0.85], glass: true, shine: 0.8 }); items.push({ mesh: M.cyl, model: m4.trs([x, 0.28, z], [0.05, 0.12, 0.05]), color: [0.15, 0.15, 0.17, 1] }); }
    if (id === 'power') { items.push({ mesh: M.box, model: m4.trs([x, 0.15, z], [0.55, 0.3, 0.35]), color: [0.22, 0.25, 0.3, 1], shine: 0.3 }); items.push({ mesh: M.box, model: m4.trs([x, 0.2, z + 0.18], [0.3, 0.1, 0.01]), color: [0.14, 0.75, 0.6, 1], emissive: 0.6 }); }
    labels.push({ p: [x, -0.2, z + 0.3], text: LABEL[id], tone: 'muted' });
    x += 0.72;
  }
}
const LABEL: Record<string, string> = { balance: 'Таразы', phmeter: 'pH-өлшеуіш', thermometer: 'Термометр', pipette: 'Тамшуыр', rod: 'Таяқша', cylinder: 'Цилиндр', indicator: 'Индикатор', power: 'Ток көзі' };
