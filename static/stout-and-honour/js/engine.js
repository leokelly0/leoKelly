'use strict';
/* =====================================================================
   STOUT & HONOUR — engine.js
   Maths helpers, save data, synthesised sound + trad music, the
   announcer voice, and touch / keyboard / gamepad input.
   Everything is generated at runtime: no audio or image files.
   ===================================================================== */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const chance = (p) => Math.random() < p;
const sgn = (v) => (v < 0 ? -1 : 1);
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeOutQuad = (t) => 1 - (1 - t) * (1 - t);
const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function wpick(list, wf) {
  let tot = 0;
  for (const it of list) tot += Math.max(0, wf(it));
  if (tot <= 0) return list[0];
  let r = Math.random() * tot;
  for (const it of list) { r -= Math.max(0, wf(it)); if (r <= 0) return it; }
  return list[list.length - 1];
}

function roman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let s = '';
  for (const [v, r] of map) while (n >= v) { s += r; n -= v; }
  return s || 'N';
}

/* ---------------------------------------------------------------- save */
const Store = {
  key: 'stout-and-honour-v1',
  data: null,
  defaults() {
    return {
      settings: { music: 0.55, sfx: 0.9, voice: true, lefty: false, shake: true, hints: true, difficulty: 1 },
      story: { unlocked: 0, completed: false, spared: null },
      best: { lockin: 0, lockinWave: 0, bouts: {} },
      seen: {},
    };
  },
  load() {
    let d = null;
    try { const raw = localStorage.getItem(this.key); if (raw) d = JSON.parse(raw); } catch (e) { d = null; }
    const def = this.defaults();
    this.data = d && typeof d === 'object' ? deepMerge(def, d) : def;
    return this.data;
  },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* private mode: fine */ } },
};
function deepMerge(base, over) {
  for (const k in over) {
    const v = over[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object') deepMerge(base[k], v);
    else base[k] = v;
  }
  return base;
}

/* =============================================================== SOUND */
const Sound = (() => {
  let ctx = null, sfxBus = null, musicBus = null, comp = null, noise = null, verbIn = null;
  let sfxVol = 0.9, musVol = 0.55, murmur = null;
  const last = {};

  function init() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ctx = new AC(); } catch (e) { ctx = null; return false; }
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.2;
    const master = ctx.createGain(); master.gain.value = 0.95;
    comp.connect(master); master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol;
    musicBus = ctx.createGain(); musicBus.gain.value = musVol * 0.55;
    sfxBus.connect(comp); musicBus.connect(comp);
    // the room: a short convolution reverb so everything sounds like it's in a snug
    const len = (ctx.sampleRate * 1.4) | 0;
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < len; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
    const verb = ctx.createConvolver(); verb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.2;
    verbIn = ctx.createGain(); verbIn.gain.value = 1;
    verbIn.connect(verb); verb.connect(wet); wet.connect(comp);
    const s1 = ctx.createGain(); s1.gain.value = 0.35; sfxBus.connect(s1); s1.connect(verbIn);
    const s2 = ctx.createGain(); s2.gain.value = 0.5; musicBus.connect(s2); s2.connect(verbIn);
    return true;
  }

  function unlock() {
    if (!init()) return;
    if (ctx.state !== 'running') { try { ctx.resume().catch(() => {}); } catch (e) { /* ignore */ } }
    if (!unlock.done) {
      try { const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource(); s.buffer = b; s.connect(ctx.destination); s.start(0); } catch (e) { /* ignore */ }
      unlock.done = true;
      Music._onUnlock();
    }
  }

  function setVolumes(sfx, mus) {
    sfxVol = sfx; musVol = mus;
    if (!ctx) return;
    sfxBus.gain.setTargetAtTime(sfx, ctx.currentTime, 0.05);
    musicBus.gain.setTargetAtTime(mus * 0.55, ctx.currentTime, 0.05);
  }

  const ok = () => ctx && ctx.state === 'running' && sfxVol > 0.001;
  const okMusic = () => ctx && ctx.state === 'running';

  function envGain(t, a, peak, d, dest) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(dest);
    return g;
  }
  function tone(type, f0, f1, t, a, d, peak, dest, detune) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + a + d);
    if (detune) o.detune.value = detune;
    o.connect(envGain(t, a, peak, d, dest || sfxBus));
    o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }
  function hiss(t, a, d, peak, ftype, f0, f1, q, dest) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = ftype;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + a + d);
    f.Q.value = q || 1;
    s.connect(f); f.connect(envGain(t, a, peak, d, dest || sfxBus));
    s.start(t, Math.random() * 1.5); s.stop(t + a + d + 0.05);
  }
  function throttled(name, ms) {
    const now = performance.now();
    if (last[name] && now - last[name] < ms) return true;
    last[name] = now; return false;
  }
  function voices(t, dur, pitch, vol) { // crowd voices: buzzy saws through vowel formants
    for (let i = 0; i < 4; i++) {
      const f = (120 + i * 37) * pitch * rand(0.97, 1.03);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
      o.frequency.linearRampToValueAtTime(f * rand(0.96, 1.06), t + dur);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = rand(650, 900); bp.Q.value = 2.2;
      o.connect(bp); bp.connect(envGain(t + rand(0, 0.03), 0.04, vol * 0.18, dur, sfxBus));
      o.start(t); o.stop(t + dur + 0.12);
    }
    hiss(t, 0.03, dur, vol * 0.25, 'bandpass', 800, 700, 1.4);
  }

  const sfx = {
    hit(p = 1) {
      if (!ok() || throttled('hit', 22)) return; const t = ctx.currentTime;
      hiss(t, 0.002, 0.06 + 0.05 * p, 0.45 * p, 'bandpass', 2200, 500, 1.1);
      tone('sine', 150 + 50 * p, 48, t, 0.002, 0.12 + 0.06 * p, 0.75 * Math.min(1.2, p));
      tone('triangle', 520, 180, t, 0.001, 0.05, 0.18 * p);
    },
    heavy() {
      if (!ok()) return; const t = ctx.currentTime;
      tone('sine', 120, 34, t, 0.002, 0.42, 1.0);
      hiss(t, 0.002, 0.28, 0.6, 'lowpass', 1800, 200, 0.8);
      hiss(t, 0.001, 0.08, 0.35, 'bandpass', 3000, 900, 1);
    },
    whoosh(p = 1) {
      if (!ok() || throttled('whoosh', 45)) return; const t = ctx.currentTime;
      hiss(t, 0.035, 0.11, 0.16 * p, 'bandpass', 450, 2400, 2.2);
    },
    block() { // bodhrán bong
      if (!ok() || throttled('block', 30)) return; const t = ctx.currentTime;
      tone('sine', 120, 66, t, 0.002, 0.28, 0.85);
      tone('triangle', 240, 140, t, 0.001, 0.08, 0.2);
      hiss(t, 0.001, 0.05, 0.3, 'highpass', 2600, null, 0.7);
    },
    parry() {
      if (!ok()) return; const t = ctx.currentTime;
      [987, 1480, 2217, 2960, 3950].forEach((f, i) => tone('sine', f, f * 0.996, t, 0.001, 0.75 - i * 0.11, 0.22 / (i * 0.6 + 1)));
      hiss(t, 0.001, 0.05, 0.4, 'highpass', 4500, null, 0.7);
      tone('sine', 180, 80, t, 0.002, 0.15, 0.5);
    },
    dodge() { if (!ok()) return; const t = ctx.currentTime; hiss(t, 0.02, 0.16, 0.2, 'bandpass', 900, 3000, 1.6); },
    tele(kind) {
      if (!ok() || throttled('tele' + kind, 60)) return; const t = ctx.currentTime;
      if (kind === 'r') { tone('sawtooth', 240, 170, t, 0.01, 0.22, 0.12); tone('sine', 1700, 1600, t, 0.002, 0.14, 0.16); }
      else if (kind === 'p') { tone('sine', 140, 210, t, 0.12, 0.6, 0.18); tone('sine', 280, 420, t, 0.12, 0.6, 0.06); }
      else if (kind === 'y') { for (let i = 0; i < 5; i++) hiss(t + i * 0.025, 0.001, 0.02, 0.15, 'highpass', 4000); }
      else tone('sine', 2600, 2400, t, 0.002, 0.09, 0.14);
    },
    cheer(amount = 1) {
      if (!ok() || throttled('cheer', 160)) return; const t = ctx.currentTime;
      const a = clamp(amount, 0.2, 1.6);
      hiss(t, 0.12, 0.9 + a * 0.8, 0.22 * a, 'bandpass', 1100, 900, 0.6);
      hiss(t + 0.05, 0.18, 0.7 + a * 0.6, 0.16 * a, 'bandpass', 2600, 2100, 0.9);
      hiss(t, 0.1, 0.8 + a * 0.5, 0.14 * a, 'bandpass', 600, 500, 0.8);
      const n = Math.round(1 + a * 3);
      for (let i = 0; i < n; i++) { const tt = t + rand(0.05, 0.5); const f = rand(1500, 2300); tone('sine', f, f * rand(1.2, 1.5), tt, 0.04, rand(0.15, 0.35), 0.035 * a); }
    },
    boo() {
      if (!ok() || throttled('boo', 900)) return; const t = ctx.currentTime;
      hiss(t, 0.2, 1.1, 0.18, 'lowpass', 600, 380, 0.7);
      for (let i = 0; i < 5; i++) { const f = rand(110, 170); const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.linearRampToValueAtTime(f * 0.86, t + 1.1); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; o.connect(lp); lp.connect(envGain(t + rand(0, 0.15), 0.18, 0.05, 1.0, sfxBus)); o.start(t); o.stop(t + 1.5); }
    },
    chant(kind) {
      if (!ok() || throttled('chant', 2400)) return; const t = ctx.currentTime;
      const pat = kind === 'ole'
        ? [[0, 0.16, 1], [0.2, 0.3, 1.25], [0.62, 0.16, 1], [0.82, 0.3, 1.25], [1.24, 0.16, 1], [1.44, 0.3, 1.25], [1.86, 0.16, 1.1], [2.06, 0.45, 1.0]]
        : [[0, 0.2, 1], [0.24, 0.32, 1.15], [0.72, 0.2, 1], [0.96, 0.32, 1.15], [1.44, 0.2, 1], [1.68, 0.4, 1.15]]; // LYN-CHY! LYN-CHY! LYN-CHY!
      for (const [o, d, p] of pat) { voices(t + o, d, p, 0.9); tone('sine', 90, 70, t + o, 0.003, 0.12, 0.25, musicBus); }
    },
    bell(times = 3) {
      if (!ok()) return; const t = ctx.currentTime;
      for (let k = 0; k < times; k++) { const tt = t + k * 0.32; [1180, 2710, 3960, 5300].forEach((f, i) => tone('sine', f, f * 0.998, tt, 0.001, 1.1 - i * 0.2, 0.16 / (i + 1))); }
    },
    gulp() {
      if (!ok()) return; const t = ctx.currentTime;
      for (let i = 0; i < 3; i++) tone('sine', 320 - i * 25, 120, t + i * 0.14, 0.005, 0.07, 0.35);
      hiss(t + 0.46, 0.04, 0.32, 0.14, 'bandpass', 900, 700, 3);
    },
    crunch() { if (!ok()) return; const t = ctx.currentTime; for (let i = 0; i < 7; i++) hiss(t + i * rand(0.03, 0.06), 0.001, 0.025, 0.22, 'highpass', 3200); },
    clink() { if (!ok() || throttled('clink', 50)) return; const t = ctx.currentTime; tone('sine', 2900, 2880, t, 0.001, 0.25, 0.12); tone('sine', 4300, 4290, t, 0.001, 0.18, 0.07); },
    splash() { if (!ok()) return; const t = ctx.currentTime; hiss(t, 0.005, 0.32, 0.4, 'bandpass', 1600, 500, 0.8); for (let i = 0; i < 4; i++) tone('sine', rand(2500, 4800), null, t + i * 0.035, 0.001, 0.12, 0.08); },
    bark() {
      if (!ok() || throttled('bark', 120)) return; const t = ctx.currentTime;
      for (let i = 0; i < 2; i++) { const tt = t + i * 0.13; const o = ctx.createOscillator(); o.type = 'square'; o.frequency.setValueAtTime(700, tt); o.frequency.exponentialRampToValueAtTime(1150, tt + 0.03); o.frequency.exponentialRampToValueAtTime(560, tt + 0.08); const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 1.6; o.connect(bp); bp.connect(envGain(tt, 0.004, 0.22, 0.08, sfxBus)); o.start(tt); o.stop(tt + 0.12); }
    },
    yelp() { if (!ok()) return; const t = ctx.currentTime; tone('square', 1400, 700, t, 0.004, 0.18, 0.1); },
    growl() { if (!ok() || throttled('growl', 600)) return; const t = ctx.currentTime; const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(95, t); o.frequency.linearRampToValueAtTime(80, t + 0.8); const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; const g = envGain(t, 0.1, 0.12, 0.7, sfxBus); const am = ctx.createOscillator(); am.frequency.value = 23; const ag = ctx.createGain(); ag.gain.value = 0.06; am.connect(ag); ag.connect(g.gain); o.connect(lp); lp.connect(g); o.start(t); am.start(t); o.stop(t + 0.9); am.stop(t + 0.9); },
    rattle(dur = 1.2) {
      if (!ok() || throttled('rattle', 300)) return; const t = ctx.currentTime;
      let tt = 0; while (tt < dur) { hiss(t + tt, 0.001, 0.018, rand(0.06, 0.16), 'bandpass', rand(2000, 5000), null, 3); tt += rand(0.025, 0.06); }
      tone('sine', 2100, 1900, t, 0.05, dur * 0.6, 0.02);
    },
    crash() { if (!ok()) return; const t = ctx.currentTime; hiss(t, 0.002, 0.45, 0.5, 'lowpass', 3500, 400, 0.7); [610, 1130, 1720, 2480].forEach((f) => tone('sine', f, f * 0.98, t, 0.001, rand(0.2, 0.45), 0.08)); tone('sine', 90, 40, t, 0.002, 0.3, 0.6); },
    dart() { if (!ok()) return; const t = ctx.currentTime; hiss(t, 0.005, 0.07, 0.18, 'highpass', 3000, 6000, 0.8); },
    thunk() { if (!ok()) return; const t = ctx.currentTime; tone('sine', 380, 110, t, 0.001, 0.08, 0.3); },
    thud() { if (!ok() || throttled('thud', 40)) return; const t = ctx.currentTime; tone('sine', 85, 38, t, 0.003, 0.22, 0.7); hiss(t, 0.002, 0.12, 0.25, 'lowpass', 500, 200, 0.7); },
    ko() { if (!ok()) return; const t = ctx.currentTime; tone('sine', 75, 28, t, 0.003, 0.75, 1.0); hiss(t, 0.004, 0.6, 0.45, 'lowpass', 900, 120, 0.7); },
    stamp() { if (!ok()) return; const t = ctx.currentTime; tone('sine', 140, 55, t, 0.002, 0.18, 0.9); hiss(t, 0.001, 0.09, 0.4, 'bandpass', 1200, 400, 0.9); },
    special() { if (!ok()) return; const t = ctx.currentTime; hiss(t, 0.5, 0.35, 0.3, 'bandpass', 300, 3200, 1.5); tone('sawtooth', 110, 220, t, 0.5, 0.3, 0.08); },
    fire() { if (!ok() || throttled('fire', 35)) return; const t = ctx.currentTime; tone('sine', 110, 40, t, 0.002, 0.26, 0.6); hiss(t, 0.003, 0.3, 0.35, 'lowpass', 2200, 300, 0.8); for (let i = 0; i < 6; i++) hiss(t + rand(0, 0.3), 0.001, 0.015, 0.1, 'highpass', 3500); },
    charge() { if (!ok()) return; const t = ctx.currentTime; tone('triangle', 520, 1040, t, 0.01, 0.16, 0.12); tone('sine', 1560, 1560, t + 0.06, 0.002, 0.3, 0.08); },
    door() { if (!ok() || throttled('door', 200)) return; const t = ctx.currentTime; tone('sawtooth', 300, 180, t, 0.05, 0.3, 0.025); tone('sine', 120, 70, t + 0.25, 0.002, 0.12, 0.25); },
    ui() { if (!ok() || throttled('ui', 40)) return; const t = ctx.currentTime; tone('sine', 760, 520, t, 0.002, 0.07, 0.14); tone('sine', 1520, 1300, t, 0.001, 0.04, 0.04); },
    shh() { if (!ok()) return; const t = ctx.currentTime; hiss(t, 0.2, 1.2, 0.12, 'highpass', 3500, 2600, 0.8); },
  };

  function crowdLevel(x) {
    if (!okMusic()) return;
    if (!murmur) {
      const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 520; bp.Q.value = 0.8;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300;
      const g = ctx.createGain(); g.gain.value = 0.0001;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 2.7; const lg = ctx.createGain(); lg.gain.value = 0.012;
      lfo.connect(lg); lg.connect(g.gain);
      src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(sfxBus);
      src.start(); lfo.start();
      murmur = { g, bp };
    }
    murmur.g.gain.setTargetAtTime(0.02 + 0.07 * clamp(x, 0, 1.3), ctx.currentTime, 0.5);
    murmur.bp.frequency.setTargetAtTime(430 + 520 * clamp(x, 0, 1.3), ctx.currentTime, 0.5);
  }

  return {
    init, unlock, setVolumes, sfx, crowdLevel, tone, hiss, envGain,
    get ctx() { return ctx; }, get musicBus() { return musicBus; }, get noise() { return noise; },
    get running() { return okMusic(); },
  };
})();

/* =============================================================== MUSIC
   Original tunes in the trad style, written in a tiny ABC-like notation:
   UPPER = octave 4, lower = octave 5, ' raises and , lowers an octave,
   a trailing digit is the length in eighth notes, z is a rest.
   Key signature (sharps) is applied automatically.                    */
const Music = (() => {
  const CH = { D: [50, 57, 62, 66], G: [55, 59, 62, 67], A: [57, 61, 64, 69], Em: [52, 55, 59, 64], Bm: [47, 54, 59, 62], Fs: [54, 57, 61, 66] };
  const STRUM = {
    jig: [[0, 1], [3, 0.7]],
    reel: [[0, 1], [2, 0.45], [3, 0.35], [4, 0.85], [6, 0.45], [7, 0.3]],
    boss: [[0, 1], [3, 0.7], [4, 0.6], [6, 0.8]],
    pad: [[0, 0.7]],
  };
  const DRUMS = {
    jig: [[0, 1, 1], [2, 0.45, 0], [3, 0.8, 1], [5, 0.45, 0]],
    reel: [[0, 1, 1], [1, 0.3, 0], [2, 0.6, 0], [3, 0.3, 0], [4, 0.9, 1], [5, 0.3, 0], [6, 0.6, 0], [7, 0.4, 0]],
    boss: [[0, 1, 1], [1, 0.35, 0], [2, 0.75, 1], [3, 0.35, 0], [4, 1, 1], [5, 0.35, 0], [6, 0.75, 1], [7, 0.55, 0]],
  };
  const DEFS = {
    jig: { // "The Colosseum Jig" — menus and the pub at rest
      unit: 0.178, bar: 6, sharps: 'FC', strum: 'jig', drum: 'jig', whistleUp: 12, fiddle: 0.5, form: ['A', 'A', 'B', 'B'],
      parts: {
        A: 'd2A F2A | Bcd edB | A2F D2F | EFG FED | d2A F2A | Bcd efg | fed ecA | d3 d2A',
        B: 'f2g a2f | gfe fdB | A2d dcd | edc BAG | f2g a2f | gfe fga | baf ecA | d3 d3',
      },
      chords: { A: ['D', 'G', 'D', 'A', 'D', 'G', 'A', 'D'], B: ['D', 'G', 'D', 'A', 'D', 'G', 'A', 'D'] },
    },
    reel: { // "Lynchy's Reel" — the fights
      unit: 0.148, bar: 8, sharps: 'FC', strum: 'reel', drum: 'reel', whistleUp: 12, fiddle: 0.55, form: ['A', 'A', 'B', 'B'],
      parts: {
        A: 'FAA2 BAFA | defd edBA | FAA2 BAFA | BdAF E2DE | FAA2 BAFA | defg afed | BdAF GFEF | D2EF D4',
        B: 'd2fd adfd | gfef gece | d2fd adfd | efge fdBA | d2fd adfd | gfef gabg | afge fdec | d2AF D4',
      },
      chords: { A: ['D', 'D', 'D', 'Em', 'D', 'G', 'A', 'D'], B: ['D', 'G', 'D', 'A', 'D', 'G', 'A', 'D'] },
    },
    boss: { // "The Landlord's Reel" — E dorian, for the big lads
      unit: 0.138, bar: 8, sharps: 'FC', strum: 'boss', drum: 'boss', whistleUp: 12, fiddle: 0.7, drone: 40, form: ['A', 'A', 'B', 'B'],
      parts: {
        A: 'E2BE GEBE | E2BE AFDF | E2BE GEBE | dBAF DEFD | E2BE GEBE | E2ed BAFA | Bcde fdec | dBAF E4',
        B: "g2fg efga | bgaf gefd | e2Be gefg | afdf edBA | g2fg efga | b3a bd'ba | gefd ecdB | AFDF E4",
      },
      chords: { A: ['Em', 'Em', 'Em', 'D', 'Em', 'Em', 'A', 'Em'], B: ['G', 'D', 'Em', 'D', 'G', 'Bm', 'A', 'Em'] },
    },
    air: { // "Barley Fields" — a slow air for the story
      unit: 0.36, bar: 6, sharps: 'FC', strum: 'pad', drum: null, whistleUp: 12, fiddle: 0.35, form: ['A'],
      parts: { A: 'A2d2e2 | f4ed | e2d2B2 | A6 | A2d2e2 | f4a2 | g2f2e2 | f6 | a2f2d2 | e4d2 | B2A2F2 | A6 | d2B2A2 | F2E2D2 | E4F2 | D6' },
      chords: { A: ['D', 'Bm', 'G', 'A', 'D', 'Bm', 'A', 'D', 'D', 'A', 'G', 'D', 'G', 'D', 'A', 'D'] },
    },
  };

  function parseTune(str, sharps) {
    const out = [];
    const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const re = /([_^=]?)([A-Ga-gz])([',]*)(\d*)/g;
    let m;
    while ((m = re.exec(str))) {
      const acc = m[1], letter = m[2], oct = m[3], dur = m[4] ? parseInt(m[4], 10) : 1;
      if (letter === 'z') { out.push([null, dur]); continue; }
      const up = letter.toUpperCase();
      let midi = (letter === up ? 60 : 72) + base[up];
      for (const c of oct) midi += c === "'" ? 12 : -12;
      if (acc === '^') midi += 1; else if (acc === '_') midi -= 1; else if (acc !== '=' && sharps.indexOf(up) >= 0) midi += 1;
      out.push([midi, dur]);
    }
    return out;
  }

  function compile(name) {
    const def = DEFS[name];
    const ev = [];
    let t = 0;
    for (const part of def.form) {
      const notes = parseTune(def.parts[part], def.sharps);
      let u = 0;
      for (const [midi, dur] of notes) { if (midi != null) ev.push({ t: t + u, k: 'n', m: midi, d: dur }); u += dur; }
      const bars = Math.round(u / def.bar);
      const chords = def.chords[part];
      for (let b = 0; b < bars; b++) {
        const bt = t + b * def.bar, ch = CH[chords[b % chords.length]];
        for (const [off, v] of STRUM[def.strum]) ev.push({ t: bt + off, k: 'c', c: ch, v, pad: def.strum === 'pad', d: def.strum === 'pad' ? def.bar : 1 });
        if (def.drum) for (const [off, v, low] of DRUMS[def.drum]) ev.push({ t: bt + off, k: 'd', v, low });
        if (def.drone) ev.push({ t: bt, k: 'r', m: def.drone, d: def.bar });
      }
      t += bars * def.bar;
    }
    ev.sort((a, b) => a.t - b.t);
    return { name, def, unit: def.unit, length: t, events: ev };
  }
  const compiled = {};
  for (const k in DEFS) compiled[k] = compile(k);

  let cur = null, idx = 0, loopStart = 0, timer = null, pending = null;

  /* instruments */
  function whistle(midi, t, dur, vel) {
    const ctx = Sound.ctx, bus = Sound.musicBus;
    const f = mtof(midi);
    const len = Math.max(0.07, dur * 0.9);
    const g = ctx.createGain();
    const peak = 0.11 * vel;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.014);
    g.gain.setValueAtTime(peak * 0.9, t + len - 0.035);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    g.connect(bus);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f, t);
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.setValueAtTime(f * 2, t);
    const g2 = ctx.createGain(); g2.gain.value = 0.22;
    o.connect(g); o2.connect(g2); g2.connect(g);
    if (dur > 0.32) {
      const l = ctx.createOscillator(); l.frequency.value = 5.4;
      const lg = ctx.createGain(); lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(f * 0.007, t + 0.25);
      l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + len + 0.02);
    }
    o.start(t); o2.start(t); o.stop(t + len + 0.03); o2.stop(t + len + 0.03);
  }
  function fiddle(midi, t, dur, vel) {
    const ctx = Sound.ctx, bus = Sound.musicBus;
    const f = mtof(midi), len = Math.max(0.08, dur * 0.95);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2300; lp.Q.value = 0.8;
    const g = ctx.createGain(); const peak = 0.035 * vel;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.03);
    g.gain.setValueAtTime(peak, t + len - 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    lp.connect(g); g.connect(bus);
    for (const det of [-6, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.detune.value = det; o.connect(lp); o.start(t); o.stop(t + len + 0.03); }
  }
  function pluck(midi, t, d, peak) {
    const ctx = Sound.ctx, bus = Sound.musicBus;
    const f = mtof(midi);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2600, t); lp.frequency.exponentialRampToValueAtTime(700, t + d);
    const g = Sound.envGain(t, 0.003, peak, d, bus);
    lp.connect(g);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.connect(lp);
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.setValueAtTime(f * 1.003, t); o2.connect(lp);
    o.start(t); o2.start(t); o.stop(t + d + 0.05); o2.stop(t + d + 0.05);
  }
  function pad(notes, t, d, v) {
    const ctx = Sound.ctx, bus = Sound.musicBus;
    for (const m of notes) {
      const g = ctx.createGain(); const peak = 0.022 * v;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + d * 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + d * 1.05);
      g.connect(bus);
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = mtof(m); o.connect(g); o.start(t); o.stop(t + d * 1.1);
    }
  }
  function drum(t, v, low) {
    const bus = Sound.musicBus;
    if (low) { Sound.tone('sine', 105, 52, t, 0.003, 0.24, 0.42 * v, bus); Sound.hiss(t, 0.001, 0.05, 0.1 * v, 'lowpass', 1000, null, 0.7, bus); }
    else { Sound.hiss(t, 0.001, 0.035, 0.085 * v, 'bandpass', 1900, null, 1.6, bus); Sound.tone('sine', 230, 130, t, 0.002, 0.05, 0.08 * v, bus); }
  }
  function drone(midi, t, d) {
    const ctx = Sound.ctx, bus = Sound.musicBus;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.04, t + 0.06); g.gain.setValueAtTime(0.04, t + d - 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    lp.connect(g); g.connect(bus);
    for (const m of [midi, midi + 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.connect(lp); o.start(t); o.stop(t + d + 0.02); }
  }

  function schedule(ev, t) {
    const u = cur.unit, def = cur.def;
    if (ev.k === 'n') {
      const dur = ev.d * u;
      if (ev.d >= 2 && Math.random() < 0.3 && u > 0.12) { whistle(ev.m + def.whistleUp + 2, t, 0.035, 0.6); whistle(ev.m + def.whistleUp, t + 0.035, dur - 0.035, 1); }
      else whistle(ev.m + def.whistleUp, t, dur, 1);
      if (def.fiddle) fiddle(ev.m, t, dur, def.fiddle);
    } else if (ev.k === 'c') {
      if (ev.pad) pad(ev.c, t, ev.d * u, ev.v);
      else ev.c.forEach((m, i) => pluck(m, t + i * 0.011, 0.32, 0.045 * ev.v));
    } else if (ev.k === 'd') drum(t, ev.v, ev.low);
    else if (ev.k === 'r') drone(ev.m, t, ev.d * u);
  }

  function tick() {
    timer = null;
    if (!cur || !Sound.running) { timer = setTimeout(tick, 120); return; }
    const ctx = Sound.ctx, now = ctx.currentTime, ahead = now + 0.16;
    const loopLen = cur.length * cur.unit;
    if (now - loopStart > loopLen * 2) { loopStart = now + 0.05; idx = 0; }
    let guard = 0;
    while (guard++ < 400) {
      const ev = cur.events[idx];
      const t = loopStart + ev.t * cur.unit;
      if (t > ahead) break;
      if (t >= now - 0.03) schedule(ev, Math.max(t, now));
      idx++;
      if (idx >= cur.events.length) { idx = 0; loopStart += loopLen; }
    }
    timer = setTimeout(tick, 32);
  }

  function play(name) {
    if (!compiled[name]) return;
    pending = name;
    if (!Sound.ctx) return;
    if (cur && cur.name === name) return;
    stop();
    pending = name;
    cur = compiled[name];
    idx = 0; loopStart = Sound.ctx.currentTime + 0.1;
    tick();
  }
  function stop() { if (timer) clearTimeout(timer); timer = null; cur = null; }
  function stinger(kind) {
    stop();
    if (!Sound.running) return;
    const t = Sound.ctx.currentTime + 0.06;
    if (kind === 'win') {
      const seq = [[62, 0, 0.14], [66, 0.15, 0.14], [69, 0.3, 0.14], [74, 0.45, 0.5], [71, 0.98, 0.14], [74, 1.13, 0.8]];
      for (const [m, o, d] of seq) { whistle(m + 12, t + o, d, 1); fiddle(m, t + o, d, 0.6); }
      [0, 0.45, 0.98, 1.13].forEach((o, i) => drum(t + o, 1, i % 2 === 0));
      CH.D.forEach((m, i) => pluck(m, t + 1.13 + i * 0.015, 1.2, 0.06));
    } else if (kind === 'lose') {
      const seq = [[69, 0, 0.35], [66, 0.38, 0.35], [64, 0.76, 0.35], [62, 1.14, 1.2]];
      for (const [m, o, d] of seq) { whistle(m + 12, t + o, d, 0.8); fiddle(m - 12, t + o, d, 0.7); }
      drum(t, 1, 1); drum(t + 1.14, 1, 1);
    }
    pending = null;
  }
  function beatPhase() {
    if (!cur || !Sound.running) return (performance.now() / 1000 * 1.8) % 1;
    const u = (Sound.ctx.currentTime - loopStart) / cur.unit;
    const beat = cur.def.bar === 6 ? 3 : 2;
    return ((u / beat) % 1 + 1) % 1;
  }
  return {
    play, stop, stinger, beatPhase,
    get current() { return cur ? cur.name : null; },
    _onUnlock() { if (pending && !cur) { const p = pending; pending = null; play(p); } },
    _parse: parseTune,
  };
})();

/* =============================================================== VOICE
   The announcer. On an iPhone this picks the Irish English voice when
   the phone has one; elsewhere it falls back to whatever is installed. */
const Voice = {
  enabled: true, voice: null, lastAt: 0, unlocked: false,
  init() {
    if (!('speechSynthesis' in window)) return;
    const choose = () => {
      try {
        const vs = window.speechSynthesis.getVoices() || [];
        this.voice = vs.find((v) => /en[-_]IE/i.test(v.lang)) || vs.find((v) => /moira/i.test(v.name)) || vs.find((v) => /en[-_]GB/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
      } catch (e) { this.voice = null; }
    };
    choose();
    try { window.speechSynthesis.onvoiceschanged = choose; } catch (e) { /* ignore */ }
  },
  unlock() {
    if (this.unlocked || !('speechSynthesis' in window)) return;
    this.unlocked = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); } catch (e) { /* ignore */ }
  },
  say(text, priority = 1, opts = {}) {
    if (!this.enabled || !('speechSynthesis' in window) || !this.unlocked) return;
    const now = performance.now();
    if (priority < 2 && now - this.lastAt < 1600) return;
    try {
      const ss = window.speechSynthesis;
      if (priority >= 2 || ss.pending) ss.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else u.lang = 'en-IE';
      u.rate = opts.rate || 1.02; u.pitch = opts.pitch || 1; u.volume = 1;
      ss.speak(u);
      this.lastAt = now;
    } catch (e) { /* ignore */ }
  },
};

/* =============================================================== INPUT
   Left thumb: a floating joystick anywhere on the left of the screen.
   Right thumb: four big buttons. Keyboard and gamepads work too.       */
const Input = (() => {
  const NAMES = ['strike', 'shield', 'dodge', 'crowd', 'pause'];
  const st = {};
  NAMES.forEach((n) => (st[n] = { srcs: new Set(), p: false, r: false }));
  const ptrs = new Map();
  const keys = new Set();
  const joy = { id: null, active: false, bx: 0, by: 0, kx: 0, ky: 0, vx: 0, vy: 0, R: 56, gx: 0, gy: 0 };
  const B = { strike: { x: 0, y: 0, r: 44 }, shield: { x: 0, y: 0, r: 36 }, dodge: { x: 0, y: 0, r: 33 }, crowd: { x: 0, y: 0, r: 31 }, pause: { x: 0, y: 0, r: 18 } };
  let W = 800, H = 400, safe = { l: 0, r: 0, t: 0, b: 0 }, lefty = false, enabled = false, canvas = null;
  let usingTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  let gpPrev = {}, gpMove = { x: 0, y: 0, m: 0 };
  const KEYMAP = { KeyJ: 'strike', KeyZ: 'strike', KeyK: 'shield', KeyX: 'shield', KeyL: 'dodge', KeyC: 'dodge', Space: 'dodge', KeyI: 'crowd', KeyV: 'crowd', Escape: 'pause', KeyP: 'pause' };
  const MOVEKEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

  function press(n, src) { const s = st[n]; if (!s) return; const was = s.srcs.size; s.srcs.add(src); if (was === 0) s.p = true; }
  function release(n, src) { const s = st[n]; if (!s) return; if (!s.srcs.has(src)) return; s.srcs.delete(src); if (s.srcs.size === 0) s.r = true; }

  function layout(w, h, s, isLefty) {
    W = w; H = h; safe = s; lefty = !!isLefty;
    const k = clamp(h / 390, 0.8, 1.32);
    const ex = (x) => (lefty ? s.l + x : w - s.r - x);
    const by = (y) => h - s.b - y;
    B.strike.x = ex(92 * k); B.strike.y = by(80 * k); B.strike.r = 42 * k;
    B.shield.x = ex(184 * k); B.shield.y = by(50 * k); B.shield.r = 34 * k;
    B.dodge.x = ex(70 * k); B.dodge.y = by(176 * k); B.dodge.r = 31 * k;
    B.crowd.x = ex(162 * k); B.crowd.y = by(140 * k); B.crowd.r = 29 * k;
    B.pause.x = w - s.r - 34; B.pause.y = s.t + 30; B.pause.r = 19;
    joy.R = 54 * k;
    joy.gx = lefty ? w - s.r - 118 * k : s.l + 118 * k;
    joy.gy = h - s.b - 104 * k;
  }

  function updJoy() {
    let dx = joy.kx - joy.bx, dy = joy.ky - joy.by;
    const d = Math.hypot(dx, dy), R = joy.R;
    if (d > R) { joy.bx = joy.kx - (dx / d) * R; joy.by = joy.ky - (dy / d) * R; dx = joy.kx - joy.bx; dy = joy.ky - joy.by; }
    const len = Math.hypot(dx, dy), m = Math.min(1, len / R), dead = 0.16;
    if (m < dead || len < 0.001) { joy.vx = 0; joy.vy = 0; return; }
    const mag = Math.min(1, ((m - dead) / (1 - dead)) * 1.12);
    joy.vx = (dx / len) * mag; joy.vy = (dy / len) * mag;
  }

  function onDown(e) {
    usingTouch = e.pointerType !== 'mouse';
    Sound.unlock(); Voice.unlock();
    if (!enabled) return;
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    if (Math.hypot(x - B.pause.x, y - B.pause.y) < B.pause.r + 16) { ptrs.set(e.pointerId, 'pause'); press('pause', 'p' + e.pointerId); return; }
    const leftZone = lefty ? x > W * 0.55 : x < W * 0.45;
    if (leftZone) {
      if (!joy.active) {
        joy.active = true; joy.id = e.pointerId;
        joy.bx = clamp(x, 24, W - 24); joy.by = clamp(y, 24, H - 24); joy.kx = x; joy.ky = y;
        ptrs.set(e.pointerId, 'joy'); updJoy();
      }
    } else {
      let best = null, bd = Infinity;
      for (const n of ['strike', 'shield', 'dodge', 'crowd']) { const b = B[n]; const d = Math.hypot(x - b.x, y - b.y) - b.r; if (d < bd) { bd = d; best = n; } }
      if (best && bd < 52) { ptrs.set(e.pointerId, best); press(best, 'p' + e.pointerId); }
    }
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  }
  function onMove(e) {
    const what = ptrs.get(e.pointerId);
    if (what === 'joy') { e.preventDefault(); joy.kx = e.clientX; joy.ky = e.clientY; updJoy(); }
  }
  function onUp(e) {
    const what = ptrs.get(e.pointerId);
    if (!what) return;
    ptrs.delete(e.pointerId);
    if (what === 'joy') { joy.active = false; joy.id = null; joy.vx = 0; joy.vy = 0; }
    else release(what, 'p' + e.pointerId);
  }

  function pollGamepad() {
    gpMove.x = 0; gpMove.y = 0; gpMove.m = 0;
    if (!navigator.getGamepads) return;
    let pads;
    try { pads = navigator.getGamepads(); } catch (e) { return; }
    const gp = pads && Array.from(pads).find((p) => p && p.connected);
    if (!gp) return;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, m = Math.hypot(ax, ay);
    if (m > 0.22) { gpMove.x = ax / Math.max(1, m); gpMove.y = ay / Math.max(1, m); gpMove.m = Math.min(1, m); }
    const btn = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    if (btn(12) || btn(13) || btn(14) || btn(15)) {
      const x = (btn(15) ? 1 : 0) - (btn(14) ? 1 : 0), y = (btn(13) ? 1 : 0) - (btn(12) ? 1 : 0);
      const l = Math.hypot(x, y) || 1; gpMove.x = x / l; gpMove.y = y / l; gpMove.m = 1;
    }
    const map = { strike: btn(0), dodge: btn(1), shield: btn(2) || btn(5) || btn(7) || btn(4) || btn(6), crowd: btn(3), pause: btn(9) };
    for (const n in map) {
      if (map[n] && !gpPrev[n]) press(n, 'gp');
      if (!map[n] && gpPrev[n]) release(n, 'gp');
      gpPrev[n] = map[n];
    }
    if (map.strike || map.dodge || map.shield || m > 0.5) usingTouch = false;
  }

  function poll() {
    pollGamepad();
    let mx = joy.vx, my = joy.vy;
    const kx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
    const ky = (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0);
    if (kx || ky) { const l = Math.hypot(kx, ky); mx = kx / l; my = ky / l; }
    if (gpMove.m > Math.hypot(mx, my)) { mx = gpMove.x * gpMove.m; my = gpMove.y * gpMove.m; }
    const out = { mx, my };
    for (const n of NAMES) { const s = st[n]; out[n] = { down: s.srcs.size > 0, pressed: s.p, released: s.r }; s.p = false; s.r = false; }
    return out;
  }

  function reset() {
    for (const n of NAMES) { st[n].srcs.clear(); st[n].p = false; st[n].r = false; }
    ptrs.clear(); joy.active = false; joy.id = null; joy.vx = 0; joy.vy = 0;
  }

  function init(cv) {
    canvas = cv;
    cv.addEventListener('pointerdown', onDown, { passive: false });
    cv.addEventListener('pointermove', onMove, { passive: false });
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('lostpointercapture', onUp);
    cv.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      Sound.unlock(); Voice.unlock();
      if (MOVEKEYS.indexOf(e.code) >= 0 || e.code === 'Space') { if (enabled) e.preventDefault(); usingTouch = false; }
      if (e.repeat) return;
      keys.add(e.code);
      const n = KEYMAP[e.code];
      if (n && enabled) { press(n, 'k' + e.code); usingTouch = false; }
    });
    window.addEventListener('keyup', (e) => { keys.delete(e.code); const n = KEYMAP[e.code]; if (n) release(n, 'k' + e.code); });
    window.addEventListener('blur', () => { keys.clear(); reset(); });
  }

  return {
    init, layout, poll, reset, press, release, B, joy,
    setEnabled(v) { enabled = !!v; if (!enabled) reset(); },
    get enabled() { return enabled; },
    get usingTouch() { return usingTouch; },
    get lefty() { return lefty; },
    isDown(n) { return st[n] && st[n].srcs.size > 0; },
  };
})();
