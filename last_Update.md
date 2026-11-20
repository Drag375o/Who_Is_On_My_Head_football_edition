# Who's on My Head?: Last Update

**Current version:** 0.1
**Last updated:** 2026-11-21

This file records what the game does now and how it got there. Read it before changing anything, and update it after every change (same routine as Auction XI's `last_Update.md`).

---

## Instructions for agents and developers

1. **Read this whole file first.**
2. **Make your change**, then run the tests (see [Testing](#testing)).
3. **Update "Current state" so it is true again.** Fix or delete outdated lines; don't just add below them.
4. **Add a version entry at the top of "Version history"** and bump the version: minor (0.1 → 0.2) for anything a player would notice, patch (0.1 → 0.1.1) for fixes.
5. **Update `README.md`** if players would notice the change.
6. **Commit and push after each small feature or component.** Commits are authored by the owner only, with no co-author lines.

---

## Current state (version 0.1)

### Game
- **Modes of play:** vs Computer (1 human + 1–5 computers), Pass & play (2–8 on one device), Online (2–8 devices, PeerJS room code).
- **Win modes:** Classic (first correct guess wins; if everyone else gives up, the last player left wins) and Points (3/5/7 rounds, 1 point per correct guess, a round ends when ≤ 1 player is still guessing).
- **Turn:** ask (ready-made `qid`, typed text, or spoken) → answers → YES continues, NO ends the turn, "rephrase" sends it back. Guess any time on your turn; wrong ends the turn, ambiguous name means "try the full name" with no penalty. Give up = out for the round.
- **Answers:** majority of the other players still at the table (computers vote only on ready-made questions). Settles as soon as the result can't change; tie → earliest answer. Host can settle early ("Go with the answers so far", shown after 12 s).
- **Timer:** off / 30 / 60 / 90 s, pauses while answers are open. In pass & play it starts on "I'm ready".
- **First turn:** two dice each, highest total (random among ties). Later rounds start with the next player.
- **Dealing:** no duplicates within a round; cards already dealt this game come back only when the deck runs out.

### Data (`js/data/`)
- **519 footballers:** Auction XI's ~250 plus club squads (2025–26) and alumni/legends.
- Row format is documented at the top of `footballers-core.js`. Clubs listed per player only cover clubs in `WOH.CLUBS` (61 well-known clubs); leagues are countries (`WOH.LEAGUES`).
- **Honours:** B Ballon d'Or, W World Cup, C Champions League/European Cup, I continental title with country. Recorded up to 2024–25 and the 2025 Ballon d'Or. **Not included:** 2026 World Cup, 2025–26 trophies, transfers after mid-2026.
- **Decks:** era (`m` 2024+, `t` 2010s, `z` 2000s, `l` legends, or all) × fame (1 superstars 78, ≤2 well known, ≤3 everyone), or one club (24 clubs have ≥ 16 cards: Real Madrid 88, Barcelona 84, Man Utd 68 …).
- Data was written from general knowledge, not an external source. Known shared nicknames: "El Príncipe" (Milito / Francescoli) → ambiguous, which is intended.

### Computer player (`js/ai.js`)
- Candidates = deck − cards on other heads − cards contradicting its clues (falls back to "most consistent" if a human answered wrongly).
- Hard: best split question; Normal: random among top 4; Easy: random useful question and early guesses.
- Answers ready-made questions truthfully from the records.

### Online (`js/net.js`, online part of `js/ui.js`)
- PeerJS 1.5.4 from unpkg; id prefix `whos-on-my-head-room-`; 5-letter codes without I/O.
- Host runs the engine and sends each guest `state {screen, me, sentAt, lobby, game}` with **that guest's own card set to null** until revealed. Guests send `hello {name, token}`, `act {a}`, `bye`.
- Host → guest also: `full`, `started`, `replaced`, `closed`, `away`.
- Heartbeat: ping every 2 s, dropped after 10 s silence. Guests auto-reconnect (40 tries × 3 s). Away players are skipped (`E.setAway`); host can remove them (`E.remove`).
- Storage keys: `whos-on-my-head:settings`, `whos-on-my-head:hosted-game` (resume, 12 h), `whos-on-my-head:joined-room` (rejoin, 12 h).
- Guests show the turn clock using `sentAt` to correct for clock differences between devices.

### Look and sound
- Themes: `board` (default, Monopoly-inspired: mint board, property-colour strips, title-deed seats, chance cards), plus Auction XI's `midnight`, `whiteboard`, `chalkboard`, `pitch`, `sketchbook`. Seat colours `--seat-0…7`.
- Sounds are synthesised in `js/sound.js` (no files). Mute is saved in settings.

### Testing
- `node tests/check-data.js`, `node tests/check-questions.js`, `node tests/simulate.js` (240 games).
- `python tests/ui_play.py` (vs Computer 3 rounds, pass & play desktop + phone) and `python tests/ui_play.py online` (3 devices, a mid-game reload and rejoin). Screenshots in `tests/out/` (git-ignored).

### Known limitations
- Footballer facts may contain mistakes and stop at mid-2026 (see Data).
- Online depends on the room creator's tab and the free PeerJS server. Strict networks without a TURN relay may fail to connect.
- The room creator's browser holds every card, so a technical player could peek. It's meant for friendly games.
- Pass & play has no typed questions or guesses: the group answers out loud and taps the result.
- Not deployed anywhere yet.

---

## Version history

### 0.1 · 2026-11-21 · First playable version
**Changed:** everything above: database, question deck, engine, computer player, sounds, online rooms, six themes, tests.
**Tested:** all Node checks; Chrome playthroughs of vs Computer (3 rounds vs 3 Hard computers), pass & play at 1280px and 390px, and a 3-device online game through the real PeerJS server with a reload + rejoin. No page errors.
**Deployed:** no.
