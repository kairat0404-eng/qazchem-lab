import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore, go } from '../app/store';
import { MODEL_BY_ID, EQUIPMENT, defaultParams, checkBalance, type ReactionModel, type Action, type Params } from '../lab/engine/index';
import { fmt } from '../lab/engine/chem';
import { UNITS, type ExperimentTemplate, type QuizItem } from '../data/experiments';
import { gradeMCQ, gradeNumeric, stepDone, scoreAttempt } from '../assessment/grade';
import { uid, nowISO, type Attempt } from '../storage/storage';
import { Viewport3D, type Viewport3DHandle } from '../lab/scenes/Viewport3D';
import { buildLabScene } from '../lab/scenes/labScene';
import { Lab2D } from '../lab/scenes/Lab2D';
import { EquationView, MeasureTable, LineChart, Empty, Icon, showValue } from '../components/ui';

const SPEED: Record<string, number> = { conditional: 1, 'model-seconds': 10 };
const CAMERA: Record<string, { theta: number; phi: number; dist: number; target: [number, number, number] }> = {
  titration: { theta: 0.3, phi: 0.25, dist: 6.6, target: [0, 1.35, 0] },
  electrolysis: { theta: 0.15, phi: 0.3, dist: 5.4, target: [0, 1.0, 0] },
  dilution: { theta: 0.2, phi: 0.32, dist: 6.2, target: [0, 0.85, 0] },
};
const DEFAULT_CAM = { theta: 0.2, phi: 0.32, dist: 5.2, target: [0, 0.75, 0] as [number, number, number] };

export function LabPage({ id }: { id?: string }) {
  const s = useStore();
  if (!id) {
    const last = s.db.attempts.find(a => a.id === s.db.lastAttemptId && !a.completed);
    return <section className="page narrow">
      <h1>Виртуалды зертхана</h1>
      {last ? <div className="card"><p>Соңғы ашылған жұмыс: <b>{last.template.title}</b></p><a className="btn primary" href={`#/lab/${last.templateId}`}>Жалғастыру</a></div>
        : <Empty title="Жұмыс таңдалмаған"><p>Зертхананы ашу үшін каталогтан жұмыс таңдаңыз.</p><a className="btn primary" href="#/labs">Жұмыстар каталогы</a></Empty>}
    </section>;
  }
  const tpl = s.getTemplate(id);
  if (!tpl || tpl.deleted) return <section className="page narrow"><Empty title="Жұмыс табылмады"><p>Бұл шаблон жойылған немесе сілтеме қате. <a href="#/labs">Каталогқа оралу</a></p></Empty></section>;
  const attempt = [...s.db.attempts].reverse().find(a => a.templateId === id && !a.completed);
  if (!attempt) return <StartPanel tpl={tpl} />;
  return <Workbench key={attempt.id} initial={attempt} latest={tpl} />;
}

function StartPanel({ tpl }: { tpl: ExperimentTemplate }) {
  const s = useStore();
  const [pred, setPred] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [nick, setNick] = useState(s.db.settings.nickname);
  const m = MODEL_BY_ID[tpl.modelId];
  const done = s.db.attempts.filter(a => a.templateId === tpl.id && a.completed).length;
  const start = () => {
    const params = { ...defaultParams(m.params), ...tpl.params };
    const a: Attempt = {
      id: uid(), templateId: tpl.id, templateVersion: tpl.version, template: JSON.parse(JSON.stringify(tpl)), nickname: nick.trim(),
      createdAt: nowISO(), updatedAt: nowISO(), prediction: pred, predictionNote: note.trim(), params, modelState: m.init(params), simTime: 0,
      placed: [], log: [{ at: nowISO(), text: 'Жұмыс басталды. Болжам: ' + (pred === null ? '—' : tpl.prediction.options[pred]), kind: 'system' }],
      rows: [], observations: [], manualSteps: [], answers: {}, quizSubmitted: false, conclusion: '', teacher: null, completed: false,
    };
    s.setSettings({ nickname: nick.trim() });
    s.upsertAttempt(a);
  };
  return <section className="page narrow">
    <p className="crumb"><a href="#/labs">Жұмыстар</a> / {tpl.topic}</p>
    <h1>{tpl.title}</h1>
    <p className="lead">{tpl.description}</p>
    <div className="grid2">
      <div className="card"><h2 className="h3">Мақсат</h2><p>{tpl.goal}</p><h2 className="h3">Күтілетін нәтиже</h2><p>{tpl.outcome}</p>
        {done > 0 && <p className="muted">Бұл жұмыс бұрын {done} рет аяқталған. Жаңа әрекет бөлек сақталады.</p>}</div>
      <form className="card" onSubmit={e => { e.preventDefault(); if (pred !== null) start(); }}>
        <fieldset><legend className="h3">1-қадам. Болжау: не болады деп ойлайсың?</legend>
          <p>{tpl.prediction.question}</p>
          {tpl.prediction.options.map((o, i) => <label key={i} className="radio"><input type="radio" name="pred" checked={pred === i} onChange={() => setPred(i)} /> {o}</label>)}
        </fieldset>
        <label className="field">Болжамыңды негізде (міндетті емес)<textarea value={note} onChange={e => setNote(e.target.value)} rows={2} maxLength={600} /></label>
        <label className="field">Лақап атың (міндетті емес, тек осы браузерде)<input value={nick} onChange={e => setNick(e.target.value)} maxLength={40} autoComplete="off" /></label>
        <button className="btn primary" disabled={pred === null} type="submit"><Icon name="flask" /> Тәжірибені бастау</button>
        {pred === null && <p className="hint">Бастау үшін болжам нұсқасын таңдаңыз.</p>}
      </form>
    </div>
  </section>;
}

function Workbench({ initial, latest }: { initial: Attempt; latest: ExperimentTemplate }) {
  const s = useStore();
  const tpl = initial.template;
  const m = MODEL_BY_ID[tpl.modelId] as ReactionModel;
  const [a, setA] = useState<Attempt>(initial);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'note'; text: string } | null>(null);
  const [tool, setTool] = useState<string | null>(null);
  const [tab, setTab] = useState<'meas' | 'eq' | 'log' | 'chart'>('meas');
  const [draft, setDraft] = useState<Params>(a.params);
  const [obs, setObs] = useState('');
  const [chartKey, setChartKey] = useState<string>('');
  const vpRef = useRef<Viewport3DHandle>(null);
  const [tNow, setTNow] = useState(0);

  // Сақтау (дебаунс)
  useEffect(() => { const h = setTimeout(() => s.upsertAttempt({ ...a, updatedAt: nowISO() }), 400); return () => clearTimeout(h); }, [a]); // eslint-disable-line

  const params = a.params;
  const state = a.modelState as any;
  const measurements = useMemo(() => m.measure(state, params), [state, params, m]);
  const visual = useMemo(() => m.visual(state, params), [state, params, m]);
  const setupDone = tpl.equipment.every(e => a.placed.includes(e));
  const reached = { ...m.reached(state, params), setup: setupDone, observe: a.observations.length > 0 };
  const pristine = JSON.stringify(state) === JSON.stringify(m.init(params));
  const canRun = m.timeMode !== 'none' && !!m.isRunning?.(state);
  const animate = !s.reducedMotion && (running || visual.vessels.some(v => (v.bubbles || 0) > 0.01));

  // Симуляция циклі: үзілісте күй мүлдем ілгерілемейді
  useEffect(() => {
    if (!running || !m.tick) return;
    let last = performance.now();
    const h = window.setInterval(() => {
      const now = performance.now(); const dt = Math.min(0.25, (now - last) / 1000) * (SPEED[m.timeMode] || 1); last = now;
      setA(p => ({ ...p, modelState: m.tick!(p.modelState, dt, p.params), simTime: p.simTime + dt }));
    }, 100);
    return () => window.clearInterval(h);
  }, [running, m]);
  useEffect(() => { if (!canRun && running) setRunning(false); }, [canRun, running]);
  useEffect(() => { if (s.reducedMotion) return; let raf = 0; const f = () => { setTNow(performance.now() / 1000); raf = requestAnimationFrame(f); }; if (!s.use3D && animate) raf = requestAnimationFrame(f); return () => cancelAnimationFrame(raf); }, [s.use3D, animate, s.reducedMotion]);

  const log = (text: string, kind: Attempt['log'][number]['kind']) => setA(p => ({ ...p, log: [...p.log, { at: nowISO(), text, kind }].slice(-400) }));
  const dispatch = (act: Action, label: string) => {
    if (!setupDone) { const miss = tpl.equipment.filter(e => !a.placed.includes(e)).map(e => EQUIPMENT[e].name).join(', '); setMsg({ kind: 'error', text: `Алдымен құралдарды үстелге орналастырыңыз: ${miss}.` }); return; }
    const r = m.apply(state, act, params);
    if (r.error) { setMsg({ kind: 'error', text: r.error }); log(`${label}: ${r.error}`, 'error'); return; }
    setMsg(r.note ? { kind: 'note', text: r.note } : null);
    setA(p => ({ ...p, modelState: r.state, log: [...p.log, { at: nowISO(), text: `${label}${act.amount ? ` (${fmt(act.amount)})` : ''} → ${r.note || 'орындалды'}`, kind: 'action' as const }].slice(-400) }));
  };
  const place = (eq: string) => {
    if (a.placed.includes(eq)) return;
    setA(p => ({ ...p, placed: [...p.placed, eq], log: [...p.log, { at: nowISO(), text: `${EQUIPMENT[eq].name} үстелге орналастырылды`, kind: 'action' as const }] }));
    setTool(null); setMsg({ kind: 'note', text: `${EQUIPMENT[eq].name} орналастырылды.` });
  };
  const restart = () => {
    setRunning(false);
    setA(p => ({ ...p, modelState: m.init(p.params), simTime: 0, log: [...p.log, { at: nowISO(), text: 'Тәжірибе бастапқы шарттармен қайта басталды.', kind: 'system' as const }] }));
    setMsg({ kind: 'note', text: 'Бастапқы шарттар қалпына келтірілді.' });
  };
  const paramError = m.validateParams!(draft);
  const applyParams = () => {
    if (paramError) return;
    setRunning(false);
    setA(p => ({ ...p, params: { ...draft }, modelState: m.init(draft), simTime: 0, log: [...p.log, { at: nowISO(), text: 'Параметрлер өзгертілді: ' + m.params.map(d => `${d.label} = ${d.options ? d.options.find(o => o.value === draft[d.key])?.label : fmt(draft[d.key])}${d.unit && !d.options ? ' ' + d.unit : ''}`).join('; '), kind: 'system' as const }] }));
  };
  const recordRow = () => {
    const values: Record<string, string | number> = {};
    measurements.forEach(x => { values[x.key] = x.value; });
    m.params.forEach(d => { values['param:' + d.key] = params[d.key]; });
    setA(p => ({ ...p, rows: [...p.rows, { at: nowISO(), simTime: Number(p.simTime.toFixed(2)), values }] }));
    setMsg({ kind: 'note', text: 'Өлшеу дәптерге жазылды.' });
  };
  const addObs = () => {
    if (!obs.trim()) return;
    setA(p => ({ ...p, observations: [...p.observations, { at: nowISO(), text: obs.trim() }], log: [...p.log, { at: nowISO(), text: 'Бақылау жазылды', kind: 'action' as const }] }));
    setObs('');
  };
  const labels: Record<string, string> = Object.fromEntries(measurements.map(x => [x.key, x.label]));
  const numericKeys = Array.from(new Set(a.rows.flatMap(r => Object.keys(r.values).filter(k => !k.startsWith('param:') && typeof r.values[k] === 'number'))));
  const ck = chartKey && numericKeys.includes(chartKey) ? chartKey : numericKeys[0];

  const actions = m.actions;
  const stepsDone = tpl.steps.map(st => stepDone(st, { reached, manualSteps: a.manualSteps, answers: a.answers, quizSubmitted: a.quizSubmitted }));
  const required = tpl.steps.filter(st => st.milestone);
  const allRequired = required.every(st => reached[st.milestone!]);
  const finishMissing = [
    !allRequired && 'барлық негізгі қадамдар',
    a.observations.length === 0 && 'кемінде бір бақылау жазбасы',
    !a.quizSubmitted && 'бағалау тапсырмалары',
    !a.conclusion.trim() && 'қорытынды',
  ].filter(Boolean) as string[];
  const score = scoreAttempt(tpl, { reached, manualSteps: a.manualSteps, answers: a.answers, quizSubmitted: a.quizSubmitted, teacher: a.teacher });

  return <section className="page lab">
    <div className="lab-head">
      <div><p className="crumb"><a href="#/labs">Жұмыстар</a> / {tpl.topic}</p><h1>{tpl.title}</h1></div>
      <div className="toolbar" role="toolbar" aria-label="Тәжірибені басқару">
        {m.timeMode !== 'none' && (running
          ? <button className="btn" onClick={() => setRunning(false)}><Icon name="pause" /> Үзіліс</button>
          : <button className="btn primary" disabled={!canRun} onClick={() => setRunning(true)} title={canRun ? '' : 'Процесті бастау үшін алдымен реагенттерді қосыңыз'}><Icon name="play" /> {a.simTime > 0 ? 'Жалғастыру' : 'Бастау'}</button>)}
        <button className="btn" onClick={restart}><Icon name="reset" /> Қайта бастау</button>
        {s.use3D && <button className="btn" onClick={() => vpRef.current?.resetCamera()}><Icon name="cam" /> Камера</button>}
        <button className="btn ghost" aria-pressed={!s.use3D} disabled={!s.gl} onClick={() => s.setSettings({ force2D: !s.db.settings.force2D })} title={s.gl ? '' : 'Бұл құрылғыда WebGL қолжетімсіз'}>{s.use3D ? '2D режим' : s.gl ? '3D режим' : '2D режим (WebGL жоқ)'}</button>
      </div>
    </div>
    {latest.version !== a.templateVersion && <p className="banner info">Мұғалім шаблонды жаңартты (v{latest.version}). Бұл жұмыс бастапқы v{a.templateVersion} шарттарымен жалғасады.</p>}
    <div aria-live="assertive" className="sr-only">{msg?.kind === 'error' ? msg.text : ''}</div>
    {msg && <div className={'msg ' + msg.kind} role={msg.kind === 'error' ? 'alert' : 'status'}><span>{msg.kind === 'error' ? 'Қате: ' : ''}{msg.text}</span><button className="x" aria-label="Хабарды жабу" onClick={() => setMsg(null)}>×</button></div>}

    <div className="lab-grid">
      <aside className="panel left" aria-label="Құралдар мен реактивтер">
        <h2 className="h4">Құралдар</h2>
        <ul className="tools">
          {tpl.equipment.map(eq => {
            const placed = a.placed.includes(eq);
            return <li key={eq}>
              <button className={'tool' + (tool === eq ? ' sel' : '') + (placed ? ' placed' : '')} aria-pressed={tool === eq} disabled={placed}
                draggable={!placed} onDragStart={e => { e.dataTransfer.setData('text/plain', eq); setTool(eq); }}
                onClick={() => setTool(tool === eq ? null : eq)} title={EQUIPMENT[eq].desc}>
                <span>{EQUIPMENT[eq].name}</span>{placed && <span className="ok"><Icon name="check" size={14} /> үстелде</span>}
              </button>
            </li>;
          })}
        </ul>
        <button className="btn small primary block" disabled={!tool} onClick={() => tool && place(tool)}>{tool ? `«${EQUIPMENT[tool].name}» орналастыру` : 'Құралды таңдаңыз'}</button>
        <p className="hint">Таңда → Орналастыр, немесе құралды үстелге сүйреп апар.</p>

        <h2 className="h4">Реактивтер мен әрекеттер</h2>
        <div className="actions">
          {actions.map(act => act.amounts
            ? <div key={act.id} className="act-group"><span className="act-label">{act.label}</span><div className="amounts">{act.amounts.map(v => <button key={v} data-act={act.id} data-amount={v} className="btn small" onClick={() => dispatch({ id: act.id, amount: v }, act.label)}>+{fmt(v)} {act.unit}</button>)}</div></div>
            : <button key={act.id} data-act={act.id} className="btn small block left" onClick={() => dispatch({ id: act.id }, act.label)}>{act.label}</button>)}
        </div>

        <h2 className="h4">Бастапқы шарттар</h2>
        <form className="params" onSubmit={e => { e.preventDefault(); applyParams(); }}>
          {m.params.map(d => <label key={d.key} className="field compact">
            <span>{d.label}{d.unit && !d.options ? `, ${d.unit}` : ''}</span>
            {d.options
              ? <select value={draft[d.key]} disabled={!pristine} onChange={e => setDraft({ ...draft, [d.key]: Number(e.target.value) })}>{d.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : <span className="range"><input type="range" min={d.min} max={d.max} step={d.step} value={draft[d.key]} disabled={!pristine} onChange={e => setDraft({ ...draft, [d.key]: Number(e.target.value) })} aria-label={d.label} />
                <input type="number" min={d.min} max={d.max} step={d.step} value={draft[d.key]} disabled={!pristine} onChange={e => setDraft({ ...draft, [d.key]: e.target.value === '' ? NaN : Number(e.target.value) })} aria-label={d.label + ' сан мәні'} /></span>}
          </label>)}
          {paramError && <p className="err" role="alert">{paramError}</p>}
          {pristine ? <button className="btn small" type="submit" disabled={!!paramError || JSON.stringify(draft) === JSON.stringify(params)}>Шарттарды қолдану</button>
            : <p className="hint">Тәжірибе басталды — шарттарды өзгерту үшін «Қайта бастау» басыңыз.</p>}
        </form>
      </aside>

      <div className="stage" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const eq = e.dataTransfer.getData('text/plain'); if (tpl.equipment.includes(eq)) place(eq); }}>
        {s.use3D
          ? <Viewport3D ref={vpRef} build={(r, t) => buildLabScene(r, visual, t, { placed: a.placed, reducedMotion: s.reducedMotion, running })} initial={CAMERA[m.id] || DEFAULT_CAM} animate={animate} ariaLabel={`${tpl.title}: зертханалық үстелдің 3D көрінісі`} onFail={s.setGLFailed} version={JSON.stringify(visual) + a.placed.join()} />
          : <Lab2D v={visual} placed={a.placed} t={tNow} reducedMotion={s.reducedMotion} />}
        {a.placed.length === 0 && <div className="stage-hint">Үстел бос. Сол жақтан құралдарды таңдап, орналастырыңыз.</div>}
        {tool && <button className="drop-target" onClick={() => place(tool)}>Осы жерге «{EQUIPMENT[tool].name}» орналастыру</button>}
        {m.timeMode !== 'none' && <div className="stage-badge">{m.timeMode === 'conditional' ? 'Уақыт — шартты шкала' : `Модель уақыты ×${SPEED['model-seconds']} үдетілген`}{running ? ' · жүріп жатыр' : a.simTime > 0 ? ' · үзіліс' : ''}</div>}
      </div>

      <aside className="panel right" aria-label="Мақсат пен кезеңдер">
        <h2 className="h4">Мақсат</h2><p>{tpl.goal}</p>
        <h2 className="h4">Болжамың</h2><p className="pred">{a.prediction === null ? '—' : tpl.prediction.options[a.prediction]}{a.predictionNote && <><br /><span className="muted">{a.predictionNote}</span></>}</p>
        <h2 className="h4">Кезеңдер</h2>
        <ol className="steps">
          {tpl.steps.map((st, i) => <li key={st.id} className={stepsDone[i] ? 'done' : ''}>
            {st.milestone ? <span className="chk" aria-hidden="true">{stepsDone[i] ? '✓' : i + 1}</span>
              : <input type="checkbox" checked={stepsDone[i]} aria-label={'Орындалды: ' + st.text} onChange={e => setA(p => ({ ...p, manualSteps: e.target.checked ? [...p.manualSteps, st.id] : p.manualSteps.filter(x => x !== st.id) }))} />}
            <span>{st.text}{stepsDone[i] && <span className="sr-only"> (орындалды)</span>}</span>
          </li>)}
        </ol>
        <details className="model-info"><summary>Модель және оның шектеулері</summary>
          <p className="muted">Модель: {m.title}, нұсқа {m.version}</p>
          <ul>{m.assumptions.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <p className="h5">Шектеулер</p><ul>{m.limitations.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <p className="h5">Дереккөздер</p><ul>{m.sources.map((x, i) => <li key={i}>{x.url ? <a href={x.url} target="_blank" rel="noreferrer">{x.title}</a> : x.title}{x.note && <span className="muted"> — {x.note}</span>}</li>)}</ul>
        </details>
      </aside>
    </div>

    <div className="tabs" role="tablist" aria-label="Деректер">
      {([['meas', 'Өлшеулер'], ['eq', 'Теңдеу'], ['chart', 'График'], ['log', 'Журнал']] as const).map(([k, l]) => <button key={k} role="tab" id={'tab-' + k} aria-selected={tab === k} aria-controls={'pane-' + k} onClick={() => setTab(k)}>{l}</button>)}
    </div>
    <div className="tabpane card" role="tabpanel" id={'pane-' + tab} aria-labelledby={'tab-' + tab}>
      {tab === 'meas' && <div className="grid2">
        <div><MeasureTable items={measurements} /><button className="btn small primary" onClick={recordRow}><Icon name="plus" /> Өлшеуді дәптерге жазу</button></div>
        <div>{a.rows.length === 0 ? <p className="muted">Әлі жазылған өлшеу жоқ. Нақты сәтте «Өлшеуді дәптерге жазу» батырмасын басыңыз.</p>
          : <div className="scroll-x"><table className="mtable"><thead><tr><th>№</th>{m.timeMode !== 'none' && <th>t</th>}{measurements.filter(x => typeof x.value === 'number').slice(0, 4).map(x => <th key={x.key}>{x.label}</th>)}</tr></thead>
            <tbody>{a.rows.map((r, i) => <tr key={i}><td>{i + 1}</td>{m.timeMode !== 'none' && <td>{fmt(r.simTime)}</td>}{measurements.filter(x => typeof x.value === 'number').slice(0, 4).map(x => <td key={x.key} className="num">{typeof r.values[x.key] === 'number' ? fmt(r.values[x.key] as number) : String(r.values[x.key] ?? '—')}</td>)}</tr>)}</tbody></table></div>}</div>
      </div>}
      {tab === 'eq' && <div>{m.equations.length === 0 ? <p>Бұл жұмыста химиялық реакция жүрмейді: <b>c = n / V</b>, сұйылтуда <b>c₁V₁ = c₂V₂</b>.</p>
        : m.equations.map(eq => { const b = checkBalance(eq); return <div key={eq.id} className="eq-row"><EquationView eq={eq} /><span className={'badge ' + (b.atoms && b.charge ? 'ok' : 'bad')}>{b.atoms && b.charge ? 'атомдар мен заряд теңестірілген' : 'теңестірілмеген'}</span></div>; })}
        <p className="muted small">Теңдеудің теңестірілуі реакцияның шын жүретінін дәлелдемейді — ол тек атомдар мен зарядтың сақталуын көрсетеді.</p></div>}
      {tab === 'chart' && (tpl.modelId === 'titration'
        ? <LineChart points={(state.curve as { V: number; pH: number }[]).map(c => ({ x: c.V, y: c.pH }))} xLabel="V(NaOH), мл" yLabel="pH" yMin={0} yMax={14} />
        : numericKeys.length === 0 ? <p className="muted">График дәптерге жазылған өлшеулерден құрылады. Әртүрлі сәтте немесе әртүрлі шартта бірнеше өлшеу жазыңыз.</p>
          : <div><label className="field inline">Шама: <select value={ck} onChange={e => setChartKey(e.target.value)}>{numericKeys.map(k => <option key={k} value={k}>{labels[k] || k}</option>)}</select></label>
            <LineChart points={a.rows.map((r, i) => ({ x: m.timeMode === 'none' ? i + 1 : r.simTime, y: Number(r.values[ck]) })).filter(p => Number.isFinite(p.y))} xLabel={m.timeMode === 'none' ? 'Өлшеу №' : m.timeMode === 'conditional' ? 'Шартты уақыт' : 'Модель уақыты, с'} yLabel={labels[ck] || ck} /></div>)}
      {tab === 'log' && <ol className="log">{[...a.log].reverse().map((l, i) => <li key={i} className={'l-' + l.kind}><time>{new Date(l.at).toLocaleTimeString('kk-KZ')}</time> {l.text}</li>)}</ol>}
    </div>

    <div className="grid2 below">
      <section className="card">
        <h2 className="h3">Бақылау</h2>
        <p className="muted">{tpl.observationPrompt}</p>
        <label className="field"><span className="sr-only">Бақылау мәтіні</span><textarea rows={3} value={obs} onChange={e => setObs(e.target.value)} maxLength={1500} placeholder="Мысалы: ерітінді түсі әлсіреді, шеге беті қызарды…" /></label>
        <button className="btn small primary" disabled={!obs.trim()} onClick={addObs}>Бақылауды жазу</button>
        {a.observations.length > 0 && <ul className="obs">{a.observations.map((o, i) => <li key={i}>{o.text}</li>)}</ul>}
      </section>
      <section className="card">
        <h2 className="h3">Түсіндіру</h2>
        {a.observations.length > 0 ? <p>{tpl.explanation}</p> : <p className="muted">Түсіндірме бақылау жазылғаннан кейін ашылады: алдымен өзің көргеніңді жаз, содан кейін ғылыми түсіндірмемен салыстыр.</p>}
      </section>
    </div>

    <Quiz tpl={tpl} a={a} setA={setA} />

    <section className="card">
      <h2 className="h3">Қорытынды</h2>
      <p className="muted">{tpl.conclusionPrompt}</p>
      <label className="field"><span className="sr-only">Қорытынды</span><textarea rows={4} value={a.conclusion} onChange={e => setA(p => ({ ...p, conclusion: e.target.value }))} maxLength={3000} disabled={a.completed} /></label>
      {finishMissing.length > 0 ? <p className="hint">Аяқтау үшін қалғаны: {finishMissing.join(', ')}.</p> : null}
      <div className="row">
        <button className="btn primary" disabled={finishMissing.length > 0} onClick={() => { const fin = { ...a, completed: true, updatedAt: nowISO(), log: [...a.log, { at: nowISO(), text: 'Жұмыс аяқталды', kind: 'system' as const }] }; s.upsertAttempt(fin); go('#/notebook/' + a.id); }}><Icon name="check" /> Жұмысты аяқтау</button>
        <a className="btn" href={'#/notebook/' + a.id}>Дәптерде ашу</a>
        <span className="muted">Процедура: {Math.round(score.procedure)} %{score.data !== null ? ` · Деректер: ${Math.round(score.data)} %` : ''}</span>
      </div>
    </section>
  </section>;
}

function Quiz({ tpl, a, setA }: { tpl: ExperimentTemplate; a: Attempt; setA: (f: (p: Attempt) => Attempt) => void }) {
  const set = (q: string, v: Partial<Attempt['answers'][string]>) => setA(p => ({ ...p, answers: { ...p.answers, [q]: { ...p.answers[q], ...v } } }));
  const locked = a.quizSubmitted;
  const allAnswered = tpl.quiz.every(q => { const x = a.answers[q.id] || {}; return q.type === 'mcq' ? x.choice !== undefined : q.type === 'numeric' ? !!x.value?.trim() : !!x.text?.trim(); });
  return <section className="card quiz">
    <h2 className="h3">Бағалау тапсырмалары</h2>
    {tpl.quiz.map((q: QuizItem, i) => {
      const ans = a.answers[q.id] || {};
      const fb = locked && q.type === 'mcq' ? gradeMCQ(q, ans.choice) : locked && q.type === 'numeric' ? gradeNumeric(q, ans.value || '', ans.unit || UNITS[q.family][0].u) : null;
      return <fieldset key={q.id} className="q">
        <legend><b>{i + 1}.</b> {q.prompt}</legend>
        {q.type === 'mcq' && q.options.map((o, k) => <label key={k} className="radio"><input type="radio" name={'q-' + q.id} disabled={locked} checked={ans.choice === k} onChange={() => set(q.id, { choice: k })} /> {o}</label>)}
        {q.type === 'numeric' && <div className="num-ans"><input inputMode="decimal" disabled={locked} value={ans.value || ''} onChange={e => set(q.id, { value: e.target.value })} aria-label="Сандық жауап" placeholder="мысалы 0,05" />
          {q.family !== 'none' && <select disabled={locked} value={ans.unit || UNITS[q.family][0].u} onChange={e => set(q.id, { unit: e.target.value })} aria-label="Өлшем бірлігі">{UNITS[q.family].map(u => <option key={u.u}>{u.u}</option>)}</select>}</div>}
        {q.type === 'open' && <><textarea rows={3} disabled={locked} value={ans.text || ''} onChange={e => set(q.id, { text: e.target.value })} maxLength={2000} aria-label="Ашық жауап" />
          {locked && <p className="fb pending">Бұл жауапты мұғалім рубрика бойынша бағалайды{a.teacher ? ' (бағаланды)' : ' — «Қорытынды тексерілуде»'}.</p>}</>}
        {fb && <p className={'fb ' + (fb.correct ? 'ok' : 'bad')} role="status">{fb.message}</p>}
      </fieldset>;
    })}
    {!locked ? <><button className="btn primary" disabled={!allAnswered} onClick={() => setA(p => ({ ...p, quizSubmitted: true, log: [...p.log, { at: nowISO(), text: 'Бағалау тапсырмалары тапсырылды', kind: 'action' as const }] }))}>Жауаптарды тексеру</button>
      {!allAnswered && <p className="hint">Барлық сұраққа жауап беріңіз.</p>}</> : <p className="muted">Жауаптар тапсырылды. Жаңа әрекет үшін жұмысты қайта бастаңыз.</p>}
    <p className="muted small">Таңдау және сандық жауаптар ереже бойынша автоматты тексеріледі; ашық жауаптарды мұғалім бағалайды.</p>
  </section>;
}

export { showValue };
