// QAZCHEM LAB — ғылыми модельдердің ортақ дерек құрылымдары.
// Есептеу модулі көріністен (3D/2D) толық тәуелсіз: тек таза функциялар.

export type Phase = 's' | 'l' | 'g' | 'aq';

/** Реакциядағы бір бөлшек: формула құрылымдалған күйде сақталады. */
export interface Species {
  f: string;          // формула, мысалы "CaCO3", "H3O"
  coef: number;       // стехиометриялық коэффициент
  phase?: Phase;
  charge?: number;    // ион заряды (+2, -1 ...)
}

export interface Equation {
  id: string;
  label: string;      // «Молекулалық теңдеу», «Қысқартылған иондық теңдеу» т.б.
  reactants: Species[];
  products: Species[];
  reversible?: boolean;
  catalyst?: string;  // катализатор формуласы (стехиометрияға кірмейді)
  conditions?: string;
}

export interface Substance {
  id: string;
  name: string;       // қазақша атауы
  formula: string;
  molarMass?: number; // г/моль
  color?: string;     // нақты түсінің сипаттамасы
}

export interface ParamOption { value: number; label: string }

export interface ParamDef {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
  options?: ParamOption[]; // дискретті таңдау
}

export interface ActionDef {
  id: string;
  label: string;
  hint?: string;
  amounts?: number[];  // мысалы бюреткадан қосылатын көлемдер
  unit?: string;
  group?: 'reagent' | 'operation' | 'instrument';
}

export interface Action { id: string; amount?: number }

export type Params = Record<string, number>;

export interface Measurement {
  key: string;
  label: string;
  value: number | string;
  unit?: string;
  /** calc — модельмен есептелген сан; qual — сапалық бақылау; cond — шартты шкала */
  kind: 'calc' | 'qual' | 'cond';
  digits?: number;
}

export type RGBA = [number, number, number, number];

export interface VisualVessel {
  id: string;
  kind: 'beaker' | 'flask' | 'volflask' | 'tube' | 'cylinder' | 'burette' | 'ucell';
  label: string;
  x: number;               // үстелдегі орны (−1…1)
  capacity: number;        // мл
  volume: number;          // мл
  liquid: RGBA;            // сұйықтықтың нақты түсі
  precipitate?: number;    // 0…1 тұнба қабаты
  precipitateColor?: RGBA;
  solid?: { kind: 'nail' | 'chunks' | 'powder' | 'crystals' | 'catalyst'; amount: number; color: RGBA; coating?: number; coatColor?: RGBA };
  bubbles?: number;        // 0…1 салыстырмалы газ бөліну қарқыны
  particles?: { label: string; count: number; color: RGBA; charge?: number }[];
  electrodes?: { on: boolean; gasLeft: number; gasRight: number; leftLabel: string; rightLabel: string };
  meter?: { label: string; value: string };
}

export interface VisualState {
  vessels: VisualVessel[];
  lamp?: number | null;     // 0…1, null — тізбек ажыратылған
  timeLabel?: string;
}

export interface Milestone { id: string; label: string }

export interface StepResult<S> { state: S; error?: string; note?: string }

export interface ReactionModel<S = any> {
  id: string;
  version: string;
  title: string;
  equations: Equation[];
  substances: Substance[];
  equipment: string[];        // қажетті құралдар
  optionalEquipment?: string[];
  params: ParamDef[];
  actions: ActionDef[];
  milestones: Milestone[];
  assumptions: string[];
  limitations: string[];
  sources: SourceRef[];
  /** Сапалық (шартты) уақыт қолданылады ма */
  timeMode: 'none' | 'conditional' | 'model-seconds';
  validateParams?(p: Params): string | null;
  init(p: Params): S;
  apply(s: S, a: Action, p: Params): StepResult<S>;
  tick?(s: S, dt: number, p: Params): S;
  isRunning?(s: S): boolean;
  measure(s: S, p: Params): Measurement[];
  visual(s: S, p: Params): VisualState;
  reached(s: S, p: Params): Record<string, boolean>;
}

export interface SourceRef { title: string; url?: string; note?: string }
