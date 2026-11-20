/*
 * The computer player. It only uses what a real player would know:
 *   - the deck the game was set up with,
 *   - the cards it can see on everyone else's head (no duplicates in a round, so those aren't its own),
 *   - the answers to its own questions and its wrong guesses.
 * It asks the ready-made question that best splits the footballers it could still be,
 * and answers other players' ready-made questions truthfully from the records.
 */
window.WOH = window.WOH || {};

(function (WOH) {
  'use strict';

  const Q = WOH.Questions, Cards = WOH.Cards;

  const LEVELS = {
    easy: { name: 'Easy', blurb: 'Asks random questions, guesses early' },
    normal: { name: 'Normal', blurb: 'Asks good questions' },
    hard: { name: 'Hard', blurb: 'Asks the best question every time' },
  };

  function consistent(c, clues) {
    return clues.every(cl => {
      if (cl.kind === 'q' && cl.qid) return Q.answer(cl.qid, c) === (cl.a === 'yes');
      if (cl.kind === 'guess' && cl.a === 'wrong') return cl.id !== c.id;
      return true;
    });
  }

  /** The footballers player i could still be, from their point of view. */
  function candidates(g, i) {
    const seen = new Set(g.players.filter((p, k) => k !== i && p.card).map(p => p.card));
    const pool = Cards.pool(g.cfg).filter(c => !seen.has(c.id));
    const clues = g.players[i].clues;
    const fits = pool.filter(c => consistent(c, clues));
    if (fits.length) return fits;
    // someone answered wrongly: keep the cards that agree with the most answers
    const score = c => clues.filter(cl => consistent(c, [cl])).length;
    const best = Math.max(...pool.map(score));
    return pool.filter(c => score(c) === best);
  }

  const pick = (list, rng) => list[Math.floor(rng() * list.length)];

  /** What computer player i does on its turn: { type: 'ask', qid } or { type: 'guess', text, id }. */
  function decide(g, i, rng) {
    const r = rng || Math.random;
    const level = g.players[i].level || 'normal';
    const cands = candidates(g, i);
    const guess = c => ({ type: 'guess', text: c.name, id: c.id });

    if (cands.length === 1) return guess(cands[0]);
    if (level === 'hard' && cands.length === 2 && r() < 0.5) return guess(pick(cands, r));
    if (level === 'normal' && cands.length === 2 && r() < 0.35) return guess(pick(cands, r));
    if (level === 'easy' && cands.length <= 3 && r() < 0.5) return guess(pick(cands, r));

    const asked = new Set(g.players[i].clues.map(cl => cl.qid).filter(Boolean));
    const n = cands.length;
    const options = Q.catalogue(cands)
      .filter(q => !asked.has(q.id))
      .map(q => {
        const yes = cands.filter(c => Q.answer(q.id, c)).length;
        return { id: q.id, yes, split: Math.abs(yes / n - 0.5) };
      })
      .filter(o => o.yes > 0 && o.yes < n);
    if (!options.length) return guess(pick(cands, r)); // nothing left to tell them apart

    options.sort((a, b) => a.split - b.split);
    let choice;
    if (level === 'hard') choice = pick(options.filter(o => o.split === options[0].split), r);
    else if (level === 'normal') choice = pick(options.slice(0, 4), r);
    else choice = pick(options, r);
    return { type: 'ask', qid: choice.id };
  }

  /** How computer player i answers the open question: 'yes' / 'no' from the records, or null if it can't. */
  function vote(g, i) {
    const a = g.ask;
    if (!a || !a.qid || a.by === i) return null;
    return Q.answer(a.qid, WOH.Engine.card(g, a.by)) ? 'yes' : 'no';
  }

  WOH.AI = { LEVELS, candidates, decide, vote };
})(window.WOH);
