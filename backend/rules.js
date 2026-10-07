// Deterministic threshold rules. No AI involved.
export const RULES = {
  pump: [
    { k:'bearingTemp', l:'Bearing temperature', u:'°C', warn:80, crit:95 },
    { k:'vibration', l:'Vibration', u:'mm/s', warn:7.1, crit:11 },
    { k:'outletPressure', l:'Outlet pressure', u:'bar', low:true, warn:1.5, crit:0.8 },
    { k:'motorTemp', l:'Motor temperature', u:'°C', warn:90, crit:110 } ],
  compressor: [
    { k:'dischargeTemp', l:'Discharge temperature', u:'°C', warn:110, crit:130 },
    { k:'vibration', l:'Vibration', u:'mm/s', warn:7.1, crit:11 },
    { k:'oilPressure', l:'Oil pressure', u:'bar', low:true, warn:1.5, crit:0.8 } ],
  motor: [
    { k:'windingTemp', l:'Winding temperature', u:'°C', warn:120, crit:140 },
    { k:'vibration', l:'Vibration', u:'mm/s', warn:4.5, crit:7.1 } ]
};
const blank = v => v === undefined || v === null || v === '';

export function runRules(type, readings = {}) {
  const checks = [], notes = [];
  for (const r of RULES[type] || []) {
    const a = readings[r.k], b = readings[r.k + 'B'];
    if (blank(a) && blank(b)) { notes.push({ type:'missing', key:r.k, msg:`${r.l} was not provided` }); continue; }
    const vals = [a, b].filter(v => !blank(v)).map(Number);
    if (vals.some(v => !Number.isFinite(v))) { notes.push({ type:'invalid', key:r.k, msg:`${r.l} has a non-numeric value and was ignored` }); continue; }
    if (vals.length === 2 && Math.abs(vals[0]-vals[1]) / Math.max(Math.abs(vals[0]), Math.abs(vals[1]), 1e-9) > 0.1)
      notes.push({ type:'conflict', key:r.k, msg:`${r.l}: sensors disagree (${vals[0]} vs ${vals[1]} ${r.u}). The worse value was used for the check.` });
    const v = r.low ? Math.min(...vals) : Math.max(...vals);
    const level = r.low ? (v <= r.crit ? 'critical' : v <= r.warn ? 'warning' : 'ok') : (v >= r.crit ? 'critical' : v >= r.warn ? 'warning' : 'ok');
    checks.push({ key:r.k, label:r.l, value:v, unit:r.u, level, warn:r.warn, crit:r.crit, low:!!r.low });
  }
  return { checks, notes };
}
export const priorityFloor = checks =>
  checks.some(c => c.level === 'critical') ? 'High' : checks.some(c => c.level === 'warning') ? 'Medium' : 'Low';
export const LEVELS = ['Low', 'Medium', 'High', 'Urgent'];
