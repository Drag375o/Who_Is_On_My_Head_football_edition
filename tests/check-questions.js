/*
 * Checks the question deck and the guess checker. Run: node tests/check-questions.js
 */
'use strict';
const assert = require('assert');
const load = require('./load');

const WOH = load([...load.DATA, 'js/questions.js']);
const { Cards, Questions: Q } = WOH;
const card = id => { const c = Cards.byId[id]; assert(c, `no card ${id}`); return c; };

// every catalogue question has text and a yes/no answer for every card
const cat = Q.catalogue(Cards.all);
for (const q of cat) {
  assert(q.text && q.cat, `question ${q.id} has no text`);
  for (const c of Cards.all) assert.strictEqual(typeof Q.answer(q.id, c), 'boolean', `${q.id} on ${c.name}`);
}
assert.strictEqual(Q.describe('club:XXX'), null);
assert.strictEqual(Q.describe('nonsense'), null);

// answers
const messi = card('lionel-messi');
assert.strictEqual(Q.answer('club:BAR', messi), true);
assert.strictEqual(Q.answer('club:RMA', messi), false);
assert.strictEqual(Q.answer('league:USA', messi), true);
assert.strictEqual(Q.answer('hon:W', messi), true);
assert.strictEqual(Q.answer('born<:1990', messi), true);
assert.strictEqual(Q.answer('cont:SA', messi), true);
assert.strictEqual(Q.answer('pos:FWD', messi), true);
assert.strictEqual(Q.answer('active', card('zinedine-zidane')), false);

// guesses
const cases = [
  ['Messi', 'lionel-messi', 'correct'],
  ['lionel messi', 'lionel-messi', 'correct'],
  ['Is it Leo Messi?', 'lionel-messi', 'correct'],
  ['Mesi', 'lionel-messi', 'correct'],
  ['Ronaldo', 'cristiano-ronaldo', 'ambiguous'],
  ['Ronaldo', 'ronaldo-nazario', 'ambiguous'],
  ['Cristiano', 'cristiano-ronaldo', 'correct'],
  ['CR7', 'cristiano-ronaldo', 'correct'],
  ['R9', 'ronaldo-nazario', 'correct'],
  ['Muller', 'thomas-muller', 'ambiguous'],
  ['Thomas Muller', 'thomas-muller', 'correct'],
  ['Odegaard', 'martin-odegaard', 'correct'],
  ['Kaka', 'kaka', 'correct'],
  ['Neymar', 'lionel-messi', 'wrong'],
  ['Pele', 'lionel-messi', 'wrong'],
  ['Totally not a player', 'lionel-messi', 'wrong'],
  ['', 'lionel-messi', 'empty'],
  ['Zlatan', 'zlatan-ibrahimovic', 'correct'],
  ['Ibrahimovich', 'zlatan-ibrahimovic', 'correct'],
  ['Mbape', 'kylian-mbappe', 'correct'],
];
for (const [guess, id, want] of cases) {
  assert.strictEqual(Q.checkGuess(guess, card(id)), want, `"${guess}" for ${id}`);
}
console.log(`${cat.length} questions in the full deck; ${cases.length} guess cases pass`);
console.log('Questions OK');
