import { UNITS, type ExperimentTemplate, type QuizItem, type QuizNum, type QuizMCQ } from '../data/experiments';

export const CONCLUSION_RUBRIC = ['Болжамын нәтижемен салыстырады', 'Өз өлшеулеріне (сандарға) сүйенеді', 'Ғылыми түсіндірме береді (модель, теңдеу немесе заң)'];

export function parseNumber(s: string): number | null {
  if (typeof s !== 'string') return null;
  const t = s.trim().replace(/\s/g, '').replace(',', '.').replace(/·10\^?/, 'e').replace(/×10\^?/, 'e');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const v = Number(t); return Number.isFinite(v) ? v : null;
}

export interface Feedback { correct: boolean; message: string }

export function gradeMCQ(q: QuizMCQ, choice: number | undefined): Feedback {
  if (choice === undefined || choice === null) return { correct: false, message: 'Жауап таңдалмады.' };
  const ok = choice === q.correct;
  const hint = q.hints?.[choice];
  return { correct: ok, message: ok ? `Дұрыс. ${q.explain}` : `Дұрыс емес.${hint ? ' ' + hint : ''} ${q.explain}` };
}

/** Сандық жауап: бірлікті түрлендіріп, салыстырмалы ауытқу шегімен тексереді. */
export function gradeNumeric(q: QuizNum, raw: string, unit: string): Feedback {
  const v = parseNumber(raw);
  if (v === null) return { correct: false, message: 'Сан дұрыс енгізілмеді. Мысалы: 0,05 немесе 5e-2.' };
  const fam = UNITS[q.family];
  const u = fam.find(x => x.u === unit) ?? fam[0];
  const base = v * u.f;
  const tol = Math.abs(q.answer) * q.tolRel || 1e-9;
  const ok = Math.abs(base - q.answer) <= tol;
  if (ok) return { correct: true, message: `Дұрыс. ${q.explain}` };
  // Жиі кездесетін қате: бірлікті түрлендірмеу
  for (const other of fam) if (other.u !== u.u && Math.abs(v * other.f - q.answer) <= tol)
    return { correct: false, message: `Сан дұрыс сияқты, бірақ өлшем бірлігі сәйкес емес: «${u.u}» емес, «${other.u}» болуы керек. ${q.explain}` };
  return { correct: false, message: `Дұрыс емес (рұқсат етілген ауытқу ±${Math.round(q.tolRel * 100)} %). ${q.explain}` };
}

export interface AttemptLike {
  reached: Record<string, boolean>;
  manualSteps: string[];
  answers: Record<string, { choice?: number; value?: string; unit?: string; text?: string }>;
  quizSubmitted: boolean;
  teacher?: { rubric: Record<string, boolean[]>; conclusionRubric: boolean[] } | null;
}

export interface Score { procedure: number; data: number | null; conclusion: number | null; total: number | null; status: 'graded' | 'conclusion-pending' | 'not-submitted' }

export function stepDone(step: { id: string; milestone?: string }, a: AttemptLike) {
  return step.milestone ? !!a.reached[step.milestone] : a.manualSteps.includes(step.id);
}

export function scoreAttempt(t: ExperimentTemplate, a: AttemptLike): Score {
  const req = t.steps;
  const procedure = req.length ? req.filter(s => stepDone(s, a)).length / req.length * 100 : 100;
  const auto = t.quiz.filter(q => q.type !== 'open');
  let data: number | null = null;
  if (a.quizSubmitted && auto.length) {
    let ok = 0;
    for (const q of auto) {
      const ans = a.answers[q.id] || {};
      if (q.type === 'mcq' && gradeMCQ(q, ans.choice).correct) ok++;
      if (q.type === 'numeric' && gradeNumeric(q, ans.value || '', ans.unit || '').correct) ok++;
    }
    data = ok / auto.length * 100;
  }
  let conclusion: number | null = null;
  if (a.teacher) {
    let got = 0, all = 0;
    for (const q of t.quiz) if (q.type === 'open') { const r = a.teacher.rubric[q.id] || []; all += q.rubric.length; got += q.rubric.filter((_, i) => r[i]).length; }
    all += CONCLUSION_RUBRIC.length; got += a.teacher.conclusionRubric.filter(Boolean).length;
    conclusion = all ? got / all * 100 : 0;
  }
  const w = t.weights; const sumW = w.procedure + w.data + w.conclusion || 1;
  const total = data !== null && conclusion !== null ? (procedure * w.procedure + data * w.data + conclusion * w.conclusion) / sumW : null;
  return { procedure, data, conclusion, total, status: !a.quizSubmitted ? 'not-submitted' : conclusion === null ? 'conclusion-pending' : 'graded' };
}

export function isOpen(q: QuizItem): q is Extract<QuizItem, { type: 'open' }> { return q.type === 'open'; }
