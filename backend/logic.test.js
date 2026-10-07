import test from 'node:test';
import assert from 'node:assert';
import { runRules, priorityFloor } from './rules.js';
import { retrieve, KB } from './retrieval.js';
import { Out, checkCitations } from './ai.js';
import { hash, verify } from './auth.js';

const good = () => ({
  causes: [{ cause: 'Bearing wear', confidence: 'medium', why: 'Matches symptoms', citations: ['PUMP-4.2'] }],
  questions: [{ q: 'Is there leakage?' }],
  inspection: [{ step: 'Check lubrication', citations: ['PUMP-4.2'] }],
  priority: { level: 'High', reason: 'Warning thresholds exceeded', citations: ['rule:bearingTemp'] },
  workOrder: { title: 'Inspect bearings', description: 'Check P-204', tasks: ['Inspect bearings'] }
});

test('threshold boundaries: warn and critical values are inclusive', () => {
  const lvl = v => runRules('pump', { bearingTemp: v }).checks[0].level;
  assert.equal(lvl('79.9'), 'ok');
  assert.equal(lvl('80'), 'warning');
  assert.equal(lvl('95'), 'critical');
});
test('low pressure at the critical limit is critical', () => {
  assert.equal(runRules('pump', { outletPressure: '0.8' }).checks[0].level, 'critical');
});
test('priority floor is Low when every reading is ok', () => {
  const { checks } = runRules('pump', { bearingTemp: '60', vibration: '2', outletPressure: '3', motorTemp: '50' });
  assert.equal(priorityFloor(checks), 'Low');
});
test('retrieval finds the bearing section for a grinding noise', () => {
  assert.ok(retrieve('pump', 'loud grinding noise hot bearing').some(d => d.id === 'PUMP-4.2'));
});
test('retrieval only returns sections for the chosen equipment or general', () => {
  const hits = retrieve('compressor', 'oil pressure low vibration');
  assert.ok(hits.length > 0);
  assert.ok(hits.every(d => ['compressor', 'general'].includes(d.equipment)));
});
test('retrieval returns nothing for unrelated text', () => {
  assert.deepEqual(retrieve('pump', 'zzzz qqqq xxxx'), []);
});
test('knowledge base has unique ids and complete entries', () => {
  assert.equal(new Set(KB.map(d => d.id)).size, KB.length);
  assert.ok(KB.every(d => d.id && d.equipment && d.title && d.text));
});
test('citation check accepts known sources', () => {
  assert.doesNotThrow(() => checkCitations(good(), new Set(['PUMP-4.2', 'rule:bearingTemp'])));
});
test('citation check rejects invented sources', () => {
  assert.throws(() => checkCitations(good(), new Set(['rule:bearingTemp'])), /unknown sources: PUMP-4.2/);
});
test('AI output without citations is rejected by the schema', () => {
  const bad = good(); bad.causes[0].citations = [];
  assert.equal(Out.safeParse(bad).success, false);
});
test('valid AI output passes the schema', () => {
  assert.equal(Out.safeParse(good()).success, true);
});
test('passwords hash and verify correctly', () => {
  const h = hash('password123');
  assert.ok(!h.includes('password123'));
  assert.equal(verify('password123', h), true);
  assert.equal(verify('wrong-password', h), false);
});