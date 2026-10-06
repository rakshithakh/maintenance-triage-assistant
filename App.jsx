import { useEffect, useState } from 'react';

const api = async (p, o = {}) => {
  const r = await fetch('/api' + p, { headers: { 'Content-Type': 'application/json' }, ...o, body: o.body && JSON.stringify(o.body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
};
const when = d => new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

export default function App() {
  const [list, setList] = useState([]);
  const [sel, setSel] = useState('new');
  const [offline, setOffline] = useState(false);
  const refresh = () => api('/reports').then(l => { setList(l); setOffline(false); }).catch(() => setOffline(true));
  useEffect(() => { refresh(); }, []);
  return (
    <div className="app">
      <aside>
        <div className="brand">Maintenance triage</div>
        <button className="btn primary" onClick={() => setSel('new')}>New report</button>
        {offline && <div className="banner">Can't reach the server. Start the backend on port 4000.</div>}
        <div>{list.length === 0 && !offline && <p className="tag" style={{ padding: '0 10px' }}>No reports yet. Report your first equipment problem.</p>}
          {list.map(r => (
            <button key={r.id} className={'item ' + (sel === r.id ? 'on' : '')} onClick={() => setSel(r.id)}>
              <b>{r.equipmentId}</b><small>{r.issue}</small>
              <small>{when(r.createdAt)}{r.ai === 'error' ? ' · AI failed' : r.order ? ' · ' + r.order : ''}</small>
            </button>))}
        </div>
      </aside>
      <main>{sel === 'new'
        ? <NewReport onDone={id => { refresh(); setSel(id); }} />
        : <Report key={sel} id={sel} onChange={refresh} open={setSel} />}</main>
    </div>);
}

function NewReport({ onDone }) {
  const [meta, setMeta] = useState({});
  const [f, setF] = useState({ type: 'pump', equipmentId: '', issue: '', events: '' });
  const [rd, setRd] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api('/meta').then(m => setMeta(m.types)).catch(e => setErr(e.message)); }, []);
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const submit = async e => {
    e.preventDefault(); setBusy(true); setErr('');
    try {
      const r = await api('/reports', { method: 'POST', body: { ...f, events: f.events.split('\n').map(s => s.trim()).filter(Boolean), readings: rd } });
      onDone(r.id);
    } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <form onSubmit={submit}>
      <h1>What's wrong with the equipment?</h1>
      <p className="sub">Describe the problem and anything that happened recently. Sensor readings are optional.</p>
      <div className="row">
        <div><label htmlFor="t">Equipment type</label>
          <select id="t" value={f.type} onChange={e => { set('type', e.target.value); setRd({}); }}>
            {Object.keys(meta).map(t => <option key={t}>{t}</option>)}</select></div>
        <div><label htmlFor="e">Equipment identifier</label>
          <input id="e" required placeholder="P-204" value={f.equipmentId} onChange={e => set('equipmentId', e.target.value)} /></div>
      </div>
      <label htmlFor="i">Issue description</label>
      <textarea id="i" required placeholder="Loud grinding noise and the motor feels very hot" value={f.issue} onChange={e => set('issue', e.target.value)} />
      <label htmlFor="v">Recent operating events <span className="tag">(one per line)</span></label>
      <textarea id="v" placeholder={'Restarted after power cut yesterday\nRan dry for about 10 minutes'} value={f.events} onChange={e => set('events', e.target.value)} />
      <label>Sensor readings <span className="tag">(optional; add a second sensor to cross-check)</span></label>
      <div className="card">
        {(meta[f.type] || []).map(s => (
          <div className="rd" key={s.k}><span>{s.l} <span className="tag">({s.u})</span></span>
            <input aria-label={s.l + ' sensor A'} placeholder="Sensor A" inputMode="decimal" value={rd[s.k] || ''} onChange={e => setRd({ ...rd, [s.k]: e.target.value })} />
            <input aria-label={s.l + ' sensor B'} placeholder="Sensor B" inputMode="decimal" value={rd[s.k + 'B'] || ''} onChange={e => setRd({ ...rd, [s.k + 'B']: e.target.value })} /></div>))}
      </div>
      {err && <div className="banner" role="alert">{err}</div>}
      <div className="bar"><button className="btn primary" disabled={busy}>{busy ? 'Analyzing…' : 'Analyze problem'}</button></div>
      {busy && <p className="tag dots"><span /><span /><span /> Checking thresholds, searching manuals and asking the AI. This can take up to a minute.</p>}
    </form>);
}

const Cites = ({ ids, src }) => (
  <div className="cites">{ids?.map(c => <span key={c} className="cite" title={`${src[c]?.title || c}: ${src[c]?.text || ''}`}>{c}</span>)}</div>);

function Report({ id, onChange, open }) {
  const [r, setR] = useState(null);
  const [hist, setHist] = useState([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const load = () => api('/reports/' + id).then(x => { setR(x); api(`/equipment/${encodeURIComponent(x.equipmentId)}/history`).then(setHist); }).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [id]);
  if (err) return <div className="banner">{err}</div>;
  if (!r) return <p className="tag">Loading…</p>;
  const a = r.analysis, ai = a.ai;
  const reanalyze = async () => { setBusy(true); try { setR(await api(`/reports/${id}/reanalyze`, { method: 'POST' })); onChange(); } catch (e) { setErr(e.message); } setBusy(false); };
  return (<>
    <h1>{r.equipmentId} <span className="tag">{r.type}</span></h1>
    <p className="sub">{when(r.createdAt)}</p>

    {a.status === 'error' && <div className="banner" role="alert"><b>AI analysis failed.</b> {a.error.message} <span className="tag">({a.error.code})</span>
      <div className="bar"><button className="btn" onClick={reanalyze} disabled={busy}>{busy ? 'Retrying…' : 'Retry analysis'}</button></div>
      <div className="tag">Threshold checks and manual search below still worked.</div></div>}
    {a.retrievalError && <div className="banner" role="alert">Manual search failed: {a.retrievalError}</div>}
    {a.retrievalWarning && <div className="banner soft">{a.retrievalWarning}</div>}

    <h2>Observations</h2>
    <p className="sub">What was reported and measured. Nothing here is a diagnosis.</p>
    <div className="card stripe"><b>Issue:</b> {r.issue}
      {r.events.length > 0 && <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>{r.events.map((e, i) => <li key={i}>{e}</li>)}</ul>}</div>
    <div className="card">
      {a.rules.checks.length === 0 && <span className="tag">No sensor readings were provided.</span>}
      {a.rules.checks.map(c => <div className="split" key={c.key}><span>{c.label}: <b>{c.value} {c.unit}</b></span>
        <span className={'pill ' + c.level}>{c.level} · {c.low ? 'min' : 'max'} {c.warn}/{c.crit}</span></div>)}
      {a.rules.notes.map((n, i) => <div key={i} className="tag" style={{ marginTop: 6 }}><span className={'pill ' + (n.type === 'conflict' ? 'warning' : 'info')}>{n.type}</span> {n.msg}</div>)}
    </div>

    {ai && <>
      <h2>Possible causes</h2>
      <p className="sub">AI suggestions to investigate. None of these are confirmed.</p>
      {ai.causes.map((c, i) => <div className="card" key={i}><div className="split"><b>{c.cause}</b><span className="pill info">possible · {c.confidence} confidence</span></div>
        <div>{c.why}</div><Cites ids={c.citations} src={a.sources} /></div>)}

      {ai.questions.length > 0 && <><h2>Questions to answer on site</h2>
        <div className="card"><ul style={{ margin: 0, paddingLeft: 20 }}>{ai.questions.map((q, i) => <li key={i}>{q.q}</li>)}</ul></div></>}

      <h2>Suggested inspection</h2>
      {ai.inspection.map((s, i) => <div className="card" key={i}>{s.step}<Cites ids={s.citations} src={a.sources} /></div>)}

      <h2>Proposed priority</h2>
      <div className="card"><span className={'pill ' + ai.priority.level}>{ai.priority.level}</span> {ai.priority.reason}<Cites ids={ai.priority.citations} src={a.sources} /></div>
    </>}

    <Findings r={r} reload={load} />
    {r.order && <Order o={r.order} reload={() => { load(); onChange(); }} />}

    {hist.filter(h => h.id !== r.id).length > 0 && <><h2>History for {r.equipmentId}</h2>
      {hist.filter(h => h.id !== r.id).map(h => <button key={h.id} className="item card" onClick={() => open(h.id)}>
        <b>{h.issue}</b><small>{when(h.createdAt)} · work order: {h.order?.status || 'none'} · {h.findings.length} confirmed finding(s)</small></button>)}</>}
  </>);
}

function Findings({ r, reload }) {
  const [text, setText] = useState(''); const [tech, setTech] = useState(localStorage.tech || ''); const [err, setErr] = useState('');
  const add = async () => { try { localStorage.tech = tech; await api(`/reports/${r.id}/findings`, { method: 'POST', body: { text, technician: tech } }); setText(''); setErr(''); reload(); } catch (e) { setErr(e.message); } };
  return (<>
    <h2>Confirmed findings</h2>
    <p className="sub">Only a technician can record what was actually found after inspection.</p>
    {r.findings.length === 0 && <p className="tag">Nothing confirmed yet.</p>}
    {r.findings.map(f => <div key={f.id} className="card stripe good"><span className="pill ok">confirmed</span> {f.text}<div className="tag">{f.confirmedBy} · {when(f.at)}</div></div>)}
    <div className="card">
      <textarea aria-label="Confirmed finding" placeholder="e.g. Drive-end bearing worn, confirmed by play measurement" value={text} onChange={e => setText(e.target.value)} />
      <div className="row" style={{ marginTop: 8 }}><input aria-label="Technician name" placeholder="Your name" value={tech} onChange={e => setTech(e.target.value)} />
        <button className="btn" onClick={add}>Record confirmed finding</button></div>
      {err && <div className="banner" role="alert">{err}</div>}
    </div></>);
}

function Order({ o, reload }) {
  const [d, setD] = useState({ title: o.title, description: o.description, tasks: o.tasks.join('\n'), priority: o.priority });
  const [tech, setTech] = useState(localStorage.tech || ''); const [err, setErr] = useState('');
  const locked = o.status !== 'draft';
  const run = async (path, method, body) => { try { localStorage.tech = tech; await api(path, { method, body: { technician: tech, ...body } }); setErr(''); reload(); } catch (e) { setErr(e.message); } };
  const tasks = d.tasks.split('\n').map(s => s.trim()).filter(Boolean);
  return (<>
    <h2>Work order <span className={'pill ' + o.status}>{o.status}{o.edited && o.status === 'draft' ? ' · edited' : ''}</span></h2>
    <p className="sub">{locked ? `${o.status} by ${o.decidedBy} on ${when(o.decidedAt)}${o.reason ? '. Reason: ' + o.reason : ''}` : 'AI-drafted. Nothing happens until a technician approves it.'}</p>
    <div className="card">
      <label htmlFor="wt" style={{ marginTop: 0 }}>Title</label><input id="wt" disabled={locked} value={d.title} onChange={e => setD({ ...d, title: e.target.value })} />
      <label htmlFor="wd">Description</label><textarea id="wd" disabled={locked} value={d.description} onChange={e => setD({ ...d, description: e.target.value })} />
      <label htmlFor="wk">Tasks <span className="tag">(one per line)</span></label><textarea id="wk" disabled={locked} value={d.tasks} onChange={e => setD({ ...d, tasks: e.target.value })} />
      <label htmlFor="wp">Priority</label>
      <select id="wp" disabled={locked} value={d.priority} onChange={e => setD({ ...d, priority: e.target.value })}>{['Low', 'Medium', 'High', 'Urgent'].map(p => <option key={p}>{p}</option>)}</select>
      {!locked && <>
        <label htmlFor="wn">Technician name</label><input id="wn" placeholder="Required to edit, approve or reject" value={tech} onChange={e => setTech(e.target.value)} />
        {err && <div className="banner" role="alert">{err}</div>}
        <div className="bar">
          <button className="btn" onClick={() => run(`/work-orders/${o.id}`, 'PATCH', { ...d, tasks })}>Save edits</button>
          <button className="btn primary" onClick={() => run(`/work-orders/${o.id}/approve`, 'POST', {})}>Approve work order</button>
          <button className="btn danger" onClick={() => { const reason = prompt('Why are you rejecting this work order?'); if (reason) run(`/work-orders/${o.id}/reject`, 'POST', { reason }); }}>Reject</button>
        </div></>}
    </div></>);
}
