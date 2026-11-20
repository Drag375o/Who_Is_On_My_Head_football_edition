/*
 * Sound effects, synthesised with the Web Audio API (no audio files to load).
 * Sound.play('yes') etc. Browsers only allow audio after the first click or key
 * press, so the context is created lazily on the first play().
 */
window.WOH = window.WOH || {};

(function (WOH) {
  'use strict';

  let ctx = null, master = null, noiseBuf = null;
  let muted = false, volume = 0.6;

  function audio() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    // one second of white noise for rattles, swishes and crowd
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }

  // a single note with a quick attack and an exponential fade
  function tone(freq, start, dur, opts) {
    const o = Object.assign({ type: 'sine', gain: 0.25, slideTo: null }, opts);
    const t = ctx.currentTime + start;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type;
    osc.frequency.setValueAtTime(freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  // filtered noise: rattles, swishes, crowd
  function noise(start, dur, opts) {
    const o = Object.assign({ gain: 0.2, freq: 1200, q: 1, type: 'bandpass', sweepTo: null }, opts);
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf;
    f.type = o.type;
    f.Q.value = o.q;
    f.frequency.setValueAtTime(o.freq, t);
    if (o.sweepTo) f.frequency.exponentialRampToValueAtTime(o.sweepTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  const N = { C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, B4: 493.9, C5: 523.3, D5: 587.3, E5: 659.3, G5: 784, A5: 880, C6: 1046.5 };

  const SOUNDS = {
    // UI
    click: () => tone(1400, 0, 0.04, { type: 'square', gain: 0.05 }),
    select: () => { tone(880, 0, 0.06, { type: 'triangle', gain: 0.1 }); tone(1320, 0.04, 0.07, { type: 'triangle', gain: 0.08 }); },
    // dice tumbling on the board, then landing
    dice: () => {
      for (let k = 0; k < 9; k++) noise(k * 0.07 + Math.random() * 0.02, 0.05, { freq: 2200 + Math.random() * 1800, q: 6, gain: 0.22 });
      tone(180, 0.68, 0.12, { type: 'triangle', gain: 0.25 });
      tone(150, 0.78, 0.12, { type: 'triangle', gain: 0.2 });
    },
    // cards being dealt
    deal: () => { for (let k = 0; k < 4; k++) noise(k * 0.09, 0.09, { type: 'highpass', freq: 5000, sweepTo: 1800, gain: 0.12 }); },
    // a card flipping over to show a question
    ask: () => { noise(0, 0.12, { type: 'highpass', freq: 3000, sweepTo: 8000, gain: 0.1 }); tone(N.E5, 0.05, 0.18, { gain: 0.15 }); tone(N.A5, 0.14, 0.26, { gain: 0.13 }); },
    // someone else answered
    vote: () => tone(660, 0, 0.08, { type: 'triangle', gain: 0.12, slideTo: 990 }),
    yes: () => { tone(N.C5, 0, 0.14, { type: 'triangle', gain: 0.2 }); tone(N.E5, 0.08, 0.14, { type: 'triangle', gain: 0.2 }); tone(N.G5, 0.16, 0.3, { type: 'triangle', gain: 0.22 }); },
    no: () => { tone(170, 0, 0.42, { type: 'sawtooth', gain: 0.12, slideTo: 110 }); tone(174, 0, 0.42, { type: 'square', gain: 0.05, slideTo: 112 }); },
    rephrase: () => { tone(N.G4, 0, 0.12, { type: 'triangle', gain: 0.15 }); tone(N.G4, 0.16, 0.12, { type: 'triangle', gain: 0.15 }); },
    // nearly: not a clear enough name
    ambiguous: () => { tone(N.E5, 0, 0.1, { gain: 0.15 }); tone(N.D5, 0.1, 0.1, { gain: 0.15 }); tone(N.E5, 0.2, 0.16, { gain: 0.15 }); },
    // till "cha-ching" plus a fanfare and a cheer
    correct: () => {
      [N.C5, N.E5, N.G5, N.C6].forEach((f, k) => tone(f, k * 0.09, k === 3 ? 0.5 : 0.16, { type: 'triangle', gain: 0.22 }));
      tone(2637, 0.38, 0.25, { type: 'square', gain: 0.05 });
      tone(3136, 0.44, 0.35, { type: 'square', gain: 0.05 });
      noise(0.3, 1.1, { freq: 1500, q: 0.6, gain: 0.08 });
    },
    wrong: () => { tone(N.G4, 0, 0.18, { type: 'square', gain: 0.08, slideTo: N.F4 }); tone(N.E4, 0.2, 0.18, { type: 'square', gain: 0.08, slideTo: N.D4 }); tone(N.C4, 0.4, 0.45, { type: 'square', gain: 0.08, slideTo: 200 }); },
    giveup: () => tone(N.A4, 0, 0.6, { type: 'sine', gain: 0.15, slideTo: N.C4 }),
    // it's your turn
    turn: () => { tone(N.G5, 0, 0.25, { gain: 0.14 }); tone(N.C6, 0.1, 0.4, { gain: 0.12 }); },
    // the last seconds of the turn clock
    tick: () => tone(2000, 0, 0.03, { type: 'square', gain: 0.04 }),
    time: () => { tone(880, 0, 0.16, { type: 'square', gain: 0.08 }); tone(880, 0.22, 0.16, { type: 'square', gain: 0.08 }); tone(660, 0.44, 0.4, { type: 'square', gain: 0.08 }); },
    // referee's whistle: round over
    whistle: () => { tone(2600, 0, 0.2, { type: 'sine', gain: 0.12 }); tone(2600, 0.25, 0.55, { type: 'sine', gain: 0.12, slideTo: 2500 }); noise(0.25, 0.55, { freq: 2600, q: 8, gain: 0.04 }); },
    // trophy fanfare and a crowd roar
    win: () => {
      [[N.C5, 0], [N.C5, 0.12], [N.C5, 0.24], [N.E5, 0.36], [N.G5, 0.6], [N.E5, 0.78], [N.G5, 0.9]].forEach(([f, s], k) =>
        tone(f, s, k === 6 ? 0.9 : 0.14, { type: 'triangle', gain: 0.22 }));
      noise(0.2, 2.2, { freq: 900, q: 0.4, gain: 0.12, sweepTo: 1400 });
    },
    join: () => { tone(N.C5, 0, 0.1, { gain: 0.12 }); tone(N.G5, 0.08, 0.2, { gain: 0.12 }); },
    leave: () => { tone(N.G5, 0, 0.1, { gain: 0.1 }); tone(N.C5, 0.08, 0.22, { gain: 0.1 }); },
  };

  function play(name) {
    if (muted || !SOUNDS[name]) return;
    try {
      if (!audio()) return;
      if (ctx.state === 'suspended') ctx.resume();
      SOUNDS[name]();
    } catch (e) { /* audio is a nice-to-have */ }
  }

  function setMuted(m) { muted = !!m; }
  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (master) master.gain.value = volume;
  }

  WOH.Sound = { play, setMuted, setVolume, isMuted: () => muted, NAMES: Object.keys(SOUNDS) };
})(window.WOH);
