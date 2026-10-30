import type { ExperimentTemplate, QuizItem } from '../data/experiments';
import { UNITS, SPECIAL_MILESTONES } from '../data/experiments';
import { MODEL_BY_ID, EQUIPMENT, defaultParams } from '../lab/engine/index';
import type { Attempt, MeasureRow } from './storage';

export const TEMPLATE_FORMAT = 'qazchem-lab/template';
export const ATTEMPT_FORMAT = 'qazchem-lab/attempt';
export const FILE_SCHEMA = 1;
export const MAX_IMPORT_BYTES = 512 * 1024;

const isStr = (v: unknown, max = 4000): v is string => typeof v === 'string' && v.length <= max;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Шаблонды толық тексеру: модель, құралдар, параметр ауқымы, кезеңдер, тапсырмалар. Қателер тізімін қайтарады. */
export function validateTemplate(t: any): string[] {
  const e: string[] = [];
  if (!t || typeof t !== 'object') return ['Файлда шаблон нысаны жоқ.'];
  const m = MODEL_BY_ID[t.modelId];
  if (!m) return [`Модель «${String(t.modelId)}» табылмады. Тек тексерілген 10 модельдің біріне негізделген шаблон қабылданады.`];
  if (!isStr(t.id, 80) || !t.id) e.push('id өрісі жоқ немесе тым ұзын.');
  if (!isNum(t.version) || t.version < 1) e.push('version оң сан болуы керек.');
  for (const k of ['title', 'goal', 'description', 'observationPrompt', 'explanation', 'conclusionPrompt', 'topic', 'outcome'] as const)
    if (!isStr(t[k])) e.push(`«${k}» мәтіндік өрісі жоқ немесе тым ұзын.`);
  if (t.title !== undefined && isStr(t.title) && !t.title.trim()) e.push('Атауы бос болмауы керек.');
  if (!t.prediction || !isStr(t.prediction.question) || !Array.isArray(t.prediction.options) || t.prediction.options.length < 2 || !t.prediction.options.every((o: unknown) => isStr(o, 300)))
    e.push('Болжам сұрағы және кемінде 2 жауап нұсқасы қажет.');
  const allowedEq = new Set([...m.equipment, ...(m.optionalEquipment || [])]);
  if (!Array.isArray(t.equipment)) e.push('equipment тізім болуы керек.');
  else {
    for (const q of t.equipment) if (!allowedEq.has(q)) e.push(`«${EQUIPMENT[q]?.name ?? q}» құралы «${m.title}» моделіне сәйкес келмейді.`);
    for (const q of m.equipment) if (!t.equipment.includes(q)) e.push(`Модельге қажетті «${EQUIPMENT[q].name}» құралы алынып тасталмауы керек.`);
  }
  if (!t.params || typeof t.params !== 'object') e.push('params нысаны жоқ.');
  else {
    const p = { ...defaultParams(m.params), ...t.params };
    for (const k of Object.keys(t.params)) if (!m.params.some(d => d.key === k)) e.push(`Белгісіз параметр: ${k}.`);
    const pe = m.validateParams!(p); if (pe) e.push(pe);
  }
  const ms = new Set([...m.milestones.map(x => x.id), ...SPECIAL_MILESTONES.map(x => x.id)]);
  if (!Array.isArray(t.steps) || t.steps.length < 1 || t.steps.length > 12) e.push('Кезеңдер саны 1–12 болуы керек.');
  else {
    const ids = new Set<string>();
    for (const s of t.steps) {
      if (!isStr(s.id, 40) || !isStr(s.text, 600) || !s.text.trim()) { e.push('Әр кезеңде id мен мәтін болуы керек.'); continue; }
      if (ids.has(s.id)) e.push(`Кезең id қайталанады: ${s.id}.`); ids.add(s.id);
      if (s.milestone !== undefined && !ms.has(s.milestone)) e.push(`«${s.text.slice(0, 30)}…» кезеңі модельде жоқ «${s.milestone}» тексеру нүктесіне сілтейді.`);
    }
    if (!t.steps.some((s: any) => s.milestone && s.milestone !== 'setup' && s.milestone !== 'observe')) e.push('Кемінде бір кезең модельдің нақты әрекетімен тексерілуі керек.');
  }
  if (!Array.isArray(t.quiz) || t.quiz.length < 3) e.push('Кемінде 3 бағалау тапсырмасы қажет.');
  else {
    const types = new Set(t.quiz.map((q: QuizItem) => q.type));
    if (!types.has('mcq') || !types.has('numeric') || !types.has('open')) e.push('Тапсырмалар ішінде таңдау, сандық және ашық сұрақ болуы керек.');
    t.quiz.forEach((q: any, i: number) => {
      if (!isStr(q.id, 40) || !isStr(q.prompt, 1000) || !q.prompt.trim()) e.push(`${i + 1}-тапсырманың мәтіні жоқ.`);
      if (q.type === 'mcq' && (!Array.isArray(q.options) || q.options.length < 2 || !isNum(q.correct) || q.correct < 0 || q.correct >= q.options.length)) e.push(`${i + 1}-тапсырма: дұрыс жауап нұсқалардың бірі болуы керек.`);
      if (q.type === 'numeric' && (!isNum(q.answer) || !(q.family in UNITS) || !isNum(q.tolRel) || q.tolRel <= 0 || q.tolRel > 0.2)) e.push(`${i + 1}-тапсырма: сандық жауап, бірлік түрі және 0–20 % ауытқу шегі қажет.`);
      if (q.type === 'open' && (!Array.isArray(q.rubric) || q.rubric.length < 1)) e.push(`${i + 1}-тапсырма: ашық сұраққа кемінде бір рубрика өлшемі қажет.`);
      if (!['mcq', 'numeric', 'open'].includes(q.type)) e.push(`${i + 1}-тапсырманың түрі белгісіз.`);
    });
  }
  const w = t.weights;
  if (!w || ![w.procedure, w.data, w.conclusion].every(x => isNum(x) && x >= 0 && x <= 100) || w.procedure + w.data + w.conclusion !== 100) e.push('Бағалау салмақтарының қосындысы 100 % болуы керек.');
  return e;
}

export function templateToJSON(t: ExperimentTemplate) {
  return JSON.stringify({ format: TEMPLATE_FORMAT, schema: FILE_SCHEMA, exportedAt: new Date().toISOString(), template: t }, null, 2);
}

export function parseTemplateFile(text: string): { template?: ExperimentTemplate; errors: string[] } {
  if (text.length > MAX_IMPORT_BYTES) return { errors: ['Файл тым үлкен (512 КБ-тан асады).'] };
  let obj: any;
  try { obj = JSON.parse(text); } catch { return { errors: ['Файл JSON пішімінде емес немесе бүлінген.'] }; }
  if (obj?.format !== TEMPLATE_FORMAT) return { errors: ['Бұл QAZCHEM LAB шаблон файлы емес.'] };
  if (obj.schema !== FILE_SCHEMA) return { errors: [`Файл нұсқасы (${obj.schema}) қолдау көрсетілмейді.`] };
  const errs = validateTemplate(obj.template);
  if (errs.length) return { errors: errs };
  const t = obj.template as ExperimentTemplate;
  return { template: { ...t, source: 'teacher', deleted: false }, errors: [] };
}

export function attemptToJSON(a: Attempt) {
  return JSON.stringify({ format: ATTEMPT_FORMAT, schema: FILE_SCHEMA, exportedAt: new Date().toISOString(), attempt: a }, null, 2);
}

export function parseAttemptFile(text: string): { attempt?: Attempt; errors: string[] } {
  if (text.length > MAX_IMPORT_BYTES * 4) return { errors: ['Файл тым үлкен.'] };
  let obj: any;
  try { obj = JSON.parse(text); } catch { return { errors: ['Файл JSON пішімінде емес немесе бүлінген.'] }; }
  if (obj?.format !== ATTEMPT_FORMAT) return { errors: ['Бұл QAZCHEM LAB жұмыс файлы емес.'] };
  if (obj.schema !== FILE_SCHEMA) return { errors: [`Файл нұсқасы (${obj.schema}) қолдау көрсетілмейді.`] };
  const a = obj.attempt;
  const errs: string[] = [];
  if (!a || !isStr(a.id, 80) || !Array.isArray(a.log) || !Array.isArray(a.rows) || typeof a.answers !== 'object') errs.push('Жұмыс файлының құрылымы толық емес.');
  else {
    errs.push(...validateTemplate(a.template).map(x => 'Шаблон: ' + x));
    const m = MODEL_BY_ID[a.template?.modelId];
    if (m && a.params) { const pe = m.validateParams!({ ...defaultParams(m.params), ...a.params }); if (pe) errs.push(pe); }
  }
  return errs.length ? { errors: errs } : { attempt: a as Attempt, errors: [] };
}

function csvCell(v: unknown) { const s = String(v ?? ''); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }
export function rowsToCSV(rows: MeasureRow[], labels: Record<string, string>) {
  const keys = Array.from(new Set(rows.flatMap(r => Object.keys(r.values))));
  const head = ['Уақыты', 'Модель уақыты', ...keys.map(k => labels[k] || k)];
  const body = rows.map(r => [r.at, r.simTime, ...keys.map(k => typeof r.values[k] === 'number' ? String(Number((r.values[k] as number).toPrecision(12))).replace('.', ',') : r.values[k] ?? '')]);
  return '﻿' + [head, ...body].map(r => r.map(csvCell).join(';')).join('\r\n');
}

/** Хост ортасы: claude.ai артефакт қарауышы болса — downloads мүмкіндігі, әйтпесе қарапайым браузер жүктеуі. */
export function inViewer(): boolean { return typeof (window as any).claude?.use === 'function'; }

/** Файлды пайдаланушыға беру. Нәтиже: 'saved' | 'declined' | 'unavailable'. */
export async function download(name: string, text: string, mime: string): Promise<'saved' | 'declined' | 'unavailable'> {
  if (inViewer()) {
    try {
      const d = await (window as any).claude.use('downloads');
      if (!d) return 'unavailable';
      await d.save({ filename: name, data: text });
      return 'saved';
    } catch (e: any) { return e?.code === 'declined' ? 'declined' : 'unavailable'; }
  }
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'saved';
}
