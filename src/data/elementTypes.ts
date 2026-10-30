export type Category = 'am' | 'ae' | 'tm' | 'pt' | 'md' | 'nm' | 'hg' | 'ng' | 'ln' | 'ac' | 'uk';

export interface ElementData {
  z: number;
  s: string;            // таңба
  kk: string;           // қазақша атауы
  en: string;           // халықаралық (ағылшынша) атауы
  cat: Category;
  period: number;
  group: number | null; // f-блок элементтері үшін null
  cfg: string;          // негізгі күйдегі электрондық конфигурация
  shells: number[];     // қабаттар бойынша электрондар
  cfgStatus: 'measured' | 'uncertain' | 'predicted';
  state: 'g' | 'l' | 's' | 'u';
  A: number;            // көрсетілетін изотоптың массалық саны
  use: string;
  aw?: string;          // стандартты атомдық масса (немесе шартты мән)
  awType: 'standard' | 'interval' | 'none';
  interval?: [string, string];
}

export const CATEGORY: Record<Category, { name: string; color: string }> = {
  am: { name: 'Сілтілік металдар', color: '#F59E8B' },
  ae: { name: 'Сілтілік жер металдары', color: '#F7C47A' },
  tm: { name: 'Ауыспалы металдар', color: '#8FB8F5' },
  pt: { name: 'Өтпелі кейінгі металдар', color: '#9FD8C9' },
  md: { name: 'Жартылай металдар', color: '#C7D98A' },
  nm: { name: 'Бейметалдар', color: '#7FE0B5' },
  hg: { name: 'Галогендер', color: '#6FD3E8' },
  ng: { name: 'Асыл газдар', color: '#C4B5FD' },
  ln: { name: 'Лантаноидтар', color: '#F5A8D0' },
  ac: { name: 'Актиноидтар', color: '#E7A6F0' },
  uk: { name: 'Қасиеттері зерттелмеген', color: '#B7C5D8' },
};

export const STATE_NAME = { g: 'газ', l: 'сұйық', s: 'қатты', u: 'дерек расталмаған' } as const;

/** Көрсетілетін изотоптың түсіндірмесі: тұрақтылар үшін — ең көп таралған, радиоактивтілер үшін — ең ұзақ өмір сүретін белгілі изотоп. */
export function isotopeNote(e: ElementData) {
  return e.awType === 'none' ? 'ең ұзақ өмір сүретін белгілі изотоп' : 'ең көп таралған изотоп';
}
