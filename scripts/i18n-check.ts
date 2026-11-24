/**
 * Lists every English UI string that has no Tamil translation yet.
 *   npm run i18n:check          -> prints missing strings, exit code 1 if any
 * Scans: t('...'), tNow('...'), label/title/text/benefit/how/hint/name literals, weather tips, scheme text.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TA } from '../src/i18n/ta';
import { SCHEMES } from '../src/data/schemes';
import { STATUS_LABELS } from '../src/lib/labels';

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f === 'node_modules' || f.startsWith('.')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(f) && !/leafletAssets|\/ta\.ts$/.test(p)) out.push(p);
  }
  return out;
}

const files = [...walk('app'), ...walk('src')];
const found = new Map<string, string>();
const unesc = (s: string) => s.replace(/\\'/g, "'").replace(/\\n/g, '\n');
const add = (s: string, file: string) => {
  const k = unesc(s);
  if (!/[A-Za-z]/.test(k)) return;
  if (!found.has(k)) found.set(k, file);
};

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  // every quoted literal inside a t(...) / tNow(...) call, including ternary branches
  for (const m of src.matchAll(/\b(?:t|tNow)\(/g)) {
    let i = m.index! + m[0].length, depth = 1, q = '';
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      const c = src[i];
      if (q) { if (c === '\\') i++; else if (c === q) q = ''; continue; }
      if (c === "'" || c === '"' || c === '`') q = c;
      else if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    const body = src.slice(start, i - 1);
    const firstArg = body.split(/,\s*\{/)[0]; // ignore the {vars} object
    for (const lit of firstArg.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) add(lit[1], file);
    for (const lit of firstArg.matchAll(/"((?:[^"\\\n]|\\.)*)"/g)) add(lit[1], file);
  }
  // option labels, preset titles, feed notes, tips, scheme text
  for (const m of src.matchAll(/\b(?:label|title|text|benefit|how|hint):\s*'((?:[^'\\\n]|\\.)*)'/g)) add(m[1], file);
  if (/lib\/weather\.ts$/.test(file)) {
    for (const m of src.matchAll(/^\s+'((?:[^'\\\n]|\\.)*)',?$/gm)) add(m[1], file); // tips
    for (const m of src.matchAll(/message:\s*`([^`]*)`/g)) add(m[1].replace(/\s*\(.*\)/, '').replace(/\$\{[^}]*\}/g, '').trim(), file);
  }
}
for (const v of Object.values(STATUS_LABELS)) add(v, 'labels');
for (const s of SCHEMES) { add(s.name, 'schemes'); add(s.benefit, 'schemes'); add(s.how, 'schemes'); s.criteria.forEach(c => add(c.hint, 'schemes')); }

// not UI strings
const IGNORE = new Set(['morning','paid','part_paid','pending','confirmed','failed','silent','eligible','maybe','closed','cow','processing','done','saved','milk_notebook','society_slip','danger','warning', 'text!', 'TEXT', 'Sold {n} animals', '#1C2B1E', 'en', 'ta', 'cm', 'in', 'kg', 'L', 'AM', 'PM', 'SC/ST', 'WhatsApp', 'IFSC', 'English', 'தமிழ்', 'EN']);
const missing = [...found.entries()].filter(([k]) => !(k in TA) && !IGNORE.has(k));
if (process.argv.includes('--json')) console.log(JSON.stringify(missing.map(([k]) => k), null, 1));
else {
  for (const [k, f] of missing) console.log(`${f.padEnd(34)} ${JSON.stringify(k)}`);
  console.log(`\n${found.size} strings found, ${missing.length} without Tamil`);
}
// also flag stale entries (in TA but no longer in code) so the dictionary does not rot
const stale = Object.keys(TA).filter(k => !found.has(k));
if (stale.length && process.argv.includes('--stale')) console.log('\nUnused Tamil keys:', stale.length, stale.slice(0, 20));
process.exit(missing.length ? 1 : 0);
