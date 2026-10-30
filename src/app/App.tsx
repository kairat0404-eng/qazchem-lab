import { useEffect, useRef } from 'react';
import { StoreProvider, useRoute, useStore } from './store';
import { Home } from '../pages/Home';
import { Labs } from '../pages/Labs';
import { LabPage } from '../pages/Lab';
import { Builder } from '../builder/Builder';
import { TablePage } from '../pages/Table';
import { Notebook, Report } from '../pages/Notebook';
import { Results } from '../pages/Results';
import { About } from '../pages/About';
import { Empty } from '../components/ui';

const NAV = [
  { href: '#/', key: '', label: 'Басты бет' },
  { href: '#/labs', key: 'labs', label: 'Жұмыстар' },
  { href: '#/lab', key: 'lab', label: 'Зертхана' },
  { href: '#/builder', key: 'builder', label: 'Құрастыру' },
  { href: '#/table', key: 'table', label: 'Периодтық кесте' },
  { href: '#/notebook', key: 'notebook', label: 'Дәптер' },
  { href: '#/results', key: 'results', label: 'Нәтижелер' },
  { href: '#/about', key: 'about', label: 'Анықтама' },
];

function Shell() {
  const { parts } = useRoute();
  const s = useStore();
  const section = parts[0] || '';
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const titles: Record<string, string> = { '': 'Басты бет', labs: 'Зертханалық жұмыстар', lab: 'Виртуалды зертхана', builder: 'Тәжірибе құрастыру', table: 'Периодтық кесте', notebook: 'Зертханалық дәптер', results: 'Нәтижелер мен бағалау', about: 'Анықтама', report: 'Есеп' };
    document.title = `${titles[section] ?? 'Бет'} · QAZCHEM LAB`;
    window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [section, parts[1]]);

  let page;
  switch (section) {
    case '': page = <Home />; break;
    case 'labs': page = <Labs />; break;
    case 'lab': page = <LabPage id={parts[1]} />; break;
    case 'builder': page = <Builder id={parts[1]} />; break;
    case 'table': page = <TablePage z={parts[1] ? Number(parts[1]) : undefined} />; break;
    case 'notebook': page = <Notebook id={parts[1]} />; break;
    case 'report': page = <Report id={parts[1]} />; break;
    case 'results': page = <Results />; break;
    case 'about': page = <About />; break;
    default: page = <Empty title="Бет табылмады"><p>Сілтеме дұрыс емес. <a href="#/">Басты бетке оралу</a></p></Empty>;
  }
  const navKey = section === 'report' ? 'notebook' : section;
  return <>
    <a className="skip" href="#main" onClick={e => { e.preventDefault(); mainRef.current?.focus(); }}>Негізгі мазмұнға өту</a>
    <header className="topbar">
      <a href="#/" className="brand" aria-label="QAZCHEM LAB — басты бет"><span className="logo" aria-hidden="true">Q</span><span>QAZCHEM <b>LAB</b></span></a>
      <nav aria-label="Негізгі бөлімдер" className="mainnav">
        {NAV.map(n => <a key={n.key} href={n.href} aria-current={navKey === n.key ? 'page' : undefined}>{n.label}</a>)}
      </nav>
      <div className="modes">
        <div className="seg" role="group" aria-label="Интерфейс режимі">
          <button aria-pressed={s.db.settings.mode === 'student'} onClick={() => s.setSettings({ mode: 'student' })}>Оқушы</button>
          <button aria-pressed={s.db.settings.mode === 'teacher'} onClick={() => s.setSettings({ mode: 'teacher' })}>Мұғалім</button>
        </div>
        <button className="btn ghost small" aria-pressed={s.db.settings.reducedMotion} onClick={() => s.setSettings({ reducedMotion: !s.db.settings.reducedMotion })} title="Сәндік анимацияларды азайту">Қозғалыс: {s.reducedMotion ? 'аз' : 'қалыпты'}</button>
      </div>
    </header>
    {(!s.storageOk || !s.saveOk) && <div className="banner warn" role="alert">Браузер деректерді сақтауға рұқсат бермеді. Жұмыс тек осы бет ашық тұрғанда сақталады — нәтижені дәптерден файлға экспорттаңыз.</div>}
    {s.loadError && <div className="banner warn" role="status">{s.loadError}</div>}
    <main id="main" ref={mainRef} tabIndex={-1}>{page}</main>
    <footer className="foot">
      <p>Деректер тек <b>осы браузерде</b> сақталады; басқа құрылғыға автоматты синхрондалмайды. «Оқушы» мен «Мұғалім» режимдері — интерфейс баптауы, авторизация емес.</p>
      <p>Виртуалды тәжірибелер нақты зертханадағы қауіпсіздік нұсқаулығы мен мұғалім бақылауын алмастырмайды.</p>
    </footer>
  </>;
}

export function App() { return <StoreProvider><Shell /></StoreProvider>; }
