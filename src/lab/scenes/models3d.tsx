import { useState } from 'react';
import { Renderer, m4, sphere, cylinder, circleLine, type DrawItem, type V3, type RGBA } from './gl';
import { Viewport3D, type SceneFrame } from './Viewport3D';
import type { ElementData } from '../../data/elementTypes';

/* ───────── Молекулалар (басты бет) ───────── */
const COL: Record<string, RGBA> = { H: [0.93, 0.94, 0.96, 1], O: [0.92, 0.26, 0.26, 1], C: [0.3, 0.32, 0.36, 1], N: [0.3, 0.45, 0.95, 1] };
const RAD: Record<string, number> = { H: 0.25, O: 0.42, C: 0.4, N: 0.41 };
export interface Mol { id: string; name: string; formula: string; atoms: { el: string; p: V3 }[]; bonds: [number, number, number][]; note: string }
const deg = Math.PI / 180;
export const MOLECULES: Mol[] = [
  { id: 'h2o', name: 'Су', formula: 'H₂O', note: 'Бұрыштық пішін, H–O–H бұрышы ≈ 104,5°', atoms: [{ el: 'O', p: [0, 0.2, 0] }, { el: 'H', p: [Math.sin(52.25 * deg) * 1.0, 0.2 - Math.cos(52.25 * deg) * 1.0, 0] }, { el: 'H', p: [-Math.sin(52.25 * deg) * 1.0, 0.2 - Math.cos(52.25 * deg) * 1.0, 0] }], bonds: [[0, 1, 1], [0, 2, 1]] },
  { id: 'co2', name: 'Көміртек диоксиді', formula: 'CO₂', note: 'Сызықтық пішін, O=C=O бұрышы 180°', atoms: [{ el: 'C', p: [0, 0, 0] }, { el: 'O', p: [1.2, 0, 0] }, { el: 'O', p: [-1.2, 0, 0] }], bonds: [[0, 1, 2], [0, 2, 2]] },
  { id: 'ch4', name: 'Метан', formula: 'CH₄', note: 'Тетраэдр, H–C–H бұрышы ≈ 109,5°', atoms: [{ el: 'C', p: [0, 0, 0] }, ...([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]] as V3[]).map(v => ({ el: 'H', p: v.map(x => x * 0.63) as V3 }))], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1], [0, 4, 1]] },
  { id: 'nh3', name: 'Аммиак', formula: 'NH₃', note: 'Үшбұрышты пирамида, H–N–H бұрышы ≈ 107°', atoms: [{ el: 'N', p: [0, 0.3, 0] }, ...[0, 120, 240].map(a => ({ el: 'H', p: [Math.cos(a * deg) * 0.94, -0.08, Math.sin(a * deg) * 0.94] as V3 }))], bonds: [[0, 1, 1], [0, 2, 1], [0, 3, 1]] },
];

function buildMol(r: Renderer, mol: Mol, t: number, spin: boolean): SceneFrame {
  const S = r.mesh('msph', () => sphere(28, 20)), C = r.mesh('mcyl', () => cylinder(16));
  const rot = spin ? t * 0.35 : 0.5; const cr = Math.cos(rot), sr = Math.sin(rot);
  const tf = (p: V3): V3 => [p[0] * cr + p[2] * sr, p[1], -p[0] * sr + p[2] * cr];
  const items: DrawItem[] = [];
  mol.atoms.forEach(a => { const rr = RAD[a.el]; items.push({ mesh: S, model: m4.trs(tf(a.p), [rr, rr, rr]), color: COL[a.el], shine: 0.7 }); });
  mol.bonds.forEach(([i, j, order]) => {
    const a = tf(mol.atoms[i].p), b = tf(mol.atoms[j].p); const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const off = order === 2 ? [-0.07, 0.07] : [0];
    off.forEach(o => items.push({ mesh: C, model: m4.align([a[0], a[1] + o, a[2] + o], d, 0.07), color: [0.75, 0.78, 0.84, 1], shine: 0.4 }));
  });
  return { items, labels: mol.atoms.map(a => ({ p: tf([a.p[0], a.p[1], a.p[2] + RAD[a.el] + 0.05]), text: a.el })) };
}

export function MoleculeViewer({ use3D, reducedMotion, onFail }: { use3D: boolean; reducedMotion: boolean; onFail: () => void }) {
  const [id, setId] = useState('h2o'); const mol = MOLECULES.find(m => m.id === id)!;
  return <div className="molecule">
    {use3D ? <Viewport3D className="mol-vp" build={(r, t) => buildMol(r, mol, t, !reducedMotion)} initial={{ theta: 0.3, phi: 0.25, dist: 5, target: [0, 0, 0] }} animate={!reducedMotion} ariaLabel={`${mol.name} (${mol.formula}) молекуласының 3D оқу моделі`} onFail={onFail} version={id} minDist={2.5} maxDist={10} />
      : <Mol2D mol={mol} />}
    <div className="mol-switch" role="group" aria-label="Молекуланы таңдау">
      {MOLECULES.map(m => <button key={m.id} className={'chip' + (m.id === id ? ' on' : '')} aria-pressed={m.id === id} onClick={() => setId(m.id)}>{m.formula}</button>)}
    </div>
    <p className="mol-note"><strong>{mol.name}</strong> — {mol.note}. Түстер мен өлшемдер шартты.</p>
  </div>;
}
function Mol2D({ mol }: { mol: Mol }) {
  const sc = 70, cx = 160, cy = 120; const css = (c: RGBA) => `rgb(${c.map(x => Math.round(x * 255)).slice(0, 3).join(',')})`;
  return <svg viewBox="0 0 320 240" className="mol2d" role="img" aria-label={`${mol.name} молекуласының 2D сызбасы`}>
    {mol.bonds.map(([i, j], k) => <line key={k} x1={cx + mol.atoms[i].p[0] * sc} y1={cy - mol.atoms[i].p[1] * sc} x2={cx + mol.atoms[j].p[0] * sc} y2={cy - mol.atoms[j].p[1] * sc} stroke="#aab4c3" strokeWidth="6" />)}
    {mol.atoms.map((a, i) => <g key={i}><circle cx={cx + a.p[0] * sc} cy={cy - a.p[1] * sc} r={RAD[a.el] * 50} fill={css(COL[a.el])} /><text x={cx + a.p[0] * sc} y={cy - a.p[1] * sc + 5} textAnchor="middle" className="svg-atom">{a.el}</text></g>)}
  </svg>;
}

/* ───────── Атомның қабаттық оқу моделі ───────── */
function fib(n: number, i: number): V3 { const y = 1 - (i + 0.5) / n * 2, r = Math.sqrt(1 - y * y), a = i * 2.39996; return [Math.cos(a) * r, y, Math.sin(a) * r]; }
function buildAtom(r: Renderer, e: ElementData, t: number, spin: boolean): SceneFrame {
  const S = r.mesh('asph', () => sphere(8, 6)), E = r.mesh('esph', () => sphere(10, 8)), L = r.mesh('ring', () => circleLine(72));
  const items: DrawItem[] = []; const Z = e.z, N = e.A - e.z, A = e.A;
  const R = 0.12 * Math.cbrt(A) * 0.9;
  for (let i = 0; i < A; i++) {
    const p = fib(A, i); const rr = R * Math.cbrt((i + 0.5) / A);
    const isP = (i * Z) % A < Z; // протондар мен нейтрондарды біркелкі араластыру
    items.push({ mesh: S, model: m4.trs([p[0] * rr, p[1] * rr, p[2] * rr], [0.075, 0.075, 0.075]), color: isP ? [0.93, 0.36, 0.33, 1] : [0.7, 0.74, 0.8, 1], shine: 0.3 });
  }
  void N;
  e.shells.forEach((cnt, k) => {
    const rad = R + 0.55 + k * 0.42;
    items.push({ mesh: L, model: m4.trs([0, 0, 0], [rad, 1, rad]), color: [0.45, 0.78, 0.96, 0.55] });
    for (let j = 0; j < cnt; j++) {
      const a = j / cnt * Math.PI * 2 + (spin ? t * 0.25 / (k + 1) : 0);
      items.push({ mesh: E, model: m4.trs([Math.cos(a) * rad, 0, Math.sin(a) * rad], [0.06, 0.06, 0.06]), color: [0.3, 0.85, 0.75, 1], emissive: 0.3, shine: 0.6 });
    }
  });
  return { items };
}
export function AtomViewer({ e, use3D, reducedMotion, onFail }: { e: ElementData; use3D: boolean; reducedMotion: boolean; onFail: () => void }) {
  const nShell = e.shells.length;
  return use3D
    ? <Viewport3D className="atom-vp" build={(r, t) => buildAtom(r, e, t, !reducedMotion)} initial={{ theta: 0.4, phi: 0.75, dist: 3 + nShell * 0.9, target: [0, 0, 0] }} animate={!reducedMotion} ariaLabel={`${e.kk} атомының масштабталмаған қабаттық оқу моделі: ${e.z} протон, ${e.A - e.z} нейтрон, ${e.z} электрон`} onFail={onFail} version={e.z} minDist={1.5} maxDist={14} />
    : <Atom2D e={e} />;
}
function Atom2D({ e }: { e: ElementData }) {
  const cx = 150, cy = 150;
  return <svg viewBox="0 0 300 300" className="atom2d" role="img" aria-label={`${e.kk} атомының 2D қабаттық сызбасы`}>
    <circle cx={cx} cy={cy} r={16} fill="#e65c54" /><text x={cx} y={cy + 4} textAnchor="middle" className="svg-atom">{e.s}</text>
    {e.shells.map((n, k) => { const rad = 30 + k * 18; return <g key={k}><circle cx={cx} cy={cy} r={rad} fill="none" stroke="rgba(77,201,245,0.5)" />
      {Array.from({ length: n }, (_, j) => { const a = j / n * Math.PI * 2; return <circle key={j} cx={cx + Math.cos(a) * rad} cy={cy + Math.sin(a) * rad} r={2.6} fill="#23C6A5" />; })}</g>; })}
  </svg>;
}
