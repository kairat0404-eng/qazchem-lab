import { useRef, useState } from 'react';
import { useStore, go } from '../app/store';
import { MODEL_BY_ID, type ReactionModel } from '../lab/engine/index';
import { fmt } from '../lab/engine/chem';
import { attemptToJSON, parseAttemptFile, rowsToCSV, download, inViewer } from '../storage/io';
import { scoreAttempt, stepDone, gradeMCQ, gradeNumeric } from '../assessment/grade';
import { UNITS } from '../data/experiments';
import { uid, type Attempt } from '../storage/storage';
import { Empty, Icon, MeasureTable, EquationView } from '../components/ui';

export function reachedOf(a: Attempt) {
  const m = MODEL_BY_ID[a.template.modelId];
  return { ...m.reached(a.modelState as any, a.params), setup: a.template.equipment.every(e => a.placed.includes(e)), observe: a.observations.length > 0 };
}
export function scoreOf(a: Attempt) { return scoreAttempt(a.template, { reached: reachedOf(a), manualSteps: a.manualSteps, answers: a.answers, quizSubmitted: a.quizSubmitted, teacher: a.teacher }); }
const slug = (s: string) => s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 40);
function labelsOf(a: Attempt) { const m = MODEL_BY_ID[a.template.modelId]; const o: Record<string, string> = Object.fromEntries(m.measure(a.modelState as any, a.params).map(x => [x.key, x.label])); m.params.forEach(d => { o['param:' + d.key] = d.label + (d.unit ? `, ${d.unit}` : ''); }); return o; }
export function exportCSV(a: Attempt) { download(`qazchem-${slug(a.template.title)}-olsheuler.csv`, rowsToCSV(a.rows, labelsOf(a)), 'text/csv;charset=utf-8'); }
export function exportJSON(a: Attempt) { download(`qazchem-${slug(a.template.title)}-${a.id}.json`, attemptToJSON(a), 'application/json'); }

export function Notebook({ id }: { id?: string }) {
  const s = useStore();
  const [sel, setSel] = useState<string[]>([]);
  const [importMsg, setImportMsg] = useState<{ ok: boolean; text: string[] } | null>(null);
  const [undo, setUndo] = useState<Attempt | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  if (id) { const a = s.db.attempts.find(x => x.id === id); return a ? <AttemptDetail a={a} /> : <section className="page narrow"><Empty title="Жазба табылмады"><p><a href="#/notebook">Дәптерге оралу</a></p></Empty></section>; }
  const list = [...s.db.attempts].sort((x, y) => y.updatedAt.localeCompare(x.updatedAt));
  const remove = (a: Attempt) => { s.update(d => ({ ...d, attempts: d.attempts.filter(x => x.id !== a.id), lastAttemptId: d.lastAttemptId === a.id ? null : d.lastAttemptId })); setUndo(a); setSel(sel.filter(x => x !== a.id)); };
  const onImport = async (f: File) => {
    const r = parseAttemptFile(await f.text());
    if (!r.attempt) { setImportMsg({ ok: false, text: r.errors }); return; }
    const exists = s.db.attempts.some(x => x.id === r.attempt!.id);
    const a = exists ? { ...r.attempt, id: uid() } : r.attempt;
    s.update(d => ({ ...d, attempts: [...d.attempts, a] }));
    setImportMsg({ ok: true, text: [`«${a.template.title}» жұмысы импортталды${exists ? ' (көшірме ретінде)' : ''}.`] });
  };
  const cmp = sel.map(x => s.db.attempts.find(a => a.id === x)!).filter(Boolean);
  return <section className="page">
    <h1>Менің зертханалық дәптерім</h1>
    <p className="lead">Барлық әрекеттер осы браузерде сақталады. Басқа құрылғыға көшіру үшін JSON-ға экспорттап, сол жерде импорттаңыз.</p>
    <div className="row">
      <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" /> Жұмысты импорттау (JSON)</button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
      {sel.length > 0 && <span className="muted">Салыстыру үшін таңдалды: {sel.length}/2</span>}
    </div>
    {importMsg && <div className={'msg ' + (importMsg.ok ? 'note' : 'error')} role={importMsg.ok ? 'status' : 'alert'}><div>{importMsg.ok ? '' : 'Импорт қабылданбады — бар деректер өзгерген жоқ:'}<ul>{importMsg.text.map((t, i) => <li key={i}>{t}</li>)}</ul></div><button className="x" aria-label="Жабу" onClick={() => setImportMsg(null)}>×</button></div>}
    {undo && <div className="msg note" role="status"><span>«{undo.template.title}» жазбасы жойылды.</span><button className="btn small" onClick={() => { s.update(d => ({ ...d, attempts: [...d.attempts, undo] })); setUndo(null); }}>Қайтару</button></div>}
    {list.length === 0 ? <Empty title="Дәптер әзірге бос"><p>Жұмысты бастағанда болжам, өлшеулер мен қорытынды осында жазылады.</p><a className="btn primary" href="#/labs">Жұмыс таңдау</a></Empty>
      : <ul className="nb-list">{list.map(a => { const sc = scoreOf(a); const chosen = sel.includes(a.id);
        return <li key={a.id} className="card nb-item">
          <label className="cmp"><input type="checkbox" checked={chosen} disabled={!chosen && sel.length >= 2} onChange={e => setSel(e.target.checked ? [...sel, a.id] : sel.filter(x => x !== a.id))} /> <span className="sr-only">Салыстыруға таңдау</span></label>
          <div className="nb-main"><h2 className="h4"><a href={'#/notebook/' + a.id}>{a.template.title}</a></h2>
            <p className="muted small">{a.nickname || 'Лақап атсыз'} · шаблон v{a.templateVersion} · {new Date(a.updatedAt).toLocaleString('kk-KZ')} · өлшеулер: {a.rows.length} · <b>{a.completed ? 'аяқталған' : 'жалғасуда'}</b></p>
            <p className="small">Процедура {Math.round(sc.procedure)} %{sc.data !== null && ` · Деректер ${Math.round(sc.data)} %`} · {sc.status === 'graded' ? `Жиынтық: ${Math.round(sc.total!)} %` : sc.status === 'conclusion-pending' ? 'Қорытынды тексерілуде' : 'Тапсырмалар тапсырылмаған'}</p></div>
          <div className="nb-act">
            {!a.completed && <a className="btn small primary" href={'#/lab/' + a.templateId}>Жалғастыру</a>}
            <a className="btn small" href={'#/report/' + a.id}><Icon name="print" /> Есеп</a>
            <button className="btn small" onClick={() => exportCSV(a)} disabled={a.rows.length === 0}>CSV</button>
            <button className="btn small" onClick={() => exportJSON(a)}>JSON</button>
            <button className="btn small ghost" onClick={() => remove(a)} aria-label={'Жою: ' + a.template.title}><Icon name="trash" /></button>
          </div>
        </li>; })}</ul>}
    {cmp.length === 2 && <Compare a={cmp[0]} b={cmp[1]} />}
  </section>;
}

function Compare({ a, b }: { a: Attempt; b: Attempt }) {
  const ma = MODEL_BY_ID[a.template.modelId], mb = MODEL_BY_ID[b.template.modelId];
  if (ma.id !== mb.id) return <div className="card"><h2 className="h3">Салыстыру</h2><p>Тек бір модельге негізделген жұмыстарды салыстыруға болады.</p></div>;
  const A = ma.measure(a.modelState as any, a.params), B = mb.measure(b.modelState as any, b.params);
  const show = (v: unknown) => typeof v === 'number' ? fmt(v) : String(v);
  return <section className="card" aria-labelledby="cmp-h"><h2 id="cmp-h" className="h3">Әрекеттерді салыстыру: {a.template.title}</h2>
    <div className="scroll-x"><table className="mtable"><thead><tr><th>Шама</th><th>1-әрекет ({new Date(a.createdAt).toLocaleDateString('kk-KZ')})</th><th>2-әрекет ({new Date(b.createdAt).toLocaleDateString('kk-KZ')})</th></tr></thead>
      <tbody>{ma.params.map(d => <tr key={d.key}><th>{d.label}</th><td>{d.options ? d.options.find(o => o.value === a.params[d.key])?.label : fmt(a.params[d.key]) + ' ' + d.unit}</td><td>{d.options ? d.options.find(o => o.value === b.params[d.key])?.label : fmt(b.params[d.key]) + ' ' + d.unit}</td></tr>)}
        {A.map((x, i) => <tr key={x.key}><th>{x.label}</th><td className="num">{show(x.value)} {typeof x.value === 'number' ? x.unit : ''}</td><td className="num">{show(B[i]?.value)} {typeof B[i]?.value === 'number' ? B[i].unit : ''}</td></tr>)}
      </tbody></table></div></section>;
}

function AttemptDetail({ a }: { a: Attempt }) {
  const m = MODEL_BY_ID[a.template.modelId]; const t = a.template; const sc = scoreOf(a); const r = reachedOf(a);
  return <section className="page narrow">
    <p className="crumb"><a href="#/notebook">Дәптер</a> / {t.title}</p>
    <h1>{t.title}</h1>
    <p className="muted">{a.nickname || 'Лақап атсыз'} · шаблон v{a.templateVersion} · басталды {new Date(a.createdAt).toLocaleString('kk-KZ')} · {a.completed ? 'аяқталған' : 'жалғасуда'}</p>
    <div className="row">
      {!a.completed ? <a className="btn primary" href={'#/lab/' + a.templateId}>Жалғастыру</a> : <button className="btn primary" onClick={() => go('#/lab/' + a.templateId)}>Жаңа әрекет бастау</button>}
      <a className="btn" href={'#/report/' + a.id}><Icon name="print" /> Басып шығаруға арналған есеп</a>
      <button className="btn" disabled={a.rows.length === 0} onClick={() => exportCSV(a)}><Icon name="download" /> Өлшеулер (CSV)</button>
      <button className="btn" onClick={() => exportJSON(a)}><Icon name="download" /> Жұмыс деректері (JSON)</button>
    </div>
    <ReportBody a={a} m={m} r={r} sc={sc} />
  </section>;
}

function ReportBody({ a, m, r, sc }: { a: Attempt; m: ReactionModel; r: Record<string, boolean>; sc: ReturnType<typeof scoreOf> }) {
  const t = a.template;
  const partial = sc.data !== null ? (sc.procedure * t.weights.procedure + sc.data * t.weights.data) / (t.weights.procedure + t.weights.data) : null;
  return <div className="report">
    <section><h2 className="h3">Болжам</h2><p>{t.prediction.question}<br /><b>{a.prediction === null ? '—' : t.prediction.options[a.prediction]}</b>{a.predictionNote && <><br />{a.predictionNote}</>}</p></section>
    <section><h2 className="h3">Бастапқы шарттар</h2><ul>{m.params.map((d: any) => <li key={d.key}>{d.label}: {d.options ? d.options.find((o: any) => o.value === a.params[d.key])?.label : `${fmt(a.params[d.key])} ${d.unit}`}</li>)}</ul></section>
    <section><h2 className="h3">Теңдеулер</h2>{m.equations.length ? m.equations.map((eq: any) => <EquationView key={eq.id} eq={eq} />) : <p>c = n / V; c₁V₁ = c₂V₂</p>}</section>
    <section><h2 className="h3">Кезеңдер</h2><ol>{t.steps.map(st => <li key={st.id}>{stepDone(st, { reached: r, manualSteps: a.manualSteps, answers: a.answers, quizSubmitted: a.quizSubmitted }) ? '✓ ' : '○ '}{st.text}</li>)}</ol></section>
    <section><h2 className="h3">Соңғы күй</h2><MeasureTable items={m.measure(a.modelState, a.params)} /></section>
    <section><h2 className="h3">Жазылған өлшеулер</h2>{a.rows.length === 0 ? <p className="muted">Жазылған өлшеу жоқ.</p> : <div className="scroll-x"><table className="mtable"><thead><tr><th>№</th><th>t</th>{Object.keys(a.rows[0].values).filter(k => !k.startsWith('param:')).slice(0, 6).map(k => <th key={k}>{labelsOf(a)[k] || k}</th>)}</tr></thead>
      <tbody>{a.rows.map((row, i) => <tr key={i}><td>{i + 1}</td><td>{fmt(row.simTime)}</td>{Object.keys(a.rows[0].values).filter(k => !k.startsWith('param:')).slice(0, 6).map(k => <td key={k} className="num">{typeof row.values[k] === 'number' ? fmt(row.values[k] as number) : String(row.values[k] ?? '')}</td>)}</tr>)}</tbody></table></div>}</section>
    <section><h2 className="h3">Бақылаулар</h2>{a.observations.length ? <ul>{a.observations.map((o, i) => <li key={i}>{o.text}</li>)}</ul> : <p className="muted">Жоқ.</p>}</section>
    <section><h2 className="h3">Тапсырмалар</h2>{t.quiz.map((q, i) => { const ans = a.answers[q.id] || {};
      const fb = !a.quizSubmitted ? null : q.type === 'mcq' ? gradeMCQ(q, ans.choice) : q.type === 'numeric' ? gradeNumeric(q, ans.value || '', ans.unit || UNITS[q.family][0].u) : null;
      return <div key={q.id} className="q-rep"><p><b>{i + 1}.</b> {q.prompt}</p><p>Жауап: {q.type === 'mcq' ? (ans.choice !== undefined ? q.options[ans.choice] : '—') : q.type === 'numeric' ? `${ans.value || '—'} ${q.family !== 'none' ? ans.unit || UNITS[q.family][0].u : ''}` : ans.text || '—'}</p>
        {fb && <p className={'fb ' + (fb.correct ? 'ok' : 'bad')}>{fb.correct ? 'Дұрыс' : 'Дұрыс емес'}</p>}{q.type === 'open' && a.quizSubmitted && <p className="fb pending">{a.teacher ? 'Мұғалім бағалады' : 'Мұғалім тексеруінде'}</p>}</div>; })}</section>
    <section><h2 className="h3">Қорытынды</h2><p>{a.conclusion || <span className="muted">Жазылмаған.</span>}</p></section>
    <section><h2 className="h3">Бағалау</h2><ul>
      <li>Процедура: {Math.round(sc.procedure)} % (салмағы {t.weights.procedure} %)</li>
      <li>Деректерді талдау: {sc.data === null ? 'тапсырылмаған' : Math.round(sc.data) + ' %'} (салмағы {t.weights.data} %)</li>
      <li>Қорытынды: {sc.conclusion === null ? 'Қорытынды тексерілуде' : Math.round(sc.conclusion) + ' %'} (салмағы {t.weights.conclusion} %)</li>
      <li><b>{sc.status === 'graded' ? `Жиынтық баға: ${Math.round(sc.total!)} %` : sc.status === 'conclusion-pending' ? `Жиынтық баға әлі жоқ. Бағаланған бөлік: ${Math.round(partial!)} %` : 'Бағалау тапсырмалары тапсырылмаған'}</b></li></ul></section>
    <section className="small muted"><h2 className="h4">Модель шектеулері</h2><ul>{m.limitations.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul></section>
  </div>;
}

export function Report({ id }: { id?: string }) {
  const s = useStore();
  const a = s.db.attempts.find(x => x.id === id);
  if (!a) return <section className="page narrow"><Empty title="Есеп табылмады"><p><a href="#/notebook">Дәптерге оралу</a></p></Empty></section>;
  const m = MODEL_BY_ID[a.template.modelId];
  const saveHtml = () => {
    const el = document.getElementById('report-root'); if (!el) return;
    const css = Array.from(document.querySelectorAll('style')).map(x => x.textContent).join('\n');
    const body = el.cloneNode(true) as HTMLElement; body.querySelectorAll('.no-print').forEach(n => n.remove());
    download(`qazchem-esep-${a.id}.html`, `<!doctype html><html lang="kk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${a.template.title} — есеп</title><style>${css}</style></head><body class="print-doc"><main>${body.outerHTML}</main><script>window.onload=function(){window.print()}</script></body></html>`, 'text/html');
  };
  return <section className="page narrow printable" id="report-root">
    <div className="row no-print"><a className="btn" href={'#/notebook/' + a.id}>← Дәптерге</a>
      {inViewer() ? <><button className="btn primary" onClick={saveHtml}><Icon name="download" /> Есепті файл ретінде сақтау</button><span className="muted small">Сақталған файлды браузерде ашқанда басып шығару терезесі ашылады (PDF ретінде сақтауға болады).</span></>
        : <button className="btn primary" onClick={() => window.print()}><Icon name="print" /> Басып шығару / PDF ретінде сақтау</button>}</div>
    <header className="rep-head"><p className="eyebrow">QAZCHEM LAB · зертханалық жұмыс есебі</p><h1>{a.template.title}</h1>
      <p>Оқушы: {a.nickname || '________________'} · Күні: {new Date(a.updatedAt).toLocaleDateString('kk-KZ')} · Шаблон нұсқасы: v{a.templateVersion} · Модель: {m.title} v{m.version}</p></header>
    <ReportBody a={a} m={m} r={reachedOf(a)} sc={scoreOf(a)} />
  </section>;
}
