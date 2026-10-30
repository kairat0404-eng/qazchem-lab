import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ELEMENTS } from '../data/elements';
import { BUILTIN } from '../data/experiments';
import { validateTemplate, templateToJSON, parseTemplateFile, rowsToCSV } from '../storage/io';
import { gradeNumeric, gradeMCQ, scoreAttempt, parseNumber } from '../assessment/grade';
import { MODEL_BY_ID } from '../lab/engine/index';

test('118 элемент: нөмірлер 1–118, бірегей таңбалар', () => {
  assert.equal(ELEMENTS.length, 118);
  ELEMENTS.forEach((e, i) => assert.equal(e.z, i + 1));
  assert.equal(new Set(ELEMENTS.map(e => e.s)).size, 118);
});

test('бейтарап атомда электрондар саны Z-ке тең (конфигурация және қабаттар)', () => {
  for (const e of ELEMENTS) {
    assert.equal(e.shells.reduce((a, b) => a + b, 0), e.z, e.s);
    const core: Record<string, number> = { He: 2, Ne: 10, Ar: 18, Kr: 36, Xe: 54, Rn: 86 };
    const m = e.cfg.match(/^\[(\w+)\]\s*(.*)$/);
    let n = m ? core[m[1]] : 0;
    for (const part of (m ? m[2] : e.cfg).split(/\s+/).filter(Boolean)) n += parseInt(part.slice(2), 10);
    assert.equal(n, e.z, e.s + ' ' + e.cfg);
  }
});

test('конфигурация ерекшеліктері: Cr, Cu, Pd, Au', () => {
  const by = (s: string) => ELEMENTS.find(e => e.s === s)!.cfg;
  assert.equal(by('Cr'), '[Ar] 3d5 4s1');
  assert.equal(by('Cu'), '[Ar] 3d10 4s1');
  assert.equal(by('Pd'), '[Kr] 4d10');
  assert.equal(by('Au'), '[Xe] 4f14 5d10 6s1');
});

test('атомдық масса: стандарт мәні жоқ элементке жасанды мән қойылмаған; N = A − Z ≥ 0', () => {
  for (const e of ELEMENTS) {
    if (e.awType === 'none') assert.equal(e.aw, undefined, e.s);
    else assert.ok(e.aw && Number(e.aw) > 0, e.s);
    assert.ok(e.A - e.z >= 0, e.s);
  }
  assert.equal(ELEMENTS.find(e => e.s === 'Tc')!.awType, 'none');
  assert.equal(ELEMENTS.find(e => e.s === 'H')!.awType, 'interval');
});

test('ауыр элементтердің конфигурациясы болжамды деп белгіленген', () => {
  for (const e of ELEMENTS) if (e.z >= 104) assert.equal(e.cfgStatus, 'predicted');
});

test('барлық кіріктірілген шаблон тексеруден өтеді', () => {
  for (const t of BUILTIN) assert.deepEqual(validateTemplate(t), [], t.id);
  assert.equal(BUILTIN.length, 10);
});

test('шаблон экспорты → импорты мазмұнды сақтайды', () => {
  const t = BUILTIN[2];
  const r = parseTemplateFile(templateToJSON(t));
  assert.deepEqual(r.errors, []);
  assert.deepEqual({ ...r.template, source: 'builtin', deleted: undefined }, { ...t, deleted: undefined });
});

test('бүлінген және сәйкессіз импорт қабылданбайды', () => {
  assert.match(parseTemplateFile('{бұзылған').errors[0], /JSON/);
  assert.match(parseTemplateFile(JSON.stringify({ format: 'x' })).errors[0], /емес/);
  const bad = { ...BUILTIN[0], equipment: [...BUILTIN[0].equipment, 'burette'], params: { c1: 5, V1: 50, V2: 100 } };
  const errs = validateTemplate(bad);
  assert.ok(errs.some(x => /Бюретка/.test(x)));
  assert.ok(errs.some(x => /аралығында/.test(x)));
  assert.ok(validateTemplate({ ...BUILTIN[0], modelId: 'unknown' })[0].includes('табылмады'));
});

test('сандық жауап: бірлік түрлендіру және ауытқу шегі', () => {
  const q = BUILTIN[2].quiz.find(x => x.type === 'numeric') as any; // 30 мл
  assert.ok(gradeNumeric(q, '30', 'мл').correct);
  assert.ok(gradeNumeric(q, '0,030', 'л').correct);
  assert.ok(gradeNumeric(q, '30,4', 'мл').correct);
  const wrongUnit = gradeNumeric(q, '0,030', 'мл');
  assert.ok(!wrongUnit.correct && /бірлігі/.test(wrongUnit.message));
  assert.ok(!gradeNumeric(q, 'отыз', 'мл').correct);
  assert.equal(parseNumber('5e-2'), 0.05);
});

test('бағалау: қорытынды тексерілмесе жиынтық баға шықпайды', () => {
  const t = BUILTIN[0];
  const a = { reached: { setup: true, aliquot: true, filled: true, mixed: true, observe: true }, manualSteps: [], answers: { q1: { choice: 1 }, q2: { value: '0,05', unit: 'моль/л' } }, quizSubmitted: true, teacher: null };
  const s = scoreAttempt(t, a);
  assert.equal(s.status, 'conclusion-pending'); assert.equal(s.total, null); assert.equal(s.data, 100);
  const g = scoreAttempt(t, { ...a, teacher: { rubric: { q3: [true, true, true] }, conclusionRubric: [true, true, true] } });
  assert.equal(g.status, 'graded'); assert.ok(g.total! > 90);
  assert.ok(gradeMCQ(t.quiz[0] as any, 0).message.startsWith('Дұрыс емес'));
});

test('CSV: қазақ әріптері мен үтір сақталады', () => {
  const csv = rowsToCSV([{ at: '2026-10-30', simTime: 0, values: { c: 0.1, s: 'қаныққан' } }], { c: 'Концентрация', s: 'Күйі' });
  assert.ok(csv.includes('Концентрация') && csv.includes('0,1') && csv.includes('қаныққан'));
});

test('шаблон кезеңдері модель тексеру нүктелеріне сәйкес', () => {
  for (const t of BUILTIN) {
    const m = MODEL_BY_ID[t.modelId];
    for (const s of t.steps) if (s.milestone && !['setup', 'observe'].includes(s.milestone)) assert.ok(m.milestones.some(x => x.id === s.milestone), t.id + '/' + s.milestone);
    assert.ok(t.steps.length >= 4 && t.steps.length <= 7, t.id + ' кезеңдер саны');
  }
});
