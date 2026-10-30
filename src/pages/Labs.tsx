import { useState } from 'react';
import { useStore } from '../app/store';
import type { ExperimentTemplate } from '../data/experiments';
import { Empty } from '../components/ui';

export function LabCard({ t, n }: { t: ExperimentTemplate; n?: number }) {
  const s = useStore();
  const atts = s.db.attempts.filter(a => a.templateId === t.id);
  const inProg = atts.some(a => !a.completed), done = atts.filter(a => a.completed).length;
  return <article className="labcard card">
    <div className="lc-top">{n !== undefined && <span className="lc-n">{String(n).padStart(2, '0')}</span>}<span className="tag">{t.topic}</span>{t.source === 'teacher' && <span className="tag violet">Мұғалім · v{t.version}</span>}</div>
    <h3 className="h4">{t.title}</h3>
    <p className="muted">{t.goal}</p>
    <div className="lc-foot">
      <span className="status">{inProg ? 'Жалғасуда' : done ? `Аяқталды: ${done}` : 'Басталмаған'}</span>
      <a className="btn small primary" href={'#/lab/' + t.id} aria-label={`${t.title}: ${inProg ? 'жалғастыру' : 'бастау'}`}>{inProg ? 'Жалғастыру' : 'Бастау'}</a>
    </div>
  </article>;
}

export function Labs() {
  const s = useStore();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<'all' | 'builtin' | 'teacher'>('all');
  const list = s.templates.filter(t => (filter === 'all' || t.source === filter) && (t.title + t.topic + t.goal).toLowerCase().includes(q.toLowerCase()));
  return <section className="page">
    <h1>Зертханалық жұмыстар</h1>
    <p className="lead">Әр жұмыс: болжам → құралдарды орналастыру → тәжірибе → өлшеу → бақылау → бағалау → қорытынды.</p>
    <div className="filters">
      <label className="field inline"><span>Іздеу</span><input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="атауы немесе тақырыбы" /></label>
      <div className="seg" role="group" aria-label="Шаблон түрі">
        {([['all', 'Барлығы'], ['builtin', 'Дайын 10 жұмыс'], ['teacher', 'Мұғалім құрастырғандар']] as const).map(([k, l]) => <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>)}
      </div>
    </div>
    {list.length === 0 ? <Empty title="Жұмыс табылмады"><p>{filter === 'teacher' ? 'Мұғалім шаблондары әлі жоқ. «Құрастыру» бөлімінде жасауға болады.' : 'Іздеу сөзін өзгертіп көріңіз.'}</p></Empty>
      : <div className="cards">{list.map((t, i) => <LabCard key={t.id} t={t} n={t.source === 'builtin' ? s.templates.indexOf(t) + 1 : undefined} />)}</div>}
    <p className="muted small" aria-live="polite">{list.length} жұмыс көрсетілді.</p>
  </section>;
}
