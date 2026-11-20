/*
 * Sanity checks for the footballer database. Run: node tests/check-data.js
 */
'use strict';
const load = require('./load');

const WOH = load(load.DATA);
const { all, GROUP, pool, clubDecks } = WOH.Cards;
const problems = [];
const say = msg => problems.push(msg);

const seen = new Map();
for (const c of all) {
  if (seen.has(c.id)) say(`duplicate: ${c.name}`);
  seen.set(c.id, c);
  if (!GROUP[c.pos]) say(`${c.name}: unknown position ${c.pos}`);
  if (!WOH.NATIONS[c.nation]) say(`${c.name}: unknown nation ${c.nation}`);
  if (!(c.born > 1890 && c.born < 2012)) say(`${c.name}: odd birth year ${c.born}`);
  if (![1, 2, 3].includes(c.fame)) say(`${c.name}: fame must be 1-3`);
  if (!c.eras.length || c.eras.some(e => !'mtzl'.includes(e))) say(`${c.name}: bad eras`);
  if (/[^BWCI]/.test(c.honours)) say(`${c.name}: bad honours ${c.honours}`);
  c.clubs.forEach(k => { if (!WOH.CLUBS[k]) say(`${c.name}: unknown club ${k}`); });
  if (new Set(c.clubs).size !== c.clubs.length) say(`${c.name}: club listed twice`);
  if (c.active && c.born < 1980) say(`${c.name}: active but born ${c.born}?`);
}

// every short name / alias that a guess could use
const names = new Map();
for (const c of all) {
  for (const n of new Set([c.name, c.short, ...c.aka].map(WOH.Cards.normalise))) {
    if (!names.has(n)) names.set(n, []);
    names.get(n).push(c.name);
  }
}
const shared = [...names].filter(([, v]) => v.length > 1);

for (const era of ['all', 'm', 't', 'z', 'l']) {
  for (const fame of [1, 2, 3]) {
    const n = pool({ era, fame }).length;
    if (n < 16) say(`deck era=${era} fame=${fame} has only ${n} cards`);
  }
}

console.log(`${all.length} footballers, ${Object.keys(WOH.CLUBS).length} clubs, ${Object.keys(WOH.NATIONS).length} nations`);
console.log('By era:', ['m', 't', 'z', 'l'].map(e => `${e}=${all.filter(c => c.eras.includes(e)).length}`).join(' '));
console.log('By fame:', [1, 2, 3].map(f => `${f}=${all.filter(c => c.fame === f).length}`).join(' '));
console.log('Club decks:', clubDecks().map(d => `${d.name} ${d.count}`).join(', '));
if (shared.length) console.log('Shared names (guess must be more specific):', shared.map(([k, v]) => `"${k}" → ${v.join(' / ')}`).join('; '));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ` + problems.join('\n- '));
  process.exit(1);
}
console.log('Data OK');
