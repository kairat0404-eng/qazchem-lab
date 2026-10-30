import { useState } from 'react';
import { useStore } from '../app/store';
import { CONCLUSION_RUBRIC } from '../assessment/grade';
import { nowISO, type Attempt } from '../storage/storage';
import { scoreOf } from './Notebook';
import { Empty } from '../components/ui';

export function Results() {
  const s = useStore();
  const teacher = s.db.settings.mode === 'teacher';
  const [open, setOpen] = useState<string | null>(null);
  const subs = [...s.db.attempts].filter(a => a.quizSubmitted).sort((x, y) => x.updatedAt.localeCompare(y.updatedAt));
  const scored = subs.map(a => ({ a, sc: scoreOf(a) }));
  const pending = scored.filter(x => x.sc.status === 'conclusion-pending').length;
  return <section className="page">
    <h1>Нәтижелер мен бағалау</h1>
    <p className="lead">Таңдау және сандық тапсырмалар ереже бойынша автоматты тексеріледі. Ашық жауаптар мен қорытындыны мұғалім рубрикамен бағалайды. Жиынтық баға тек барлық бөлік бағаланғанда шығады.</p>
    {!teacher && pending > 0 && <p className="banner info">{pending} жұмыстың қорытындысы мұғалім тексеруін күтуде. Мұғалім осы құрылғыда «Мұғалім» режиміне ауысып бағалай алады.</p>}
    {scored.length === 0 ? <Empty title="Әзірге нәтиже жоқ"><p>Нәтиже бағалау тапсырмалары тапсырылғаннан кейін пайда болады. Бастапқыда жалған бағалар көрсетілмейді.</p><a className="btn primary" href="#/labs">Жұмыс бастау</a></Empty> : <>
      <ProgressChart data={scored} />
      <div className="scroll-x"><table className="mtable results">
        <thead><tr><th>Жұмыс</th><th>Оқушы</th><th>Күні</th><th>Процедура</th><th>Деректер</th><th>Қорытынды</th><th>Жиынтық</th>{teacher && <th>Әрекет</th>}</tr></thead>
        <tbody>{scored.map(({ a, sc }) => <tr key={a.id}>
          <th scope="row"><a href={'#/notebook/' + a.id}>{a.template.title}</a></th><td>{a.nickname || '—'}</td><td>{new Date(a.updatedAt).toLocaleDateString('kk-KZ')}</td>
          <td className="num">{Math.round(sc.procedure)} %</td><td className="num">{sc.data === null ? '—' : Math.round(sc.data) + ' %'}</td>
          <td>{sc.conclusion === null ? <span className="tag warn">Қорытынды тексерілуде</span> : Math.round(sc.conclusion) + ' %'}</td>
          <td className="num"><b>{sc.total === null ? '—' : Math.round(sc.total) + ' %'}</b></td>
          {teacher && <td><button className="btn small" aria-expanded={open === a.id} onClick={() => setOpen(open === a.id ? null : a.id)}>{a.teacher ? 'Бағаны өзгерту' : 'Бағалау'}</button></td>}
        </tr>)}</tbody>
      </table></div>
      {teacher && open && <Grader a={s.db.attempts.find(x => x.id === open)!} onDone={() => setOpen(null)} />}
    </>}
    <p className="muted small">Салмақтар (процедура / деректер / қорытынды) әр шаблонда сақталады; оларды мұғалім «Тәжірибе құрастыру» бөлімінде өзгерте алады. Бұл нұсқада мәтінді жасанды интеллект тексермейді.</p>
  </section>;
}

function ProgressChart({ data }: { data: { a: Attempt; sc: ReturnType<typeof scoreOf> }[] }) {
  const W = 640, H = 200, L = 36, B = 28, n = data.length; const bw = Math.min(46, (W - L - 10) / n - 8);
  return <figure className="card chart"><figcaption className="h4">Үлгерім (сақталған орындалулар бойынша)</figcaption>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Үлгерім графигі: ${n} жұмыс`}>
      {[0, 25, 50, 75, 100].map(v => <g key={v}><line x1={L} x2={W - 6} y1={H - B - v / 100 * (H - B - 10)} y2={H - B - v / 100 * (H - B - 10)} className="grid" /><text x={L - 6} y={H - B - v / 100 * (H - B - 10) + 4} textAnchor="end" className="tick">{v}</text></g>)}
      {data.map(({ a, sc }, i) => { const v = sc.total ?? (sc.data !== null ? (sc.procedure * a.template.weights.procedure + sc.data * a.template.weights.data) / (a.template.weights.procedure + a.template.weights.data) : sc.procedure); const x = L + 8 + i * ((W - L - 10) / n); const h = v / 100 * (H - B - 10);
        return <g key={a.id}><rect x={x} y={H - B - h} width={bw} height={h} rx="3" className={sc.total === null ? 'bar partial' : 'bar'} /><text x={x + bw / 2} y={H - 8} textAnchor="middle" className="tick">{i + 1}</text><title>{a.template.title}: {Math.round(v)} %{sc.total === null ? ' (тек бағаланған бөлік)' : ''}</title></g>; })}
    </svg>
    <p className="small muted"><span className="sw solid" /> толық баға · <span className="sw hatched" /> қорытынды әлі бағаланбаған (тек бағаланған бөлік)</p>
  </figure>;
}

function Grader({ a, onDone }: { a: Attempt; onDone: () => void }) {
  const s = useStore();
  const opens = a.template.quiz.filter(q => q.type === 'open') as Extract<Attempt['template']['quiz'][number], { type: 'open' }>[];
  const [rub, setRub] = useState<Record<string, boolean[]>>(a.teacher?.rubric || Object.fromEntries(opens.map(q => [q.id, q.rubric.map(() => false)])));
  const [cr, setCr] = useState<boolean[]>(a.teacher?.conclusionRubric || CONCLUSION_RUBRIC.map(() => false));
  const save = () => { s.update(d => ({ ...d, attempts: d.attempts.map(x => x.id === a.id ? { ...x, teacher: { rubric: rub, conclusionRubric: cr, gradedAt: nowISO() } } : x) })); onDone(); };
  return <section className="card grader" aria-labelledby="gr-h">
    <h2 id="gr-h" className="h3">Рубрика бойынша бағалау: {a.template.title}</h2>
    {opens.map(q => <fieldset key={q.id}><legend>{q.prompt}</legend>
      <blockquote>{a.answers[q.id]?.text || <span className="muted">Жауап жоқ</span>}</blockquote>
      <p className="muted small">Үлгі жауап: {q.sample}</p>
      {q.rubric.map((c, i) => <label key={i} className="check"><input type="checkbox" checked={!!rub[q.id]?.[i]} onChange={e => setRub({ ...rub, [q.id]: q.rubric.map((_, k) => k === i ? e.target.checked : !!rub[q.id]?.[k]) })} /> {c}</label>)}
    </fieldset>)}
    <fieldset><legend>Қорытынды</legend><blockquote>{a.conclusion || <span className="muted">Қорытынды жазылмаған</span>}</blockquote>
      {CONCLUSION_RUBRIC.map((c, i) => <label key={i} className="check"><input type="checkbox" checked={cr[i]} onChange={e => setCr(cr.map((v, k) => k === i ? e.target.checked : v))} /> {c}</label>)}</fieldset>
    <div className="row"><button className="btn primary" onClick={save}>Бағаны сақтау</button><button className="btn" onClick={onDone}>Бас тарту</button></div>
  </section>;
}
