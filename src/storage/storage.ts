import type { ExperimentTemplate } from '../data/experiments';

export interface LogEntry { at: string; text: string; kind: 'action' | 'error' | 'note' | 'system' }
export interface MeasureRow { at: string; simTime: number; values: Record<string, string | number> }
export interface Observation { at: string; text: string }

export interface Attempt {
  id: string;
  templateId: string;
  templateVersion: number;
  template: ExperimentTemplate;          // орындалған кездегі шаблон көшірмесі
  nickname: string;
  createdAt: string;
  updatedAt: string;
  prediction: number | null;
  predictionNote: string;
  params: Record<string, number>;
  modelState: unknown;
  simTime: number;
  placed: string[];
  log: LogEntry[];
  rows: MeasureRow[];
  observations: Observation[];
  manualSteps: string[];
  answers: Record<string, { choice?: number; value?: string; unit?: string; text?: string }>;
  quizSubmitted: boolean;
  conclusion: string;
  teacher: { rubric: Record<string, boolean[]>; conclusionRubric: boolean[]; gradedAt: string } | null;
  completed: boolean;
}

export interface Settings { mode: 'student' | 'teacher'; reducedMotion: boolean; force2D: boolean; nickname: string; sound: boolean }

export interface DB {
  schema: 1;
  attempts: Attempt[];
  templates: ExperimentTemplate[];          // мұғалім шаблондары
  templateHistory: ExperimentTemplate[];    // жарияланған нұсқалар архиві
  settings: Settings;
  lastAttemptId: string | null;
}

const KEY = 'qazchem-lab.v1';

export function emptyDB(): DB {
  return { schema: 1, attempts: [], templates: [], templateHistory: [], settings: { mode: 'student', reducedMotion: false, force2D: false, nickname: '', sound: false }, lastAttemptId: null };
}

export function storageAvailable(): boolean {
  try { const k = '__qz_test__'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch { return false; }
}

export function loadDB(): { db: DB; ok: boolean; error?: string } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { db: emptyDB(), ok: true };
    const parsed = JSON.parse(raw);
    if (parsed?.schema !== 1) return { db: emptyDB(), ok: true, error: 'Сақталған деректердің нұсқасы сәйкес емес — жаңа дерекқор ашылды.' };
    const base = emptyDB();
    return { db: { ...base, ...parsed, settings: { ...base.settings, ...parsed.settings } }, ok: true };
  } catch {
    return { db: emptyDB(), ok: false, error: 'Браузер сақтауына қол жеткізу мүмкін болмады.' };
  }
}

export function saveDB(db: DB): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch { return false; }
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
export const nowISO = () => new Date().toISOString();
