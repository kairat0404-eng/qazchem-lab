import type { ReactionModel, RGBA } from '../types';
import { checkParams, fmt, FARADAY, VM_25C_100KPA, WATER } from '../chem';
import { SRC } from '../sources';

/* ───────────────────── 8. Электрөткізгіштік ───────────────────── */
type Sol = 'none' | 'water' | 'nacl' | 'sucrose';
interface CondS { sol: Sol; power: boolean; tested: Sol[] }
/** Шартты салыстырмалы өткізгіштік (0…1). Таза су — нөл емес, бірақ өте аз. */
export function relConductivity(sol: Sol, c: number): number {
  const base = 0.004; // таза судың өзіндік иондануы есебінен шартты аз мән
  if (sol === 'nacl') return Math.min(1, base + 0.95 * (1 - Math.exp(-3 * c)));
  if (sol === 'water' || sol === 'sucrose') return base;
  return 0;
}
const SOL_NAME: Record<Sol, string> = { none: '—', water: 'Тазартылған су', nacl: 'NaCl ерітіндісі', sucrose: 'Сахароза ерітіндісі' };
export const conductivity: ReactionModel<CondS> = {
  id: 'conductivity', version: '1.0.0', title: 'Ерітінділердің электрөткізгіштігі',
  equations: [{ id: 'diss', label: 'NaCl электролиттік диссоциациясы', reactants: [{ f: 'NaCl', coef: 1, phase: 's' }], products: [{ f: 'Na', coef: 1, phase: 'aq', charge: 1 }, { f: 'Cl', coef: 1, phase: 'aq', charge: -1 }] }],
  substances: [{ id: 'nacl', name: 'Натрий хлориді', formula: 'NaCl' }, { id: 'suc', name: 'Сахароза (бейэлектролит)', formula: 'C12H22O11' }, { id: 'w', name: 'Тазартылған су', formula: 'H2O' }],
  equipment: ['beaker', 'electrodes', 'power', 'lamp'],
  params: [{ key: 'c', label: 'Еріген зат концентрациясы', unit: 'моль/л', min: 0.01, max: 1, step: 0.01, default: 0.1 }],
  actions: [
    { id: 'water', label: 'Стақанға тазартылған су құю', group: 'reagent' },
    { id: 'nacl', label: 'NaCl ерітіндісін құю', group: 'reagent' },
    { id: 'sucrose', label: 'Сахароза ерітіндісін құю', group: 'reagent' },
    { id: 'power', label: 'Тізбекті қосу / ажырату', group: 'instrument' },
  ],
  milestones: [{ id: 'water', label: 'Су тексерілді' }, { id: 'nacl', label: 'NaCl ерітіндісі тексерілді' }, { id: 'sucrose', label: 'Сахароза ерітіндісі тексерілді' }],
  assumptions: ['NaCl суда толық диссоциацияланады; сахароза бейтарап молекулалар күйінде ериді.', 'Өткізгіштік көрсеткіші — шартты салыстырмалы шкала (0…1), нақты См/м емес.'],
  limitations: ['Таза судың өткізгіштігі нөлге тең емес, бірақ шам жанбайтындай өте аз.', 'Концентрация артқанда нақты өткізгіштік сызықты өспейді — шкала сапалық.'],
  sources: [SRC.rscMicro],
  timeMode: 'none',
  validateParams(p) { return checkParams(this.params, p); },
  init: () => ({ sol: 'none', power: false, tested: [] }),
  apply(s, a) {
    if (a.id === 'water' || a.id === 'nacl' || a.id === 'sucrose') {
      const sol = a.id as Sol;
      const tested = s.power && !s.tested.includes(sol) ? [...s.tested, sol] : s.tested;
      return { state: { ...s, sol, tested }, note: `Стақан жуылып, ${SOL_NAME[sol].toLowerCase()} құйылды.` };
    }
    if (a.id === 'power') {
      if (s.sol === 'none') return { state: { ...s, power: !s.power }, note: s.power ? 'Тізбек ажыратылды.' : 'Тізбек қосылды, бірақ стақан бос — ток жүрмейді.' };
      const power = !s.power;
      const tested = power && !s.tested.includes(s.sol) ? [...s.tested, s.sol] : s.tested;
      return { state: { ...s, power, tested }, note: power ? 'Тізбек қосылды.' : 'Тізбек ажыратылды.' };
    }
    return { state: s, error: 'Бұл әрекет осы модельде жоқ.' };
  },
  measure(s, p) {
    const g = relConductivity(s.sol, p.c);
    return [
      { key: 'sol', label: 'Ерітінді', value: SOL_NAME[s.sol], kind: 'qual' },
      { key: 'g', label: 'Салыстырмалы өткізгіштік', value: s.power ? Number(g.toFixed(3)) : 'тізбек ажыратулы', unit: s.power ? 'шартты' : undefined, kind: 'cond' },
      { key: 'lamp', label: 'Шам', value: !s.power ? 'сөнік' : g > 0.3 ? 'жарық жанады' : g > 0.05 ? 'әлсіз жанады' : 'жанбайды', kind: 'qual' },
      { key: 'ions', label: 'Еркін иондар', value: s.sol === 'nacl' ? 'Na⁺, Cl⁻ (+ өте аз H₃O⁺, OH⁻)' : s.sol === 'none' ? '—' : 'өте аз H₃O⁺, OH⁻', kind: 'qual' },
    ];
  },
  visual(s, p) {
    const g = relConductivity(s.sol, p.c);
    const n = Math.round(4 + p.c * 30);
    const parts = s.sol === 'nacl' ? [{ label: 'Na⁺', count: n, color: [0.95, 0.75, 0.3, 1] as RGBA, charge: 1 }, { label: 'Cl⁻', count: n, color: [0.35, 0.85, 0.5, 1] as RGBA, charge: -1 }]
      : s.sol === 'sucrose' ? [{ label: 'C₁₂H₂₂O₁₁', count: n, color: [0.92, 0.92, 0.95, 1] as RGBA }] : [];
    return { vessels: [{ id: 'b', kind: 'beaker', label: SOL_NAME[s.sol], x: 0, capacity: 150, volume: s.sol === 'none' ? 0 : 100, liquid: WATER, particles: parts, electrodes: { on: s.power, gasLeft: 0, gasRight: 0, leftLabel: '−', rightLabel: '+' } }], lamp: s.power ? g : null };
  },
  reached: s => ({ water: s.tested.includes('water'), nacl: s.tested.includes('nacl'), sucrose: s.tested.includes('sucrose') }),
};

/* ───────────────────── 9. Еру, қанығу, кристалдану ───────────────────── */
export const NACL_SOL_25C = 36.0; // г / 100 г су (CRC, 25 °C)
interface SolS { salt: number; water: number; stirred: boolean; evaporated: number; solidMax: number; solidAfterEvap: boolean; unsatSeen: boolean }
export function dissolution(salt: number, water: number) {
  const cap = NACL_SOL_25C * water / 100;
  const dissolved = Math.min(salt, cap), solid = Math.max(0, salt - cap);
  const status = salt === 0 ? 'таза су' : salt < cap - 1e-9 ? 'қанықпаған' : solid > 1e-9 ? 'қаныққан + артық қатты зат' : 'қаныққан';
  return { cap, dissolved, solid, status };
}
export const solubility: ReactionModel<SolS> = {
  id: 'solubility', version: '1.0.0', title: 'Еру, қанығу және кристалдану',
  equations: [{ id: 'eq', label: 'Еру тепе-теңдігі', reactants: [{ f: 'NaCl', coef: 1, phase: 's' }], products: [{ f: 'Na', coef: 1, phase: 'aq', charge: 1 }, { f: 'Cl', coef: 1, phase: 'aq', charge: -1 }], reversible: true }],
  substances: [{ id: 'nacl', name: 'Натрий хлориді', formula: 'NaCl', molarMass: 58.44 }, { id: 'w', name: 'Су', formula: 'H2O' }],
  equipment: ['beaker', 'balance', 'rod', 'thermometer'],
  params: [{ key: 'w0', label: 'Су массасы', unit: 'г', min: 50, max: 200, step: 10, default: 100 }],
  actions: [
    { id: 'salt', label: 'Тұз қосу', amounts: [1, 5, 10], unit: 'г', group: 'reagent' },
    { id: 'stir', label: 'Араластыру', group: 'operation' },
    { id: 'evap', label: 'Суды виртуалды буландыру', amounts: [5, 10, 20], unit: 'г', group: 'operation' },
  ],
  milestones: [{ id: 'unsat', label: 'Қанықпаған ерітінді алынды' }, { id: 'sat', label: 'Қанығу нүктесінен асты (артық тұз)' }, { id: 'crys', label: 'Буландыру арқылы кристалдар бөлінді' }],
  assumptions: [`Тұрақты температура 25 °C; NaCl ерігіштігі ${fmt(NACL_SOL_25C)} г / 100 г су.`, 'Араластырғаннан кейін тепе-теңдік бірден орнайды деп есептеледі.'],
  limitations: ['Буландыру анимациясы нақты уақыттағы жылдамдық емес.', 'Еру мен кристалдану — физикалық процесс, жаңа зат түзілмейді.', 'Ерітінді көлемінің өзгерісі есептелмейді, тек масса.'],
  sources: [SRC.crc],
  timeMode: 'none',
  validateParams(p) { return checkParams(this.params, p); },
  init: p => ({ salt: 0, water: p.w0, stirred: true, evaporated: 0, solidMax: 0, solidAfterEvap: false, unsatSeen: false }),
  apply(s, a) {
    if (a.id === 'salt') {
      const m = a.amount ?? 1;
      if (s.salt + m > 150) return { state: s, error: 'Модельде ең көбі 150 г тұз қосуға болады.' };
      return { state: { ...s, salt: s.salt + m, stirred: false }, note: `${fmt(m)} г NaCl қосылды. Араластырыңыз.` };
    }
    if (a.id === 'stir') return { state: { ...s, stirred: true, unsatSeen: s.unsatSeen || (s.salt > 0 && dissolution(s.salt, s.water).solid === 0), solidMax: Math.max(s.solidMax, dissolution(s.salt, s.water).solid) }, note: `Араластырылды: ${dissolution(s.salt, s.water).status}.` };
    if (a.id === 'evap') {
      const m = a.amount ?? 5;
      if (s.water - m < 10) return { state: s, error: 'Стақанда кемінде 10 г су қалуы керек. Кішірек мөлшер таңдаңыз.' };
      const before = dissolution(s.salt, s.water).solid, after = dissolution(s.salt, s.water - m).solid;
      return { state: { ...s, water: s.water - m, evaporated: s.evaporated + m, stirred: true, solidAfterEvap: s.solidAfterEvap || (after > before + 1e-9) }, note: `${fmt(m)} г су буланды.${after > before + 1e-9 ? ' Кристалдар бөлінді.' : ''}` };
    }
    return { state: s, error: 'Бұл әрекет осы модельде жоқ.' };
  },
  measure(s) {
    const d = dissolution(s.salt, s.water);
    return [
      { key: 'water', label: 'Су массасы', value: s.water, unit: 'г', kind: 'calc' },
      { key: 'salt', label: 'Қосылған NaCl', value: s.salt, unit: 'г', kind: 'calc' },
      { key: 'cap', label: 'Осы суда ери алатын ең көп NaCl', value: Number(d.cap.toFixed(2)), unit: 'г', kind: 'calc' },
      { key: 'dissolved', label: 'Еріген NaCl', value: s.stirred ? Number(d.dissolved.toFixed(2)) : 'араластырылмады', unit: s.stirred ? 'г' : undefined, kind: s.stirred ? 'calc' : 'qual' },
      { key: 'solid', label: 'Ерімеген қатты NaCl', value: s.stirred ? Number(d.solid.toFixed(2)) : 'араластырылмады', unit: s.stirred ? 'г' : undefined, kind: s.stirred ? 'calc' : 'qual' },
      { key: 'status', label: 'Ерітінді күйі', value: s.stirred ? d.status : 'тұз түбінде, әлі араластырылмаған', kind: 'qual' },
    ];
  },
  visual(s) {
    const d = dissolution(s.salt, s.water);
    const solid = s.stirred ? d.solid : s.salt;
    return { vessels: [{ id: 'b', kind: 'beaker', label: 'Стақан, 25 °C', x: 0, capacity: 250, volume: s.water, liquid: WATER,
      solid: solid > 0 ? { kind: 'crystals', amount: Math.min(1, solid / 40 + 0.05), color: [0.97, 0.97, 0.99, 1] } : undefined,
      particles: s.stirred && d.dissolved > 0 ? [{ label: 'Na⁺', count: Math.round(Math.min(24, d.dissolved / d.cap * 24)), color: [0.95, 0.75, 0.3, 1], charge: 1 }, { label: 'Cl⁻', count: Math.round(Math.min(24, d.dissolved / d.cap * 24)), color: [0.35, 0.85, 0.5, 1], charge: -1 }] : [],
      meter: { label: 'T', value: '25 °C' } }] };
  },
  reached(s) {
    return { unsat: s.unsatSeen, sat: s.solidMax > 0, crys: s.solidAfterEvap };
  },
};

/* ───────────────────── 10. Судың электролизі ───────────────────── */
interface ElecS { power: boolean; t: number; Q: number; electrolyte: boolean }
export const ELEC_EFFICIENCY = 1.0; // ток тиімділігі (модель жорамалы)
export function electrolysisGas(Q: number) { const ne = Q / FARADAY; return { ne, nH2: ne / 2 * ELEC_EFFICIENCY, nO2: ne / 4 * ELEC_EFFICIENCY }; }
export const electrolysis: ReactionModel<ElecS> = {
  id: 'electrolysis', version: '1.0.0', title: 'Судың электролизі',
  equations: [
    { id: 'total', label: 'Жалпы теңдеу', reactants: [{ f: 'H2O', coef: 2, phase: 'l' }], products: [{ f: 'H2', coef: 2, phase: 'g' }, { f: 'O2', coef: 1, phase: 'g' }], conditions: 'тұрақты ток, инертті электродтар, Na₂SO₄ ерітіндісі' },
    { id: 'cat', label: 'Катод (−)', reactants: [{ f: 'H2O', coef: 4, phase: 'l' }, { f: 'e', coef: 4, charge: -1 }], products: [{ f: 'H2', coef: 2, phase: 'g' }, { f: 'OH', coef: 4, phase: 'aq', charge: -1 }] },
    { id: 'an', label: 'Анод (+)', reactants: [{ f: 'H2O', coef: 2, phase: 'l' }], products: [{ f: 'O2', coef: 1, phase: 'g' }, { f: 'H', coef: 4, phase: 'aq', charge: 1 }, { f: 'e', coef: 4, charge: -1 }] },
  ],
  substances: [{ id: 'w', name: 'Су', formula: 'H2O' }, { id: 'na2so4', name: 'Натрий сульфаты (өткізгіштікті арттырады)', formula: 'Na2SO4' }],
  equipment: ['ucell', 'electrodes', 'power'],
  params: [
    { key: 'I', label: 'Ток күші I', unit: 'А', min: 0.1, max: 1, step: 0.1, default: 0.5 },
    { key: 'el', label: 'Ерітінді', unit: '', min: 0, max: 1, step: 1, default: 1, options: [{ value: 1, label: 'Na₂SO₄ ерітіндісі' }, { value: 0, label: 'Тазартылған су (электролитсіз)' }] },
  ],
  actions: [{ id: 'power', label: 'Ток көзін қосу / ажырату', group: 'instrument' }],
  milestones: [{ id: 'on', label: 'Ток қосылды' }, { id: 'gas', label: 'Катодта кемінде 5 мл газ жиналды' }, { id: 'off', label: 'Ток ажыратылып, көлемдер салыстырылды' }],
  assumptions: ['Фарадей заңы: n(e⁻) = Q / F, Q = I·t; F = 96 485 Кл/моль.', `Ток тиімділігі ${Math.round(ELEC_EFFICIENCY * 100)} % деп қабылданады; газдар идеал, 25 °C, 100 кПа.`, 'Na₂SO₄ жұмсалмайды — тек өткізгіштікті арттырады.', 'Электролитсіз таза суда ток іс жүзінде жүрмейді деп есептеледі.'],
  limitations: ['Газдардың суда еруі ескерілмейді, сондықтан нақты O₂ көлемі сәл аз болуы мүмкін.', 'Модель уақыты анимацияда үдетіліп көрсетіледі.', 'NaCl ерітіндісінде анодта хлор бөлінуі мүмкін — бұл сценарийге жатпайды.'],
  sources: [SRC.cuElec, SRC.openstax, SRC.codata],
  timeMode: 'model-seconds',
  validateParams(p) { return checkParams(this.params, p); },
  init: p => ({ power: false, t: 0, Q: 0, electrolyte: p.el === 1 }),
  apply(s, a) {
    if (a.id === 'power') return { state: { ...s, power: !s.power }, note: !s.power ? (s.electrolyte ? 'Ток көзі қосылды.' : 'Ток көзі қосылды, бірақ таза су ток өткізбейді деуге болады — газ байқалмайды.') : 'Ток көзі ажыратылды.' };
    return { state: s, error: 'Бұл әрекет осы модельде жоқ.' };
  },
  tick(s, dt, p) {
    if (!s.power || dt <= 0) return s;
    const I = s.electrolyte ? p.I : 0;
    return { ...s, t: s.t + dt, Q: s.Q + I * dt };
  },
  isRunning: s => s.power,
  measure(s, p) {
    const g = electrolysisGas(s.Q);
    const vH = g.nH2 * VM_25C_100KPA * 1000, vO = g.nO2 * VM_25C_100KPA * 1000;
    return [
      { key: 't', label: 'Модель уақыты t', value: Math.round(s.t), unit: 'с', kind: 'calc' },
      { key: 'I', label: 'Ток күші', value: s.power ? (s.electrolyte ? p.I : 0) : 0, unit: 'А', kind: 'calc' },
      { key: 'Q', label: 'Өткен заряд Q', value: Math.round(s.Q), unit: 'Кл', kind: 'calc' },
      { key: 'nH2', label: 'n(H₂), катод', value: g.nH2, unit: 'моль', kind: 'calc' },
      { key: 'nO2', label: 'n(O₂), анод', value: g.nO2, unit: 'моль', kind: 'calc' },
      { key: 'VH2', label: 'V(H₂)', value: Number(vH.toFixed(2)), unit: 'мл', kind: 'calc' },
      { key: 'VO2', label: 'V(O₂)', value: Number(vO.toFixed(2)), unit: 'мл', kind: 'calc' },
      { key: 'ratio', label: 'V(H₂) : V(O₂)', value: vO > 0 ? `${(vH / vO).toFixed(2).replace('.', ',')} : 1` : '—', kind: 'calc' },
    ];
  },
  visual(s) {
    const g = electrolysisGas(s.Q);
    const vH = g.nH2 * VM_25C_100KPA * 1000, vO = g.nO2 * VM_25C_100KPA * 1000;
    return { vessels: [{ id: 'u', kind: 'ucell', label: s.electrolyte ? 'Na₂SO₄ ерітіндісі' : 'Тазартылған су', x: 0, capacity: 100, volume: 80, liquid: WATER, bubbles: s.power && s.electrolyte ? 0.6 : 0,
      electrodes: { on: s.power, gasLeft: Math.min(1, vH / 40), gasRight: Math.min(1, vO / 40), leftLabel: `Катод (−) · H₂ ${fmt(vH)} мл`, rightLabel: `Анод (+) · O₂ ${fmt(vO)} мл` } }],
      timeLabel: `модель уақыты: ${Math.round(s.t)} с` };
  },
  reached(s) { const vH = electrolysisGas(s.Q).nH2 * VM_25C_100KPA * 1000; return { on: s.t > 0 || s.power, gas: vH >= 5, off: !s.power && vH >= 5 }; },
};
