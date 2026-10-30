import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MODELS, MODEL_BY_ID, checkBalance, defaultParams } from '../lab/engine/index';
import { phFromNetStrong } from '../lab/engine/chem';
import { titrationPH, phStrong } from '../lab/engine/models/solutions';
import { precipitate } from '../lab/engine/models/reactions';
import { electrolysisGas, dissolution } from '../lab/engine/models/physical';

const near = (a: number, b: number, tol: number) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b} (±${tol})`);
const run = (id: string, actions: { id: string; amount?: number }[], p?: Record<string, number>) => {
  const m = MODEL_BY_ID[id]; const params = { ...defaultParams(m.params), ...p };
  let s = m.init(params);
  for (const a of actions) { const r = m.apply(s, a, params); assert.equal(r.error, undefined, `${id}/${a.id}: ${r.error}`); s = r.state; }
  return { m, s, params, meas: (k: string) => m.measure(s, params).find(x => x.key === k)!.value };
};

test('барлық теңдеуде атомдар мен заряд сақталады', () => {
  for (const m of MODELS) for (const eq of m.equations) {
    const b = checkBalance(eq);
    assert.ok(b.atoms, `${m.id}/${eq.id}: атомдар ${b.detail}`);
    assert.ok(b.charge, `${m.id}/${eq.id}: заряд`);
  }
});

test('әр модельдің әдепкі параметрлері жарамды', () => {
  for (const m of MODELS) assert.equal(m.validateParams!(defaultParams(m.params)), null, m.id);
});

test('сұйылту: 0,20 моль/л × 50 мл → 100 мл = 0,10 моль/л', () => {
  const { meas } = run('dilution', [{ id: 'pipette' }, { id: 'fill' }, { id: 'mix' }], { c1: 0.2, V1: 50, V2: 100 });
  near(meas('c') as number, 0.10, 1e-12);
  near(meas('water') as number, 50, 1e-12);
});

test('сұйылту: V₂ < V₁ рұқсат етілмейді', () => {
  assert.match(MODEL_BY_ID.dilution.validateParams!({ c1: 0.2, V1: 50, V2: 40 })!, /үлкен болуы керек/);
});

test('pH: 0,01 моль/л HCl ≈ 2, NaOH ≈ 12', () => {
  near(phStrong(0, 0.01), 2, 0.01);
  near(phStrong(1, 0.01), 12, 0.01);
});

test('pH: шексіз сұйылтылған қышқыл сілтіге айналмайды, 7-ге жақындайды', () => {
  let prev = 0;
  for (let e = 1; e <= 12; e++) { const pH = phStrong(0, Math.pow(10, -e)); assert.ok(pH < 7, `10^-${e}: ${pH}`); assert.ok(pH >= prev); prev = pH; }
  near(phStrong(0, 1e-12), 7, 0.01);
  near(phStrong(0, 1e-7), 6.79, 0.01); // судың иондануы ескерілгенде
});

test('титрлеу: 25 мл 0,100 HCl + 25 мл 0,100 NaOH → pH 7', () => {
  near(titrationPH(0.1, 25, 0.1, 25), 7, 1e-6);
  assert.ok(titrationPH(0.1, 25, 0.1, 24.9) < 4.5);
  assert.ok(titrationPH(0.1, 25, 0.1, 25.1) > 9.5);
});

test('титрлеу: бюреткадан 50 мл-ден артық құюға болмайды', () => {
  const m = MODEL_BY_ID.titration; const p = defaultParams(m.params);
  let s = m.init(p); for (let i = 0; i < 10; i++) s = m.apply(s, { id: 'add', amount: 5 }, p).state;
  assert.ok(m.apply(s, { id: 'add', amount: 0.1 }, p).error);
});

test('тұнба: Q > Ksp кезде ғана түзіледі, шектеуші реагент бойынша', () => {
  const r = precipitate(0.1, 20, 0.1, 10);
  near(r.n, 0.001, 1e-6);           // Na₂CO₃ шектеуші: 0,001 моль
  const dilute = precipitate(0.0001, 20, 0.0001, 10);
  assert.equal(dilute.n, 0);        // өте сұйылтылған — тұнба жоқ
});

test('орынбасу: шектеуші реагент біткенде өнім тоқтайды, Cu²⁺ қалдығы ескеріледі', () => {
  const m = MODEL_BY_ID.displacement; const p = { mFe: 0.5, cCu: 0.5, V: 50 };
  let s = m.init(p); s = m.apply(s, { id: 'pour' }, p).state; s = m.apply(s, { id: 'addFe' }, p).state;
  for (let i = 0; i < 200; i++) s = m.tick!(s, 0.5, p);
  const nFe = 0.5 / 55.845, nCu = 0.025;
  assert.ok(s.xi <= nFe + 1e-12);
  near(s.xi, nFe, 1e-9);
  const cu = m.measure(s, p).find(x => x.key === 'cu2')!.value as number;
  near(cu, (nCu - nFe) / 0.05, 1e-6);
  assert.ok(cu > 0);
});

test('үзіліс: tick шақырылмаса немесе dt = 0 болса күй өзгермейді', () => {
  for (const id of ['displacement', 'carbonate', 'catalyst', 'electrolysis']) {
    const m = MODEL_BY_ID[id]; const p = defaultParams(m.params); const s = m.init(p);
    assert.deepEqual(m.tick!(s, 0, p), s);
  }
});

test('карбонат: CO₂ мөлшері шектеуші реагентпен шектеледі', () => {
  const m = MODEL_BY_ID.carbonate; const p = { m: 5, cH: 0.5, V: 20, size: 1 };
  let s = m.init(p); s = m.apply(s, { id: 'addCarb' }, p).state; s = m.apply(s, { id: 'addAcid' }, p).state;
  for (let i = 0; i < 400; i++) s = m.tick!(s, 0.5, p);
  near(s.xi, 0.5 * 0.02 / 2, 1e-8); // HCl шектеуші
});

test('катализатор: теориялық өнімді көбейтпейді, жылдамдатады', () => {
  const m = MODEL_BY_ID.catalyst; const p = { n: 0.01 };
  let s = m.init(p); s = m.apply(s, { id: 'fill' }, p).state; s = m.apply(s, { id: 'addCat' }, p).state;
  for (let i = 0; i < 100; i++) s = m.tick!(s, 0.5, p);
  assert.ok(s.xB <= 0.005 + 1e-12 && s.xA <= 0.005 + 1e-12);
  assert.ok(s.xB > s.xA * 5);
});

test('электролиз: H₂ : O₂ = 2 : 1, Фарадей заңы', () => {
  const g = electrolysisGas(96485.33212);
  near(g.nH2, 0.5, 1e-12); near(g.nO2, 0.25, 1e-12); near(g.nH2 / g.nO2, 2, 1e-12);
  const m = MODEL_BY_ID.electrolysis; const p = { I: 0.5, el: 0 };
  let s = m.init(p); s = m.apply(s, { id: 'power' }, p).state; s = m.tick!(s, 100, p);
  assert.equal(s.Q, 0); // электролитсіз су — ток жоқ
});

test('ерігіштік: 100 г суға 40 г NaCl → 36 г ериді, 4 г қалады', () => {
  const d = dissolution(40, 100); near(d.dissolved, 36, 1e-9); near(d.solid, 4, 1e-9);
  const { s } = run('solubility', [{ id: 'salt', amount: 10 }, { id: 'stir' }, { id: 'salt', amount: 10 }, { id: 'salt', amount: 10 }, { id: 'salt', amount: 5 }, { id: 'stir' }, { id: 'evap', amount: 20 }]);
  assert.ok(MODEL_BY_ID.solubility.reached(s, { w0: 100 }).crys);
  assert.ok(MODEL_BY_ID.solubility.reached(s, { w0: 100 }).unsat);
});

test('өткізгіштік: сахароза ≈ су, NaCl ≫ су, су ≠ 0', () => {
  const m = MODEL_BY_ID.conductivity; const p = { c: 0.1 };
  let s = m.init(p);
  const g = (a: string) => { s = m.apply(s, { id: a }, p).state; return m.visual(s, p).lamp; };
  s = m.apply(s, { id: 'power' }, p).state;
  const w = g('water')!, n = g('nacl')!, su = g('sucrose')!;
  assert.ok(w > 0); assert.equal(su, w); assert.ok(n > 20 * w);
  assert.deepEqual(m.reached(s, p), { water: true, nacl: true, sucrose: true });
});

test('ауқымнан тыс параметр қабылданбайды', () => {
  assert.ok(MODEL_BY_ID.carbonate.validateParams!({ m: -1, cH: 1, V: 50, size: 0 }));
  assert.ok(MODEL_BY_ID.acidbase.validateParams!({ kind: 0, c0: 0.05 })); // тізімде жоқ мән
});

test('phFromNetStrong симметриялы', () => { near(phFromNetStrong(1e-3) + phFromNetStrong(-1e-3), 14, 1e-9); });
