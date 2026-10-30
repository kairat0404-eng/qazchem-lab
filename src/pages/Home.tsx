import { useStore } from '../app/store';
import { MoleculeViewer } from '../lab/scenes/models3d';
import { LabCard } from './Labs';
import { Icon } from '../components/ui';

export function Home() {
  const s = useStore();
  const last = s.db.attempts.find(a => a.id === s.db.lastAttemptId);
  const builtins = s.templates.filter(t => t.source === 'builtin');
  return <div className="page home">
    <section className="hero">
      <div className="hero-text">
        <p className="eyebrow">Қазақ тіліндегі интерактивті виртуалды зертхана</p>
        <h1>Химияны көр. Тәжірибе жаса. Түсін.</h1>
        <p className="lead">Болжам жаса, параметрлерді өзгерт, нәтижені өлшеп, ғылыми қорытынды шығар. Әр тәжірибенің артында тексерілген есептеу моделі тұр.</p>
        <div className="row">
          <a className="btn primary lg" href="#/labs"><Icon name="flask" /> Тәжірибені бастау</a>
          <a className="btn lg" href="#/table"><Icon name="table" /> Периодтық кесте</a>
        </div>
      </div>
      <div className="hero-3d card">
        <MoleculeViewer use3D={s.use3D} reducedMotion={s.reducedMotion} onFail={s.setGLFailed} />
        <p className="hint">{s.use3D ? 'Тінтуірмен сүйреп бұраңыз, дөңгелекпен үлкейтіңіз (немесе бағыт пернелері мен + / −).' : '2D балама көрініс: бұл құрылғыда 3D қолжетімсіз.'}</p>
      </div>
    </section>

    <section aria-labelledby="flow-h">
      <h2 id="flow-h" className="h3">Оқу реті</h2>
      <ol className="flow">
        {[['Болжау', 'Не болатынын алдын ала айт'], ['Тәжірибе', 'Құралдарды орналастырып, реактивтерді қос'], ['Бақылау', 'Өлшеп, көргеніңді дәптерге жаз'], ['Қорытынды', 'Нәтижені болжаммен салыстырып, түсіндір']].map(([h, p], i) =>
          <li key={h}><span className="n">{i + 1}</span><b>{h}</b><span>{p}</span></li>)}
      </ol>
    </section>

    {last && <section className="card continue" aria-labelledby="cont-h">
      <div><h2 id="cont-h" className="h4">Соңғы ашылған жұмыс</h2><p><b>{last.template.title}</b> · {last.completed ? 'аяқталған' : 'жалғасуда'} · {new Date(last.updatedAt).toLocaleString('kk-KZ')}</p></div>
      {last.completed ? <a className="btn" href={'#/notebook/' + last.id}>Дәптерде қарау</a> : <a className="btn primary" href={'#/lab/' + last.templateId}>Жалғастыру</a>}
    </section>}

    <section aria-labelledby="labs-h">
      <h2 id="labs-h" className="h3">10 зертханалық жұмыс</h2>
      <div className="cards">{builtins.map((t, i) => <LabCard key={t.id} t={t} n={i + 1} />)}</div>
    </section>
  </div>;
}
