import { z } from 'zod';
import { LEVELS } from './rules.js';
const Cit = z.array(z.string()).min(1);
export const Out = z.object({
  causes: z.array(z.object({ cause:z.string(), confidence:z.enum(['low','medium','high']), why:z.string(), citations:Cit })).min(1),
  questions: z.array(z.object({ q:z.string() })),
  inspection: z.array(z.object({ step:z.string(), citations:Cit })).min(1),
  priority: z.object({ level:z.enum(LEVELS), reason:z.string(), citations:Cit }),
  workOrder: z.object({ title:z.string(), description:z.string(), tasks:z.array(z.string()).min(1) })
});

export function checkCitations(out, allowed) {
  const all = [...out.causes.flatMap(c => c.citations), ...out.inspection.flatMap(i => i.citations), ...out.priority.citations];
  const bad = all.filter(c => !allowed.has(c));
  if (bad.length) throw new Error('AI cited unknown sources: ' + [...new Set(bad)].join(', '));
}

export async function callModel(prompt) {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('ANTHROPIC_API_KEY is not set on the server.'), { code:'LLM_NOT_CONFIGURED' });
  let res;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', { method:'POST',
      headers:{ 'content-type':'application/json', 'x-api-key':process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:process.env.MODEL || 'claude-sonnet-5-5', max_tokens:2000, messages:[{ role:'user', content:prompt }] }),
      signal: AbortSignal.timeout(45000) });
  } catch (e) { throw Object.assign(new Error('Could not reach the AI service: ' + e.message), { code:'LLM_UNREACHABLE' }); }
  if (!res.ok) throw Object.assign(new Error(`AI service returned ${res.status}`), { code:'LLM_HTTP_ERROR' });
  const text = (await res.json()).content?.map(c => c.text || '').join('') || '';
  const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
  try { return JSON.parse(json); } catch { throw Object.assign(new Error('AI returned invalid JSON'), { code:'LLM_BAD_OUTPUT' }); }
}

export const buildPrompt = (r, hits, rules) => `You assist a maintenance technician. You never control equipment and never approve work.
Rules: causes are POSSIBLE, never confirmed. Every cause, inspection step and the priority MUST cite source ids from the list below. Use only these ids.
Equipment: ${r.type} ${r.equipmentId}
Issue [issue]: ${r.issue}
Events: ${r.events.map((e, i) => `[event:${i + 1}] ${e}`).join(' | ') || 'none'}
Threshold checks: ${rules.checks.map(c => `[rule:${c.key}] ${c.label} ${c.value}${c.unit} = ${c.level}`).join(' | ') || 'none'}
Data problems: ${rules.notes.map(n => n.msg).join(' | ') || 'none'}
Manual sections: ${hits.map(h => `[${h.id}] ${h.title}: ${h.text}`).join('\n') || 'none matched'}
Return ONLY JSON: {"causes":[{"cause","confidence":"low|medium|high","why","citations":[]}],"questions":[{"q"}],"inspection":[{"step","citations":[]}],"priority":{"level":"Low|Medium|High|Urgent","reason","citations":[]},"workOrder":{"title","description","tasks":[]}}`;
