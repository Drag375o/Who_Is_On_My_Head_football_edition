/*
 * UI: renders screens from the game state and wires up clicks.
 * Screens: setup → (online: lobby) → game (roll → table / pass-and-play → round end → final).
 * All colours and fonts come from the active theme stylesheet.
 *
 * Who runs the game: on one device (vs Computer, pass & play) this page does.
 * Online, the room creator's page runs it and sends every player a snapshot after each
 * change, with that player's own card blanked out. Other players only send their moves.
 */
(function (WOH) {
  'use strict';

  const E = WOH.Engine, AI = WOH.AI, Q = WOH.Questions, Cards = WOH.Cards, Net = WOH.Net, Sound = WOH.Sound;
  const app = document.getElementById('app');
  const STORE = 'whos-on-my-head:settings';
  const DEFAULTS = {
    play: 'cpu', mode: 'classic', rounds: 3, timer: 0,
    deck: 'mix', era: 'all', fame: 2, club: 'RMA',
    cpus: 2, level: 'normal',
    names: ['Player 1', 'Player 2', 'Player 3'],
    theme: 'board', muted: false,
  };

  // Each theme is one stylesheet in css/themes/, scoped to [data-theme="id"].
  const THEMES = [
    { id: 'board', name: 'Classic Board' },
  ];

  const CPU_NAMES = ['VAR Bot', 'Robo Pundit', 'Gaffer 3000', 'Scout AI', 'Tiki-Taka Bot', 'Data Analyst', 'Kit Man'];

  const RULES = [
    ['Get a card', "Everyone gets a random footballer on their head. You can see everyone's card except your own."],
    ['Roll for first turn', 'Highest roll asks first. Then turns go round the table.'],
    ['Ask YES / NO questions', '"Am I Brazilian?" "Have I played for Real Madrid?" The others may only answer YES or NO, and must answer truthfully.'],
    ['YES: keep going', 'A YES means you ask again. A NO ends your turn and play moves on.'],
    ['Guess any time', 'Name your footballer during your turn. Right: you score. Wrong: your turn ends.'],
    ['Win', 'Classic: the first correct guess wins. Points: 1 point per correct guess over several rounds.'],
  ];

  const HONOUR_NAMES = { B: "Ballon d'Or", W: 'World Cup', C: 'Champions League', I: 'Continental title' };

  let settings = loadSettings();
  if (!THEMES.some(t => t.id === settings.theme)) settings.theme = DEFAULTS.theme;
  applyTheme();
  Sound.setMuted(settings.muted);

  const view = {
    screen: 'setup', game: null, timers: [],
    online: null,     // { role: 'host'|'guest', me, code, status, seats?, lobby?, token? }
    joinCode: '', notice: null,
    tab: 'deck', qcat: 'pos', qText: '', guessText: '', search: '',
    pass: { stage: 'handover', key: 0 },
    seenEvent: 0, cpuKeys: new Set(), askSeen: {}, catalogue: null, catalogueKey: '',
    timeOffset: 0, lastTick: -1,
  };

  /* ---------- helpers ---------- */

  function loadSettings() {
    const base = JSON.parse(JSON.stringify(DEFAULTS));
    try { return Object.assign(base, JSON.parse(localStorage.getItem(STORE)) || {}); } catch (e) { return base; }
  }
  function saveSettings() {
    try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch (e) { /* private mode */ }
  }
  function applyTheme() { document.documentElement.dataset.theme = settings.theme; }

  const esc = s => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pts = n => `${n} pt${n === 1 ? '' : 's'}`;
  const seatClass = i => `s-${i % 8}`;
  const now = () => (isGuest() ? Date.now() - view.timeOffset : Date.now());

  function later(fn, ms) { view.timers.push(setTimeout(fn, ms)); }
  function clearTimers() { view.timers.forEach(clearTimeout); view.timers = []; }

  function go(screen) {
    clearTimers();
    view.screen = screen;
    render();
    window.scrollTo(0, 0);
  }

  const isGuest = () => !!view.online && view.online.role === 'guest';
  const isHost = () => !!view.online && view.online.role === 'host';
  const runsGame = () => !isGuest(); // this page applies the rules

  // Which player is "me" on this device (whose card stays hidden)? -1 on a shared device.
  function me() {
    const g = view.game;
    if (view.online) return view.online.me;
    if (g && g.cfg.play === 'cpu') return 0;
    return -1;
  }
  // May this device make moves for player i?
  function controls(i) {
    const g = view.game;
    if (!g || i < 0 || !g.players[i]) return false;
    if (view.online) return i === view.online.me;
    return !g.players[i].isCPU;
  }
  // May this device run the table (roll, deal, next round)?
  const isChair = () => !view.online || isHost();

  function cardVisible(g, i) {
    const p = g.players[i];
    if (!p.card) return false;
    if (g.phase === 'roundEnd' || g.phase === 'gameEnd') return true;
    if (p.solved || p.out) return true;
    return i !== me();
  }

  function deckLabel(cfg) {
    if (cfg.club) return `${WOH.CLUBS[cfg.club][0]} deck`;
    const era = Cards.ERAS.find(e => e.id === cfg.era) || Cards.ERAS[0];
    const fame = Cards.FAME.find(f => f.id === cfg.fame) || Cards.FAME[1];
    return `${era.name} · ${fame.name}`;
  }

  function modeLabel(g) {
    return g.cfg.mode === 'points' ? `Round ${Math.max(1, g.round)} of ${g.cfg.rounds}` : 'Classic';
  }

  function catalogue(g) {
    const key = JSON.stringify([g.cfg.era, g.cfg.fame, g.cfg.club]);
    if (view.catalogueKey !== key) {
      view.catalogueKey = key;
      view.catalogue = Q.catalogue(Cards.pool(g.cfg));
    }
    return view.catalogue;
  }

  /* ---------- sound & stamps ---------- */

  const fx = document.createElement('div');
  fx.className = 'fx';
  document.body.appendChild(fx);

  function stamp(kind, big, small) {
    fx.innerHTML = `<div class="stamp-layer"><div class="stamp ${kind}">${esc(big)}${small ? `<small>${esc(small)}</small>` : ''}</div></div>`;
    clearTimeout(stamp.t);
    stamp.t = setTimeout(() => { fx.innerHTML = ''; }, 1700);
  }

  function confetti() {
    const colours = [1, 2, 3, 4, 5, 6, 7, 8].map(k => getComputedStyle(document.documentElement).getPropertyValue(`--seat-${k - 1}`).trim() || '#d7262c');
    const bits = Array.from({ length: 90 }, () => {
      const left = Math.random() * 100, dur = 2.2 + Math.random() * 2.4, delay = Math.random() * 1.2;
      const c = colours[Math.floor(Math.random() * colours.length)];
      return `<i style="left:${left}%;background:${c};animation-duration:${dur}s;animation-delay:${delay}s"></i>`;
    }).join('');
    const layer = document.createElement('div');
    layer.className = 'confetti';
    layer.innerHTML = bits;
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 5200);
  }

  // Play the sound / stamp for every engine event this device hasn't shown yet.
  function effects(g) {
    const events = (g && g.events) || [];
    const fresh = events.filter(e => e.n > view.seenEvent);
    if (!fresh.length) return;
    const firstLook = view.seenEvent === 0;
    view.seenEvent = events[events.length - 1].n;
    if (firstLook && fresh.length > 1) return; // just arrived (rejoin, resume): no replay
    const name = i => (g.players[i] ? g.players[i].name : '');
    for (const e of fresh) {
      const mine = controls(e.who);
      switch (e.type) {
        case 'roll': Sound.play('dice'); break;
        case 'turn':
          if (g.phase === 'turn' && mine && g.cfg.play !== 'pass') Sound.play('turn');
          if (g.round === 1 && fresh.some(x => x.type === 'roll')) Sound.play('deal');
          break;
        case 'ask': Sound.play('ask'); if (g.ask) view.askSeen[g.ask.n] = Date.now(); break;
        case 'vote': if (e.who !== me()) Sound.play('vote'); break;
        case 'yes': Sound.play('yes'); stamp('yes', 'Yes!', mine ? 'Keep asking' : `${name(e.who)} keeps going`); break;
        case 'no': Sound.play('no'); stamp('no', 'No', mine ? 'Your turn is over' : `${name(e.who)}'s turn is over`); break;
        case 'rephrase': Sound.play('rephrase'); stamp('info', 'Ask again', 'That needs a yes/no answer'); break;
        case 'ambiguous':
          Sound.play('ambiguous');
          if (mine) { view.notice = `More than one footballer goes by “${e.text}”. Try their full name. Your turn carries on.`; }
          break;
        case 'correct': {
          Sound.play('correct');
          const c = Cards.byId[e.card];
          stamp('correct', 'Correct!', `${name(e.who)} is ${c ? c.name : 'right'}`);
          break;
        }
        case 'wrong': Sound.play('wrong'); stamp('wrong', 'Wrong!', e.text ? `Not ${e.text}` : 'Turn over'); break;
        case 'giveup': {
          Sound.play('giveup');
          const c = Cards.byId[e.card];
          stamp('info', 'Gave up', c ? `${name(e.who)} was ${c.name}` : '');
          break;
        }
        case 'time': Sound.play('time'); stamp('time', "Time's up!", `${name(e.who)}'s turn is over`); break;
        case 'roundEnd': Sound.play('whistle'); break;
        case 'gameEnd': Sound.play('win'); confetti(); break;
      }
    }
  }

  /* ---------- the clock ---------- */

  function clockText(ms) {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function clockBadge(g) {
    if (!g.clock || g.phase !== 'turn') return '';
    const left = E.remaining(g, now());
    const low = left <= 10000 && g.clock.since !== null;
    return `<span class="clock${low ? ' low' : ''}${g.clock.since === null ? ' paused' : ''}" data-clock title="Time left this turn">⏱ <b data-clock-text>${clockText(left)}</b></span>`;
  }

  // Runs 4× a second: updates the clock on screen and ends turns that run out of time.
  setInterval(() => {
    const g = view.game;
    if (view.screen !== 'game' || !g || g.phase !== 'turn' || !g.clock) return;
    const left = E.remaining(g, now());
    const el = document.querySelector('[data-clock-text]');
    if (el) el.textContent = clockText(left);
    const badge = document.querySelector('[data-clock]');
    if (badge) badge.classList.toggle('low', left <= 10000 && g.clock.since !== null);
    const sec = Math.ceil(left / 1000);
    const watching = controls(g.turn) || (g.cfg.play === 'pass');
    if (g.clock.since !== null && sec <= 5 && sec > 0 && sec !== view.lastTick && watching) { view.lastTick = sec; Sound.play('tick'); }
    if (runsGame() && left <= 0 && !g.ask && E.timeUp(g, Date.now())) render();
  }, 250);

  /* ---------- moves ---------- */

  // Apply a move for player i on the device that runs the game. Returns the engine's answer.
  function apply(i, a) {
    const g = view.game, t = Date.now();
    if (!g) return false;
    switch (a.type) {
      case 'ask': return E.ask(g, i, a.q, t);
      case 'vote': return E.vote(g, i, a.v, t);
      case 'guess': return E.guess(g, i, a.text, t, a.id);
      case 'giveup': return E.giveUp(g, i, t);
      case 'spoken': // shared device: the group answers a question asked out loud
        return E.ask(g, i, { spoken: true }, t) && E.decide(g, a.v, t);
      case 'judge': return E.judgeGuess(g, i, a.correct, t);
      case 'start-clock': return E.startClock(g, t);
      default: return false;
    }
  }

  // A move made on this device.
  function move(i, a) {
    if (!controls(i)) return;
    if (isGuest()) { Net.send({ t: 'act', a }); return; }
    const res = apply(i, a);
    if (res) {
      if (a.type === 'ask') view.qText = '';
      if (a.type === 'guess' && res !== 'ambiguous') view.guessText = '';
      render();
    }
  }

  // Computer players think for a moment, then move.
  function scheduleCPU() {
    const g = view.game;
    if (!runsGame() || !g || g.phase !== 'turn') return;
    if (g.ask) {
      E.voters(g).filter(i => g.players[i].isCPU && !g.ask.votes[i]).forEach(i => {
        const key = `v${g.ask.n}-${i}`;
        if (view.cpuKeys.has(key)) return;
        view.cpuKeys.add(key);
        later(() => {
          if (view.game !== g || !g.ask) return;
          const v = AI.vote(g, i);
          if (v && apply(i, { type: 'vote', v })) render();
        }, 500 + Math.random() * 900);
      });
      return;
    }
    const i = g.turn, p = g.players[i];
    if (!p.isCPU || !E.canPlay(p)) return;
    const key = `t${g.n}`;
    if (view.cpuKeys.has(key)) return;
    view.cpuKeys.add(key);
    later(() => {
      if (view.game !== g || g.phase !== 'turn' || g.turn !== i || g.ask) return;
      const d = AI.decide(g, i);
      const ok = d.type === 'ask' ? apply(i, { type: 'ask', q: { qid: d.qid } }) : apply(i, { type: 'guess', text: d.text, id: d.id });
      if (ok) render();
    }, 1100 + Math.random() * 1000);
  }

  /* ---------- setup screen ---------- */

  function chip(key, value, label, cls) {
    const sel = String(settings[key]) === String(value);
    return `<button class="chip${cls ? ' ' + cls : ''}${sel ? ' selected' : ''}" data-action="set" data-key="${key}" data-value="${esc(value)}">${label}</button>`;
  }

  function optionCard(key, value, title, blurb, extra) {
    const sel = String(settings[key]) === String(value);
    return `<button class="option-card${sel ? ' selected' : ''}" data-action="set" data-key="${key}" data-value="${esc(value)}">
      <b>${title}</b><span>${blurb}</span>${extra || ''}</button>`;
  }

  function playersStep() {
    if (settings.play === 'cpu') {
      return `<div class="player-list"><label class="player-row s-0"><span class="dot"></span>
          <input class="text-input" data-name="0" data-keep="name-0" maxlength="16" autocomplete="off" value="${esc(settings.names[0])}" aria-label="Your name"></label></div>
        <p class="field-hint">Computer players</p>
        <div class="choice-row">${[1, 2, 3, 4, 5].map(n => chip('cpus', n, `${n} computer${n > 1 ? 's' : ''}`, 'small')).join('')}</div>
        <p class="field-hint">How good are they?</p>
        <div class="choice-row">${Object.keys(AI.LEVELS).map(l => chip('level', l, AI.LEVELS[l].name, 'small')).join('')}</div>
        <p class="field-hint">${AI.LEVELS[settings.level].blurb}. Against the computer you ask from the question deck, because it can only answer questions it has records for.</p>`;
    }
    if (settings.play === 'pass') {
      const n = Math.max(2, Math.min(E.MAX_PLAYERS, settings.names.length));
      const rows = settings.names.slice(0, n).map((name, i) => `<div class="player-row ${seatClass(i)}"><span class="dot"></span>
        <input class="text-input" data-name="${i}" data-keep="name-${i}" maxlength="16" autocomplete="off" value="${esc(name)}" aria-label="Player ${i + 1} name">
        ${n > 2 ? `<button class="icon-btn" data-action="remove-player" data-i="${i}" aria-label="Remove ${esc(name)}">×</button>` : ''}</div>`).join('');
      return `<div class="player-list">${rows}</div>
        <div class="choice-row" style="margin-top:10px">${n < E.MAX_PLAYERS ? '<button class="btn small" data-action="add-player">+ Add player</button>' : ''}</div>
        <p class="field-hint">One phone or laptop for everyone. On your turn, hold it to your forehead (or turn around) while the others read your card and answer.</p>`;
    }
    return `<div class="player-list"><label class="player-row s-0"><span class="dot"></span>
        <input class="text-input" data-name="0" data-keep="name-0" maxlength="16" autocomplete="off" value="${esc(settings.names[0])}" aria-label="Your name"></label></div>
      <p class="field-hint">Everyone plays on their own phone or computer, with up to ${E.MAX_PLAYERS} players in a room. Create a room and share the code, or join a friend's room below.</p>
      ${joinBox()}`;
  }

  function joinBox() {
    return `<div class="join-box">
      <div class="join-text"><b>Joining a friend's room?</b>
        <small class="muted">Type their ${Net.CODE_LENGTH}-letter code. They choose the deck and rules.</small></div>
      <div class="join-row">
        <input class="code-input" data-code data-keep="code" maxlength="${Net.CODE_LENGTH}" placeholder="ABCDE" value="${esc(view.joinCode)}"
          autocomplete="off" autocapitalize="characters" spellcheck="false" aria-label="Room code">
        <button class="btn" data-action="join">Join room</button>
      </div>
    </div>`;
  }

  function deckStep() {
    const tabs = `<div class="tabs" style="max-width:420px;margin-bottom:12px">
      <button class="tab${settings.deck === 'mix' ? ' selected' : ''}" data-action="set" data-key="deck" data-value="mix">Mixed deck</button>
      <button class="tab${settings.deck === 'club' ? ' selected' : ''}" data-action="set" data-key="deck" data-value="club">Club legends</button></div>`;
    if (settings.deck === 'club') {
      const clubs = Cards.clubDecks(16).map(d => `<button class="club-card${settings.club === d.id ? ' selected' : ''}" data-action="set" data-key="club" data-value="${d.id}">
        ${esc(d.name)} <small>${d.count}</small></button>`).join('');
      return `${tabs}<div class="club-grid">${clubs}</div>
        <p class="field-hint">Every card is someone who played for that club: today's squad, alumni and all-time legends.</p>`;
    }
    const count = (era, fame) => Cards.pool({ era, fame }).length;
    const eras = Cards.ERAS.map(e => optionCard('era', e.id, e.name, e.blurb, `<span class="count">${count(e.id, settings.fame)} cards</span>`)).join('');
    const fame = Cards.FAME.map(f => optionCard('fame', f.id, f.name, f.blurb, `<span class="count">${count(settings.era, f.id)} cards</span>`)).join('');
    return `${tabs}<div class="option-grid">${eras}</div>
      <p class="field-hint">How famous?</p><div class="option-grid">${fame}</div>`;
  }

  function renderSetup() {
    const p = settings.play;
    const themes = THEMES.map(t => `<button class="theme-card${settings.theme === t.id ? ' selected' : ''}" data-action="set" data-key="theme" data-value="${t.id}">
      <span class="tp" data-theme="${t.id}"><i></i><i></i><i></i><i></i></span><span>${t.name}</span></button>`).join('');
    const modes = Object.keys(E.MODES).map(m => optionCard('mode', m, E.MODES[m].name, E.MODES[m].blurb)).join('');
    return `<section class="screen setup">
      <header class="title-block">
        <h1 class="logo"><span class="logo-main">Who's on my head?</span><small>Football Edition</small></h1>
        <p class="tagline">Everyone can see the footballer on your head except you. Ask YES or NO questions, then name them before anyone else.</p>
        <div class="top-tools">${muteButton()}</div>
      </header>
      <div class="board setup-board">
        ${resumeCards()}
        <div class="field">
          <h2 class="step"><span class="num">1</span>How are you playing?</h2>
          <div class="option-grid wide">
            ${optionCard('play', 'cpu', 'vs Computer', 'You against 1 to 5 computer players')}
            ${optionCard('play', 'pass', 'Pass & play', '2 to 8 friends sharing one device')}
            ${optionCard('play', 'online', 'Online', 'Everyone on their own device, with a room code')}
          </div>
        </div>
        <div class="field">
          <h2 class="step"><span class="num">2</span>${p === 'cpu' ? 'You &amp; the computer' : p === 'pass' ? 'Players' : 'Your name'}</h2>
          ${playersStep()}
        </div>
        <div class="field">
          <h2 class="step"><span class="num">3</span>Game mode</h2>
          <div class="option-grid wide">${modes}</div>
          ${settings.mode === 'points' ? `<p class="field-hint">Rounds</p><div class="choice-row">${[3, 5, 7].map(n => chip('rounds', n, `${n} rounds`, 'small')).join('')}</div>` : ''}
        </div>
        <div class="field">
          <h2 class="step"><span class="num">4</span>The deck</h2>
          ${deckStep()}
        </div>
        <div class="field">
          <h2 class="step"><span class="num">5</span>Turn timer</h2>
          <div class="choice-row">${chip('timer', 0, 'Off')}${chip('timer', 30, '30 seconds')}${chip('timer', 60, '60 seconds')}${chip('timer', 90, '90 seconds')}</div>
          <p class="field-hint">Optional. When time runs out, your turn ends. The clock pauses while others answer.</p>
        </div>
        <div class="field">
          <h2 class="step"><span class="num">6</span>Board style</h2>
          <div class="theme-grid">${themes}</div>
        </div>
        <div class="field">
          <h2 class="step"><span class="num">?</span>How to play</h2>
          <ol class="rules">${RULES.map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('')}</ol>
        </div>
        <div class="start-row">${p === 'online'
          ? '<button class="btn primary big" data-action="create-room">Create a room →</button>'
          : '<button class="btn primary big" data-action="start">Deal the cards →</button>'}</div>
      </div>
      <footer class="disclaimer">
        <b>Unofficial fan-made game.</b> Free to play, not sponsored, and not affiliated with or endorsed by FIFA, UEFA,
        Hasbro, or any club, league, player or coach. All names belong to their respective owners and are used only to
        identify them. Footballer facts are written from general knowledge and may contain mistakes.
      </footer>
    </section>`;
  }

  function muteButton() {
    return `<button class="icon-btn" data-action="mute" aria-label="${settings.muted ? 'Turn sound on' : 'Turn sound off'}" title="${settings.muted ? 'Sound off' : 'Sound on'}">${settings.muted ? '🔇' : '🔊'}</button>`;
  }

  function themeSwitch() {
    if (THEMES.length < 2) return '';
    const opts = THEMES.map(t => `<option value="${t.id}"${settings.theme === t.id ? ' selected' : ''}>${t.name}</option>`).join('');
    return `<label class="theme-switch">Board <select data-change="theme">${opts}</select></label>`;
  }

  /* ---------- starting a game ---------- */

  function gameConfig() {
    return {
      play: settings.play, mode: settings.mode, rounds: settings.rounds, timer: settings.timer,
      era: settings.era, fame: settings.fame, club: settings.deck === 'club' ? settings.club : '',
    };
  }

  function startLocalGame() {
    saveSettings();
    let players;
    if (settings.play === 'cpu') {
      const names = CPU_NAMES.slice().sort(() => Math.random() - 0.5);
      players = [{ name: (settings.names[0] || '').trim() || 'You' }]
        .concat(Array.from({ length: settings.cpus }, (_, k) => ({ name: names[k], isCPU: true, level: settings.level })));
    } else {
      players = settings.names.map((n, k) => ({ name: (n || '').trim() || `Player ${k + 1}` }));
    }
    newGame(E.create(gameConfig(), players));
  }

  function newGame(g) {
    view.game = g;
    Object.assign(view, { seenEvent: 0, askSeen: {}, tab: 'deck', qText: '', guessText: '', search: '', pass: { stage: 'handover', key: 0 } });
    view.cpuKeys = new Set();
    go('game');
  }

  /* ---------- game screens ---------- */

  function tableBar(g) {
    const online = view.online ? `<span class="room-chip">Room ${esc(view.online.code)}</span>` : '';
    return `<header class="board table-bar">
      <span class="title">Who's on my head?</span>
      <span class="bar-meta">${modeLabel(g)} · ${esc(deckLabel(g.cfg))}</span>
      ${online}
      ${clockBadge(g)}
      <div class="bar-tools">${themeSwitch()}${muteButton()}
        <button class="btn small ghost" data-action="quit">${view.online ? 'Leave' : 'Quit'}</button></div>
    </header>`;
  }

  function facts(c) {
    const clubs = c.clubs.map(k => WOH.CLUBS[k][0]);
    const honours = c.honours.split('').map(h => HONOUR_NAMES[h]);
    const row = (k, v) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`;
    return `<dl class="deed-facts">
      ${row('Nation', Cards.nationName(c.nation).replace(/^the /, ''))}
      ${row('Position', `${Cards.GROUP_NAMES[c.group]} (${c.pos})`)}
      ${row('Born', c.born)}
      ${row('Status', c.active ? 'Still playing' : 'Retired')}
      ${clubs.length ? row('Clubs', clubs.slice(0, 4).join(', ') + (clubs.length > 4 ? '…' : '')) : ''}
      ${honours.length ? row('Won', honours.join(', ')) : ''}
    </dl>`;
  }

  function seat(g, i) {
    const p = g.players[i], c = Cards.byId[p.card];
    const turn = g.phase === 'turn' && g.turn === i;
    const cls = ['deed', seatClass(i), turn ? 'is-turn' : '', p.away || p.gone ? 'is-away' : ''].filter(Boolean).join(' ');
    const body = c && cardVisible(g, i)
      ? `<div class="deed-name">${esc(c.name)}</div>${facts(c)}`
      : `<div class="deed-back"><b>?</b><span>${i === me() ? "That's you" : 'Hidden'}</span></div>`;
    const status = p.gone ? 'Left'
      : p.solved ? `<b>Got it</b>`
      : p.out ? 'Gave up'
      : p.away ? 'Away'
      : turn ? (g.ask ? '<b>Asking</b>' : '<b>On turn</b>')
      : `${p.clues.length} clue${p.clues.length === 1 ? '' : 's'}`;
    const label = `${p.isCPU ? 'Computer' : `Player ${i + 1}`}${i === me() ? ' · you' : ''}`;
    const removable = isHost() && i !== 0 && p.away && !p.gone && g.phase !== 'gameEnd';
    return `<article class="${cls}">
      <header class="deed-band"><small>${label}</small><b>${esc(p.name)}</b></header>
      <div class="deed-body">${body}</div>
      <footer class="deed-foot"><span class="money" title="Points">${pts(p.score)}</span><span class="status">${status}</span></footer>
      ${removable ? `<div style="padding:0 10px 10px"><button class="btn small ghost" data-action="remove" data-i="${i}">Remove from game</button></div>` : ''}
      ${p.solved ? '<span class="tag-solved">Got it!</span>' : p.out ? '<span class="tag-out">Out</span>' : ''}
    </article>`;
  }

  function tally(g) {
    const a = g.ask;
    const vs = E.voters(g);
    const chips = vs.map(i => {
      const v = a.votes[i];
      return `<span class="${v ? 'v-' + v : ''}">${esc(g.players[i].name)}${v ? `: ${v === 'rephrase' ? 'rephrase' : v.toUpperCase()}` : '…'}</span>`;
    }).join('');
    return `<div class="vote-tally">${chips}</div>`;
  }

  function chanceCard(g) {
    const a = g.ask, asker = g.players[a.by], mine = me();
    const fresh = view.lastAskShown !== a.n;
    view.lastAskShown = a.n;
    const q = a.text ? `<div class="chance-q">${esc(a.text)}</div>` : '<div class="chance-q spoken">Asked out loud</div>';
    const canVote = mine >= 0 && E.voters(g).includes(mine) && !a.votes[mine] && controls(mine);
    let body;
    if (canVote) {
      const truth = a.qid ? (Q.answer(a.qid, E.card(g, a.by)) ? 'YES' : 'NO') : null;
      body = `${truth ? `<span class="records">The records say <b>${truth}</b></span>` : ''}
        <div class="answer-row">
          <button class="btn yes big" data-action="vote" data-v="yes">Yes</button>
          <button class="btn no big" data-action="vote" data-v="no">No</button>
        </div>
        <button class="btn link" data-action="vote" data-v="rephrase">Not a yes/no question: ask again</button>`;
    } else {
      const settleable = isHost() && a.order.length && view.askSeen[a.n] && Date.now() - view.askSeen[a.n] > 12000;
      body = `<p class="muted" style="margin:0">${controls(a.by) ? 'Waiting for the others to answer' : 'Waiting for answers'}<span class="dots"><i>.</i><i>.</i><i>.</i></span></p>
        ${tally(g)}
        ${settleable ? '<button class="btn small" data-action="settle">Go with the answers so far</button>' : ''}`;
    }
    return `<div class="chance ${seatClass(a.by)}${fresh ? ' enter' : ''}">
      <span class="chance-kicker">${esc(asker.name)} asks</span>
      ${q}${body}
    </div>`;
  }

  function questionDeck(g, i) {
    const asked = new Set(g.players[i].clues.map(c => c.qid).filter(Boolean));
    const all = catalogue(g);
    const s = Cards.normalise(view.search);
    const list = s ? all.filter(q => Cards.normalise(q.text).includes(s)) : all.filter(q => q.cat === view.qcat);
    const cats = Q.CATEGORIES.map(c => `<button class="chip small${!s && view.qcat === c.id ? ' selected' : ''}" data-action="qcat" data-cat="${c.id}">${c.name}</button>`).join('');
    const items = list.map(q => `<button class="q-item" data-action="ask-q" data-qid="${q.id}"${asked.has(q.id) ? ' disabled title="Already asked"' : ''}>${esc(q.text)}</button>`).join('')
      || '<p class="hint">No questions match.</p>';
    return `<input class="text-input q-search" data-model="search" data-keep="search" placeholder="Search questions: Brazil, Real Madrid, World Cup…" value="${esc(view.search)}" autocomplete="off">
      <div class="q-cats">${cats}</div>
      <div class="q-list">${items}</div>`;
  }

  function turnPanel(g, i) {
    const cpuGame = g.cfg.play === 'cpu';
    const tabs = [['deck', 'Question deck'], ...(cpuGame ? [] : [['own', 'Own question']]), ['guess', 'Guess']];
    if (!tabs.some(([id]) => id === view.tab)) view.tab = 'deck';
    let body;
    if (view.tab === 'deck') {
      body = questionDeck(g, i);
    } else if (view.tab === 'own') {
      body = `<div class="ask-row">
          <input class="text-input" data-model="qText" data-keep="qtext" data-enter="ask-text" maxlength="${E.MAX_QUESTION}" placeholder="Am I left-footed?" value="${esc(view.qText)}" autocomplete="off">
          <button class="btn primary" data-action="ask-text">Ask</button></div>
        ${view.online ? '<button class="btn small ghost" data-action="ask-spoken">I asked out loud (voice or video call)</button>' : ''}
        <p class="hint">Anything with a factual YES or NO answer. The others answer from their own screens.</p>`;
    } else {
      body = `<div class="ask-row">
          <input class="text-input" data-model="guessText" data-keep="guess" data-enter="guess" maxlength="60" placeholder="Type a footballer's name" value="${esc(view.guessText)}" autocomplete="off" spellcheck="false">
          <button class="btn primary" data-action="guess">Guess</button></div>
        <p class="hint">Right: you score${g.cfg.mode === 'classic' ? ' and win' : ' 1 point'}. Wrong: your turn ends. Small typos are fine.</p>`;
    }
    return `<div class="board panel ${seatClass(i)}">
      <h2 class="panel-title">Your turn, <span class="seat-text">${esc(g.players[i].name)}</span></h2>
      <div class="tabs">${tabs.map(([id, label]) => `<button class="tab${view.tab === id ? ' selected' : ''}" data-action="tab" data-tab="${id}">${label}</button>`).join('')}</div>
      ${body}
      <div class="giveup-row"><button class="btn link" data-action="giveup">Give up and see my card</button></div>
    </div>`;
  }

  function waitingPanel(g) {
    const p = g.players[g.turn];
    const what = p.isCPU ? 'is thinking' : 'is deciding what to ask';
    return `<div class="board panel waiting ${seatClass(g.turn)}">
      <h2 class="panel-title"><span class="seat-text">${esc(p.name)}</span> ${what}<span class="dots"><i>.</i><i>.</i><i>.</i></span></h2>
      <p class="hint">${p.isCPU ? 'The computer asks from the question deck.' : 'When they ask, you answer YES or NO here.'}</p>
    </div>`;
  }

  function clueText(c) {
    if (c.kind === 'time') return 'Ran out of time';
    if (c.kind === 'guess') return c.text ? `Guessed ${c.text}` : 'Guessed';
    return c.text || `Question ${c.n} (out loud)`;
  }

  function notebook(g, i, title) {
    if (i < 0) return '';
    const items = g.players[i].clues.map(c => `<li><span class="n">${c.n}</span><span>${esc(clueText(c))}</span>
      <span class="ans ${c.a}">${c.a === 'time' ? 'time' : c.a}</span></li>`).join('');
    return `<div class="board panel notebook"><h3>${title || 'Your clues'}</h3>
      <ol>${items || '<li class="empty">No answers yet. Start broad: position, nationality, still playing?</li>'}</ol></div>`;
  }

  function logPanel(g) {
    const items = g.log.slice(-14).reverse().map(e =>
      `<li class="k-${e.kind}${e.who !== null ? ' ' + seatClass(e.who) : ''}">${esc(e.text)}</li>`).join('');
    return `<div class="board panel log"><h3>At the table</h3><ol>${items || '<li class="empty">Nothing yet</li>'}</ol></div>`;
  }

  function renderTable(g) {
    let center;
    if (g.ask) center = chanceCard(g);
    else if (controls(g.turn) && !g.players[g.turn].isCPU) center = turnPanel(g, g.turn);
    else center = waitingPanel(g);
    const freshDeal = view.dealtRound !== g.round;
    view.dealtRound = g.round;
    return `<section class="screen table">
      ${tableBar(g)}
      <div class="table-grid">
        <div class="seats-grid">${g.players.map((p, i) => seat(g, i).replace('class="deed', `class="deed${freshDeal ? ' fresh' : ''}`)).join('')}</div>
        <div class="side">${center}${notebook(g, me())}${logPanel(g)}</div>
      </div>
    </section>`;
  }

  /* pass & play: one device, the active player holds it to their forehead */

  function lastTurnEvent(g) {
    const t = g.events.filter(e => e.type === 'turn');
    return t.length ? t[t.length - 1].n : 0;
  }

  function renderPass(g) {
    const i = g.turn, p = g.players[i], key = lastTurnEvent(g);
    if (view.pass.key !== key) view.pass = { stage: 'handover', key };
    const scores = g.cfg.mode === 'points' || g.players.some(x => x.solved || x.out)
      ? `<p class="muted" style="margin:0">${g.players.map((x, k) => `<span class="${seatClass(k)}"><b class="seat-text">${esc(x.name)}</b> ${pts(x.score)}${x.solved ? ' ✓' : x.out ? ' (out)' : ''}</span>`).join(' · ')}</p>` : '';
    if (view.pass.stage === 'handover') {
      const yes = p.clues.filter(c => c.a === 'yes').length, no = p.clues.filter(c => c.a === 'no').length;
      const guesses = p.clues.filter(c => c.kind === 'guess').length;
      return `<section class="screen pass">
        ${tableBar(g)}
        <div class="board handover ${seatClass(i)}">
          <p class="kicker">Pass the device to</p>
          <div class="who">${esc(p.name)}</div>
          <p>Hold it to your forehead with the screen facing out, or turn around while the others read your card.
          Ask your questions out loud; the others tap the answers.</p>
          ${p.clues.length ? `<p class="muted">So far: ${yes} YES · ${no} NO${guesses ? ` · ${guesses} wrong guess${guesses > 1 ? 'es' : ''}` : ''}</p>` : '<p class="muted">First turn this round. Start broad: position, nationality, still playing?</p>'}
          <button class="btn primary huge" data-action="show-card">I'm ready: show my card</button>
          ${scores}
        </div>
      </section>`;
    }
    const c = E.card(g, i);
    return `<section class="screen pass">
      ${tableBar(g)}
      <div class="forehead ${seatClass(i)}">
        <div class="big-card">
          <header class="deed-band"><small>On ${esc(p.name)}'s head</small><b>${esc(p.name)}</b></header>
          <div class="big-name">${esc(c.name)}</div>
          <div class="big-meta">${esc(Cards.nationName(c.nation).replace(/^the /, ''))} · ${Cards.GROUP_NAMES[c.group]} · born ${c.born}</div>
          ${facts(c)}
        </div>
        <div class="board group-pad">
          <p class="flip-note">Everyone else: ${esc(p.name)} asks out loud, you tap the answer.</p>
          <div class="answer-row">
            <button class="btn yes" data-action="spoken" data-v="yes">Yes</button>
            <button class="btn no" data-action="spoken" data-v="no">No</button>
          </div>
          <div class="guess-row">
            <button class="btn" data-action="judge" data-correct="1">✓ Guessed it right</button>
            <button class="btn" data-action="judge" data-correct="0">✗ Wrong guess</button>
          </div>
          <div class="choice-row center">
            <button class="btn link" data-action="giveup">${esc(p.name)} gives up</button>
          </div>
          ${scores}
        </div>
      </div>
    </section>`;
  }

  /* who goes first */

  function die(v, rolling) {
    return `<span class="die${rolling ? ' rolling' : ''}" data-v="${v || 0}">${'<i></i>'.repeat(9)}</span>`;
  }

  function renderRoll(g) {
    const rolled = !!g.dice;
    const fresh = rolled && view.rolledShown !== g.n;
    view.rolledShown = g.n;
    const seats = g.players.map((p, i) => {
      const d = rolled ? g.dice[i] : [0, 0];
      return `<div class="dice-seat ${seatClass(i)}${rolled && i === g.starter ? ' best' : ''}">
        <b class="seat-text">${esc(p.name)}</b>
        <div class="dice">${die(d[0], fresh)}${die(d[1], fresh)}</div>
        <span class="total">${rolled ? d[0] + d[1] : '–'}</span></div>`;
    }).join('');
    const action = !isChair()
      ? `<p class="muted">Waiting for ${esc(g.players[0].name)} to ${rolled ? 'deal' : 'roll'}<span class="dots"><i>.</i><i>.</i><i>.</i></span></p>`
      : rolled
        ? '<button class="btn primary big" data-action="deal">Deal the cards →</button>'
        : '<button class="btn primary big" data-action="roll">🎲 Roll the dice</button>';
    return `<section class="screen roll">
      ${tableBar(g)}
      <div class="board roll-board">
        <h2 class="board-title">Who goes first?</h2>
        <p class="muted" style="margin:0">Everyone rolls two dice. Highest total asks first.</p>
        <div class="dice-grid">${seats}</div>
        ${rolled ? `<p class="disp" style="margin:0;font-size:1.4rem"><span class="${seatClass(g.starter)}"><span class="seat-text">${esc(g.players[g.starter].name)}</span></span> goes first!</p>` : ''}
        ${action}
      </div>
    </section>`;
  }

  /* end of a round, end of the game */

  function standings(g) {
    const rows = E.standings(g);
    const top = rows.length ? rows[0].score : 0;
    return `<table class="standings"><thead><tr><th></th><th>Player</th><th class="pts">Points</th></tr></thead><tbody>
      ${rows.map((r, k) => `<tr class="${r.score === top && top > 0 ? 'top' : ''} ${seatClass(r.i)}">
        <td class="pos">${k + 1}</td><td class="pname"><span class="seat-text">${esc(r.name)}</span>${r.gone ? ' <small class="muted">(left)</small>' : ''}</td>
        <td class="pts"><span class="money">${pts(r.score)}</span></td></tr>`).join('')}</tbody></table>`;
  }

  function renderRoundEnd(g) {
    const solved = g.players.filter(p => p.solved).length;
    return `<section class="screen round-end">
      ${tableBar(g)}
      <div class="board result-banner">
        <p class="kicker">End of round ${g.round} of ${g.cfg.rounds}</p>
        <h1 class="result-title">${solved ? `${solved} footballer${solved > 1 ? 's' : ''} named` : 'Nobody got it'}</h1>
        ${standings(g)}
        <div class="end-actions">${isChair()
          ? `<button class="btn primary big" data-action="next-round">${g.round >= g.cfg.rounds ? 'Final results →' : `Deal round ${g.round + 1} →`}</button>`
          : `<p class="muted">Waiting for ${esc(g.players[0].name)}<span class="dots"><i>.</i><i>.</i><i>.</i></span></p>`}</div>
      </div>
      <h2 class="step">Who was on everyone's head</h2>
      <div class="seats-grid reveal-grid">${g.players.map((p, i) => seat(g, i)).join('')}</div>
    </section>`;
  }

  function renderFinal(g) {
    const w = g.winners;
    const names = w.map(i => esc(g.players[i].name));
    const title = !w.length ? 'No winner' : w.length === 1 ? `${names[0]} wins!` : `${names.join(' & ')} share the win!`;
    const wc = w.length === 1 ? seatClass(w[0]) : '';
    const sub = g.cfg.mode === 'classic' && w.length === 1 && g.players[w[0]].solved
      ? `${names[0]} named ${esc(E.card(g, w[0]).name)} first.` : '';
    return `<section class="screen final">
      <div class="board result-banner ${wc}">
        <p class="kicker">Full time</p>
        <h1 class="result-title">${title}</h1>
        ${sub ? `<p>${sub}</p>` : ''}
        ${g.cfg.mode === 'points' ? standings(g) : ''}
        <div class="end-actions">${isGuest()
          ? `<p class="muted">Waiting for ${esc(g.players[0].name)}<span class="dots"><i>.</i><i>.</i><i>.</i></span></p><button class="btn big" data-action="leave">Leave room</button>`
          : `<button class="btn primary big" data-action="rematch">Play again</button>
             <button class="btn big" data-action="${view.online ? 'leave' : 'new'}">${view.online ? 'Close room' : 'New game'}</button>`}</div>
      </div>
      <h2 class="step">Who was on everyone's head</h2>
      <div class="seats-grid reveal-grid">${g.players.map((p, i) => seat(g, i)).join('')}</div>
    </section>`;
  }

  function renderGame() {
    const g = view.game;
    if (!g) return renderSetup();
    switch (g.phase) {
      case 'roll': return renderRoll(g);
      case 'turn': return g.cfg.play === 'pass' ? renderPass(g) : renderTable(g);
      case 'roundEnd': return renderRoundEnd(g);
      default: return renderFinal(g);
    }
  }

  /* ---------- online rooms ---------- */

  const HOSTED = 'whos-on-my-head:hosted-game'; // room creator: the game in progress, to resume after a reload
  const JOINED = 'whos-on-my-head:joined-room'; // joiner: room code + seat pass, to rejoin later
  const SAVE_HOURS = 12;
  const RECONNECT_TRIES = 40, RECONNECT_GAP = 3000;

  function readSaved(key) {
    try {
      const s = JSON.parse(localStorage.getItem(key));
      if (s && Date.now() - s.savedAt < SAVE_HOURS * 3600e3) return s;
    } catch (e) { /* corrupt or blocked */ }
    forget(key);
    return null;
  }
  function writeSaved(key, data) {
    try { localStorage.setItem(key, JSON.stringify(Object.assign({ savedAt: Date.now() }, data))); } catch (e) { /* full or blocked */ }
  }
  function forget(key) {
    try { localStorage.removeItem(key); } catch (e) { /* blocked */ }
  }

  const cleanName = (s, fallback) => String(s || '').trim().slice(0, 16) || fallback;
  const myName = () => cleanName(settings.names[0], 'Player');

  function lobbyInfo() {
    const o = view.online;
    return {
      code: o.code,
      seats: o.seats.map(s => ({ name: s.name, connected: s.connected })),
      summary: `${E.MODES[settings.mode].name}${settings.mode === 'points' ? ` · ${settings.rounds} rounds` : ''} · ${deckLabel(gameConfig())}${settings.timer ? ` · ${settings.timer}s turns` : ''}`,
    };
  }

  // The game as seat k may see it: their own card is blanked out until it's revealed.
  function gameFor(k) {
    const g = view.game;
    if (!g) return null;
    const copy = JSON.parse(JSON.stringify(g));
    const p = copy.players[k];
    if (p && copy.phase !== 'roundEnd' && copy.phase !== 'gameEnd' && !p.solved && !p.out) p.card = null;
    return copy;
  }

  function seatOf(c) { return view.online.seats.findIndex(s => s.conn === c); }

  function broadcast() {
    Net.broadcast(c => {
      const k = seatOf(c);
      if (k < 0) return null;
      return { t: 'state', screen: view.screen, me: k, sentAt: Date.now(), lobby: lobbyInfo(), game: gameFor(k) };
    });
  }

  /* room creator */

  function createRoom() {
    if (!Net.available()) { view.notice = 'Online play needs an internet connection.'; render(); return; }
    saveSettings();
    forget(HOSTED);
    view.resume = null;
    view.game = null;
    const o = view.online = { role: 'host', me: 0, code: '', status: 'creating', seats: [{ name: myName(), token: 'host', connected: true }] };
    go('lobby');
    Net.host(onHostEvent)
      .then(code => { o.code = code; o.status = 'open'; render(); })
      .catch(err => leaveRoom(err.message));
  }

  function resumeHost() {
    const saved = readSaved(HOSTED);
    view.resume = null;
    if (!saved) { render(); return; }
    if (!Net.available()) { view.notice = 'Online play needs an internet connection.'; render(); return; }
    const o = view.online = {
      role: 'host', me: 0, code: saved.code, status: 'creating', resuming: true,
      seats: saved.seats.map((s, k) => ({ name: s.name, token: s.token, connected: k === 0 })),
    };
    view.game = saved.game;
    Object.assign(view, { seenEvent: 0, askSeen: {}, notice: null });
    view.cpuKeys = new Set();
    go('lobby');
    Net.host(onHostEvent, { code: saved.code })
      .then(code => {
        o.status = 'open';
        o.resuming = false;
        o.code = code;
        o.seats.forEach((s, k) => { if (k > 0) E.setAway(view.game, k, true, Date.now()); });
        if (code !== saved.code) view.notice = `Room ${saved.code} was still busy, so your game reopened as room ${code}. Send the new code to everyone.`;
        go('game');
      })
      .catch(err => leaveRoom(err.message, { keep: true }));
  }

  function onHostEvent(ev) {
    const o = view.online;
    if (!o) return;
    const g = view.game;
    if (ev.type === 'message' && ev.msg.t === 'hello') {
      const token = String(ev.msg.token || ''), name = cleanName(ev.msg.name, 'Player');
      const k = o.seats.findIndex((s, i) => i > 0 && s.token === token);
      if (k > 0) {
        // a known player coming back
        const s = o.seats[k];
        if (s.conn && s.conn !== ev.from) Net.kick(s.conn, { t: 'replaced' });
        Object.assign(s, { conn: ev.from, connected: true });
        Net.accept(ev.from);
        if (g) { E.setAway(g, k, false, Date.now()); view.notice = `${s.name} is back.`; }
        Sound.play('join');
      } else if (g) {
        Net.reject(ev.from, { t: 'started' });
        return;
      } else if (o.seats.length >= E.MAX_PLAYERS) {
        Net.reject(ev.from, { t: 'full' });
        return;
      } else {
        o.seats.push({ name, token, conn: ev.from, connected: true });
        Net.accept(ev.from);
        Sound.play('join');
      }
      render();
    } else if (ev.type === 'message' && ev.msg.t === 'act' && ev.active) {
      const k = seatOf(ev.from), a = ev.msg.a || {};
      if (k < 0 || !g || !['ask', 'vote', 'guess', 'giveup'].includes(a.type)) return;
      const clean = { type: a.type };
      if (a.type === 'ask') clean.q = a.q && a.q.qid ? { qid: String(a.q.qid) } : a.q && a.q.spoken ? { spoken: true } : { text: String((a.q && a.q.text) || '') };
      if (a.type === 'vote') clean.v = String(a.v);
      if (a.type === 'guess') clean.text = String(a.text || '');
      if (apply(k, clean)) render();
    } else if (ev.type === 'message' && ev.msg.t === 'bye' && ev.active) {
      const k = seatOf(ev.from);
      if (k > 0) o.seats[k].leaving = true;
    } else if (ev.type === 'left') {
      const k = seatOf(ev.from);
      if (k <= 0) return;
      const s = o.seats[k];
      s.conn = null;
      s.connected = false;
      Sound.play('leave');
      if (!g) {
        o.seats.splice(k, 1); // lobby: free the seat
      } else if (s.leaving) {
        E.remove(g, k, Date.now());
        view.notice = `${s.name} left the game.`;
      } else {
        E.setAway(g, k, true, Date.now());
        view.notice = `${s.name} lost connection. Their turns are skipped until they rejoin with code ${o.code}.`;
      }
      render();
    } else if (ev.type === 'error') {
      view.notice = ev.message;
      render();
    }
  }

  function startOnline() {
    const o = view.online;
    saveSettings();
    o.seats = o.seats.filter((s, k) => k === 0 || s.connected);
    if (o.seats.length < 2) { view.notice = 'You need at least one friend in the room.'; render(); return; }
    newGame(E.create(gameConfig(), o.seats.map(s => ({ name: s.name }))));
  }

  /* joiner */

  function joinRoom() {
    const code = Net.normaliseCode(view.joinCode);
    if (code.length !== Net.CODE_LENGTH) { view.notice = `Room codes are ${Net.CODE_LENGTH} letters.`; render(); return; }
    if (!Net.available()) { view.notice = 'Online play needs an internet connection.'; render(); return; }
    saveSettings();
    const prev = readSaved(JOINED);
    const rejoining = !!prev && prev.code === code;
    const o = view.online = { role: 'guest', me: -1, code, token: rejoining ? prev.token : Net.makeToken(), status: 'connecting', lobby: null };
    view.notice = null;
    view.rejoin = null;
    view.game = null;
    view.seenEvent = 0;
    go('lobby');
    connectGuest(o).catch(err => leaveRoom(err.message, { keep: rejoining }));
  }

  function connectGuest(o) {
    return Net.join(o.code, onGuestEvent).then(() => {
      if (view.online !== o) { Net.close(); return; }
      o.status = 'joined';
      writeSaved(JOINED, { code: o.code, token: o.token });
      Net.send({ t: 'hello', name: myName(), token: o.token });
      render();
    });
  }

  function guestReconnect(reason) {
    const o = view.online;
    if (!o || o.reconnecting) return;
    o.reconnecting = true;
    let tries = 0;
    view.notice = () => `${esc(reason)} Reconnecting<span class="dots"><i>.</i><i>.</i><i>.</i></span>`;
    render();
    const attempt = () => {
      if (view.online !== o) return;
      tries++;
      connectGuest(o)
        .then(() => {
          if (view.online !== o) return;
          o.reconnecting = false;
          view.notice = null;
          render();
        })
        .catch(() => {
          if (view.online !== o) return;
          if (tries >= RECONNECT_TRIES) leaveRoom(`Couldn't reconnect to room ${o.code}. You can rejoin from this screen once it's back.`, { keep: true });
          else o.retry = setTimeout(attempt, RECONNECT_GAP);
        });
    };
    o.retry = setTimeout(attempt, 1000);
  }

  function onGuestEvent(ev) {
    const o = view.online;
    if (!o) return;
    if (ev.type === 'message') {
      const msg = ev.msg;
      if (msg.t === 'state') {
        const newGameArrived = msg.game && (!view.game || msg.game.n < view.game.n);
        if (newGameArrived) { view.seenEvent = 0; view.dealtRound = 0; }
        view.game = msg.game;
        o.me = msg.me;
        o.lobby = msg.lobby;
        view.timeOffset = Date.now() - msg.sentAt;
        writeSaved(JOINED, { code: o.code, token: o.token });
        if (msg.screen !== view.screen) { view.screen = msg.screen; window.scrollTo(0, 0); }
        render();
      } else if (msg.t === 'full') {
        leaveRoom(`That room is full (${E.MAX_PLAYERS} players).`);
      } else if (msg.t === 'started') {
        leaveRoom("That game has already started. Ask the room creator to start a new one, or rejoin from the device you joined with.");
      } else if (msg.t === 'replaced') {
        leaveRoom('You joined this room from another tab or device, so this one was disconnected.', { keep: true });
      } else if (msg.t === 'closed') {
        leaveRoom('The room creator closed the room.');
      } else if (msg.t === 'away') {
        guestReconnect('The room creator dropped out.');
      }
    } else if (ev.type === 'left') {
      guestReconnect('Lost connection to the room.');
    } else if (ev.type === 'error') {
      view.notice = ev.message;
      render();
    }
  }

  /* both */

  // opts.keep: keep the saved game / seat pass so it can be resumed later
  function leaveRoom(message, opts) {
    const o = view.online, keep = !!(opts && opts.keep);
    if (o) {
      clearTimeout(o.retry);
      if (o.role === 'host' && !keep) { Net.broadcast(() => ({ t: 'closed' })); forget(HOSTED); }
      if (o.role === 'guest' && !keep) { Net.send({ t: 'bye' }); forget(JOINED); }
    }
    Net.close(o ? 300 : 0); // give the goodbye time to arrive
    view.online = null;
    view.game = null;
    view.notice = message || null;
    view.resume = readSaved(HOSTED);
    view.rejoin = readSaved(JOINED);
    go('setup');
  }

  function resumeCards() {
    const cards = [];
    const r = view.resume, j = view.rejoin;
    if (r) {
      cards.push(`<div class="resume-card">
        <div class="join-text"><b>Your online game is saved</b>
          <small class="muted">Room ${esc(r.code)} · ${r.seats.length} players · ${r.game.phase === 'gameEnd' ? 'full time' : `round ${Math.max(1, r.game.round)}`}</small></div>
        <div class="join-row">
          <button class="btn primary" data-action="resume-host">Resume game</button>
          <button class="btn ghost small" data-action="discard-host">Discard</button>
        </div>
      </div>`);
    }
    if (j) {
      cards.push(`<div class="resume-card">
        <div class="join-text"><b>Rejoin your online game?</b>
          <small class="muted">Room ${esc(j.code)}. Your seat is saved for you.</small></div>
        <div class="join-row">
          <button class="btn primary" data-action="rejoin">Rejoin</button>
          <button class="btn ghost small" data-action="dismiss-rejoin">Dismiss</button>
        </div>
      </div>`);
    }
    return cards.join('');
  }

  function renderLobby() {
    const o = view.online, host = o.role === 'host';
    let body;
    if (o.status === 'creating' || o.status === 'connecting' || (!host && !o.lobby)) {
      body = `<p>${o.resuming ? `Reopening room <b>${esc(o.code)}</b>` : host ? 'Creating your room' : `Joining room <b>${esc(o.code)}</b>`}<span class="dots"><i>.</i><i>.</i><i>.</i></span></p>`;
    } else {
      const info = host ? lobbyInfo() : o.lobby;
      const seats = Array.from({ length: E.MAX_PLAYERS }, (_, k) => {
        const s = info.seats[k];
        return s
          ? `<li class="${seatClass(k)}"><span class="seat-name">${esc(s.name)}</span><small class="muted">${k === 0 ? 'room creator' : ''}${k === o.me ? ' · you' : ''}</small></li>`
          : `<li class="empty">Empty seat</li>`;
      }).join('');
      const ready = info.seats.length >= 2;
      body = `<p class="muted" style="margin:0">${host ? 'Share this code with your friends' : "You're in room"}</p>
        <div class="room-code" aria-label="Room code ${esc(info.code)}">${String(info.code).split('').map(c => `<span>${c}</span>`).join('')}</div>
        ${host ? '<button class="btn small" data-action="copy-code">Copy code</button>' : ''}
        <ul class="seats">${seats}</ul>
        <p class="muted" style="margin:0">${esc(info.summary)}</p>
        ${host
          ? `<button class="btn primary big" data-action="online-start"${ready ? '' : ' disabled'}>${ready ? 'Start the game →' : 'Waiting for friends…'}</button>`
          : `<p>Waiting for <b>${esc(info.seats[0].name)}</b> to start<span class="dots"><i>.</i><i>.</i><i>.</i></span></p>`}`;
    }
    return `<section class="screen lobby">
      <div class="board lobby-board">
        <h2 class="board-title">${host ? 'Your room' : 'Online room'}</h2>
        <div class="top-tools">${themeSwitch()}${muteButton()}</div>
        ${body}
        <button class="btn small ghost" data-action="leave">Leave room</button>
      </div>
    </section>`;
  }

  /* ---------- render & events ---------- */

  function render() {
    const screens = { setup: renderSetup, lobby: renderLobby, game: renderGame };
    const entering = view.screen !== view.renderedScreen;
    view.renderedScreen = view.screen;
    document.documentElement.dataset.screen = view.screen;

    // keep typing focus across re-renders
    const active = document.activeElement;
    const keep = active && active.dataset && active.dataset.keep;
    const sel = keep && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;

    const n = view.notice;
    const notice = n
      ? `<div class="notice" role="status"><span>${typeof n === 'function' ? n() : esc(n)}</span><button data-action="dismiss" aria-label="Dismiss">×</button></div>`
      : '';
    const html = notice + screens[view.screen]();
    app.innerHTML = html;
    if (entering) { const s = app.querySelector('.screen'); if (s) s.classList.add('enter'); }

    if (keep) {
      const el = app.querySelector(`[data-keep="${keep}"]`);
      if (el) { el.focus(); if (sel) { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text field */ } } }
    }

    if (view.screen === 'game' && view.game) {
      effects(view.game);
      scheduleCPU();
    }
    if (isHost() && view.online.status === 'open') {
      broadcast();
      if (view.game) {
        const o = view.online;
        writeSaved(HOSTED, { code: o.code, game: view.game, seats: o.seats.map(s => ({ name: s.name, token: s.token })) });
      }
    }
  }

  function quit() {
    const msg = view.online
      ? (isHost() ? 'Close the room? The game ends for everyone.' : 'Leave this online game?')
      : 'Quit this game? Progress will be lost.';
    if (!window.confirm(msg)) return;
    if (view.online) leaveRoom(); else { view.game = null; go('setup'); }
  }

  app.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const d = el.dataset, g = view.game;
    const quiet = ['vote', 'ask-q', 'ask-text', 'ask-spoken', 'guess', 'spoken', 'judge', 'roll', 'deal', 'show-card', 'mute'];
    if (!quiet.includes(d.action)) Sound.play('click');
    switch (d.action) {
      case 'set': {
        const numeric = ['rounds', 'timer', 'fame', 'cpus'].includes(d.key);
        settings[d.key] = numeric ? Number(d.value) : d.value;
        if (d.key === 'theme') applyTheme();
        if (d.key === 'play' && d.value === 'pass' && settings.names.length < 2) settings.names.push('Player 2');
        saveSettings(); render();
        break;
      }
      case 'add-player':
        if (settings.names.length < E.MAX_PLAYERS) settings.names.push(`Player ${settings.names.length + 1}`);
        saveSettings(); render();
        break;
      case 'remove-player':
        if (settings.names.length > 2) settings.names.splice(Number(d.i), 1);
        saveSettings(); render();
        break;
      case 'mute':
        settings.muted = !settings.muted;
        Sound.setMuted(settings.muted);
        if (!settings.muted) Sound.play('select');
        saveSettings(); render();
        break;
      case 'start':
        if (settings.play === 'pass' && settings.names.length < 2) settings.names.push('Player 2');
        startLocalGame();
        break;
      case 'create-room': createRoom(); break;
      case 'join': joinRoom(); break;
      case 'leave': leaveRoom(); break;
      case 'online-start': if (isHost()) startOnline(); break;
      case 'resume-host': resumeHost(); break;
      case 'discard-host': forget(HOSTED); view.resume = null; render(); break;
      case 'rejoin': view.joinCode = view.rejoin.code; joinRoom(); break;
      case 'dismiss-rejoin': forget(JOINED); view.rejoin = null; render(); break;
      case 'copy-code':
        if (navigator.clipboard) navigator.clipboard.writeText(view.online.code).then(() => { el.textContent = 'Copied!'; }, () => {});
        break;
      case 'dismiss': view.notice = null; render(); break;
      case 'quit': quit(); break;
      case 'new': view.game = null; go('setup'); break;

      // the table
      case 'roll':
        if (isChair() && g && E.roll(g)) render();
        break;
      case 'deal':
        if (isChair() && g && E.startRound(g, Date.now())) render();
        break;
      case 'next-round':
        if (isChair() && g && E.nextRound(g, Date.now())) render();
        break;
      case 'rematch':
        if (!isChair() || !g) break;
        if (view.online) startOnline();
        else newGame(E.create(g.cfg, g.players.map(p => ({ name: p.name, isCPU: p.isCPU, level: p.level }))));
        break;
      case 'remove':
        if (isHost() && g && E.remove(g, Number(d.i), Date.now())) render();
        break;
      case 'tab': view.tab = d.tab; render(); break;
      case 'qcat': view.qcat = d.cat; view.search = ''; render(); break;
      case 'ask-q':
        Sound.play('click');
        move(g.turn, { type: 'ask', q: { qid: d.qid } });
        break;
      case 'ask-text':
        if (view.qText.trim()) move(g.turn, { type: 'ask', q: { text: view.qText } });
        break;
      case 'ask-spoken':
        move(g.turn, { type: 'ask', q: { spoken: true } });
        break;
      case 'guess':
        if (view.guessText.trim()) move(g.turn, { type: 'guess', text: view.guessText });
        break;
      case 'giveup':
        if (window.confirm('Give up? You will see your card and sit out the rest of the round.')) move(g.turn, { type: 'giveup' });
        break;
      case 'vote':
        if (g && g.ask) move(me(), { type: 'vote', v: d.v });
        break;
      case 'settle':
        if (isHost() && g && E.settle(g, Date.now())) render();
        break;

      // one shared device
      case 'show-card':
        Sound.play('deal');
        view.pass.stage = 'card';
        apply(g.turn, { type: 'start-clock' });
        render();
        break;
      case 'spoken':
        move(g.turn, { type: 'spoken', v: d.v });
        break;
      case 'judge':
        move(g.turn, { type: 'judge', correct: d.correct === '1' });
        break;
    }
  });

  app.addEventListener('change', e => {
    if (e.target.dataset.change !== 'theme') return;
    settings.theme = e.target.value;
    applyTheme();
    saveSettings();
  });

  app.addEventListener('input', e => {
    const t = e.target, d = t.dataset;
    if (d.code !== undefined) {
      view.joinCode = Net.normaliseCode(t.value);
      t.value = view.joinCode;
    } else if (d.name !== undefined) {
      settings.names[Number(d.name)] = t.value;
      saveSettings();
    } else if (d.model) {
      view[d.model] = t.value;
      if (d.model === 'search') render();
    }
  });

  app.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const t = e.target;
    if (t.dataset.code !== undefined) joinRoom();
    else if (t.dataset.enter) { const btn = app.querySelector(`[data-action="${t.dataset.enter}"]`); if (btn) btn.click(); }
  });

  // If the room creator reloads or closes the tab, the game is saved and can be
  // resumed, so tell everyone to wait and keep reconnecting.
  window.addEventListener('beforeunload', () => { if (isHost()) Net.broadcast(() => ({ t: 'away' })); });

  view.resume = readSaved(HOSTED);
  view.rejoin = readSaved(JOINED);
  render();
})(window.WOH);
