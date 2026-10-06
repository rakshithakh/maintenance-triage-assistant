import test from 'node:test';
import assert from 'node:assert';
import { runRules, priorityFloor } from './rules.js';
test('flags critical bearing temperature', () => {
  const r = runRules('pump', { bearingTemp:'96', vibration:'3', outletPressure:'2', motorTemp:'60' });
  assert.equal(r.checks.find(c => c.key === 'bearingTemp').level, 'critical');
  assert.equal(priorityFloor(r.checks), 'High');
});
test('low pressure is a warning', () => {
  assert.equal(runRules('pump', { outletPressure:'1.2' }).checks[0].level, 'warning');
});
test('reports missing sensors', () => {
  assert.ok(runRules('pump', {}).notes.every(n => n.type === 'missing'));
});
test('detects conflicting sensors and uses worst value', () => {
  const r = runRules('pump', { bearingTemp:'70', bearingTempB:'90' });
  assert.ok(r.notes.some(n => n.type === 'conflict'));
  assert.equal(r.checks[0].value, 90);
});
test('ignores non-numeric readings', () => {
  assert.equal(runRules('pump', { vibration:'abc' }).notes.find(n => n.key === 'vibration').type, 'invalid');
});
