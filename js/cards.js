/*
 * Builds the footballer cards from the rows in js/data/footballers-*.js and
 * picks the deck for a game. No DOM code: this runs headless in Node too.
 */
window.WOH = window.WOH || {};

(function (WOH) {
  'use strict';

  const GROUP = {
    GK: 'GK', CB: 'DEF', LB: 'DEF', RB: 'DEF', LWB: 'DEF', RWB: 'DEF',
    CDM: 'MID', CM: 'MID', CAM: 'MID', LM: 'MID', RM: 'MID',
    LW: 'FWD', RW: 'FWD', ST: 'FWD', CF: 'FWD', FW: 'FWD',
  };
  const GROUP_NAMES = { GK: 'Goalkeeper', DEF: 'Defender', MID: 'Midfielder', FWD: 'Forward' };

  const ERAS = [
    { id: 'all', name: 'All eras', blurb: 'Anyone, any decade' },
    { id: 'm', name: '2024 onward', blurb: "Today's stars" },
    { id: 't', name: '2010s', blurb: 'The Messi–Ronaldo years' },
    { id: 'z', name: '2000s', blurb: 'Galácticos & Invincibles' },
    { id: 'l', name: 'Legends', blurb: 'Before 2000' },
  ];

  const FAME = [
    { id: 1, name: 'Superstars', blurb: 'Names everyone knows' },
    { id: 2, name: 'Well known', blurb: 'Superstars plus big names' },
    { id: 3, name: 'Everyone', blurb: 'For proper football nerds' },
  ];

  // Lower-case, no accents or punctuation, single spaces: "Ødegaard" → "odegaard".
  const SPECIAL = { ø: 'o', ł: 'l', ß: 'ss', ı: 'i', đ: 'd', æ: 'ae', œ: 'oe', 'ð': 'd', þ: 'th' };
  function normalise(s) {
    return String(s || '').toLowerCase()
      .replace(/[øłßıđæœðþ]/g, c => SPECIAL[c])
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  const slug = s => normalise(s).replace(/ /g, '-');
  const words = s => (s ? String(s).split(/\s+/).filter(Boolean) : []);

  function build(rows) {
    return rows.map(([name, pos, nation, born, active, eras, clubs, leagues, honours, fame, short, aka]) => {
      const clubList = words(clubs);
      const leagueSet = new Set(words(leagues));
      clubList.forEach(c => { if (WOH.CLUBS[c]) leagueSet.add(WOH.CLUBS[c][1]); });
      return {
        id: slug(name),
        name,
        short: short || name,
        pos,
        group: GROUP[pos],
        nation,
        born,
        active: !!active,
        eras: String(eras || '').split(''),
        clubs: clubList,
        leagues: [...leagueSet].filter(l => WOH.LEAGUES[l]),
        honours: honours || '',
        fame,
        aka: aka ? aka.split('|') : [],
      };
    });
  }

  const all = build(WOH.ROWS || []);
  const byId = Object.fromEntries(all.map(c => [c.id, c]));

  /**
   * Cards allowed by the setup options:
   *   era   'all' | 'm' | 't' | 'z' | 'l'
   *   fame  1 | 2 | 3 (include cards up to this fame tier)
   *   club  a WOH.CLUBS code, or '' for any club. A club deck ignores era and fame.
   */
  function pool(opts) {
    const o = opts || {};
    if (o.club) return all.filter(c => c.clubs.includes(o.club));
    return all.filter(c => (o.era === 'all' || !o.era || c.eras.includes(o.era)) && c.fame <= (o.fame || 3));
  }

  // Clubs worth offering as a whole deck: enough cards for a full table.
  function clubDecks(min) {
    const counts = {};
    all.forEach(c => c.clubs.forEach(k => { counts[k] = (counts[k] || 0) + 1; }));
    return Object.keys(counts).filter(k => counts[k] >= (min || 16))
      .sort((a, b) => counts[b] - counts[a])
      .map(k => ({ id: k, name: WOH.CLUBS[k][0], count: counts[k] }));
  }

  const nationName = code => (WOH.NATIONS[code] || [code])[0];
  const continentOf = code => (WOH.NATIONS[code] || [])[1];

  WOH.Cards = { all, byId, pool, clubDecks, normalise, nationName, continentOf, GROUP, GROUP_NAMES, ERAS, FAME };
})(window.WOH);
