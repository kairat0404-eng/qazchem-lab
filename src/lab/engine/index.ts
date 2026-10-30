import type { ReactionModel } from './types';
import { dilution, acidBase, titration } from './models/solutions';
import { precipitation, displacement, carbonate, catalyst } from './models/reactions';
import { conductivity, solubility, electrolysis } from './models/physical';

export const MODELS: ReactionModel[] = [dilution, acidBase, titration, precipitation, displacement, carbonate, catalyst, conductivity, solubility, electrolysis];
export const MODEL_BY_ID: Record<string, ReactionModel> = Object.fromEntries(MODELS.map(m => [m.id, m]));

export const EQUIPMENT: Record<string, { name: string; desc: string }> = {
  beaker: { name: 'Стақан', desc: 'Ерітінділерді араластыруға арналған шыны ыдыс' },
  flask: { name: 'Конустық колба', desc: 'Титрлеу мен газ бөлінетін реакцияларға ыңғайлы' },
  volflask: { name: 'Өлшеуіш колба', desc: 'Белгі сызығы дәл көлемді көрсетеді' },
  tube: { name: 'Сынауықтар', desc: 'Аз мөлшерлі салыстырмалы тәжірибелерге' },
  cylinder: { name: 'Өлшеуіш цилиндр', desc: 'Сұйықтық көлемін өлшеу' },
  pipette: { name: 'Тамшуыр (пипетка)', desc: 'Белгілі көлемді дәл өлшеп алу' },
  burette: { name: 'Бюретка', desc: 'Ерітіндіні үлестеп қосу және көлемін өлшеу' },
  balance: { name: 'Таразы', desc: 'Қатты заттың массасын өлшеу' },
  thermometer: { name: 'Термометр', desc: 'Температураны бақылау' },
  phmeter: { name: 'pH-өлшеуіш', desc: 'Ерітіндінің pH мәнін өлшеу' },
  indicator: { name: 'Индикатор', desc: 'Ортаның сипатын түспен көрсетеді' },
  rod: { name: 'Шыны таяқша', desc: 'Араластыруға арналған' },
  electrodes: { name: 'Инертті электродтар', desc: 'Графит/платина электродтар' },
  power: { name: 'Тұрақты ток көзі', desc: 'Тізбекке кернеу береді' },
  lamp: { name: 'Шам (өткізгіштік индикаторы)', desc: 'Ток жүрсе жанады' },
  ucell: { name: 'Газ жинағыш түтікті электролизер', desc: 'Катод пен анодтағы газдарды бөлек жинайды' },
};

export * from './types';
export { checkBalance, parseFormula, fmt, defaultParams, checkParams } from './chem';
