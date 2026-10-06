import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { RULES, runRules, priorityFloor, LEVELS } from './rules.js';
import { retrieve } from './retrieval.js';
import { Out, checkCitations, callModel, buildPrompt } from './ai.js';

const FILE = './data.json';
const db = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE)) : { reports:[], orders:[], findings:[], audit:[] };
const save = () => fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
const uid = p => p + '-' + Math.random().toString(36).slice(2, 8);
const audit = (action, d = {}) => { const e = { at:new Date().toISOString(), action, ...d }; db.audit.push(e); console.log(JSON.stringify(e)); save(); };

async function analyze(report) {
  const query = `${report.issue} ${report.events.join(' ')}`;
  const rules = runRules(report.type, report.readings);
  let hits = [], retrievalError = null;
  try { hits = retrieve(report.type, query); } catch (e) { retrievalError = e.message; }
  const sources = Object.fromEntries(hits.map(h => [h.id, { title:h.title, text:h.text }]));
  sources.issue = { title:'Reported issue', text:report.issue };
  report.events.forEach((e, i) => sources['event:' + (i + 1)] = { title:'Recent event', text:e });
  rules.checks.forEach(c => sources['rule:' + c.key] = { title:'Threshold check', text:`${c.label} ${c.value}${c.unit} is ${c.level}` });
  const base = { rules, hits:hits.map(h => h.id), retrievalError, sources,
    retrievalWarning: retrievalError ? null : hits.length ? null : 'No manual sections matched this report. Suggestions can only cite events and sensor checks.' };
  try {
    const out = Out.parse(await callModel(buildPrompt(report, hits, rules)));
    checkCitations(out, new Set(Object.keys(sources)));
    const floor = priorityFloor(rules.checks);
    if (LEVELS.indexOf(floor) > LEVELS.indexOf(out.priority.level)) {
      out.priority = { ...out.priority, level:floor, reason:`Raised to ${floor} by threshold rules. ${out.priority.reason}`, citations:[...out.priority.citations, ...rules.checks.filter(c => c.level !== 'ok').map(c => 'rule:' + c.key)] };
    }
    return { ...base, status:'ok', ai:out };
  } catch (e) {
    const code = e.code || (e.name === 'ZodError' ? 'LLM_BAD_OUTPUT' : 'LLM_REJECTED');
    audit('ai_failed', { reportId:report.id, code, message:e.message });
    return { ...base, status:'error', error:{ code, message:e.name === 'ZodError' ? 'AI output did not match the required format.' : e.message } };
  }
}

function applyAnalysis(report, analysis) {
  report.analysis = analysis;
  db.orders = db.orders.filter(o => !(o.reportId === report.id && o.status === 'draft'));
  if (analysis.status === 'ok') {
    const w = analysis.ai.workOrder;
    db.orders.push({ id:uid('WO'), reportId:report.id, status:'draft', title:w.title, description:w.description, tasks:w.tasks, priority:analysis.ai.priority.level, edited:false, createdAt:new Date().toISOString() });
  }
  save();
}

const app = express();
app.use(cors()); app.use(express.json());
const find = (req, res) => db.reports.find(r => r.id === req.params.id) || (res.status(404).json({ error:'Report not found' }), null);
const full = r => ({ ...r, order:db.orders.filter(o => o.reportId === r.id).pop() || null, findings:db.findings.filter(f => f.reportId === r.id) });

app.get('/api/meta', (_, res) => res.json({ types:Object.fromEntries(Object.entries(RULES).map(([t, r]) => [t, r.map(({ k, l, u }) => ({ k, l, u }))])) }));
app.get('/api/reports', (_, res) => res.json(db.reports.map(r => ({ id:r.id, type:r.type, equipmentId:r.equipmentId, issue:r.issue, createdAt:r.createdAt, ai:r.analysis?.status, order:db.orders.filter(o => o.reportId === r.id).pop()?.status })).reverse()));
app.get('/api/reports/:id', (req, res) => { const r = find(req, res); if (r) res.json(full(r)); });
app.get('/api/equipment/:eid/history', (req, res) => res.json(db.reports.filter(r => r.equipmentId === req.params.eid).map(full).reverse()));

app.post('/api/reports', async (req, res) => {
  const b = req.body || {};
  if (!RULES[b.type]) return res.status(400).json({ error:'Choose a supported equipment type.' });
  if (!b.equipmentId?.trim() || !b.issue?.trim()) return res.status(400).json({ error:'Equipment identifier and issue description are required.' });
  const report = { id:uid('R'), type:b.type, equipmentId:b.equipmentId.trim(), issue:b.issue.trim(), events:(b.events || []).filter(Boolean), readings:b.readings || {}, createdAt:new Date().toISOString() };
  db.reports.push(report); audit('report_created', { reportId:report.id });
  applyAnalysis(report, await analyze(report));
  res.json(full(report));
});
app.post('/api/reports/:id/reanalyze', async (req, res) => {
  const r = find(req, res); if (!r) return;
  audit('reanalyze', { reportId:r.id }); applyAnalysis(r, await analyze(r)); res.json(full(r));
});

const order = (req, res) => { const o = db.orders.find(x => x.id === req.params.id); if (!o) res.status(404).json({ error:'Work order not found' }); return o; };
const tech = (req, res) => { const t = req.body?.technician?.trim(); if (!t) res.status(400).json({ error:'Technician name is required. Only a human technician can do this.' }); return t; };
app.patch('/api/work-orders/:id', (req, res) => {
  const o = order(req, res); if (!o) return; const t = tech(req, res); if (!t) return;
  if (o.status !== 'draft') return res.status(409).json({ error:`A ${o.status} work order can no longer be edited.` });
  const { title, description, tasks, priority } = req.body;
  Object.assign(o, { title:title ?? o.title, description:description ?? o.description, tasks:tasks ?? o.tasks, priority:LEVELS.includes(priority) ? priority : o.priority, edited:true });
  audit('order_edited', { orderId:o.id, by:t }); res.json(o);
});
for (const [path, status] of [['approve', 'approved'], ['reject', 'rejected']]) {
  app.post(`/api/work-orders/:id/${path}`, (req, res) => {
    const o = order(req, res); if (!o) return; const t = tech(req, res); if (!t) return;
    if (o.status !== 'draft') return res.status(409).json({ error:`Work order is already ${o.status}.` });
    if (status === 'rejected' && !req.body.reason?.trim()) return res.status(400).json({ error:'Give a reason for rejecting.' });
    Object.assign(o, { status, decidedBy:t, decidedAt:new Date().toISOString(), reason:req.body.reason });
    audit('order_' + status, { orderId:o.id, by:t }); res.json(o);
  });
}
app.post('/api/reports/:id/findings', (req, res) => {
  const r = find(req, res); if (!r) return; const t = tech(req, res); if (!t) return;
  if (!req.body.text?.trim()) return res.status(400).json({ error:'Describe what you confirmed.' });
  const f = { id:uid('F'), reportId:r.id, text:req.body.text.trim(), confirmedBy:t, at:new Date().toISOString() };
  db.findings.push(f); audit('finding_confirmed', { reportId:r.id, by:t }); res.json(f);
});

app.listen(process.env.PORT || 4000, () => console.log('API on :' + (process.env.PORT || 4000)));
