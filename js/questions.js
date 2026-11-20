/*
 * The question deck: ready-made YES / NO questions that the records can answer,
 * and the checker that decides whether a guessed name is right.
 *
 * A question is identified by a short id ("club:RMA", "hon:W", "born<:1980"), so
 * only the id travels between devices; every device can rebuild the text.
 * No DOM code.
 */
window.WOH = window.WOH || {};

(function (WOH) {
  'use strict';

  const C = WOH.Cards;
  const BORN = [1950, 1960, 1970, 1980, 1985, 1990, 1995, 2000];

  const CATEGORIES = [
    { id: 'pos', name: 'Position' },
    { id: 'age', name: 'Age & status' },
    { id: 'nation', name: 'Nationality' },
    { id: 'league', name: 'Countries played in' },
    { id: 'club', name: 'Clubs' },
    { id: 'hon', name: 'Trophies' },
  ];

  const HONOURS = {
    B: "Have I won the Ballon d'Or?",
    W: 'Have I won the World Cup?',
    C: 'Have I won the Champions League (or European Cup)?',
    I: 'Have I won a continental title with my country (Euros, Copa América, AFCON…)?',
  };
  const POSITIONS = { GK: 'a goalkeeper', DEF: 'a defender', MID: 'a midfielder', FWD: 'a forward' };

  /** { cat, text } for a question id, or null if the id isn't valid. */
  function describe(id) {
    const [kind, arg] = String(id).split(':');
    switch (kind) {
      case 'pos': return POSITIONS[arg] ? { cat: 'pos', text: `Am I ${POSITIONS[arg]}?` } : null;
      case 'active': return { cat: 'age', text: 'Am I still playing?' };
      case 'born<': return BORN.includes(Number(arg)) ? { cat: 'age', text: `Was I born before ${arg}?` } : null;
      case 'cont': return WOH.CONTINENTS[arg] ? { cat: 'nation', text: `Am I from ${WOH.CONTINENTS[arg]}?` } : null;
      case 'nat': return WOH.NATIONS[arg] ? { cat: 'nation', text: `Am I from ${C.nationName(arg)}?` } : null;
      case 'league': return WOH.LEAGUES[arg] ? { cat: 'league', text: `Have I played club football in ${WOH.LEAGUES[arg]}?` } : null;
      case 'club': return WOH.CLUBS[arg] ? { cat: 'club', text: `Have I played for ${WOH.CLUBS[arg][0]}?` } : null;
      case 'hon': return HONOURS[arg] ? { cat: 'hon', text: HONOURS[arg] } : null;
      default: return null;
    }
  }

  /** What the records say for this question about this card: true (YES) or false (NO). */
  function answer(id, card) {
    const [kind, arg] = String(id).split(':');
    switch (kind) {
      case 'pos': return card.group === arg;
      case 'active': return card.active;
      case 'born<': return card.born < Number(arg);
      case 'cont': return C.continentOf(card.nation) === arg;
      case 'nat': return card.nation === arg;
      case 'league': return card.leagues.includes(arg);
      case 'club': return card.clubs.includes(arg);
      case 'hon': return card.honours.includes(arg);
      default: return null;
    }
  }

  /**
   * Every ready-made question worth asking for a deck of cards, grouped by category.
   * Nations, countries and clubs only appear if they fit at least one card in the deck.
   */
  function catalogue(cards) {
    const ids = ['pos:GK', 'pos:DEF', 'pos:MID', 'pos:FWD', 'active', ...BORN.map(y => `born<:${y}`)];
    const count = key => {
      const n = {};
      cards.forEach(c => [].concat(key(c)).forEach(k => { n[k] = (n[k] || 0) + 1; }));
      return n;
    };
    const conts = count(c => C.continentOf(c.nation));
    Object.keys(WOH.CONTINENTS).filter(k => conts[k]).forEach(k => ids.push(`cont:${k}`));
    const nats = count(c => c.nation);
    Object.keys(nats).sort((a, b) => C.nationName(a).localeCompare(C.nationName(b))).forEach(k => ids.push(`nat:${k}`));
    const leagues = count(c => c.leagues);
    Object.keys(WOH.LEAGUES).filter(k => leagues[k]).forEach(k => ids.push(`league:${k}`));
    const clubs = count(c => c.clubs);
    Object.keys(clubs).filter(k => clubs[k] >= 2)
      .sort((a, b) => WOH.CLUBS[a][0].localeCompare(WOH.CLUBS[b][0])).forEach(k => ids.push(`club:${k}`));
    Object.keys(HONOURS).forEach(k => ids.push(`hon:${k}`));
    return ids.map(id => Object.assign({ id }, describe(id)));
  }

  /* ---------- guess checking ---------- */

  // Levenshtein distance, capped for speed
  function distance(a, b, cap) {
    if (Math.abs(a.length - b.length) > cap) return cap + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        best = Math.min(best, cur[j]);
      }
      if (best > cap) return cap + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  // name variant → set of card ids that answer to it
  let index = null;
  function nameIndex() {
    if (index) return index;
    index = new Map();
    const add = (key, id) => {
      if (!key) return;
      if (!index.has(key)) index.set(key, new Set());
      index.get(key).add(id);
    };
    C.all.forEach(c => {
      [c.name, c.short, ...c.aka].forEach(n => add(C.normalise(n), c.id));
      const parts = C.normalise(c.name).split(' ');
      if (parts.length > 1) add(parts[parts.length - 1], c.id); // surname on its own
    });
    return index;
  }

  const FILLER = /^(?:is it|it s|its|am i|i am|i m|im|are you|my guess is|guess)\s+/;

  /**
   * Check a guessed name against the card on someone's head.
   *   'correct'   it's them (small typos are forgiven)
   *   'ambiguous' that name fits several footballers: ask for the full name, no penalty
   *   'wrong'     it's someone else
   *   'empty'     nothing typed
   */
  function checkGuess(text, card) {
    let g = C.normalise(text);
    while (FILLER.test(g)) g = g.replace(FILLER, '');
    if (!g) return 'empty';
    // an exact full name always counts, even if it's also someone's surname ("Pelé", "Pedro")
    const exact = C.all.find(c => C.normalise(c.name) === g);
    if (exact) return exact.id === card.id ? 'correct' : 'wrong';
    const idx = nameIndex();
    let ids = idx.get(g);
    if (!ids) {
      // fuzzy: closest name variants within a typo budget that grows with the length
      const cap = g.length < 4 ? 0 : g.length < 7 ? 1 : 2;
      let best = cap + 1;
      let found = new Set();
      idx.forEach((set, key) => {
        const d = distance(g, key, cap);
        if (d < best) { best = d; found = new Set(set); } else if (d === best && d <= cap) set.forEach(id => found.add(id));
      });
      if (best > cap) return 'wrong';
      ids = found;
    }
    if (!ids.has(card.id)) return 'wrong';
    return ids.size === 1 ? 'correct' : 'ambiguous';
  }

  WOH.Questions = { CATEGORIES, catalogue, describe, answer, checkGuess };
})(window.WOH);
