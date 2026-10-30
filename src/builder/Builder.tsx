import { useMemo, useRef, useState } from 'react';
import { useStore, go } from '../app/store';
import { MODEL_BY_ID, EQUIPMENT, defaultParams } from '../lab/engine/index';
import { fmt } from '../lab/engine/chem';
import { BUILTIN, UNITS, SPECIAL_MILESTONES, type ExperimentTemplate, type QuizItem, type UnitFamily } from '../data/experiments';
import { validateTemplate, templateToJSON, parseTemplateFile, download } from '../storage/io';
import { uid, nowISO } from '../storage/storage';
import { Empty, Icon } from '../components/ui';

export function Builder({ id }: { id?: string }) {
  const s = useStore();
  const teacher = s.db.settings.mode === 'teacher';
  if (!teacher) return <section className="page narrow"><h1>Тәжірибе құрастыру</h1>
    <Empty title="Бұл бөлім мұғалім режимінде ашылады"><p>Жоғарғы жолақтағы «Мұғалім» батырмасын басыңыз. Бұл — интерфейс баптауы ғана; деректер осы браузерде сақталады.</p>
      <button className="btn primary" onClick={() => s.setSettings({ mode: 'teacher' })}>Мұғалім режиміне ауысу</button></Empty></section>;
  if (id) { const t = s.db.templates.find(x => x.id === id); return t ? <Editor key={t.id + t.version} initial={t} /> : <section className="page narrow"><Empty title="Шаблон табылмады"><p><a href="#/builder">Тізімге оралу</a></p></Empty></section>; }
  return <BuilderList />;
}

function BuilderList() {
  const s = useStore();
  const [base, setBase] = useState(BUILTIN[0].id);
  const [msg, setMsg] = useState<{ ok: boolean; text: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mine = s.db.templates.filter(t => !t.deleted), trash = s.db.templates.filter(t => t.deleted);
  const create = (src: ExperimentTemplate, suffix: string) => {
    const t: ExperimentTemplate = { ...JSON.parse(JSON.stringify(src)), id: 't-' + uid(), version: 1, source: 'teacher', baseId: src.baseId || src.id, title: src.title + suffix, updatedAt: nowISO(), deleted: false };
    s.update(d => ({ ...d, templates: [...d.templates, t] })); go('#/builder/' + t.id);
  };
  const setDeleted = (id: string, deleted: boolean) => s.update(d => ({ ...d, templates: d.templates.map(t => t.id === id ? { ...t, deleted } : t) }));
  const onImport = async (f: File) => {
    const r = parseTemplateFile(await f.text());
    if (!r.template) { setMsg({ ok: false, text: r.errors }); return; }
    const exists = s.db.templates.some(t => t.id === r.template!.id) || BUILTIN.some(t => t.id === r.template!.id);
    const t = { ...r.template, id: exists ? 't-' + uid() : r.template.id, updatedAt: nowISO() };
    s.update(d => ({ ...d, templates: [...d.templates, t] }));
    setMsg({ ok: true, text: [`«${t.title}» шаблоны импортталды${exists ? ' (жаңа көшірме ретінде)' : ''}.`] });
  };
  return <section className="page">
    <h1>Тәжірибе құрастыру</h1>
    <p className="lead">Тексерілген 10 модельдің бірін негізге алып, мақсатын, бастапқы шарттарын, кезеңдерін және тапсырмаларын өз сыныбыңызға бейімдеңіз.</p>
    <div className="card row wrap">
      <label className="field inline"><span>Негізгі модель</span><select value={base} onChange={e => setBase(e.target.value)}>{BUILTIN.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
      <button className="btn primary" onClick={() => create(BUILTIN.find(t => t.id === base)!, ' (бейімделген)')}><Icon name="plus" /> Жаңа шаблон</button>
      <button className="btn" onClick={() => fileRef.current?.click()}><Icon name="upload" /> JSON импорттау</button>
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
    </div>
    <p className="banner info">Жаңа химиялық теңдеу еркін мәтінмен жазылса, ол автоматты түрде симуляцияға айналмайды: атомдар мен зарядтардың теңдігі реакцияның шын жүретінін дәлелдемейді. Жаңа реакция үшін бөлек ғылыми тексеру және бағдарламалық модель қажет.</p>
    {msg && <div className={'msg ' + (msg.ok ? 'note' : 'error')} role={msg.ok ? 'status' : 'alert'}><div>{!msg.ok && 'Импорт қабылданбады:'}<ul>{msg.text.map((t, i) => <li key={i}>{t}</li>)}</ul></div><button className="x" aria-label="Жабу" onClick={() => setMsg(null)}>×</button></div>}
    <h2 className="h3">Менің шаблондарым</h2>
    {mine.length === 0 ? <Empty title="Әзірге шаблон жоқ"><p>Жоғарыдан негізгі модельді таңдап, «Жаңа шаблон» басыңыз.</p></Empty>
      : <ul className="nb-list">{mine.map(t => <li key={t.id} className="card nb-item">
        <div className="nb-main"><h3 className="h4"><a href={'#/builder/' + t.id}>{t.title}</a></h3><p className="muted small">Модель: {MODEL_BY_ID[t.modelId].title} · нұсқа v{t.version} · {t.updatedAt ? new Date(t.updatedAt).toLocaleString('kk-KZ') : ''}</p></div>
        <div className="nb-act">
          <a className="btn small primary" href={'#/builder/' + t.id}>Өңдеу</a>
          <a className="btn small" href={'#/lab/' + t.id}>Оқушы ретінде ашу</a>
          <button className="btn small" onClick={() => create(t, ' (көшірме)')}><Icon name="copy" /> Көшірме</button>
          <button className="btn small" onClick={() => download(`qazchem-shablon-${t.id}-v${t.version}.json`, templateToJSON(t), 'application/json')}><Icon name="download" /> JSON</button>
          <button className="btn small ghost" onClick={() => setDeleted(t.id, true)} aria-label={'Жою: ' + t.title}><Icon name="trash" /></button>
        </div></li>)}</ul>}
    {trash.length > 0 && <details className="card"><summary>Жойылғандар ({trash.length}) — қайтаруға болады</summary>
      <ul>{trash.map(t => <li key={t.id} className="row">{t.title} <button className="btn small" onClick={() => setDeleted(t.id, false)}>Қайтару</button></li>)}</ul></details>}
  </section>;
}

function Editor({ initial }: { initial: ExperimentTemplate }) {
  const s = useStore();
  const [t, setT] = useState<ExperimentTemplate>(initial);
  const [saved, setSaved] = useState<string | null>(null);
  const m = MODEL_BY_ID[t.modelId];
  const errors = useMemo(() => validateTemplate(t), [t]);
  const dirty = JSON.stringify(t) !== JSON.stringify(initial);
  const used = s.db.attempts.some(a => a.templateId === t.id);
  const set = <K extends keyof ExperimentTemplate>(k: K, v: ExperimentTemplate[K]) => setT(p => ({ ...p, [k]: v }));
  const params = { ...defaultParams(m.params), ...t.params };
  const milestoneOpts = [...SPECIAL_MILESTONES, ...m.milestones];

  const save = (andPreview = false) => {
    if (errors.length) return;
    const next: ExperimentTemplate = { ...t, version: dirty ? initial.version + 1 : initial.version, updatedAt: nowISO() };
    s.update(d => ({ ...d, templates: d.templates.map(x => x.id === t.id ? next : x), templateHistory: dirty ? [...d.templateHistory, initial].slice(-200) : d.templateHistory }));
    setSaved(`Сақталды: нұсқа v${next.version}.${used ? ' Бұрын басталған жұмыстар өз нұсқасымен жалғасады.' : ''}`);
    if (andPreview) go('#/lab/' + t.id); else go('#/builder/' + t.id);
  };
  const moveStep = (i: number, d: number) => { const st = [...t.steps]; const j = i + d; if (j < 0 || j >= st.length) return; [st[i], st[j]] = [st[j], st[i]]; set('steps', st); };
  const setQ = (i: number, q: QuizItem) => set('quiz', t.quiz.map((x, k) => k === i ? q : x));
  const history = s.db.templateHistory.filter(h => h.id === t.id);

  return <section className="page builder">
    <p className="crumb"><a href="#/builder">Құрастыру</a> / {initial.title}</p>
    <h1>Шаблонды өңдеу <span className="tag violet">v{initial.version}{dirty ? ' → v' + (initial.version + 1) : ''}</span></h1>
    <p className="muted">Негізгі модель: <b>{m.title}</b> (v{m.version}). Модельдің теңдеулері мен есептеу логикасы өзгермейді.</p>
    {saved && <p className="msg note" role="status">{saved}</p>}

    <div className="builder-grid">
      <div>
        <fieldset className="card"><legend className="h3">Негізгі мәлімет</legend>
          <label className="field">Атауы<input value={t.title} onChange={e => set('title', e.target.value)} maxLength={140} /></label>
          <label className="field">Тақырып<input value={t.topic} onChange={e => set('topic', e.target.value)} maxLength={140} /></label>
          <label className="field">Оқу мақсаты<textarea rows={2} value={t.goal} onChange={e => set('goal', e.target.value)} /></label>
          <label className="field">Күтілетін нәтиже<textarea rows={2} value={t.outcome} onChange={e => set('outcome', e.target.value)} /></label>
          <label className="field">Сипаттама<textarea rows={3} value={t.description} onChange={e => set('description', e.target.value)} /></label>
        </fieldset>

        <fieldset className="card"><legend className="h3">Болжам сұрағы</legend>
          <label className="field">Сұрақ<input value={t.prediction.question} onChange={e => set('prediction', { ...t.prediction, question: e.target.value })} /></label>
          {t.prediction.options.map((o, i) => <div key={i} className="row"><input aria-label={`${i + 1}-нұсқа`} value={o} onChange={e => set('prediction', { ...t.prediction, options: t.prediction.options.map((x, k) => k === i ? e.target.value : x) })} />
            <button className="btn small ghost" disabled={t.prediction.options.length <= 2} onClick={() => set('prediction', { ...t.prediction, options: t.prediction.options.filter((_, k) => k !== i) })} aria-label="Нұсқаны жою"><Icon name="trash" /></button></div>)}
          <button className="btn small" disabled={t.prediction.options.length >= 5} onClick={() => set('prediction', { ...t.prediction, options: [...t.prediction.options, 'Жаңа нұсқа'] })}><Icon name="plus" /> Нұсқа қосу</button>
        </fieldset>

        <fieldset className="card"><legend className="h3">Құралдар мен бастапқы шарттар</legend>
          <p className="muted small">Модельге қажетті құралдар: {m.equipment.map(e => EQUIPMENT[e].name).join(', ')}. Модельге сәйкес келмейтін құрал қосылмайды.</p>
          {m.params.map(d => <label key={d.key} className="field compact"><span>{d.label}{d.unit && !d.options ? ` (${fmt(d.min)}–${fmt(d.max)} ${d.unit})` : ''}</span>
            {d.options ? <select value={params[d.key]} onChange={e => set('params', { ...t.params, [d.key]: Number(e.target.value) })}>{d.options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              : <input type="number" step={d.step || 'any'} value={params[d.key]} onChange={e => set('params', { ...t.params, [d.key]: e.target.value === '' ? NaN : Number(e.target.value) })} />}</label>)}
        </fieldset>

        <fieldset className="card"><legend className="h3">Кезеңдер (4–7 ұсынылады)</legend>
          <ol className="edit-steps">{t.steps.map((st, i) => <li key={st.id}>
            <textarea rows={2} aria-label={`${i + 1}-кезең мәтіні`} value={st.text} onChange={e => set('steps', t.steps.map((x, k) => k === i ? { ...x, text: e.target.value } : x))} />
            <div className="row">
              <label className="field inline"><span>Тексеру</span><select value={st.milestone || ''} onChange={e => set('steps', t.steps.map((x, k) => k === i ? { ...x, milestone: e.target.value || undefined } : x))}>
                <option value="">оқушы өзі белгілейді</option>{milestoneOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
              <button className="btn small ghost" onClick={() => moveStep(i, -1)} disabled={i === 0} aria-label="Жоғары жылжыту"><Icon name="up" /></button>
              <button className="btn small ghost" onClick={() => moveStep(i, 1)} disabled={i === t.steps.length - 1} aria-label="Төмен жылжыту"><Icon name="down" /></button>
              <button className="btn small ghost" onClick={() => set('steps', t.steps.filter((_, k) => k !== i))} aria-label="Кезеңді жою"><Icon name="trash" /></button>
            </div></li>)}</ol>
          <button className="btn small" disabled={t.steps.length >= 12} onClick={() => set('steps', [...t.steps, { id: 's-' + uid().slice(0, 6), text: 'Жаңа кезең' }])}><Icon name="plus" /> Кезең қосу</button>
        </fieldset>

        <fieldset className="card"><legend className="h3">Бақылау, түсіндірме, қорытынды</legend>
          <label className="field">Бақылау сұрағы<textarea rows={2} value={t.observationPrompt} onChange={e => set('observationPrompt', e.target.value)} /></label>
          <label className="field">Түсіндірме (бақылаудан кейін ашылады)<textarea rows={3} value={t.explanation} onChange={e => set('explanation', e.target.value)} /></label>
          <label className="field">Қорытынды сұрағы<textarea rows={2} value={t.conclusionPrompt} onChange={e => set('conclusionPrompt', e.target.value)} /></label>
        </fieldset>

        <fieldset className="card"><legend className="h3">Бағалау тапсырмалары</legend>
          {t.quiz.map((q, i) => <div key={q.id} className="q-edit">
            <div className="row"><span className="tag">{q.type === 'mcq' ? 'Таңдау' : q.type === 'numeric' ? 'Сандық' : 'Ашық'}</span>
              <button className="btn small ghost" onClick={() => set('quiz', t.quiz.filter((_, k) => k !== i))} aria-label="Тапсырманы жою"><Icon name="trash" /></button></div>
            <label className="field">Сұрақ<textarea rows={2} value={q.prompt} onChange={e => setQ(i, { ...q, prompt: e.target.value })} /></label>
            {q.type === 'mcq' && <>{q.options.map((o, k) => <div key={k} className="row"><input type="radio" name={'c-' + q.id} checked={q.correct === k} onChange={() => setQ(i, { ...q, correct: k })} aria-label="Дұрыс жауап" />
              <input value={o} aria-label={`${k + 1}-нұсқа`} onChange={e => setQ(i, { ...q, options: q.options.map((x, j) => j === k ? e.target.value : x) })} /></div>)}
              <button className="btn small" onClick={() => setQ(i, { ...q, options: [...q.options, 'Жаңа нұсқа'] })}><Icon name="plus" /> Нұсқа</button>
              <label className="field">Түсіндірме<textarea rows={2} value={q.explain} onChange={e => setQ(i, { ...q, explain: e.target.value })} /></label></>}
            {q.type === 'numeric' && <div className="row wrap">
              <label className="field inline"><span>Дұрыс жауап</span><input type="number" step="any" value={q.answer} onChange={e => setQ(i, { ...q, answer: Number(e.target.value) })} /></label>
              <label className="field inline"><span>Бірлік</span><select value={q.family} onChange={e => setQ(i, { ...q, family: e.target.value as UnitFamily })}>{Object.keys(UNITS).map(f => <option key={f} value={f}>{UNITS[f as UnitFamily].map(u => u.u).join(' / ')}</option>)}</select></label>
              <label className="field inline"><span>Ауытқу, %</span><input type="number" min={0.1} max={20} step={0.5} value={Math.round(q.tolRel * 1000) / 10} onChange={e => setQ(i, { ...q, tolRel: Number(e.target.value) / 100 })} /></label>
              <label className="field">Түсіндірме<textarea rows={2} value={q.explain} onChange={e => setQ(i, { ...q, explain: e.target.value })} /></label></div>}
            {q.type === 'open' && <><label className="field">Рубрика өлшемдері (әр жолға біреу)<textarea rows={3} value={q.rubric.join('\n')} onChange={e => setQ(i, { ...q, rubric: e.target.value.split('\n').filter(x => x.trim()) })} /></label>
              <label className="field">Үлгі жауап<textarea rows={2} value={q.sample} onChange={e => setQ(i, { ...q, sample: e.target.value })} /></label></>}
          </div>)}
          <div className="row wrap">
            <button className="btn small" onClick={() => set('quiz', [...t.quiz, { id: 'q-' + uid().slice(0, 6), type: 'mcq', prompt: 'Жаңа сұрақ', options: ['А', 'Ә'], correct: 0, explain: '' }])}><Icon name="plus" /> Таңдау сұрағы</button>
            <button className="btn small" onClick={() => set('quiz', [...t.quiz, { id: 'q-' + uid().slice(0, 6), type: 'numeric', prompt: 'Жаңа есеп', answer: 1, family: 'amount', tolRel: 0.02, explain: '' }])}><Icon name="plus" /> Сандық есеп</button>
            <button className="btn small" onClick={() => set('quiz', [...t.quiz, { id: 'q-' + uid().slice(0, 6), type: 'open', prompt: 'Жаңа ашық сұрақ', rubric: ['Өлшем'], sample: '' }])}><Icon name="plus" /> Ашық сұрақ</button>
          </div>
        </fieldset>

        <fieldset className="card"><legend className="h3">Бағалау салмақтары (қосындысы 100 %)</legend>
          <div className="row wrap">{(['procedure', 'data', 'conclusion'] as const).map(k => <label key={k} className="field inline"><span>{k === 'procedure' ? 'Процедура' : k === 'data' ? 'Деректі талдау' : 'Қорытынды'}</span>
            <input type="number" min={0} max={100} value={t.weights[k]} onChange={e => set('weights', { ...t.weights, [k]: Number(e.target.value) })} /></label>)}</div>
          <p className="muted small">Қосынды: {t.weights.procedure + t.weights.data + t.weights.conclusion} %</p>
        </fieldset>
      </div>

      <aside className="card sticky">
        <h2 className="h4">Тексеру</h2>
        {errors.length === 0 ? <p className="fb ok">Шаблон модельге сәйкес. Сақтауға болады.</p>
          : <div role="alert"><p className="fb bad">Түзету қажет ({errors.length}):</p><ul className="errs">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
        <div className="col">
          <button className="btn primary" disabled={errors.length > 0 || !dirty} onClick={() => save(false)}>Сақтау (жаңа нұсқа)</button>
          <button className="btn" disabled={errors.length > 0} onClick={() => save(true)}>Оқушы ретінде алдын ала қарау</button>
          <button className="btn ghost" disabled={!dirty} onClick={() => setT(initial)}>Өзгерістерді болдырмау</button>
          <button className="btn ghost" onClick={() => download(`qazchem-shablon-${t.id}-v${initial.version}.json`, templateToJSON(initial), 'application/json')}><Icon name="download" /> Сақталған нұсқаны JSON-ға</button>
        </div>
        {used && <p className="muted small">Бұл шаблон бойынша жұмыстар бар. Өңдеу оларды өзгертпейді: әр жұмыс өз нұсқасының көшірмесін сақтайды.</p>}
        {history.length > 0 && <details><summary>Нұсқалар тарихы ({history.length})</summary><ul>{history.map((h, i) => <li key={i} className="row">v{h.version} <button className="btn small" onClick={() => setT({ ...h, version: initial.version })}>Осы нұсқаны жүктеу</button></li>)}</ul></details>}
      </aside>
    </div>
  </section>;
}
