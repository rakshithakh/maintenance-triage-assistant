import fs from 'fs';
export const KB = JSON.parse(fs.readFileSync(new URL('./kb.json', import.meta.url)));
const tok = s => (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 2);

export function retrieve(type, query, k = 4) {
  const docs = KB.filter(d => d.equipment === type || d.equipment === 'general');
  const q = new Set(tok(query));
  const df = {}; docs.forEach(d => new Set(tok(d.title + ' ' + d.text)).forEach(w => df[w] = (df[w] || 0) + 1));
  return docs.map(d => {
    const words = tok(d.title + ' ' + d.text);
    let score = 0; q.forEach(w => { const tf = words.filter(x => x === w).length; if (tf) score += tf * Math.log(1 + docs.length / df[w]); });
    return { ...d, score };
  }).filter(d => d.score > 0).sort((a, b) => b.score - a.score).slice(0, k);
}
