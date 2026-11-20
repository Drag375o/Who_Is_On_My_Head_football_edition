/*
 * Game rules and state. No DOM code: this runs headless in Node for tests.
 *
 * The state is plain JSON (it is sent to other devices and saved to localStorage).
 * Every move takes the state, changes it and returns true, or returns false if
 * the move isn't allowed right now. Times are passed in as `now` (ms).
 *
 * Phases:  roll → turn ⇄ (answers) → roundEnd → turn … → gameEnd
 */
window.WOH = window.WOH || {};

(function (WOH) {
  'use strict';

  const Q = WOH.Questions, Cards = WOH.Cards;
  const MAX_PLAYERS = 8;
  const MAX_QUESTION = 140;
  const VOTES = ['yes', 'no', 'rephrase'];

  const MODES = {
    classic: { name: 'Classic', blurb: 'First to name their footballer wins' },
    points: { name: 'Points', blurb: '1 point per correct guess, over several rounds' },
  };

  /**
   * cfg: { play: 'cpu'|'pass'|'online', mode: 'classic'|'points', rounds, timer (seconds, 0 = off),
   *        era, fame, club }
   * players: [{ name, isCPU?, level? }]
   */
  function create(cfg, players) {
    const c = Object.assign({ play: 'cpu', mode: 'classic', rounds: 3, timer: 0, era: 'all', fame: 2, club: '' }, cfg);
    if (c.mode === 'classic') c.rounds = 1;
    return {
      v: 1,
      cfg: c,
      players: players.slice(0, MAX_PLAYERS).map(p => ({
        name: p.name, isCPU: !!p.isCPU, level: p.level || 'normal',
        away: false, gone: false, score: 0,
        card: null, solved: false, out: false, place: 0, clues: [],
      })),
      phase: 'roll',
      dice: null,
      round: 0,
      dealt: [],
      starter: 0,
      turn: 0,
      ask: null,
      clock: null,
      event: null,
      log: [],
      n: 0,
      winners: [],
    };
  }

  /* ---------- helpers ---------- */

  const card = (g, i) => Cards.byId[g.players[i].card];
  const guessing = p => !p.solved && !p.out && !p.gone;
  const canPlay = p => guessing(p) && !p.away;
  const inRound = g => g.players.filter(guessing);

  function note(g, text, who, kind) {
    g.log.push({ n: ++g.n, who: who === undefined ? null : who, text, kind: kind || 'info' });
    if (g.log.length > 80) g.log.splice(0, g.log.length - 80);
  }

  function emit(g, type, who, extra) {
    g.event = Object.assign({ n: ++g.n, type, who }, extra);
  }

  function shuffle(list, rng) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ---------- the clock ---------- */

  function remaining(g, now) {
    const c = g.clock;
    if (!c) return null;
    return Math.max(0, c.since === null ? c.left : c.left - (now - c.since));
  }
  function pauseClock(g, now) {
    const c = g.clock;
    if (c && c.since !== null) { c.left = remaining(g, now); c.since = null; }
  }
  function resumeClock(g, now) {
    const c = g.clock;
    if (c && c.since === null) c.since = now;
  }

  /* ---------- rolling for the first turn ---------- */

  /** Everyone rolls two dice; the highest total goes first (ties: first highest after a random tie-break). */
  function roll(g, rng) {
    if (g.phase !== 'roll') return false;
    const r = rng || Math.random;
    const d = () => 1 + Math.floor(r() * 6);
    g.dice = g.players.map(() => [d(), d()]);
    const totals = g.dice.map(([a, b]) => a + b);
    const top = Math.max(...totals);
    const best = totals.map((t, i) => (t === top ? i : -1)).filter(i => i >= 0);
    g.starter = best[Math.floor(r() * best.length)];
    emit(g, 'roll', g.starter);
    note(g, `${g.players[g.starter].name} rolled highest and goes first`, g.starter);
    return true;
  }

  /* ---------- rounds ---------- */

  /** Deal a footballer to every player and start a round. No duplicates within a round. */
  function startRound(g, now, rng) {
    if (g.phase !== 'roll' && g.phase !== 'roundEnd') return false;
    if (g.phase === 'roundEnd' && g.round >= g.cfg.rounds) return false;
    const r = rng || Math.random;
    const ids = Cards.pool(g.cfg).map(c => c.id);
    const fresh = shuffle(ids.filter(id => !g.dealt.includes(id)), r);
    const reuse = shuffle(ids.filter(id => g.dealt.includes(id)), r); // only when the deck runs out
    const deck = fresh.concat(reuse);
    g.round++;
    g.players.forEach(p => {
      Object.assign(p, { card: null, solved: false, out: false, place: 0, clues: [] });
      if (!p.gone) {
        p.card = deck.shift() || null;
        if (p.card && !g.dealt.includes(p.card)) g.dealt.push(p.card);
      }
    });
    g.phase = 'turn';
    g.ask = null;
    if (g.round > 1) g.starter = nextIndex(g, g.starter, p => !p.gone);
    g.turn = g.starter;
    if (!canPlay(g.players[g.turn])) g.turn = nextIndex(g, g.turn, canPlay);
    note(g, g.cfg.mode === 'points' ? `Round ${g.round} of ${g.cfg.rounds}: cards dealt` : 'Cards dealt', null);
    startTurn(g, now);
    return true;
  }

  function nextIndex(g, from, ok) {
    const n = g.players.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k) % n;
      if (ok(g.players[i])) return i;
    }
    return from;
  }

  function startTurn(g, now) {
    g.ask = null;
    const t = g.cfg.timer;
    // on one shared device the clock starts when the player says they're ready
    g.clock = t ? { left: t * 1000, since: g.cfg.play === 'pass' ? null : now } : null;
    emit(g, 'turn', g.turn);
  }

  function endTurn(g, now) {
    g.ask = null;
    if (checkEnd(g)) return;
    g.turn = nextIndex(g, g.turn, canPlay);
    startTurn(g, now);
  }

  // Classic: the first correct guess wins. Points: the round ends when one player (or nobody) is left guessing.
  function checkEnd(g) {
    const left = inRound(g);
    if (g.cfg.mode === 'classic') {
      const solved = g.players.map((p, i) => (p.solved ? i : -1)).filter(i => i >= 0);
      if (solved.length || left.length <= 1) {
        // nobody guessed it but everyone else gave up: the last one standing wins
        g.winners = solved.length ? solved : g.players.map((p, i) => (guessing(p) ? i : -1)).filter(i => i >= 0);
        finish(g, 'gameEnd');
        return true;
      }
      return false;
    }
    if (left.length <= 1) {
      finish(g, 'roundEnd');
      return true;
    }
    return false;
  }

  function finish(g, phase) {
    g.phase = phase;
    g.ask = null;
    g.clock = null;
    if (phase === 'roundEnd') {
      note(g, `End of round ${g.round}`, null);
      emit(g, 'roundEnd', null);
    } else {
      emit(g, 'gameEnd', null);
    }
  }

  /** After the round summary: deal the next round, or finish the game after the last one. */
  function nextRound(g, now, rng) {
    if (g.phase !== 'roundEnd') return false;
    if (g.round >= g.cfg.rounds) {
      const top = Math.max(...g.players.map(p => p.score));
      g.winners = g.players.map((p, i) => (p.score === top ? i : -1)).filter(i => i >= 0);
      finish(g, 'gameEnd');
      return true;
    }
    return startRound(g, now, rng);
  }

  /* ---------- asking & answering ---------- */

  const myTurn = (g, i) => g.phase === 'turn' && g.turn === i && !g.ask && canPlay(g.players[i]);

  /**
   * The player on turn asks a question:
   *   { qid }          a ready-made question (the records can answer it)
   *   { text }         their own question, typed
   *   { spoken: true } asked out loud (a call or the same room)
   */
  function ask(g, i, q, now) {
    if (!myTurn(g, i) || !q) return false;
    let qid = null, text = null;
    if (q.qid) {
      const d = Q.describe(q.qid);
      if (!d) return false;
      qid = q.qid;
      text = d.text;
    } else if (q.text) {
      text = String(q.text).replace(/\s+/g, ' ').trim().slice(0, MAX_QUESTION);
      if (!text) return false;
    } else if (!q.spoken) {
      return false;
    }
    g.ask = { n: ++g.n, by: i, qid, text, votes: {}, order: [] };
    pauseClock(g, now);
    emit(g, 'ask', i);
    return true;
  }

  /** Who answers the open question: everyone else still at the table (computers only for ready-made questions). */
  function voters(g) {
    const a = g.ask;
    if (!a) return [];
    return g.players.map((p, i) => i).filter(i => {
      const p = g.players[i];
      return i !== a.by && !p.gone && !p.away && (!p.isCPU || !!a.qid);
    });
  }

  /** One player's answer: 'yes', 'no', or 'rephrase' (not a fair yes/no question). */
  function vote(g, i, v, now) {
    const a = g.ask;
    if (!a || !VOTES.includes(v) || a.votes[i] || !voters(g).includes(i)) return false;
    a.votes[i] = v;
    a.order.push(i);
    emit(g, 'vote', i, { vote: v });
    settleIfDecided(g, now);
    return true;
  }

  // Majority of the answers. Resolves as soon as the result can't change; a tie goes to the earliest answer.
  function tally(g) {
    const a = g.ask, counts = { yes: 0, no: 0, rephrase: 0 };
    a.order.forEach(i => { counts[a.votes[i]]++; });
    const waiting = voters(g).filter(i => !a.votes[i]).length;
    const ranked = VOTES.slice().sort((x, y) => counts[y] - counts[x] || first(a, x) - first(a, y));
    return { counts, waiting, leader: ranked[0], runnerUp: counts[ranked[1]] };
  }
  const first = (a, v) => { const k = a.order.findIndex(i => a.votes[i] === v); return k < 0 ? 99 : k; };

  function settleIfDecided(g, now) {
    if (!g.ask) return;
    const t = tally(g);
    const cast = g.ask.order.length;
    if (!cast) {
      if (!voters(g).length) resolve(g, 'yes', now); // nobody left to answer: don't block the game
      return;
    }
    if (t.waiting === 0 || t.counts[t.leader] > t.runnerUp + t.waiting) resolve(g, t.leader, now);
  }

  /** Stop waiting for slow answers and go with the votes so far (the room creator's call). */
  function settle(g, now) {
    if (!g.ask || !g.ask.order.length) return false;
    resolve(g, tally(g).leader, now);
    return true;
  }

  /** The group's answer on a shared device (no individual votes). */
  function decide(g, v, now) {
    if (!g.ask || !VOTES.includes(v)) return false;
    resolve(g, v, now);
    return true;
  }

  function resolve(g, v, now) {
    const a = g.ask, i = a.by, p = g.players[i];
    g.ask = null;
    if (v === 'rephrase') {
      emit(g, 'rephrase', i, { text: a.text });
      note(g, `${p.name}'s question was sent back: ask a yes/no question`, i, 'q');
      resumeClock(g, now);
      return;
    }
    p.clues.push({ kind: 'q', qid: a.qid, text: a.text, a: v, n: p.clues.length + 1 });
    note(g, `${p.name}: ${a.text || 'asked out loud'} → ${v.toUpperCase()}`, i, v);
    emit(g, v, i, { text: a.text, qid: a.qid });
    if (v === 'yes') resumeClock(g, now);
    else endTurn(g, now);
  }

  /* ---------- guessing ---------- */

  /**
   * The player on turn names their footballer.
   * Returns 'correct' | 'wrong' | 'ambiguous' (try the full name, turn goes on) | false (not allowed).
   */
  function guess(g, i, text, now) {
    if (!myTurn(g, i)) return false;
    const res = Q.checkGuess(text, card(g, i));
    if (res === 'empty') return false;
    const name = String(text).trim().slice(0, 60);
    if (res === 'ambiguous') {
      emit(g, 'ambiguous', i, { text: name });
      return res;
    }
    settleGuess(g, i, res === 'correct', name, now);
    return res;
  }

  /** On a shared device the group says whether the spoken guess was right. */
  function judgeGuess(g, i, correct, now) {
    if (!myTurn(g, i)) return false;
    settleGuess(g, i, !!correct, '', now);
    return true;
  }

  function settleGuess(g, i, correct, name, now) {
    const p = g.players[i];
    p.clues.push({ kind: 'guess', text: name, a: correct ? 'correct' : 'wrong', n: p.clues.length + 1 });
    if (correct) {
      p.solved = true;
      p.score++;
      p.place = g.players.filter(x => x.solved).length;
      note(g, `${p.name} is ${card(g, i).name}! +1 point`, i, 'correct');
      emit(g, 'correct', i, { card: p.card });
    } else {
      note(g, `${p.name} guessed ${name || 'wrong'}: not it`, i, 'wrong');
      emit(g, 'wrong', i, { text: name });
    }
    endTurn(g, now);
  }

  /** Give up: see your card, sit out the rest of the round. */
  function giveUp(g, i, now) {
    if (!myTurn(g, i)) return false;
    const p = g.players[i];
    p.out = true;
    note(g, `${p.name} gave up: they were ${card(g, i).name}`, i, 'wrong');
    emit(g, 'giveup', i, { card: p.card });
    endTurn(g, now);
    return true;
  }

  /** The turn clock ran out (the device running the game calls this when remaining() hits 0). */
  function timeUp(g, now) {
    if (g.phase !== 'turn' || g.ask || !g.clock || remaining(g, now) > 0) return false;
    const i = g.turn, p = g.players[i];
    p.clues.push({ kind: 'time', a: 'time', n: p.clues.length + 1 });
    note(g, `${p.name} ran out of time`, i, 'no');
    emit(g, 'time', i);
    endTurn(g, now);
    return true;
  }

  /** The shared-device player is holding the card up: start their clock. */
  function startClock(g, now) {
    if (g.phase !== 'turn' || !g.clock) return false;
    resumeClock(g, now);
    return true;
  }

  /* ---------- people coming and going (online) ---------- */

  /** A player lost connection (away = true) or came back. Their turns are skipped while away. */
  function setAway(g, i, away, now) {
    const p = g.players[i];
    if (!p || p.away === away) return false;
    p.away = away;
    if (!away) {
      if (g.phase === 'turn' && !canPlay(g.players[g.turn])) { g.turn = i; startTurn(g, now); } // everyone else had gone
      return true;
    }
    if (g.phase === 'turn') {
      if (g.ask && g.ask.by === i) endTurn(g, now);
      else if (g.ask) { delete g.ask.votes[i]; g.ask.order = g.ask.order.filter(k => k !== i); settleIfDecided(g, now); }
      else if (g.turn === i) endTurn(g, now);
    }
    return true;
  }

  /** The room creator removes a player who isn't coming back. */
  function remove(g, i, now) {
    const p = g.players[i];
    if (!p || p.gone || i === 0) return false;
    p.gone = true;
    p.away = true;
    note(g, `${p.name} left the game`, i);
    if (g.phase === 'turn') {
      if (g.ask && g.ask.by === i) endTurn(g, now);
      else if (g.ask) settleIfDecided(g, now);
      else if (g.turn === i) endTurn(g, now);
      else checkEnd(g);
    }
    return true;
  }

  /* ---------- results ---------- */

  function standings(g) {
    return g.players.map((p, i) => ({ i, name: p.name, score: p.score, gone: p.gone }))
      .sort((a, b) => b.score - a.score || a.i - b.i);
  }

  WOH.Engine = {
    MAX_PLAYERS, MAX_QUESTION, MODES,
    create, roll, startRound, nextRound,
    ask, voters, vote, settle, decide, guess, judgeGuess, giveUp, timeUp, startClock,
    setAway, remove, remaining, standings, card,
    isGuessing: guessing, canPlay,
  };
})(window.WOH);
