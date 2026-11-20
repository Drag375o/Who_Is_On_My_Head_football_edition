/*
 * Plays hundreds of computer-only games through the engine and checks the rules hold.
 * Run: node tests/simulate.js
 */
'use strict';
const assert = require('assert');
const load = require('./load');

const WOH = load([...load.DATA, 'js/questions.js', 'js/engine.js', 'js/ai.js']);
const { Engine: E, AI, Cards } = WOH;

// small seeded RNG so failures can be replayed
function rngFrom(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

const LEVELS = ['easy', 'normal', 'hard'];
let games = 0, turns = 0, questions = 0;
const lengths = [];

function play(seed, cfg, count) {
  const rng = rngFrom(seed);
  let now = 1e6;
  const players = Array.from({ length: count }, (_, i) => ({ name: `CPU ${i + 1}`, isCPU: true, level: LEVELS[i % 3] }));
  const g = E.create(cfg, players);
  assert(E.roll(g, rng));
  assert(E.startRound(g, now, rng));
  let steps = 0;
  while (g.phase !== 'gameEnd') {
    assert(++steps < 20000, `game ${seed} never ends`);
    now += 500;
    if (g.phase === 'roundEnd') { assert(E.nextRound(g, now, rng)); continue; }
    assert.strictEqual(g.phase, 'turn');

    // no duplicate cards in a round, everyone dealt
    const cards = g.players.map(p => p.card);
    assert.strictEqual(new Set(cards).size, cards.length, 'duplicate card in a round');
    assert(cards.every(id => Cards.byId[id]), 'missing card');

    if (g.ask) {
      const vs = E.voters(g);
      assert(vs.length > 0, 'question with nobody to answer');
      for (const v of vs) {
        if (!g.ask) break;
        const ans = AI.vote(g, v);
        // CPUs answer truthfully, and now and then someone sends a question back
        assert(E.vote(g, v, rng() < 0.03 ? 'rephrase' : ans, now));
      }
      continue;
    }
    const i = g.turn;
    assert(E.canPlay(g.players[i]), 'turn on a player who cannot play');
    if (cfg.timer && rng() < 0.02) { now += cfg.timer * 1000; assert(E.timeUp(g, now)); continue; }
    turns++;
    const d = AI.decide(g, i, rng);
    if (d.type === 'ask') {
      questions++;
      assert(E.ask(g, i, { qid: d.qid }, now), `ask ${d.qid}`);
    } else {
      const before = g.players[i].clues.length;
      const res = E.guess(g, i, d.text, now);
      assert(res, 'guess rejected');
      if (res === 'wrong') g.players[i].clues[before].id = d.id; // what the UI records for computer guesses
    }
  }
  games++;
  lengths.push(steps);
  assert(g.winners.length >= 1, 'no winner');
  const scores = g.players.map(p => p.score);
  if (cfg.mode === 'points') {
    const top = Math.max(...scores);
    assert(g.winners.every(w => scores[w] === top), 'winner without the top score');
  } else {
    assert(g.winners.every(w => g.players[w].solved || E.isGuessing(g.players[w])), 'classic winner never guessed');
  }
  return g;
}

let seed = 1;
for (const mode of ['classic', 'points']) {
  for (const count of [2, 3, 5, 8]) {
    for (const deck of [{ era: 'all', fame: 1 }, { era: 'm', fame: 2 }, { era: 'l', fame: 3 }, { club: 'LIV' }, { club: 'RMA' }]) {
      for (let k = 0; k < 6; k++) {
        play(seed++, Object.assign({ play: 'cpu', mode, rounds: 3, timer: k % 2 ? 60 : 0 }, deck), count);
      }
    }
  }
}

// a game where people drop out and one is removed
{
  const rng = rngFrom(99);
  let now = 0;
  const g = E.create({ mode: 'points', rounds: 2 }, [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }]);
  E.roll(g, rng);
  E.startRound(g, now, rng);
  const t = g.turn;
  assert(E.setAway(g, t, true, now));
  assert.notStrictEqual(g.turn, t, 'away player keeps the turn');
  assert(E.remove(g, (t + 1) % 4, now) || (t + 1) % 4 === 0);
  assert(E.ask(g, g.turn, { text: 'Am I Brazilian?' }, now));
  const vs = E.voters(g);
  assert(!vs.includes(t), 'away player asked to vote');
  vs.forEach(v => g.ask && E.vote(g, v, 'yes', now));
  assert.strictEqual(g.ask, null, 'question not resolved');
  assert(E.setAway(g, t, false, now));
}

// a tie goes to the earliest answer; a clear majority settles early
{
  const g = E.create({ mode: 'classic' }, [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }]);
  E.roll(g, rngFrom(5));
  E.startRound(g, 0, rngFrom(5));
  const asker = g.turn;
  E.ask(g, asker, { spoken: true }, 0);
  const vs = E.voters(g);
  E.vote(g, vs[0], 'no', 0);
  E.vote(g, vs[1], 'yes', 0);
  E.vote(g, vs[2], 'yes', 0);
  assert(g.ask, 'settled before the result was certain');
  E.vote(g, vs[3], 'no', 0);
  assert.strictEqual(g.ask, null);
  assert.strictEqual(g.players[asker].clues[0].a, 'no', 'tie should go to the earliest answer');
}

const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
console.log(`${games} games, ${turns} turns, ${questions} questions, ${avg.toFixed(0)} steps per game on average`);
console.log('Engine OK');
