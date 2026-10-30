import type { ReactionModel, RGBA } from '../types';
import { checkParams, fmt, MOLAR_MASS, VM_25C_100KPA, WATER, mix } from '../chem';
import { SRC } from '../sources';

/* ───────────────────── 4. Тұнба түзілуі ───────────────────── */
export const KSP_CACO3 = 3.36e-9; // кальцит, 25 °C (CRC)
interface PptS { caIn: boolean; co3In: boolean; stirred: boolean }

/** Араласқаннан кейінгі тепе-теңдік: (Ca − x)(CO3 − x) = Ksp, Q ≤ Ksp болса тұнба жоқ. */
export function precipitate(cCa: number, VCa: number, cC: number, VC: number) {
  const V = (VCa + VC) / 1000;
  const ca0 = cCa * VCa / 1000 / V, c0 = cC * VC / 1000 / V;
  const Q = ca0 * c0;
  let x = 0;
  if (Q > KSP_CACO3) x = ((ca0 + c0) - Math.sqrt((ca0 - c0) ** 2 + 4 * KSP_CACO3)) / 2;
  const n = x * V;
  return { V, ca0, c0, Q, n, mass: n * MOLAR_MASS.CaCO3, caLeft: ca0 - x, co3Left: c0 - x };
}

export const precipitation: ReactionModel<PptS> = {
  id: 'precipitation', version: '1.0.0', title: 'Тұнба түзілуі',
  equations: [
    { id: 'mol', label: 'Молекулалық теңдеу', reactants: [{ f: 'CaCl2', coef: 1, phase: 'aq' }, { f: 'Na2CO3', coef: 1, phase: 'aq' }], products: [{ f: 'CaCO3', coef: 1, phase: 's' }, { f: 'NaCl', coef: 2, phase: 'aq' }] },
    { id: 'net', label: 'Қысқартылған иондық теңдеу', reactants: [{ f: 'Ca', coef: 1, phase: 'aq', charge: 2 }, { f: 'CO3', coef: 1, phase: 'aq', charge: -2 }], products: [{ f: 'CaCO3', coef: 1, phase: 's' }] },
  ],
  substances: [{ id: 'cacl2', name: 'Кальций хлориді', formula: 'CaCl2' }, { id: 'na2co3', name: 'Натрий карбонаты', formula: 'Na2CO3' }, { id: 'caco3', name: 'Кальций карбонаты (ақ тұнба)', formula: 'CaCO3', molarMass: 100.086 }],
  equipment: ['beaker', 'cylinder', 'rod'],
  params: [
    { key: 'cCa', label: 'c(CaCl₂)', unit: 'моль/л', min: 0.0001, max: 0.5, step: 0.0001, default: 0.1 },
    { key: 'VCa', label: 'V(CaCl₂)', unit: 'мл', min: 5, max: 50, step: 5, default: 20 },
    { key: 'cC', label: 'c(Na₂CO₃)', unit: 'моль/л', min: 0.0001, max: 0.5, step: 0.0001, default: 0.1 },
    { key: 'VC', label: 'V(Na₂CO₃)', unit: 'мл', min: 5, max: 50, step: 5, default: 10 },
  ],
  actions: [
    { id: 'pourCa', label: 'CaCl₂ ерітіндісін стақанға құю', group: 'reagent' },
    { id: 'pourCO3', label: 'Na₂CO₃ ерітіндісін қосу', group: 'reagent' },
    { id: 'stir', label: 'Шыны таяқшамен араластыру', group: 'operation' },
  ],
  milestones: [{ id: 'mixed', label: 'Екі ерітінді араластырылды' }, { id: 'stirred', label: 'Қоспа араластырылды' }],
  assumptions: [`Ksp(CaCO₃, кальцит, 25 °C) = ${fmt(KSP_CACO3)}; концентрация = активтілік.`, 'Тұнба тек Q = [Ca²⁺][CO₃²⁻] > Ksp болғанда түзіледі.'],
  limitations: ['CO₃²⁻ ионының гидролизі және иондық күштің әсері ескерілмейді — өте сұйылтылған және өте концентрлі ерітінділерде нәтиже жуық.', 'Тұнбаның түзілу жылдамдығы мен кристалл өлшемі модельденбейді.'],
  sources: [SRC.cuPpt, SRC.crc],
  timeMode: 'none',
  validateParams(p) { return checkParams(this.params, p); },
  init: () => ({ caIn: false, co3In: false, stirred: false }),
  apply(s, a) {
    if (a.id === 'pourCa') { if (s.caIn) return { state: s, error: 'CaCl₂ құйылған.' }; return { state: { ...s, caIn: true }, note: 'CaCl₂ ерітіндісі құйылды — мөлдір.' }; }
    if (a.id === 'pourCO3') {
      if (!s.caIn) return { state: s, error: 'Алдымен стақанға CaCl₂ ерітіндісін құйыңыз.' };
      if (s.co3In) return { state: s, error: 'Na₂CO₃ қосылған.' };
      return { state: { ...s, co3In: true }, note: 'Na₂CO₃ ерітіндісі қосылды.' };
    }
    if (a.id === 'stir') { if (!s.co3In) return { state: s, error: 'Араластыру үшін екі ерітіндіні де құйыңыз.' }; return { state: { ...s, stirred: true }, note: 'Қоспа араластырылды.' }; }
    return { state: s, error: 'Бұл әрекет осы модельде жоқ.' };
  },
  measure(s, p) {
    if (!s.co3In) return [{ key: 'state', label: 'Күйі', value: s.caIn ? 'тек CaCl₂ ерітіндісі' : 'стақан бос', kind: 'qual' }];
    const r = precipitate(p.cCa, p.VCa, p.cC, p.VC);
    const nCa = p.cCa * p.VCa / 1000, nC = p.cC * p.VC / 1000;
    return [
      { key: 'Q', label: 'Q = [Ca²⁺][CO₃²⁻] (араласқан соң)', value: r.Q, kind: 'calc' },
      { key: 'Ksp', label: 'Ksp(CaCO₃)', value: KSP_CACO3, kind: 'calc' },
      { key: 'ppt', label: 'Тұнба', value: r.n > 0 ? 'ақ тұнба түзілді' : 'тұнба түзілмейді (Q ≤ Ksp)', kind: 'qual' },
      { key: 'n', label: 'n(CaCO₃) тұнба', value: r.n, unit: 'моль', kind: 'calc' },
      { key: 'm', label: 'm(CaCO₃) тұнба', value: r.mass, unit: 'г', kind: 'calc' },
      { key: 'limit', label: 'Шектеуші реагент', value: Math.abs(nCa - nC) < 1e-15 ? 'жоқ (тең мөлшер)' : nCa < nC ? 'CaCl₂' : 'Na₂CO₃', kind: 'qual' },
      { key: 'excess', label: 'Артық реагент', value: Math.abs(nCa - nC), unit: 'моль', kind: 'calc' },
    ];
  },
  visual(s, p) {
    const r = s.co3In ? precipitate(p.cCa, p.VCa, p.cC, p.VC) : null;
    const nMax = Math.max(1e-9, Math.min(p.cCa * p.VCa, p.cC * p.VC) / 1000);
    const frac = r ? Math.min(1, r.n / 0.0025) : 0;
    const cloud: RGBA = mix(WATER, [0.95, 0.95, 0.95, 0.8], r && !s.stirred ? Math.min(1, r.n / nMax) * 0.9 : r ? Math.min(0.5, r.n / nMax * 0.4) : 0);
    return {
      vessels: [
        { id: 'b', kind: 'beaker', label: 'Стақан', x: 0, capacity: 150, volume: (s.caIn ? p.VCa : 0) + (s.co3In ? p.VC : 0), liquid: cloud, precipitate: s.stirred && r ? Math.max(r.n > 0 ? 0.08 : 0, frac) : 0, precipitateColor: [0.97, 0.97, 0.97, 1],
          particles: s.co3In && r ? [{ label: 'Ca²⁺', count: Math.round(Math.min(30, r.caLeft * 200)), color: [0.6, 0.9, 0.6, 1], charge: 2 }, { label: 'CO₃²⁻', count: Math.round(Math.min(30, r.co3Left * 200)), color: [0.95, 0.6, 0.3, 1], charge: -2 }] : [] },
      ],
    };
  },
  reached: s => ({ mixed: s.co3In, stirred: s.stirred }),
};

/* ───────────────────── 5. Металдардың орынбасуы ───────────────────── */
interface DispS { poured: boolean; fe: boolean; xi: number; t: number; running: boolean }
const K_DISP = 0.35; // шартты жылдамдық тұрақтысы (1/шартты бірлік)
const CU_BLUE: RGBA = [0.15, 0.45, 0.95, 0.7], FE_GREEN: RGBA = [0.6, 0.85, 0.55, 0.4];
export function dispMax(p: Record<string, number>) { const nFe = p.mFe / MOLAR_MASS.Fe, nCu = p.cCu * p.V / 1000; return { nFe, nCu, max: Math.min(nFe, nCu) }; }

export const displacement: ReactionModel<DispS> = {
  id: 'displacement', version: '1.0.0', title: 'Металдардың орынбасу реакциясы',
  equations: [
    { id: 'mol', label: 'Молекулалық теңдеу', reactants: [{ f: 'Fe', coef: 1, phase: 's' }, { f: 'CuSO4', coef: 1, phase: 'aq' }], products: [{ f: 'FeSO4', coef: 1, phase: 'aq' }, { f: 'Cu', coef: 1, phase: 's' }] },
    { id: 'net', label: 'Қысқартылған иондық теңдеу', reactants: [{ f: 'Fe', coef: 1, phase: 's' }, { f: 'Cu', coef: 1, phase: 'aq', charge: 2 }], products: [{ f: 'Fe', coef: 1, phase: 'aq', charge: 2 }, { f: 'Cu', coef: 1, phase: 's' }] },
  ],
  substances: [{ id: 'fe', name: 'Темір (шеге)', formula: 'Fe', molarMass: 55.845 }, { id: 'cuso4', name: 'Мыс(II) сульфаты', formula: 'CuSO4', color: 'көк' }, { id: 'cu', name: 'Мыс', formula: 'Cu', color: 'қызғылт қоңыр' }],
  equipment: ['beaker', 'balance', 'cylinder'],
  params: [
    { key: 'mFe', label: 'Темір массасы', unit: 'г', min: 0.1, max: 5, step: 0.1, default: 1 },
    { key: 'cCu', label: 'c(CuSO₄)', unit: 'моль/л', min: 0.1, max: 1, step: 0.05, default: 0.5 },
    { key: 'V', label: 'V(CuSO₄)', unit: 'мл', min: 10, max: 100, step: 5, default: 50 },
  ],
  actions: [
    { id: 'pour', label: 'CuSO₄ ерітіндісін құю', group: 'reagent' },
    { id: 'addFe', label: 'Темір шегені салу', group: 'reagent' },
  ],
  milestones: [{ id: 'poured', label: 'CuSO₄ құйылды' }, { id: 'feAdded', label: 'Темір салынды' }, { id: 'reacted', label: 'Реакция шектеуші реагент біткенге дейін жүрді' }],
  assumptions: ['Стехиометрия 1:1; Fe²⁺ түзіледі.', 'ξ(t) = ξmax·(1 − e^(−k·t)) — сапалық «шартты уақыт» моделі.'],
  limitations: ['Нақты жылдамдық беттің ауданы мен температураға байланысты; секундтар берілмейді.', 'Газ бөлінбейді. Fe²⁺ ауада тотығуы ескерілмейді.'],
  sources: [SRC.rscMicro],
  timeMode: 'conditional',
  validateParams(p) { return checkParams(this.params, p); },
  init: () => ({ poured: false, fe: false, xi: 0, t: 0, running: false }),
  apply(s, a) {
    if (a.id === 'pour') { if (s.poured) return { state: s, error: 'Ерітінді құйылған.' }; return { state: { ...s, poured: true }, note: 'Көк CuSO₄ ерітіндісі құйылды.' }; }
    if (a.id === 'addFe') {
      if (!s.poured) return { state: s, error: 'Алдымен CuSO₄ ерітіндісін құйыңыз.' };
      if (s.fe) return { state: s, error: 'Шеге салынған.' };
      return { state: { ...s, fe: true, running: true }, note: 'Темір шеге ерітіндіге салынды. «Бастау» арқылы процесті бақылаңыз.' };
    }
    return { state: s, error: 'Бұл әрекет осы модельде жоқ.' };
  },
  tick(s, dt, p) {
    if (!s.fe || dt <= 0) return s;
    const t = s.t + dt; const { max } = dispMax(p);
    return { ...s, t, xi: max * (1 - Math.exp(-K_DISP * t)) };
  },
  isRunning: s => s.fe,
  measure(s, p) {
    const { nFe, nCu, max } = dispMax(p);
    return [
      { key: 't', label: 'Шартты уақыт', value: Number(s.t.toFixed(1)), unit: 'шартты бірлік', kind: 'cond' },
      { key: 'cu2', label: '[Cu²⁺] қалдық', value: s.poured ? (nCu - s.xi) / (p.V / 1000) : 0, unit: 'моль/л', kind: 'calc' },
      { key: 'fe2', label: '[Fe²⁺]', value: s.poured ? s.xi / (p.V / 1000) : 0, unit: 'моль/л', kind: 'calc' },
      { key: 'mCu', label: 'Түзілген мыс массасы', value: s.xi * MOLAR_MASS.Cu, unit: 'г', kind: 'calc' },
      { key: 'mFe', label: 'Қалған темір массасы', value: (nFe - s.xi) * MOLAR_MASS.Fe, unit: 'г', kind: 'calc' },
      { key: 'limit', label: 'Шектеуші реагент', value: nFe < nCu ? 'Fe' : nFe > nCu ? 'CuSO₄' : 'жоқ (тең)', kind: 'qual' },
      { key: 'prog', label: 'Реакция дәрежесі ξ/ξmax', value: max > 0 ? Number((s.xi / max * 100).toFixed(1)) : 0, unit: '%', kind: 'calc' },
    ];
  },
  visual(s, p) {
    const { nCu, max } = dispMax(p);
    const cu = s.poured ? (nCu - s.xi) / (p.V / 1000) : 0, fe = s.poured ? s.xi / (p.V / 1000) : 0;
    let col = mix(WATER, CU_BLUE, Math.min(1, cu / 0.6));
    if (fe > 0) col = mix(col, FE_GREEN, Math.min(0.5, fe / 1.5) * (1 - Math.min(1, cu / 0.6)));
    return {
      vessels: [{ id: 'b', kind: 'beaker', label: 'Стақан: CuSO₄', x: 0, capacity: 150, volume: s.poured ? p.V : 0, liquid: col,
        solid: s.fe ? { kind: 'nail', amount: Math.min(1, p.mFe / 3), color: [0.55, 0.57, 0.6, 1], coating: max > 0 ? s.xi / max : 0, coatColor: [0.72, 0.36, 0.22, 1] } : undefined }],
      timeLabel: s.fe ? `шартты уақыт: ${s.t.toFixed(1).replace('.', ',')}` : undefined,
    };
  },
  reached(s, p) { const { max } = dispMax(p); return { poured: s.poured, feAdded: s.fe, reacted: max > 0 && s.xi >= 0.95 * max }; },
};

/* ───────────────────── 6. Карбонат + қышқыл → CO₂ ───────────────────── */
interface CarbS { carb: boolean; acid: boolean; xi: number; t: number }
export function carbMax(p: Record<string, number>) { const nC = p.m / MOLAR_MASS.CaCO3, nH = p.cH * p.V / 1000; return { nC, nH, max: Math.min(nC, nH / 2) }; }
export const carbonate: ReactionModel<CarbS> = {
  id: 'carbonate', version: '1.0.0', title: 'Карбонат пен қышқылдан газ түзілуі',
  equations: [{ id: 'mol', label: 'Молекулалық теңдеу', reactants: [{ f: 'CaCO3', coef: 1, phase: 's' }, { f: 'HCl', coef: 2, phase: 'aq' }], products: [{ f: 'CaCl2', coef: 1, phase: 'aq' }, { f: 'CO2', coef: 1, phase: 'g' }, { f: 'H2O', coef: 1, phase: 'l' }] },
    { id: 'net', label: 'Қысқартылған иондық теңдеу', reactants: [{ f: 'CaCO3', coef: 1, phase: 's' }, { f: 'H3O', coef: 2, phase: 'aq', charge: 1 }], products: [{ f: 'Ca', coef: 1, phase: 'aq', charge: 2 }, { f: 'CO2', coef: 1, phase: 'g' }, { f: 'H2O', coef: 3, phase: 'l' }] }],
  substances: [{ id: 'caco3', name: 'Кальций карбонаты', formula: 'CaCO3', molarMass: 100.086 }, { id: 'hcl', name: 'Тұз қышқылы', formula: 'HCl' }],
  equipment: ['flask', 'balance', 'cylinder'],
  params: [
    { key: 'm', label: 'm(CaCO₃)', unit: 'г', min: 0.1, max: 5, step: 0.1, default: 1 },
    { key: 'cH', label: 'c(HCl)', unit: 'моль/л', min: 0.1, max: 2, step: 0.1, default: 1 },
    { key: 'V', label: 'V(HCl)', unit: 'мл', min: 10, max: 100, step: 5, default: 50 },
    { key: 'size', label: 'Бөлшек өлшемі (сапалық)', unit: '', min: 0, max: 1, step: 1, default: 0, options: [{ value: 0, label: 'Кесектер' }, { value: 1, label: 'Ұнтақ' }] },
  ],
  actions: [{ id: 'addCarb', label: 'CaCO₃ колбаға салу', group: 'reagent' }, { id: 'addAcid', label: 'HCl қосу', group: 'reagent' }],
  milestones: [{ id: 'carb', label: 'Карбонат салынды' }, { id: 'acid', label: 'Қышқыл қосылды' }, { id: 'done', label: 'Шектеуші реагент толық жұмсалды' }],
  assumptions: ['Стехиометрия: 1 моль CaCO₃ : 2 моль HCl : 1 моль CO₂.', `CO₂ көлемі идеал газ ретінде 25 °C және 100 кПа үшін: Vm = ${fmt(VM_25C_100KPA, 4)} л/моль.`, 'Ұнтақтың реакциясы кесектерге қарағанда жылдамырақ — тек сапалық салыстыру.'],
  limitations: ['CO₂-нің суда еруі ескерілмейді.', 'Уақыт шкаласы шартты; секундтар берілмейді.'],
  sources: [SRC.rscMicro],
  timeMode: 'conditional',
  validateParams(p) { return checkParams(this.params, p); },
  init: () => ({ carb: false, acid: false, xi: 0, t: 0 }),
  apply(s, a) {
    if (a.id === 'addCarb') { if (s.carb) return { state: s, error: 'Карбонат салынған.' }; return { state: { ...s, carb: true }, note: 'CaCO₃ колбаға салынды.' }; }
    if (a.id === 'addAcid') { if (!s.carb) return { state: s, error: 'Алдымен колбаға CaCO₃ салыңыз.' }; if (s.acid) return { state: s, error: 'Қышқыл қосылған.' }; return { state: { ...s, acid: true }, note: 'HCl қосылды — газ көпіршіктері пайда болады.' }; }
    return { state: s, error: 'Бұл әрекет осы модельде жоқ.' };
  },
  tick(s, dt, p) {
    if (!(s.carb && s.acid) || dt <= 0) return s;
    const k = p.size === 1 ? 0.9 : 0.25; const t = s.t + dt; const { max } = carbMax(p);
    return { ...s, t, xi: max * (1 - Math.exp(-k * t)) };
  },
  isRunning: s => s.carb && s.acid,
  measure(s, p) {
    const { nC, nH, max } = carbMax(p);
    return [
      { key: 't', label: 'Шартты уақыт', value: Number(s.t.toFixed(1)), unit: 'шартты бірлік', kind: 'cond' },
      { key: 'nCO2', label: 'n(CO₂)', value: s.xi, unit: 'моль', kind: 'calc' },
      { key: 'VCO2', label: 'V(CO₂), 25 °C, 100 кПа', value: s.xi * VM_25C_100KPA * 1000, unit: 'мл', kind: 'calc' },
      { key: 'mC', label: 'Қалған CaCO₃', value: s.carb ? (nC - s.xi) * MOLAR_MASS.CaCO3 : 0, unit: 'г', kind: 'calc' },
      { key: 'nH', label: 'Қалған HCl', value: s.acid ? nH - 2 * s.xi : 0, unit: 'моль', kind: 'calc' },
      { key: 'limit', label: 'Шектеуші реагент', value: Math.abs(nC - nH / 2) < 1e-12 ? 'жоқ (тең)' : nC < nH / 2 ? 'CaCO₃' : 'HCl', kind: 'qual' },
      { key: 'max', label: 'Теориялық n(CO₂) max', value: max, unit: 'моль', kind: 'calc' },
    ];
  },
  visual(s, p) {
    const { nC, max } = carbMax(p); const k = p.size === 1 ? 0.9 : 0.25;
    const rate = s.carb && s.acid && max > 0 ? Math.exp(-k * s.t) * Math.min(1, max / 0.01 + 0.3) : 0;
    return { vessels: [{ id: 'f', kind: 'flask', label: 'Колба', x: 0, capacity: 250, volume: s.acid ? p.V : 0, liquid: WATER, bubbles: rate,
      solid: s.carb ? { kind: p.size === 1 ? 'powder' : 'chunks', amount: nC > 0 ? (nC - s.xi) / nC * Math.min(1, p.m / 3 + 0.2) : 0, color: [0.93, 0.92, 0.88, 1] } : undefined }],
      timeLabel: s.acid ? `шартты уақыт: ${s.t.toFixed(1).replace('.', ',')}` : undefined };
  },
  reached(s, p) { const { max } = carbMax(p); return { carb: s.carb, acid: s.acid, done: max > 0 && s.xi >= 0.97 * max }; },
};

/* ───────────────────── 7. Катализатор ───────────────────── */
interface CatS { filled: boolean; cat: boolean; xA: number; xB: number; t: number }
export const K_UNCAT = 0.004, K_CAT = 0.6; // шартты бірліктер
export const MNO2_MASS = 0.5; // г, шартты аз мөлшер
export const catalyst: ReactionModel<CatS> = {
  id: 'catalyst', version: '1.0.0', title: 'Катализатордың әсері',
  equations: [{ id: 'dec', label: 'Ыдырау теңдеуі', reactants: [{ f: 'H2O2', coef: 2, phase: 'aq' }], products: [{ f: 'H2O', coef: 2, phase: 'l' }, { f: 'O2', coef: 1, phase: 'g' }], catalyst: 'MnO2' }],
  substances: [{ id: 'h2o2', name: 'Сутек асқын тотығы', formula: 'H2O2' }, { id: 'mno2', name: 'Марганец(IV) оксиді — катализатор', formula: 'MnO2', color: 'қара ұнтақ' }],
  equipment: ['tube', 'balance'],
  params: [{ key: 'n', label: 'Әр сынауықтағы n(H₂O₂)', unit: 'моль', min: 0.002, max: 0.02, step: 0.002, default: 0.01 }],
  actions: [{ id: 'fill', label: 'Екі сынауыққа бірдей H₂O₂ құю', group: 'reagent' }, { id: 'addCat', label: 'B сынауығына MnO₂ салу', group: 'reagent' }],
  milestones: [{ id: 'filled', label: 'Екі бірдей жүйе дайындалды' }, { id: 'cat', label: 'Катализатор қосылды' }, { id: 'compared', label: 'B жүйесінде ыдырау толық дерлік аяқталды' }],
  assumptions: ['Бірінші ретті сапалық модель: ξ = ξmax(1 − e^(−k·t)); k(катализатормен) ≫ k(катализаторсыз).', 'Катализатор стехиометриялық реагент емес — массасы өзгермейді.'],
  limitations: ['Жылдамдық тұрақтылары — шартты; нақты секунд немесе жылдамдық мәні берілмейді.', 'Нақты зертханаға арналған концентрация мен дайындау тәсілі берілмейді.'],
  sources: [SRC.rscH2O2],
  timeMode: 'conditional',
  validateParams(p) { return checkParams(this.params, p); },
  init: () => ({ filled: false, cat: false, xA: 0, xB: 0, t: 0 }),
  apply(s, a) {
    if (a.id === 'fill') { if (s.filled) return { state: s, error: 'Сынауықтар толтырылған.' }; return { state: { ...s, filled: true }, note: 'A және B сынауықтарына бірдей мөлшерде H₂O₂ құйылды.' }; }
    if (a.id === 'addCat') { if (!s.filled) return { state: s, error: 'Алдымен сынауықтарға H₂O₂ құйыңыз.' }; if (s.cat) return { state: s, error: 'Катализатор салынған.' }; return { state: { ...s, cat: true }, note: `B сынауығына ${fmt(MNO2_MASS)} г MnO₂ салынды.` }; }
    return { state: s, error: 'Бұл әрекет осы модельде жоқ.' };
  },
  tick(s, dt, p) {
    if (!s.filled || dt <= 0) return s;
    const t = s.t + dt; const max = p.n / 2;
    // B жүйесі: катализатор қосылған сәттен бастап жылдам ыдырайды
    const xA = max * (1 - Math.exp(-K_UNCAT * t));
    let xB = s.xB;
    const kB = s.cat ? K_CAT : K_UNCAT;
    xB = max - (max - xB) * Math.exp(-kB * dt);
    return { ...s, t, xA, xB };
  },
  isRunning: s => s.filled,
  measure(s, p) {
    const max = p.n / 2;
    return [
      { key: 't', label: 'Шартты уақыт', value: Number(s.t.toFixed(1)), unit: 'шартты бірлік', kind: 'cond' },
      { key: 'oA', label: 'n(O₂) — A (катализаторсыз)', value: s.xA, unit: 'моль', kind: 'calc' },
      { key: 'oB', label: 'n(O₂) — B (MnO₂-мен)', value: s.xB, unit: 'моль', kind: 'calc' },
      { key: 'max', label: 'Теориялық n(O₂), әр сынауық', value: max, unit: 'моль', kind: 'calc' },
      { key: 'rate', label: 'Салыстырмалы жылдамдық B : A', value: s.cat ? `≈ ${Math.round(K_CAT / K_UNCAT)} есе (шартты)` : '1 : 1', kind: 'cond' },
      { key: 'mno2', label: 'MnO₂ массасы (басы / соңы)', value: s.cat ? `${fmt(MNO2_MASS)} / ${fmt(MNO2_MASS)}` : '—', unit: 'г', kind: 'calc' },
    ];
  },
  visual(s, p) {
    const max = p.n / 2;
    const rA = s.filled ? K_UNCAT * 20 * (1 - s.xA / max) : 0, rB = s.filled ? (s.cat ? 1 : K_UNCAT * 20) * (1 - s.xB / max) : 0;
    const liq: RGBA = [0.85, 0.92, 0.98, 0.3];
    return { vessels: [
      { id: 'A', kind: 'tube', label: 'A: катализаторсыз', x: -0.35, capacity: 25, volume: s.filled ? 15 : 0, liquid: liq, bubbles: rA },
      { id: 'B', kind: 'tube', label: 'B: MnO₂-мен', x: 0.35, capacity: 25, volume: s.filled ? 15 : 0, liquid: liq, bubbles: rB, solid: s.cat ? { kind: 'catalyst', amount: 0.4, color: [0.12, 0.12, 0.12, 1] } : undefined },
    ], timeLabel: s.filled ? `шартты уақыт: ${s.t.toFixed(1).replace('.', ',')}` : undefined };
  },
  reached(s, p) { return { filled: s.filled, cat: s.cat, compared: s.cat && s.xB >= 0.95 * p.n / 2 }; },
};
