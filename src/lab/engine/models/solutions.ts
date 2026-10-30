import type { ReactionModel, RGBA, VisualVessel } from '../types';
import { checkParams, fmt, phFromNetStrong, KW_25C, WATER, mix } from '../chem';
import { SRC } from '../sources';

/* ───────────────────── 1. Сұйылту ───────────────────── */
interface DilS { stage: 'empty' | 'aliquot' | 'filled'; n: number; V: number; mixed: boolean; water: number }
const STOCK: RGBA = [0.25, 0.45, 0.95, 0.55]; // шартты түсті ерітінді (мыс. CuSO₄ сияқты көк)

export const dilution: ReactionModel<DilS> = {
  id: 'dilution', version: '1.0.0', title: 'Ерітінді концентрациясы және сұйылту',
  equations: [],
  substances: [{ id: 'stock', name: 'Бастапқы ерітінді (CuSO₄)', formula: 'CuSO4', color: 'көк' }, { id: 'water', name: 'Тазартылған су', formula: 'H2O' }],
  equipment: ['beaker', 'pipette', 'volflask', 'rod'],
  params: [
    { key: 'c1', label: 'Бастапқы концентрация c₁', unit: 'моль/л', min: 0.05, max: 1, step: 0.05, default: 0.2 },
    { key: 'V1', label: 'Алынатын ерітінді көлемі V₁', unit: 'мл', min: 5, max: 100, step: 5, default: 50 },
    { key: 'V2', label: 'Соңғы ерітінді көлемі V₂', unit: 'мл', min: 10, max: 250, step: 5, default: 100 },
  ],
  actions: [
    { id: 'pipette', label: 'V₁ көлемді өлшеп, колбаға құю', group: 'reagent' },
    { id: 'fill', label: 'Сызыққа дейін су қосу (V₂)', group: 'reagent' },
    { id: 'mix', label: 'Колбаны төңкеріп араластыру', group: 'operation' },
  ],
  milestones: [
    { id: 'aliquot', label: 'Ерітінді үлесі өлшеніп алынды' },
    { id: 'filled', label: 'Су соңғы көлемге дейін қосылды' },
    { id: 'mixed', label: 'Ерітінді араластырылды' },
  ],
  assumptions: ['Идеал сұйылту: еріген заттың мөлшері n өзгермейді.', 'V — ерітіндінің жалпы көлемі; көлемдердің аддитивтілігі жорамалданады.'],
  limitations: ['Бұл — химиялық реакция емес, жаңа зат түзілмейді.', 'Қосылған су көлемі (V₂ − V₁) соңғы көлеммен бірдей емес.', 'Түс қарқыны концентрацияны сапалық түрде көрсетеді.'],
  sources: [SRC.rscMicro],
  timeMode: 'none',
  validateParams(p) {
    const e = checkParams(this.params, p); if (e) return e;
    if (p.V2 <= p.V1) return 'Соңғы көлем V₂ алынған көлем V₁-ден үлкен болуы керек. V₂-ні арттырыңыз немесе V₁-ді азайтыңыз.';
    return null;
  },
  init: () => ({ stage: 'empty', n: 0, V: 0, mixed: false, water: 0 }),
  apply(s, a, p) {
    if (a.id === 'pipette') {
      if (s.stage !== 'empty') return { state: s, error: 'Ерітінді үлесі колбада бар. Жаңа өлшеу үшін «Қайта бастау» батырмасын басыңыз.' };
      return { state: { ...s, stage: 'aliquot', n: p.c1 * p.V1 / 1000, V: p.V1 }, note: `${fmt(p.V1)} мл ерітінді (n = ${fmt(p.c1 * p.V1 / 1000)} моль) колбаға құйылды.` };
    }
    if (a.id === 'fill') {
      if (s.stage === 'empty') return { state: s, error: 'Алдымен колбаға бастапқы ерітіндінің үлесін құйыңыз.' };
      if (s.stage === 'filled') return { state: s, error: 'Колба белгі сызығына дейін толтырылған. Артық су құю концентрацияны бұзады.' };
      return { state: { ...s, stage: 'filled', V: p.V2, water: p.V2 - p.V1, mixed: false }, note: `${fmt(p.V2 - p.V1)} мл су қосылды; жалпы көлем ${fmt(p.V2)} мл.` };
    }
    if (a.id === 'mix') {
      if (s.stage !== 'filled') return { state: s, error: 'Араластыру үшін колбаны белгі сызығына дейін толтырыңыз.' };
      return { state: { ...s, mixed: true }, note: 'Ерітінді біркелкі араластырылды.' };
    }
    return { state: s, error: 'Бұл әрекет осы модельде жоқ.' };
  },
  measure(s, p) {
    const c = s.V > 0 ? s.n / (s.V / 1000) : 0;
    return [
      { key: 'n', label: 'Еріген зат мөлшері n', value: s.n, unit: 'моль', kind: 'calc', digits: 3 },
      { key: 'V', label: 'Ерітінді көлемі V', value: s.V, unit: 'мл', kind: 'calc' },
      { key: 'water', label: 'Қосылған су', value: s.water, unit: 'мл', kind: 'calc' },
      { key: 'c', label: 'Концентрация c = n/V', value: s.stage === 'filled' && !s.mixed ? 'біркелкі емес — араластырыңыз' : c, unit: s.stage === 'filled' && !s.mixed ? undefined : 'моль/л', kind: s.stage === 'filled' && !s.mixed ? 'qual' : 'calc', digits: 3 },
      { key: 'c1', label: 'Бастапқы c₁', value: p.c1, unit: 'моль/л', kind: 'calc' },
    ];
  },
  visual(s, p) {
    const c = s.V > 0 ? s.n / (s.V / 1000) : 0;
    const flaskColor = s.V > 0 ? mix(WATER, STOCK, Math.min(1, c / 1)) : WATER;
    return {
      vessels: [
        { id: 'stock', kind: 'beaker', label: `Бастапқы ерітінді, ${fmt(p.c1)} моль/л`, x: -0.55, capacity: 250, volume: 180, liquid: mix(WATER, STOCK, Math.min(1, p.c1 / 1)), particles: [{ label: 'еріген зат', count: Math.round(6 + p.c1 * 40), color: [0.2, 0.4, 0.95, 1] }] },
        { id: 'vf', kind: 'volflask', label: `Өлшеуіш колба, ${fmt(p.V2)} мл`, x: 0.35, capacity: Math.max(p.V2, 10) * 1.25, volume: s.V, liquid: flaskColor, particles: s.V > 0 ? [{ label: 'еріген зат', count: Math.round(6 + c * 40), color: [0.2, 0.4, 0.95, 1] }] : [], meter: s.V > 0 ? { label: 'c', value: s.stage === 'filled' && !s.mixed ? '…' : fmt(c) + ' моль/л' } : undefined },
      ],
    };
  },
  reached: s => ({ aliquot: s.stage !== 'empty', filled: s.stage === 'filled', mixed: s.mixed }),
};

/* ───────────────────── 2. Қышқыл, негіз, pH ───────────────────── */
interface PhS { c: number; dil: number; indicator: boolean; measured: boolean; readings: number }
/** Әмбебап индикатордың шартты түс шкаласы (сапалық). */
export function universalColor(pH: number): RGBA {
  const stops: [number, RGBA][] = [[1, [0.85, 0.12, 0.12, 0.7]], [3, [0.95, 0.45, 0.1, 0.7]], [5, [0.95, 0.8, 0.15, 0.65]], [7, [0.35, 0.75, 0.25, 0.6]], [9, [0.15, 0.55, 0.75, 0.65]], [11, [0.25, 0.3, 0.8, 0.7]], [13, [0.45, 0.2, 0.65, 0.75]]];
  if (pH <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) if (pH <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (pH - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0]));
  return stops[stops.length - 1][1];
}
export function phStrong(kind: number, c: number) { return phFromNetStrong(kind === 0 ? c : -c); }

export const acidBase: ReactionModel<PhS> = {
  id: 'acidbase', version: '1.0.0', title: 'Қышқыл, негіз және pH',
  equations: [
    { id: 'hcl', label: 'HCl иондануы', reactants: [{ f: 'HCl', coef: 1, phase: 'aq' }, { f: 'H2O', coef: 1, phase: 'l' }], products: [{ f: 'H3O', coef: 1, phase: 'aq', charge: 1 }, { f: 'Cl', coef: 1, phase: 'aq', charge: -1 }] },
    { id: 'naoh', label: 'NaOH диссоциациясы', reactants: [{ f: 'NaOH', coef: 1, phase: 's' }], products: [{ f: 'Na', coef: 1, phase: 'aq', charge: 1 }, { f: 'OH', coef: 1, phase: 'aq', charge: -1 }] },
  ],
  substances: [{ id: 'hcl', name: 'Тұз қышқылы', formula: 'HCl' }, { id: 'naoh', name: 'Натрий гидроксиді', formula: 'NaOH' }, { id: 'ind', name: 'Әмбебап индикатор', formula: '—' }],
  equipment: ['beaker', 'phmeter', 'cylinder', 'indicator'],
  params: [
    { key: 'kind', label: 'Зат', unit: '', min: 0, max: 1, step: 1, default: 0, options: [{ value: 0, label: 'HCl (күшті қышқыл)' }, { value: 1, label: 'NaOH (күшті негіз)' }] },
    { key: 'c0', label: 'Бастапқы концентрация', unit: 'моль/л', min: 0.0001, max: 0.1, step: 0, default: 0.01, options: [{ value: 0.1, label: '0,1' }, { value: 0.01, label: '0,01' }, { value: 0.001, label: '0,001' }, { value: 0.0001, label: '0,0001' }] },
  ],
  actions: [
    { id: 'indicator', label: 'Әмбебап индикатор тамызу', group: 'reagent' },
    { id: 'measure', label: 'pH-өлшеуішпен өлшеу', group: 'instrument' },
    { id: 'dilute', label: '10 есе сұйылту (10 мл → 100 мл)', group: 'reagent' },
  ],
  milestones: [
    { id: 'indicator', label: 'Индикатор қосылды' },
    { id: 'measured', label: 'pH өлшенді' },
    { id: 'diluted', label: 'Ерітінді кемінде 2 рет сұйылтылды' },
  ],
  assumptions: ['25 °C, идеал сұйылтылған ерітінді (активтілік = концентрация).', 'HCl және NaOH толық иондалады.', `Судың өзіндік иондануы ескеріледі: Kw = 1,0·10⁻¹⁴; [H₃O⁺] = (c + √(c² + 4Kw))/2.`],
  limitations: ['0,1 моль/л-ден жоғары концентрацияда активтілік әсері ескерілмейді.', 'Индикатор түсі — шартты шкала; дәл pH тек өлшеуішпен анықталады.', 'Күштілік (иондану дәрежесі) мен концентрация — әртүрлі ұғымдар.'],
  sources: [SRC.phet, SRC.rscMicro],
  timeMode: 'none',
  validateParams(p) { return checkParams(this.params, p); },
  init: p => ({ c: p.c0, dil: 0, indicator: false, measured: false, readings: 0 }),
  apply(s, a, p) {
    if (a.id === 'indicator') {
      if (s.indicator) return { state: s, error: 'Индикатор қосылған. Артық тамызу түсті өзгертпейді.' };
      return { state: { ...s, indicator: true }, note: 'Әмбебап индикатор қосылды.' };
    }
    if (a.id === 'measure') {
      const pH = phStrong(p.kind, s.c);
      return { state: { ...s, measured: true, readings: s.readings + 1 }, note: `pH-өлшеуіш: ${pH.toFixed(2).replace('.', ',')}` };
    }
    if (a.id === 'dilute') {
      if (s.dil >= 8) return { state: s, error: 'Модельде ең көбі 8 рет сұйылтуға болады (c ≈ 10⁻¹² моль/л). pH 7-ге жақындағанын байқадыңыз.' };
      return { state: { ...s, c: s.c / 10, dil: s.dil + 1, measured: false }, note: `10 мл ерітінді 100 мл-ге дейін сұйылтылды: c = ${fmt(s.c / 10)} моль/л.` };
    }
    return { state: s, error: 'Бұл әрекет осы модельде жоқ.' };
  },
  measure(s, p) {
    const pH = phStrong(p.kind, s.c);
    const h = Math.pow(10, -pH), oh = KW_25C / h;
    return [
      { key: 'c', label: p.kind === 0 ? 'c(HCl)' : 'c(NaOH)', value: s.c, unit: 'моль/л', kind: 'calc' },
      { key: 'pH', label: 'pH', value: s.measured ? Number(pH.toFixed(2)) : 'өлшенбеді', kind: s.measured ? 'calc' : 'qual' },
      { key: 'h', label: '[H₃O⁺]', value: h, unit: 'моль/л', kind: 'calc' },
      { key: 'oh', label: '[OH⁻]', value: oh, unit: 'моль/л', kind: 'calc' },
      { key: 'dil', label: 'Сұйылту саны', value: s.dil, kind: 'calc' },
      { key: 'ind', label: 'Индикатор түсі', value: s.indicator ? indicatorWord(pH) : 'қосылмаған', kind: 'qual' },
    ];
  },
  visual(s, p) {
    const pH = phStrong(p.kind, s.c);
    const h = Math.pow(10, -pH), oh = KW_25C / h;
    // Иондар саны логарифмдік шартты шкаламен
    const cnt = (x: number) => Math.max(0, Math.round((Math.log10(x) + 8) * 4));
    const v: VisualVessel = {
      id: 'b', kind: 'beaker', label: p.kind === 0 ? 'HCl ерітіндісі' : 'NaOH ерітіндісі', x: 0, capacity: 150, volume: 100,
      liquid: s.indicator ? universalColor(pH) : WATER,
      particles: [{ label: 'H₃O⁺', count: cnt(h), color: [0.95, 0.35, 0.3, 1], charge: 1 }, { label: 'OH⁻', count: cnt(oh), color: [0.3, 0.5, 0.95, 1], charge: -1 }],
      meter: { label: 'pH', value: s.measured ? pH.toFixed(2).replace('.', ',') : '—' },
    };
    return { vessels: [v] };
  },
  reached: s => ({ indicator: s.indicator, measured: s.readings > 0, diluted: s.dil >= 2 }),
};

function indicatorWord(pH: number) {
  if (pH < 3) return 'қызыл (қатты қышқыл орта)';
  if (pH < 6) return 'сарғыш-сары (қышқыл орта)';
  if (pH < 8) return 'жасыл (бейтарапқа жақын)';
  if (pH < 11) return 'көк (сілтілі орта)';
  return 'күлгін (қатты сілтілі орта)';
}

/* ───────────────────── 3. Титрлеу ───────────────────── */
interface TitS { Vb: number; indicator: boolean; curve: { V: number; pH: number }[] }
export const PHENOLPHTHALEIN = { start: 8.2, end: 10.0 };
export function titrationPH(cA: number, VA: number, cB: number, Vb: number) {
  const nA = cA * VA / 1000, nB = cB * Vb / 1000, Vt = (VA + Vb) / 1000;
  return phFromNetStrong((nA - nB) / Vt);
}
function phenolColor(pH: number): RGBA {
  if (pH < PHENOLPHTHALEIN.start) return WATER;
  const t = Math.min(1, (pH - PHENOLPHTHALEIN.start) / (PHENOLPHTHALEIN.end - PHENOLPHTHALEIN.start));
  return mix([0.95, 0.75, 0.85, 0.35], [0.85, 0.1, 0.55, 0.75], t);
}

export const titration: ReactionModel<TitS> = {
  id: 'titration', version: '1.0.0', title: 'Бейтараптану және титрлеу',
  equations: [
    { id: 'mol', label: 'Молекулалық теңдеу', reactants: [{ f: 'HCl', coef: 1, phase: 'aq' }, { f: 'NaOH', coef: 1, phase: 'aq' }], products: [{ f: 'NaCl', coef: 1, phase: 'aq' }, { f: 'H2O', coef: 1, phase: 'l' }] },
    { id: 'net', label: 'Қысқартылған иондық теңдеу', reactants: [{ f: 'H3O', coef: 1, phase: 'aq', charge: 1 }, { f: 'OH', coef: 1, phase: 'aq', charge: -1 }], products: [{ f: 'H2O', coef: 2, phase: 'l' }] },
  ],
  substances: [{ id: 'hcl', name: 'Тұз қышқылы', formula: 'HCl' }, { id: 'naoh', name: 'Натрий гидроксиді', formula: 'NaOH' }, { id: 'php', name: 'Фенолфталеин', formula: '—' }],
  equipment: ['flask', 'burette', 'phmeter', 'indicator'],
  params: [
    { key: 'cA', label: 'c(HCl)', unit: 'моль/л', min: 0.05, max: 0.2, step: 0.01, default: 0.1 },
    { key: 'VA', label: 'V(HCl) колбада', unit: 'мл', min: 10, max: 50, step: 5, default: 25 },
    { key: 'cB', label: 'c(NaOH) бюреткада', unit: 'моль/л', min: 0.05, max: 0.2, step: 0.01, default: 0.1 },
  ],
  actions: [
    { id: 'indicator', label: 'Фенолфталеин тамызу', group: 'reagent' },
    { id: 'add', label: 'Бюреткадан NaOH қосу', amounts: [0.1, 0.5, 1, 5], unit: 'мл', group: 'reagent' },
  ],
  milestones: [
    { id: 'indicator', label: 'Индикатор қосылды' },
    { id: 'started', label: 'NaOH қосыла бастады' },
    { id: 'nearEq', label: 'Эквиваленттік нүкте маңында өлшеу жасалды (±0,5 мл)' },
    { id: 'passedEq', label: 'Эквиваленттік нүктеден өтті' },
  ],
  assumptions: ['25 °C, күшті қышқыл/күшті негіз идеал моделі; Kw ескеріледі.', 'Көлемдер аддитивті; индикатор тамшыларының көлемі ескерілмейді.', `Фенолфталеин: pH < ${PHENOLPHTHALEIN.start} — түссіз; ${PHENOLPHTHALEIN.start}–${PHENOLPHTHALEIN.end} — қызғылт.`],
  limitations: ['Индикатордың түс ауысуы эквиваленттік нүктемен (pH 7) дәл сәйкес келмейді — бұл титрлеудің соңғы нүктесі.', 'Бюретка сыйымдылығы 50 мл.'],
  sources: [SRC.harris, SRC.phet],
  timeMode: 'none',
  validateParams(p) { return checkParams(this.params, p); },
  init: p => ({ Vb: 0, indicator: false, curve: [{ V: 0, pH: titrationPH(p.cA, p.VA, p.cB, 0) }] }),
  apply(s, a, p) {
    if (a.id === 'indicator') {
      if (s.indicator) return { state: s, error: 'Фенолфталеин қосылған.' };
      return { state: { ...s, indicator: true }, note: '2 тамшы фенолфталеин қосылды.' };
    }
    if (a.id === 'add') {
      const dv = a.amount ?? 1;
      if (!(dv > 0)) return { state: s, error: 'Қосылатын көлем оң сан болуы керек.' };
      if (s.Vb + dv > 50 + 1e-9) return { state: s, error: `Бюреткада ${fmt(50 - s.Vb)} мл ғана қалды. Кішірек үлес таңдаңыз немесе қайта бастаңыз.` };
      const Vb = Math.round((s.Vb + dv) * 1000) / 1000;
      const pH = titrationPH(p.cA, p.VA, p.cB, Vb);
      return { state: { ...s, Vb, curve: [...s.curve, { V: Vb, pH }] }, note: `+${fmt(dv)} мл NaOH → барлығы ${fmt(Vb)} мл, pH ${pH.toFixed(2).replace('.', ',')}` };
    }
    return { state: s, error: 'Бұл әрекет осы модельде жоқ.' };
  },
  measure(s, p) {
    const pH = titrationPH(p.cA, p.VA, p.cB, s.Vb);
    const nA = p.cA * p.VA / 1000, nB = p.cB * s.Vb / 1000;
    const ex = nA - nB;
    return [
      { key: 'Vb', label: 'Қосылған V(NaOH)', value: s.Vb, unit: 'мл', kind: 'calc' },
      { key: 'pH', label: 'pH', value: Number(pH.toFixed(2)), kind: 'calc' },
      { key: 'excess', label: Math.abs(ex) < 1e-12 ? 'Артық реагент' : ex > 0 ? 'Артық HCl' : 'Артық NaOH', value: Math.abs(ex) < 1e-12 ? 'жоқ (эквиваленттік нүкте)' : Math.abs(ex), unit: Math.abs(ex) < 1e-12 ? undefined : 'моль', kind: Math.abs(ex) < 1e-12 ? 'qual' : 'calc' },
      { key: 'ind', label: 'Фенолфталеин', value: !s.indicator ? 'қосылмаған' : pH < PHENOLPHTHALEIN.start ? 'түссіз' : 'қызғылт', kind: 'qual' },
    ];
  },
  visual(s, p) {
    const pH = titrationPH(p.cA, p.VA, p.cB, s.Vb);
    return {
      vessels: [
        { id: 'bur', kind: 'burette', label: `Бюретка: NaOH, ${fmt(p.cB)} моль/л`, x: 0, capacity: 50, volume: 50 - s.Vb, liquid: WATER },
        { id: 'fl', kind: 'flask', label: 'Колба: HCl', x: 0, capacity: 150, volume: p.VA + s.Vb, liquid: s.indicator ? phenolColor(pH) : WATER, meter: { label: 'pH', value: pH.toFixed(2).replace('.', ',') } },
      ],
    };
  },
  reached(s, p) {
    const Veq = p.cA * p.VA / p.cB;
    return { indicator: s.indicator, started: s.Vb > 0, nearEq: s.curve.some(c => Math.abs(c.V - Veq) <= 0.5), passedEq: s.Vb > Veq + 1e-9 };
  },
};
