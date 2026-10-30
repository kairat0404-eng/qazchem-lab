import type { SourceRef } from './types';

// Дереккөздер. Бұл нұсқада интернетке шығу шектеулі болғандықтан,
// сандық мәндер анықтамалық дереккөздерден алынды, бірақ «онлайн тексерілді» деп белгіленбейді.
export const SRC = {
  iupac: { title: 'IUPAC — Periodic Table of Elements', url: 'https://iupac.org/what-we-do/periodic-table-of-elements/' },
  ciaaw: { title: 'CIAAW — Standard atomic weights', url: 'https://ciaaw.org/atomic-weights.htm' },
  nist: { title: 'NIST — Periodic Table: Atomic Properties of the Elements', url: 'https://www.nist.gov/pml/periodic-table-elements', note: 'Негізгі күйдегі электрондық конфигурациялар' },
  codata: { title: 'CODATA 2018 — фундаментальды тұрақтылар (F, R)', url: 'https://physics.nist.gov/cuu/Constants/' },
  phet: { title: 'PhET — Acid-Base Solutions (модельдеу үлгісі)', url: 'https://phet.colorado.edu/en/simulations/acid-base-solutions' },
  rscMicro: { title: 'Royal Society of Chemistry — Microscale chemistry', url: 'https://edu.rsc.org/resources/collections/microscale-chemistry' },
  rscH2O2: { title: 'RSC — Hydrogen peroxide decomposition using different catalysts', url: 'https://edu.rsc.org/experiments/hydrogen-peroxide-decomposition-using-different-catalysts/831.article' },
  cuPpt: { title: 'CU Boulder — Precipitation: CaCl₂ + Na₂CO₃ → CaCO₃', url: 'https://www.colorado.edu/lab/lecture-demo-manual/general-reactions/s130-chemical-rxns-precipitation-cacl2-na2co3-caco3' },
  cuElec: { title: 'CU Boulder — Electrolysis of water', url: 'https://www.colorado.edu/lab/lecture-demo-manual/x840-electrolysis-water' },
  openstax: { title: 'OpenStax Chemistry 2e — 17.7 Electrolysis', url: 'https://openstax.org/books/chemistry/pages/17-7-electrolysis' },
  crc: { title: 'CRC Handbook of Chemistry and Physics', note: 'Ksp(CaCO₃, кальцит, 25 °C) = 3,36·10⁻⁹; NaCl ерігіштігі 25 °C-та ≈ 36,0 г/100 г су' },
  harris: { title: 'D. C. Harris, Quantitative Chemical Analysis', note: 'Фенолфталеиннің ауысу аралығы ≈ pH 8,0–9,6 (дереккөздерде 8,2–10,0 деп те беріледі)' },
} satisfies Record<string, SourceRef>;

export const SOURCES_ACCESSED = '30.10.2026';
export const SOURCES_STATUS = 'Сілтемелер тізімделді; бұл нұсқа жиналған ортада сайттарға тікелей қол жеткізу болмағандықтан, мәндер онлайн салыстырылмаған. Мұғалім рецензиясы ұсынылады.';
