import type { Equation, ParamDef, Params, Species, RGBA } from './types';

/** 25 °C-тағы судың иондық көбейтіндісі (идеал модель). */
export const KW_25C = 1.0e-14;
/** Фарадей тұрақтысы, Кл/моль (CODATA 2018, дәл мән). */
export const FARADAY = 96485.33212;
/** Газ тұрақтысы, Дж/(моль·К) (CODATA 2018, дәл мән). */
export const R_GAS = 8.314462618;
/** 25 °C (298,15 К) және 100 кПа кезіндегі идеал газдың мольдік көлемі, л/моль. */
export const VM_25C_100KPA = (R_GAS * 298.15) / 100000 * 1000; // ≈ 24,79

export const MOLAR_MASS: Record<string, number> = {
  Fe: 55.845, Cu: 63.546, CaCO3: 100.086, NaCl: 58.44, MnO2: 86.94, CuSO4: 159.61,
};

/** Формуладағы атомдарды санау: "Ca(OH)2" → {Ca:1,O:2,H:2}. */
export function parseFormula(f: string): Record<string, number> {
  if (f === 'e') return {}; // электрон: тек заряд
  const stack: Record<string, number>[] = [{}];
  let i = 0;
  const readNum = () => {
    let s = '';
    while (i < f.length && /[0-9]/.test(f[i])) s += f[i++];
    return s ? parseInt(s, 10) : 1;
  };
  while (i < f.length) {
    const ch = f[i];
    if (ch === '(') { stack.push({}); i++; }
    else if (ch === ')') {
      i++;
      const n = readNum();
      const top = stack.pop()!;
      const cur = stack[stack.length - 1];
      for (const k in top) cur[k] = (cur[k] || 0) + top[k] * n;
    } else if (/[A-Z]/.test(ch)) {
      let el = ch; i++;
      while (i < f.length && /[a-z]/.test(f[i])) el += f[i++];
      const n = readNum();
      const cur = stack[stack.length - 1];
      cur[el] = (cur[el] || 0) + n;
    } else throw new Error('Формула талданбады: ' + f);
  }
  if (stack.length !== 1) throw new Error('Жақшалар сәйкес емес: ' + f);
  return stack[0];
}

function sideTotals(side: Species[]) {
  const atoms: Record<string, number> = {};
  let charge = 0;
  for (const sp of side) {
    const a = parseFormula(sp.f);
    for (const k in a) atoms[k] = (atoms[k] || 0) + a[k] * sp.coef;
    charge += (sp.charge || 0) * sp.coef;
  }
  return { atoms, charge };
}

/** Атомдар мен зарядтың сақталуын тексеру. Теңдік реакцияның жүретінін дәлелдемейді. */
export function checkBalance(eq: Equation): { atoms: boolean; charge: boolean; detail: string } {
  const L = sideTotals(eq.reactants), R = sideTotals(eq.products);
  const keys = new Set([...Object.keys(L.atoms), ...Object.keys(R.atoms)]);
  const diffs: string[] = [];
  keys.forEach(k => { if ((L.atoms[k] || 0) !== (R.atoms[k] || 0)) diffs.push(`${k}: ${L.atoms[k] || 0}≠${R.atoms[k] || 0}`); });
  return { atoms: diffs.length === 0, charge: L.charge === R.charge, detail: diffs.join(', ') };
}

/**
 * Күшті монопротонды қышқылдың (немесе күшті негіздің) таза мөлшері бар ерітіндідегі
 * [H3O+] мәні, судың өзіндік иондануын ескеріп: x² − c·x − Kw = 0.
 * net > 0 — артық қышқыл (моль/л), net < 0 — артық негіз.
 */
export function phFromNetStrong(net: number, kw = KW_25C): number {
  if (net >= 0) {
    const h = (net + Math.sqrt(net * net + 4 * kw)) / 2;
    return -Math.log10(h);
  }
  const b = -net;
  const oh = (b + Math.sqrt(b * b + 4 * kw)) / 2;
  return -Math.log10(kw / oh);
}

/** Параметрлерді орталықтан тексеру: ауқым, қадам, дискретті мәндер. */
export function checkParams(defs: ParamDef[], p: Params): string | null {
  for (const d of defs) {
    const v = p[d.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) return `«${d.label}» мәні сан болуы керек.`;
    if (d.options) {
      if (!d.options.some(o => o.value === v)) return `«${d.label}» үшін рұқсат етілмеген мән таңдалды.`;
      continue;
    }
    if (v < d.min - 1e-12 || v > d.max + 1e-12)
      return `«${d.label}» ${fmt(d.min)}–${fmt(d.max)} ${d.unit} аралығында болуы керек (енгізілгені: ${fmt(v)}). Мәнді осы ауқымға келтіріңіз.`;
  }
  return null;
}

export function defaultParams(defs: ParamDef[]): Params {
  const o: Params = {};
  for (const d of defs) o[d.key] = d.default;
  return o;
}

export function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }

/** Қазақша сан форматы: үтір ондық бөлгіш. */
export function fmt(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  let s: string;
  if (a >= 1e5 || a < 1e-3) {
    const e = Math.floor(Math.log10(a));
    const m = v / Math.pow(10, e);
    s = `${m.toFixed(2).replace('.', ',')}·10${toSup(e)}`;
    return s;
  }
  s = Number(v.toPrecision(digits)).toString();
  return s.replace('.', ',');
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export function toSup(n: number) { return String(n).split('').map(c => SUP[c] || c).join(''); }

export function mix(a: RGBA, b: RGBA, t: number): RGBA {
  return [0, 1, 2, 3].map(i => a[i] + (b[i] - a[i]) * t) as RGBA;
}

export const WATER: RGBA = [0.78, 0.88, 0.96, 0.28];
