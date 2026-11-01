'use strict';
/* =====================================================================
   STOUT & HONOUR — ui.js
   DOM screens (title, menu, story cards, results, settings), the story
   flow between bouts, and the boot + main loop.
   ===================================================================== */

const SPEAKERS = { narrator: '', marcus: "Marcus O'Reilly", mike: 'Mike Lynch', commodus: "Commodus O'Dowd", proximo: 'Proximo', cassius: 'Cassius, the quizmaster', tigris: 'Tigris of Galway', crowd: 'The crowd' };
const $ = (id) => document.getElementById(id);

const Flow = {
  screen: null, after: null, cards: null, ci: 0, typing: false, typeTimer: null, typeText: '', typeN: 0,
  rotateShown: false, lastResult: null, settingsFrom: null,

  init() {
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', (e) => { e.preventDefault(); Sound.unlock(); Voice.unlock(); Sound.sfx.ui(); fn(e); }); };
    on('b-enter', () => this.menu());
    on('b-story', () => this.storyMenu());
    on('b-lockin', () => this.startLockIn());
    on('b-howto', () => this.show('s-howto'));
    on('b-settings', () => this.settings('s-menu'));
    on('b-howto-back', () => this.show('s-menu'));
    on('b-chapters-back', () => this.menu());
    on('b-settings-back', () => this.closeSettings());
    on('b-resume', () => this.resume());
    on('b-restart', () => this.restart());
    on('b-pause-settings', () => this.settings('s-pause'));
    on('b-quit', () => this.quit());
    on('b-skip', () => this.skipDialog());
    on('b-credits-back', () => this.menu());
    on('b-spare', () => this.choose(true));
    on('b-bar', () => this.choose(false));
    on('b-reset-hints', () => { Store.data.seen = {}; Store.save(); this.toast('Hints will show again'); });
    on('b-reset-progress', () => { const b = $('b-reset-progress'); if (b.dataset.armed) { const keep = Store.data.settings; Store.data = Store.defaults(); Store.data.settings = keep; Store.save(); delete b.dataset.armed; b.textContent = 'Reset story progress'; this.toast('Progress wiped. Fresh start.'); } else { b.dataset.armed = '1'; b.textContent = 'Tap again to confirm'; setTimeout(() => { delete b.dataset.armed; b.textContent = 'Reset story progress'; }, 3000); } });
    $('s-dialog').addEventListener('click', (e) => { if (e.target.closest('#b-skip')) return; Sound.unlock(); Voice.unlock(); this.advance(); });
    $('s-title').addEventListener('click', (e) => { if (e.target.closest('button')) return; Sound.unlock(); this.menu(); });
    document.querySelectorAll('[data-diff]').forEach((el) => el.addEventListener('click', () => { Sound.unlock(); Sound.sfx.ui(); Store.data.settings.difficulty = +el.dataset.diff; Store.save(); this.syncMenu(); }));
    const S = Store.data.settings;
    const bindRange = (id, key, apply) => { const el = $(id); el.value = Math.round(S[key] * 100); el.addEventListener('input', () => { S[key] = el.value / 100; apply(); Store.save(); }); };
    bindRange('set-music', 'music', () => Sound.setVolumes(S.sfx, S.music));
    bindRange('set-sfx', 'sfx', () => { Sound.setVolumes(S.sfx, S.music); Sound.sfx.hit(0.8); });
    const bindCheck = (id, key, apply) => { const el = $(id); el.checked = !!S[key]; el.addEventListener('change', () => { S[key] = el.checked; if (apply) apply(); Store.save(); }); };
    bindCheck('set-voice', 'voice', () => { Voice.enabled = S.voice; if (S.voice) { Voice.unlock(); Voice.say('Sláinte!', 2); } });
    bindCheck('set-lefty', 'lefty', () => window.dispatchEvent(new Event('resize')));
    bindCheck('set-shake', 'shake');
    bindCheck('set-hints', 'hints');
    window.addEventListener('keydown', (e) => this.key(e));
    const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    $('install-tip').hidden = !(ios && !standalone);
  },

  key(e) {
    if (this.screen === 's-dialog' && (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyJ')) { e.preventDefault(); this.advance(); }
    else if (this.screen === 's-title' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); this.menu(); }
    else if (this.screen === 's-pause' && (e.code === 'Escape' || e.code === 'KeyP')) { e.preventDefault(); this.resume(); }
    else if (this.screen === 's-result' && e.code === 'Enter') { const b = document.querySelector('#s-result .btn.primary'); if (b) b.click(); }
  },

  show(id) {
    this.screen = id;
    document.querySelectorAll('.screen').forEach((el) => { el.hidden = el.id !== id; });
    const fighting = id === null && (G.phase === 'fight' || G.phase === 'intro' || G.phase === 'won' || G.phase === 'dead' || G.phase === 'timeout' || G.phase === 'shh');
    Input.setEnabled(fighting);
    document.body.classList.toggle('in-fight', fighting);
    if (id) { const el = $(id); const f = el && el.querySelector('.btn.primary, .btn'); if (f && !Input.usingTouch) setTimeout(() => { try { f.focus({ preventScroll: true }); } catch (err) { /* ignore */ } }, 30); }
  },

  setScene(theme, host) { G.phase = 'idle'; G.mode = 'menu'; G.player = null; G.fighters = []; G.pickups = []; G.projectiles = []; G.hazards = []; G.dogs = []; G.banners = []; G.popups = []; G.particles = []; G.craic = 30; G.theme = theme; G.host = host; G.hostMood = 'polish'; G.hostMoodT = 0; G.hatches = HATCHES.map((h) => ({ x: h.x, y: h.y, state: 'closed', t: 0, lid: 0 })); G.cam.zoom = 1; G.cam.x = 650; G.paused = false; },

  title() { this.setScene('colosseum', 'marcus'); Music.play('jig'); this.show('s-title'); },
  menu() { if (G.phase !== 'idle') this.setScene('colosseum', 'proximo'); Music.play('jig'); this.syncMenu(); this.show('s-menu'); },
  syncMenu() {
    const d = Store.data, s = d.story;
    const next = Math.min(s.unlocked, BOUTS.length - 1);
    $('story-sub').textContent = s.completed ? 'Story complete. Replay any bout' : s.unlocked > 0 ? 'Continue: Bout ' + BOUTS[next].num + ', ' + BOUTS[next].title : 'Story · seven bouts · start here';
    $('lockin-sub').textContent = d.best.lockin ? 'Endless · Best ' + d.best.lockin.toLocaleString() + ' (round ' + roman(Math.max(1, d.best.lockinWave)) + ')' : 'Endless waves after closing time';
    document.querySelectorAll('[data-diff]').forEach((el) => { const on = +el.dataset.diff === d.settings.difficulty; el.setAttribute('aria-checked', on ? 'true' : 'false'); el.classList.toggle('on', on); });
    $('diff-blurb').textContent = DIFFS[d.settings.difficulty].blurb;
  },

  storyMenu() {
    const s = Store.data.story;
    if (s.unlocked === 0 && !s.completed) { this.startStory(0); return; }
    const list = $('chapter-list'); list.innerHTML = '';
    BOUTS.forEach((b, i) => {
      const open = i <= s.unlocked || s.completed;
      const best = Store.data.best.bouts[b.id];
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.className = 'chapter' + (open ? '' : ' locked');
      btn.disabled = !open;
      btn.innerHTML = '<span class="num">' + b.num + '</span><span class="ch-main"><span class="ch-title">' + b.title + '</span><span class="ch-place">' + b.place + '</span></span><span class="ch-grade">' + (best ? best.grade : open ? '' : 'Locked') + '</span>';
      if (open) btn.addEventListener('click', () => { Sound.unlock(); Sound.sfx.ui(); this.startStory(i); });
      li.appendChild(btn); list.appendChild(li);
    });
    this.show('s-chapters');
  },

  startStory(idx) { this.preBout(idx); },
  preBout(idx) {
    const b = BOUTS[idx];
    this.setScene(b.theme, b.host || 'proximo');
    let cards = b.pre.slice();
    if (b.preSpared && Store.data.story.spared === true) cards = cards.concat(b.preSpared);
    Art.portraitHelmet = !!b.helmet;
    Music.play('air');
    this.dialog(cards, () => this.fight(idx));
  },
  fight(idx) { this.show(null); Game.startBout(idx); this.show(null); this.wake(); },
  startLockIn() { this.show(null); Game.startLockIn(); this.show(null); this.wake(); },
  wake() { try { if (navigator.wakeLock && !this.lock) navigator.wakeLock.request('screen').then((l) => { this.lock = l; l.addEventListener('release', () => { this.lock = null; }); }).catch(() => {}); } catch (e) { /* ignore */ } },

  /* ---------------- dialogue */
  dialog(cards, after) {
    this.cards = cards; this.ci = -1; this.after = after;
    this.show('s-dialog');
    this.advance();
  },
  advance() {
    if (this.typing) { this.finishType(); return; }
    this.ci++;
    if (!this.cards || this.ci >= this.cards.length) { const a = this.after; this.after = null; this.cards = null; if (a) a(); return; }
    const [who, text] = this.cards[this.ci];
    $('dlg-who').textContent = SPEAKERS[who] || '';
    $('s-dialog').dataset.who = who;
    Art.drawPortrait($('portrait'), who);
    this.typeText = text; this.typeN = 0; this.typing = true;
    $('dlg-text').textContent = '';
    clearInterval(this.typeTimer);
    this.typeTimer = setInterval(() => { this.typeN += 2; $('dlg-text').textContent = this.typeText.slice(0, this.typeN); if (this.typeN >= this.typeText.length) this.finishType(); }, 26);
    if (who === 'crowd') Sound.sfx.cheer(1);
    if (who === 'mike' && /ENTERTAINED/.test(text)) Voice.say('Are you not entertained?', 2);
  },
  finishType() { clearInterval(this.typeTimer); this.typing = false; $('dlg-text').textContent = this.typeText; },
  skipDialog() { this.finishType(); this.ci = this.cards ? this.cards.length : 0; this.advance(); },

  /* ---------------- fight outcomes */
  onWin(r) {
    this.lastResult = r;
    if (G.mode !== 'story') return;
    const idx = G.boutIdx, s = Store.data.story;
    s.unlocked = Math.max(s.unlocked, Math.min(idx + 1, BOUTS.length - 1));
    if (idx === BOUTS.length - 1) s.completed = true;
    Store.save();
    if (G.bout.verdict) { this.show('s-choice'); return; }
    this.result(r);
  },
  choose(spare) {
    Store.data.story.spared = spare; Store.save();
    G.hostMood = spare ? 'angry' : 'up';
    if (spare) { Sound.sfx.cheer(1.5); Sound.sfx.chant('name'); } else Sound.sfx.boo();
    this.result(this.lastResult);
  },
  result(r) {
    const won = r.won;
    const story = G.mode === 'story';
    $('res-title').textContent = won ? (r.crowdVerdict ? 'The crowd decides: Sláinte!' : 'Sláinte Victor!') : (story ? "You're barred!" : 'Locked out!');
    $('res-sub').textContent = won ? (story ? 'Bout ' + G.bout.num + ' · ' + G.bout.title : '') : story ? pick(TIPS) : 'You lasted ' + roman(Math.max(1, r.wave)) + ' rounds of the lock-in. ' + pick(TIPS);
    $('res-grade').textContent = won ? r.grade : (story ? '✗' : roman(Math.max(1, r.wave)));
    $('res-grade-name').textContent = won ? r.gradeName : story ? 'Barred' : 'Rounds survived';
    $('res-thumb').textContent = r.craic >= 45 ? '👍' : '👎';
    $('res-thumb-label').textContent = r.craic >= 45 ? 'The crowd: thumbs up' : 'The crowd: thumbs down';
    const st = r.stats;
    const rows = [['Score', r.total.toLocaleString()], ['Hits', st.hits], ['Best combo', st.maxCombo], ['Parries', st.parries], ['Olés', st.oles], ['Pints sunk', st.pints]];
    if (won && story) rows.splice(1, 0, ['Time bonus', '+' + r.timeBonus.toLocaleString()], ['Health bonus', '+' + r.hpBonus.toLocaleString()], ['Craic bonus', '+' + r.craicBonus.toLocaleString()]);
    if (!story) rows.push(['Best ever', Math.max(Store.data.best.lockin, r.total).toLocaleString()]);
    $('res-stats').innerHTML = rows.map(([k, v]) => '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>').join('');
    const acts = $('res-actions'); acts.innerHTML = '';
    const mk = (label, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = label; b.addEventListener('click', () => { Sound.unlock(); Sound.sfx.ui(); fn(); }); acts.appendChild(b); return b; };
    if (story && won) {
      mk(G.boutIdx === BOUTS.length - 1 ? 'Finish the story' : 'Next bout', 'primary', () => this.postBout());
      mk('Same again', '', () => this.fight(G.boutIdx));
    } else if (story) {
      mk('Ah go on, one more', 'primary', () => this.fight(G.boutIdx));
      mk('Go home', '', () => this.menu());
    } else {
      mk('Same again', 'primary', () => this.startLockIn());
      mk('Go home', '', () => this.menu());
    }
    if (story && won) mk('Menu', 'small', () => this.menu());
    $('s-result').classList.toggle('lost', !won);
    this.show('s-result');
  },
  onLose(r) { this.lastResult = r; this.result(r); },
  postBout() {
    const idx = G.boutIdx, b = BOUTS[idx];
    let cards = b.post || [];
    if (b.verdict) cards = Store.data.story.spared ? b.postSpared : b.postBarred;
    Art.portraitHelmet = false;
    const theme = b.theme;
    this.setScene(theme, idx === BOUTS.length - 1 ? 'proximo' : b.host || 'proximo');
    Music.play('air');
    this.dialog(cards, () => { if (idx >= BOUTS.length - 1) this.credits(); else this.preBout(idx + 1); });
  },
  credits() {
    this.setScene('lockin', 'proximo');
    $('credit-list').innerHTML = CREDITS.map(([a, b]) => '<li><span class="cr-a">' + a + '</span>' + (b ? '<span class="cr-b">' + b + '</span>' : '') + '</li>').join('');
    Music.play('jig');
    this.show('s-credits');
  },

  /* ---------------- pause & settings */
  pause() {
    if (G.paused) return;
    G.paused = true; Input.reset();
    $('pause-tip').textContent = pick(TIPS);
    $('pause-bout').textContent = G.mode === 'story' ? 'Bout ' + G.bout.num + ' · ' + G.bout.title : 'The Lock-In · Round ' + roman(Math.max(1, G.waveNum));
    $('b-restart').textContent = G.mode === 'story' ? 'Restart bout' : 'Restart lock-in';
    this.show('s-pause');
  },
  resume() { G.paused = false; this.show(null); },
  restart() { G.paused = false; if (G.mode === 'story') this.fight(G.boutIdx); else this.startLockIn(); },
  quit() { G.paused = false; this.menu(); },
  settings(from) { this.settingsFrom = from; this.show('s-settings'); },
  closeSettings() { if (this.settingsFrom === 's-pause') this.show('s-pause'); else { this.syncMenu(); this.show('s-menu'); } },

  checkRotate(W, H) {
    const portrait = H > W * 1.05 && (Input.usingTouch || navigator.maxTouchPoints > 0);
    $('rotate').hidden = !portrait;
    if (portrait && this.screen === null && (G.phase === 'fight' || G.phase === 'intro')) this.pause();
  },
  toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false; t.classList.remove('go'); void t.offsetWidth; t.classList.add('go');
    clearTimeout(this.toastT); this.toastT = setTimeout(() => { t.hidden = true; }, 2600);
  },
};

/* =============================================================== BOOT */
function bootGame(hotData) {
  Store.load();
  const S = Store.data.settings;
  Sound.setVolumes(S.sfx, S.music);
  Voice.enabled = !!S.voice; Voice.init();
  const cv = $('cv'), ctx = cv.getContext('2d', { alpha: false });
  Input.init(cv); Art.init();
  let W = 0, H = 0, dpr = 1, safe = { l: 0, r: 0, t: 0, b: 0 };
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
  document.body.appendChild(probe);
  function resize() {
    W = Math.max(1, window.innerWidth); H = Math.max(1, window.innerHeight);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const cs = getComputedStyle(probe);
    safe = { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
    Input.layout(W, H, safe, Store.data.settings.lefty);
    Flow.checkRotate(W, H);
  }
  let rt = 0;
  const onResize = () => { clearTimeout(rt); rt = setTimeout(resize, 60); };
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 150));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
  resize();

  const fonts = ['900 20px Cinzel', '700 20px Cinzel', '800 16px "Alegreya Sans"', '700 16px "Alegreya Sans"', '400 16px "Uncial Antiqua"'];
  const fontsP = document.fonts && document.fonts.load ? Promise.race([Promise.all(fonts.map((f) => document.fonts.load(f).catch(() => null))), new Promise((r) => setTimeout(r, 2500))]) : Promise.resolve();
  fontsP.then(() => { Art.fontsReady = true; }, () => { Art.fontsReady = true; });

  let last = performance.now(), acc = 0, errs = 0;
  const STEP = 1 / 60;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now;
    if (!(dt > 0)) dt = 0; if (dt > 0.25) dt = 0.25;
    acc += dt * (G.timeScale || 1);
    let n = 0;
    try { while (acc >= STEP && n < 10) { Game.update(STEP); acc -= STEP; n++; } } catch (e) { if (errs++ < 5) console.error(e); acc = 0; }
    if (n >= 10) acc = 0;
    try { Game.render(ctx, W, H, dpr, safe); } catch (e) { if (errs++ < 5) console.error(e); }
  }
  requestAnimationFrame(frame);

  ['pointerdown', 'touchend', 'click', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { Sound.unlock(); Voice.unlock(); }, { passive: true }));
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  document.addEventListener('touchmove', (e) => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
  document.addEventListener('visibilitychange', () => { if (document.hidden && !G.paused && (G.phase === 'fight' || G.phase === 'intro')) Flow.pause(); });

  Flow.init();
  const q = new URLSearchParams(location.search);
  if (q.has('god')) G.god = true;
  if (q.has('auto')) G.autopilot = true;
  if (q.has('speed')) G.timeScale = +q.get('speed') || 1;
  if (q.has('mute')) Sound.setVolumes(0, 0);
  if (q.has('bout')) { const i = clamp(+q.get('bout') | 0, 0, BOUTS.length - 1); Flow.fight(i); }
  else if (q.has('lockin')) Flow.startLockIn();
  else if (q.has('menu')) Flow.menu();
  else if (hotData && hotData.screen === 'menu') Flow.menu();
  else Flow.title();

  try { if ('serviceWorker' in navigator && location.protocol === 'https:' && !/claude|anthropic/.test(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) { /* not available here */ }
  window.SH = { G, Game, Flow, Input, Art, Sound, Music, Store, BOUTS, MOVES, ARCH };
}

(function start() {
  const hot = window.claude && window.claude.hot;
  try { if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ screen: Flow.screen === null ? 'fight' : 'menu' })); } catch (e) { /* ignore */ }
  const go = (data) => bootGame(data || {});
  if (hot && typeof hot.ready === 'function') hot.ready(go); else go(hot && hot.data);
})();
