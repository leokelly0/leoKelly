'use strict';
/* =====================================================================
   STOUT & HONOUR — game.js
   The simulation: fighters, combat, the adaptive AI, the crowd (craic),
   waves, hazards, pickups and the camera. Rendering lives in art.js;
   menus and story flow live in ui.js.
   ===================================================================== */

const GRAV = 1600;
const DODGE_T = 0.32;
const HOLD_T = 0.24;
const TAUNTS = ['COME ON SO!', 'GO ON, KERRYMAN!', "WHAT'S THE STORY?", 'AH HERE!', 'YOUR ROUND!', 'GET UP THE YARD!', 'STATE OF YA!', 'YE EEJIT!'];
const NULL_BTN = { down: false, pressed: false, released: false };
const NULL_INPUT = { mx: 0, my: 0, strike: NULL_BTN, shield: NULL_BTN, dodge: NULL_BTN, crowd: NULL_BTN, pause: NULL_BTN };

const G = {
  mode: 'menu', phase: 'idle', paused: false, time: 0, phaseT: 0, theme: 'colosseum',
  fighters: [], player: null, projectiles: [], pickups: [], particles: [], popups: [], banners: [], hazards: [], dogs: [], hatches: [],
  craic: 0, craicIdle: 0, craicHist: [], crowdPulse: 0, score: 0, combo: 0, comboT: 9, timeLeft: null,
  host: 'marcus', hostMood: 'polish', hostMoodT: 0,
  bout: null, boutIdx: -1, waves: null, waveIdx: -1, waveNum: 0, spawnQueue: [], waveClearT: 0,
  hitstop: 0, slowT: 0, slowScale: 1, shake: 0, flash: 0, dim: 0,
  cam: { x: 650, zoom: 1, tz: 1, left: 0, top: 0, k: 1, sl: 0, sr: 0, focus: null },
  zoomT: 0, stats: null, hint: null, hintQueue: [], obs: { block: 0.3, dodge: 0.3, aggro: 0.3 },
  tokens: new Set(), maxTokens: 2, parryWin: 0.18, rangedBusy: 0,
  giftT: 9, matT: 3, trolleyT: 8, hatchT: 12, lastTaunt: -99, lastKO: -99, lastBoring: -99,
  ended: false, crowdVerdict: false, blockStreak: 0, autopilot: false, god: false, tigrisGift: false, viewW: 1200,
  enemiesLeft() { let n = G.spawnQueue.length; for (const f of G.fighters) if (f.team === 1 && f.hp > 0 && f.state !== 'ko') n++; return n; },
};
const mult = () => 1 + (G.craic / 90) * 0.5;

/* ============================================================ FIGHTER */
let FID = 1;
class Fighter {
  constructor(kind, team, x, y) {
    this.id = FID++;
    this.kind = kind; this.team = team; this.isPlayer = team === 0;
    this.A = this.isPlayer ? PLAYER_ARCH : ARCH[kind];
    this.look = this.A.look();
    this.x = x; this.y = y; this.z = 0; this.vx = 0; this.vy = 0; this.vz = 0;
    this.face = 1; this.scale = this.A.scale || 1;
    this.maxHp = Math.round(this.A.hp * (this.isPlayer ? 1 : DIFF().hp)); this.hp = this.maxHp; this.hpShown = this.hp;
    this.wind = 100; this.windDelay = 0;
    this.state = 'idle'; this.st = 0;
    this.move = null; this.mt = null; this.hitSet = new Set(); this.hits = 0; this.fired = false;
    this.combo = 0; this.comboWin = 0; this.buffer = null; this.bufT = 0; this.held = 0; this.attackId = 0;
    this.hitstun = 0; this.inv = 0; this.flash = 0; this.poise = this.A.poise || 0; this.poiseMax = this.poise;
    this.blockT = 9; this.parryLock = 0; this.parryOK = true; this.charge = 0; this.staggerT = 0; this.heavyCharge = 0;
    this.walkPhase = rand(0, 6); this.phase = rand(0, 6); this.blinkT = rand(1, 4);
    this.downT = 0; this.willKO = false; this.koT = 0; this.remove = false; this.bounced = false; this.juggles = 0;
    this.hpShow = 0; this.spiked = 0; this.blind = 0; this.dutch = 0; this.healQ = 0; this.vengeance = false;
    this.ai = this.isPlayer ? null : new AI(this);
    this.radius = 22 * this.scale;
    this.enterTo = null; this.pts = null; this.oleDone = false;
  }
  set(s) { this.state = s; this.st = 0; }
  get down() { return this.state === 'launched' || this.state === 'down' || this.state === 'ko' || this.state === 'getup'; }
  hittable() { return this.hp > 0 && this.state !== 'ko' && this.state !== 'enter' && this.state !== 'down' && this.state !== 'getup' && this.inv <= 0 && !(this.state === 'launched' && this.z > 90); }
}

/* ================================================================= AI
   Each lad is a small state machine. Only a couple may attack at once
   (attack tokens), the rest circle and jeer. Bosses also adapt: they
   keep a running estimate of how you defend (G.obs) and shift their
   mix of attacks toward whatever beats it.                            */
class AI {
  constructor(f) {
    this.f = f; const a = f.A.ai || {};
    this.cfg = a; this.cd = rand(0.8, 1.6); this.token = false; this.tokenT = 0;
    this.offY = rand(-44, 44); this.ring = (a.ring || 200) + rand(-20, 30); this.strafe = rand(0.5, 1.1) * (chance(0.5) ? 1 : -1);
    this.blockT = 0; this.next = null; this.lastPA = -1; this.feinted = false; this.phase2 = false; this.hatchT = rand(6, 9);
    this.pint = null; this.drinking = null; this.tauntT = rand(4, 9); this.side = 0; this.sideUntil = 0;
  }
  release() { if (this.token) { this.token = false; G.tokens.delete(this.f.id); } this.tokenT = 0; }
  want() {
    if (this.f.A.boss) { this.token = true; return true; }
    if (this.token) return true;
    if (G.tokens.size < G.maxTokens) { this.token = true; G.tokens.add(this.f.id); this.tokenT = 0; return true; }
    return false;
  }
  onHurt(att, armored) { if (!armored) { this.release(); this.next = null; this.cd = Math.max(this.cd, rand(0.3, 0.7)); } }
  chooseMove() {
    const f = this.f, p = G.player, moves = f.A.moves, dist = Math.abs(p.x - f.x), o = G.obs;
    const list = Object.keys(moves).filter((k) => { const m = MOVES[k]; return !(m.minDist && dist < m.minDist) && !m.proj; });
    const ranged = Object.keys(moves).filter((k) => MOVES[k].proj && (!MOVES[k].minDist || dist >= MOVES[k].minDist));
    if (ranged.length && dist > 170 && chance(0.55)) return MOVES[ranged[0]];
    if (!list.length) return MOVES[Object.keys(moves)[0]];
    return MOVES[wpick(list, (k) => {
      const m = MOVES[k]; let w = moves[k];
      if (m.unblockable) w *= 1 + 1.6 * o.block;            // you block a lot? here's something you can't block
      if (m.counter) w *= 0.4 + 1.8 * o.aggro;              // you swing a lot? he waits for it
      if (m.tele === 'w' && !m.counter) w *= 1 + 0.9 * o.dodge; // you dodge a lot? quick blockable stuff
      if (this.phase2 && m.unblockable) w *= 1.25;
      return w;
    })];
  }
  pickSide(dx) {
    const f = this.f, p = G.player;
    let side = dx > 0 ? -1 : 1;
    if (this.side && G.time < this.sideUntil) side = this.side;
    const tx = p.x + side * this.ring;
    if (tx < WORLD.minX + 20 || tx > WORLD.maxX - 20) side = -side;
    let same = 0, other = 0;
    for (const o of G.fighters) { if (o.team !== 1 || o === f || o.state === 'ko' || o.state === 'enter') continue; if (sgn(o.x - p.x) === side) same++; else other++; }
    if (same >= other + 2 && chance(0.015)) { side = -side; this.side = side; this.sideUntil = G.time + 3; }
    return side;
  }
  steer(tx, ty, sp, dt) {
    const f = this.f;
    tx = clamp(tx, WORLD.minX + 10, WORLD.maxX - 10); ty = clamp(ty, WORLD.minY + 4, WORLD.maxY - 4);
    let mx = tx - f.x, my = ty - f.y;
    for (const o of G.fighters) {
      if (o === f || o.team !== f.team || o.state === 'ko') continue;
      const ox = f.x - o.x, oy = (f.y - o.y) * 2, d = Math.hypot(ox, oy);
      if (d < 80 && d > 0.01) { mx += (ox / d) * (80 - d) * 1.2; my += (oy / d) * (80 - d) * 0.5; }
    }
    const d = Math.hypot(mx, my);
    if (d > 6) { const k = Math.min(1, d / 50); f.vx = damp(f.vx, (mx / d) * sp * k, 7, dt); f.vy = damp(f.vy, (my / d) * sp * 0.72 * k, 7, dt); }
    else { f.vx = damp(f.vx, 0, 9, dt); f.vy = damp(f.vy, 0, 9, dt); }
  }
  attack(m) {
    const f = this.f; this.next = null; f.face = G.player.x >= f.x ? 1 : -1;
    beginMove(f, m); this.feinted = false;
    if (m.tele === 'w' && !Store.data.seen.shield && !m.proj) { showHint('shield'); if (G.bout && G.bout.tutorial) slowmo(0.35, 0.8); }
    if (m.tele === 'r' && !Store.data.seen.dodge) { showHint('dodge'); if (G.bout && G.bout.tutorial) slowmo(0.35, 0.8); }
    if (m.proj === 'dart') showHint('reflect');
    if (m.counter) showHint('counter');
  }
  windup(dt) {
    const f = this.f, p = G.player;
    if (f.st < f.mt.s * 0.45 && !f.move.proj && !f.move.counter) { f.face = p.x >= f.x ? 1 : -1; f.vy = clamp((p.y - f.y) * 4, -70, 70); }
    else f.vy = damp(f.vy, 0, 10, dt);
  }
  attacking(dt) {
    const f = this.f, m = f.move, p = G.player;
    stepAttack(f, dt);
    if (f.state !== 'attack' || f.move !== m) return;
    const s = f.mt.s, a = f.mt.a, r = f.mt.r;
    if (m.feintable && this.cfg.feint && !this.feinted && f.st > s * 0.35 && f.st < s * 0.85) {
      if (p.state === 'dodge' || chance(this.cfg.feint * dt * 1.5)) {
        this.feinted = true; popup(f, 'HA!', '#c46bff', 16);
        beginMove(f, MOVES.cJab); f.mt.s *= 0.7; return;
      }
    }
    if (m.chain && f.st >= s + a) {
      const nm = MOVES[m.chain];
      if (Math.abs(p.x - f.x) < nm.range * f.scale + 60 && Math.abs(p.y - f.y) < 44 && p.hp > 0 && !p.down) { f.face = p.x >= f.x ? 1 : -1; beginMove(f, nm); return; }
    }
    if (f.st >= s + a + r) {
      f.set('idle'); this.release();
      const cd = this.cfg.cd || [1, 2];
      this.cd = rand(cd[0], cd[1]) * DIFF().cd * (this.phase2 ? 0.72 : 1);
    }
  }
  react(adx, ady, dx) {
    const f = this.f, p = G.player;
    if (p.state !== 'attack' && p.state !== 'charge') return false;
    if (p.attackId === this.lastPA) return false;
    if (p.face !== -sgn(dx)) return false;
    if (adx > 170 || ady > 40) return false;
    this.lastPA = p.attackId;
    if (p.state === 'charge') {
      if (this.token && this.next && !this.next.proj && adx < 150 && chance(0.55)) { this.attack(this.next); return true; }
      return false;
    }
    const cb = (this.cfg.block || 0) * DIFF().block * (this.phase2 ? 1.3 : 1);
    if (chance(cb)) { f.set('block'); this.blockT = rand(0.45, 0.8); f.vx = 0; f.vy = 0; return true; }
    return false;
  }
  pintLogic(dt) {
    const f = this.f;
    if (f.hp > f.maxHp * 0.6 || this.token) return false;
    if (!this.pint || this.pint.dead) this.pint = G.pickups.find((k) => k.kind === 'pint' && k.landed && k.settle >= 1 && !k.dead && Math.abs(k.x - f.x) < 340) || null;
    const k = this.pint; if (!k) return false;
    const dx = k.x - f.x, dy = k.y - f.y, d = Math.hypot(dx, dy);
    if (d < 22) { f.set('drink'); f.vx = 0; f.vy = 0; this.drinking = k; return true; }
    f.face = dx > 0 ? 1 : -1;
    f.vx = damp(f.vx, (dx / d) * f.A.speed * 1.1, 8, dt); f.vy = damp(f.vy, (dy / d) * f.A.speed * 0.8, 8, dt);
    return true;
  }
  finishDrink() {
    const f = this.f, k = this.drinking;
    f.set('idle');
    if (k && !k.dead) { k.dead = true; f.hp = Math.min(f.maxHp, f.hp + 24); f.hpShow = 2; popup(f, 'HE DRANK YOUR PINT!', '#ff8a5a', 18); Sound.sfx.gulp(); Sound.sfx.boo(); addCraic(-6); }
    this.drinking = null; this.pint = null;
  }
  ranged(dt, dx, dy, adx, ady) {
    const f = this.f, p = G.player, keep = this.cfg.keep;
    const ks = Object.keys(f.A.moves);
    const pm = MOVES[ks.find((k) => MOVES[k].proj)], mm = MOVES[ks.find((k) => !MOVES[k].proj)];
    if (this.cd <= 0) {
      if (adx < 100 && ady < 26 && mm) { this.attack(mm); return; }
      if (adx > keep[0] * 0.6 && adx < keep[1] + 160 && ady < 110 && G.rangedBusy < Math.max(1, G.maxTokens)) { this.attack(pm); return; }
    }
    let side = dx > 0 ? -1 : 1;
    const want = lerp(keep[0], keep[1], 0.5);
    let tx = p.x + side * want;
    if (tx < WORLD.minX + 30 || tx > WORLD.maxX - 30) { side = -side; tx = p.x + side * want; }
    this.steer(tx, p.y + this.offY * 0.6, f.A.speed * 0.9, dt);
  }
  bossThink(dt) {
    const f = this.f;
    if (!this.phase2 && f.hp < f.maxHp * 0.5) {
      this.phase2 = true;
      if (f.kind === 'tigris') { banner('TIGRIS IS RAGING', 'Up the Tribesmen!', '#ff8a5a', 30, 1.6, 0.3); Sound.sfx.boo(); }
      if (f.kind === 'commodus') { banner("I'M TERRIBLY VEXED!", 'Bouncers! Bar him!', '#c46bff', 30, 1.8, 0.3); Voice.say("I'm terribly vexed.", 2); Game.spawnBouncers(); }
    }
    if (f.kind === 'tigris') { this.hatchT -= dt; if (this.hatchT <= 0) { this.hatchT = this.phase2 ? rand(6, 9) : rand(9, 13); triggerHatch(); } }
  }
  update(dt) {
    const f = this.f, p = G.player;
    if (!p) return;
    if (f.state === 'attack') { this.attacking(dt); return; }
    if (f.state === 'block') { this.blockT -= dt; f.vx = damp(f.vx, 0, 10, dt); f.vy = damp(f.vy, 0, 10, dt); if (this.blockT <= 0) f.set('idle'); return; }
    if (f.state === 'drink') { if (f.st >= 0.9) this.finishDrink(); return; }
    if (f.state !== 'idle') { this.release(); return; }
    const dx = p.x - f.x, dy = p.y - f.y, adx = Math.abs(dx), ady = Math.abs(dy);
    if (adx > 6) f.face = dx > 0 ? 1 : -1;
    if (p.hp <= 0) { f.vx = damp(f.vx, 0, 6, dt); f.vy = damp(f.vy, 0, 6, dt); return; }
    this.cd -= dt;
    if (f.A.boss) this.bossThink(dt);
    if (this.react(adx, ady, dx)) return;
    if (this.cfg.drinks && this.pintLogic(dt)) return;
    if (this.cfg.ranged) { this.ranged(dt, dx, dy, adx, ady); return; }
    if (this.cd <= 0) this.want();
    let sp = f.A.speed * (this.phase2 ? 1.12 : 1);
    if (this.token) {
      if (!this.next) this.next = this.chooseMove();
      const m = this.next;
      this.tokenT += dt;
      if (this.tokenT > 3.4 && !f.A.boss) { this.release(); this.cd = rand(0.4, 0.9); this.next = null; return; }
      const reach = (m.range || 80) * f.scale;
      const inRange = adx <= reach + 8 && ady < 20 && !(m.minDist && adx < m.minDist);
      const charge = m.lunge > 400 && adx > 140 && adx < 430 && ady < 24;
      const throwIt = m.proj && adx > 120 && adx < 460 && ady < 80;
      if (inRange || charge || throwIt) { this.attack(m); return; }
      const r = m.proj ? 260 : m.lunge > 400 ? 230 : reach * 0.72;
      this.steer(p.x - sgn(dx || 1) * r, p.y, sp, dt);
    } else {
      const side = this.pickSide(dx);
      this.tauntT -= dt;
      if (this.tauntT <= 0 && adx > 160) { this.tauntT = rand(7, 13); popup(f, pick(TAUNTS), '#d9c48a', 13); }
      this.steer(p.x + side * this.ring + Math.sin(G.time * this.strafe + f.id) * 26, p.y + this.offY, sp * 0.62, dt);
    }
  }
}

/* ======================================================== MOVES & HITS */
function beginMove(f, m) {
  const D = DIFF();
  const tm = f.isPlayer ? 1 : D.tele * (f.ai && f.ai.phase2 ? 0.86 : 1);
  f.move = m; f.mt = { s: m.startup * (m.tele ? tm : 1), a: m.active, r: m.recovery };
  f.set('attack'); f.hitSet.clear(); f.hits = 0; f.fired = false;
  if (!f.isPlayer && m.tele) Sound.sfx.tele(m.tele);
}

function aim(p) {
  let best = null, bd = 1e9;
  for (const f of G.fighters) {
    if (f.team === p.team || f.state === 'ko' || f.state === 'enter' || f.state === 'down') continue;
    const dx = f.x - p.x, dy = f.y - p.y;
    if (Math.abs(dx) > 300 || Math.abs(dy) > 95) continue;
    const d = Math.abs(dx) + Math.abs(dy) * 2.2 + (sgn(dx) === p.face ? 0 : 45);
    if (d < bd) { bd = d; best = f; }
  }
  p.aimT = best;
  if (best) p.face = best.x >= p.x ? 1 : -1;
}

function playerAssist(p, m, dt, k) {
  const t = p.aimT;
  if (t && t.state !== 'ko') {
    p.vy = clamp((t.y - p.y) * 12, -260, 260);
    const dx = Math.abs(t.x - p.x), want = m.range * 0.62;
    p.vx = dx > want ? p.face * Math.min(m.lunge * 1.7, (dx - want) * 11) * k : damp(p.vx, 0, 14, dt);
  } else { p.vx = p.face * m.lunge * 0.45 * k; p.vy = damp(p.vy, 0, 12, dt); }
}

function stepAttack(f, dt) {
  const m = f.move, s = f.mt.s, a = f.mt.a, t = f.st;
  if (t < s) {
    if (f.isPlayer) playerAssist(f, m, dt, 0.6);
    else { f.vx = damp(f.vx, 0, 10, dt); if (f.ai) f.ai.windup(dt); }
  } else if (t < s + a) {
    if (!f.fired) { f.fired = true; onActive(f, m); }
    if (f.isPlayer) playerAssist(f, m, dt, 1);
    else if (m.lunge) { f.vx = f.face * m.lunge * (m.lunge > 400 ? 1 : 1 - (t - s) / a); f.vy = damp(f.vy, 0, 10, dt); }
    if (!m.proj && !m.counter) meleeCheck(f, m);
  } else { f.vx = damp(f.vx, 0, 11, dt); f.vy = damp(f.vy, 0, 11, dt); }
}

function onActive(f, m) {
  Sound.sfx.whoosh(m.dmg > 12 ? 1.3 : 0.9);
  if (m.proj) spawnProj(f, m);
  if (m.shake) { shake(m.shake * 0.6); dustFX(f.x + f.face * 70, f.y, 10); }
  if (m.counter) popup(f, 'AM I NOT MERCIFUL?', '#c46bff', 16);
  if (f.isPlayer && m === MOVES.heavy) {
    const ch = f.heavyCharge;
    Sound.sfx.heavy();
    if (ch >= 1) { shake(10); part('ring', f.x + f.face * 60, f.y, 2, 0, 0, 0, 0.45, { size: 120 }); dustFX(f.x + f.face * 60, f.y, 16); }
  }
}

function meleeCheck(f, m) {
  if (!m.multi && f.hits > 0) return;
  const ch = f.isPlayer && m === MOVES.heavy ? f.heavyCharge : 0;
  const reach = m.range * f.scale + ch * 50, depth = (m.depth || 34) + ch * 22;
  for (const t of G.fighters) {
    if (t === f || t.team === f.team || f.hitSet.has(t.id)) continue;
    if (t.state === 'ko' || t.state === 'enter' || t.hp <= 0) continue;
    const dx = (t.x - f.x) * f.face, dy = Math.abs(t.y - f.y);
    if (dx < -14 - ch * 40 || dx > reach + t.radius * 0.6 || dy > depth || t.z > 85) continue;
    if (t.inv > 0) { if (t.isPlayer && t.state === 'dodge' && !t.oleDone) { t.oleDone = true; f.hitSet.add(t.id); ole(t); } continue; }
    if (!t.hittable()) continue;
    if (t.state === 'launched' && t.juggles >= 2) continue;
    f.hitSet.add(t.id);
    const res = resolveHit(f, t, m, { charge: ch });
    if (res !== 'none') f.hits++;
    if (res === 'countered') return;
    if (!m.multi) break;
  }
  if (f.isPlayer) for (const d of G.dogs) {
    if (f.hitSet.has('dog' + d.id)) continue;
    const dx = (d.x - f.x) * f.face, dy = Math.abs(d.y - f.y);
    if (dx > -12 && dx < reach + 24 && dy < 46) { f.hitSet.add('dog' + d.id); shooDog(d, f); }
  }
}

function resolveHit(att, t, m, opt) {
  opt = opt || {};
  const dirX = opt.dirX != null ? opt.dirX : (t.x >= att.x ? 1 : -1);
  const fromFront = t.face === -dirX;
  const attIsFighter = att instanceof Fighter;
  if (t.state === 'attack' && t.move && t.move.counter && t.st < t.mt.s && !opt.proj && !opt.env && attIsFighter) { counterAttack(t, att); return 'countered'; }
  if (t.state === 'block' && fromFront && !m.unblockable && !opt.env) {
    if (t.isPlayer && t.parryOK && t.blockT <= G.parryWin) { parry(t, att, m, opt); return 'parry'; }
    if (m.guardBreak) guardBreak(t, att);
    else { blockHit(t, att, m, dirX, opt); return 'block'; }
  }
  let dmg = m.dmg;
  if (att && att.isPlayer) { if (att.vengeance) dmg *= 1.3; if (att.dutch > 0) dmg *= 1.15; if (t.state === 'stagger') dmg *= 1.5; if (opt.charge) dmg += 10 * opt.charge; }
  else if (t.isPlayer) dmg *= DIFF().dmg;
  if (opt.mult) dmg *= opt.mult;
  if (t.isPlayer && G.god) dmg = 0;
  let react = 'hurt';
  if (t.A && t.A.boss && !opt.env) {
    if (t.state === 'attack' && t.move && t.move.armor && t.st < t.mt.s + t.mt.a) react = 'armor';
    else if (!m.knockdown && !m.guardBreak) { t.poise -= dmg; if (t.poise > 0) react = 'flinch'; else t.poise = t.poiseMax; }
  }
  if (t.state === 'drink' && t.ai && t.ai.drinking) { const k = t.ai.drinking; k.dead = true; t.ai.drinking = null; popup(t, 'MIND THE PINT!', '#ffb03a', 16); stoutFX(t.x, t.y, 70); Sound.sfx.splash(); addCraic(4, 'spill'); }
  const wasDown = t.state === 'down' || t.state === 'getup';
  const wasTaunt = t.state === 'taunt';
  t.hp -= dmg; t.flash = 0.1; t.hpShow = 2.2;
  const power = clamp(dmg / 12, 0.4, 1.7);
  G.hitstop = Math.max(G.hitstop, 0.03 + 0.035 * power);
  shake(2.5 + 4 * power);
  hitFX(t, power, dirX);
  Sound.sfx.hit(power);
  if (m.knockdown || t.hp <= 0) Sound.sfx.thud();
  if (wasDown) {
    if (t.hp <= 0) { t.hp = 0; if (!t.willKO) { t.willKO = true; if (t.state === 'getup') { t.set('down'); t.downT = 0.4; } onKO(t, att, m, opt); } }
  } else if (t.hp <= 0) {
    t.hp = 0; launch(t, dirX, Math.max(m.launch || 320, 330), Math.max(m.kb || 260, 300)); t.willKO = true; onKO(t, att, m, opt);
  } else if (react === 'armor') { t.vx += dirX * 25; popup(t, 'ARMOUR', '#d9c48a', 12); }
  else if (react === 'flinch') { t.vx += dirX * 70; }
  else if (m.knockdown) launch(t, dirX, m.launch || 300, m.kb || 250);
  else { t.set('hurt'); t.hitstun = m.hitstun || 0.3; t.vx = dirX * (m.kb || 80); t.vy *= 0.3; t.move = null; }
  if (wasTaunt && t.isPlayer && t.state !== 'taunt') { popup(t, 'THE CROWD LAUGHS', '#f3e6c4', 16); addCraic(-5); }
  if (att && att.isPlayer) onPlayerHit(t, m, dmg, opt);
  if (t.isPlayer) onPlayerHurt(att, m, dmg);
  if (t.ai) t.ai.onHurt(att, react === 'armor' || react === 'flinch');
  return 'hit';
}

function launch(t, dirX, vz, vx) {
  const air = t.state === 'launched' && t.z > 5;
  t.juggles = air ? t.juggles + 1 : 0;
  t.set('launched'); t.vz = vz * (air ? 0.6 : 1); t.vx = dirX * vx; t.vy = 0; t.bounced = false; t.move = null;
  if (t.ai) t.ai.release();
}

function blockHit(t, att, m, dirX, opt) {
  t.vx = dirX * (opt.proj ? 60 : 140);
  for (let i = 0; i < 6; i++) part('spark', t.x + t.face * 20, t.y, 90 * t.scale, t.face * rand(60, 260), rand(-40, 40), rand(-160, 200), 0.18);
  Sound.sfx.block();
  G.hitstop = Math.max(G.hitstop, 0.04);
  if (t.isPlayer) {
    t.wind -= m.dmg * 2.0; t.windDelay = 0.7; G.stats.blocks++; G.blockStreak++;
    if (G.blockStreak % 4 === 0) popup(t, 'HOLD THE LINE!', '#f3e6c4', 18);
    if (t.wind <= 0) { t.wind = 0; guardBreak(t, att); popup(t, 'WINDED!', '#ff8a5a', 20); }
    G.obs.block = lerp(G.obs.block, 1, 0.15);
    hintDone('shield');
    if (opt.proj && !opt.proj.arc) opt.proj.dead = true;
  } else {
    if (t.ai) t.ai.blockT = Math.max(t.ai.blockT, 0.35);
    if (att && att.isPlayer) { popup(t, pick(['BLOCKED', 'NOT TONIGHT', 'NAH']), '#d9c48a', 13); if (t.kind === 'bouncer' || t.A.boss) showHint('heavy'); }
  }
}

function guardBreak(t, att) {
  t.set('stagger'); t.staggerT = t.isPlayer ? 0.7 : 0.95; t.move = null;
  popup(t, 'GUARD BROKEN!', '#ffb03a', 20); Sound.sfx.crash(); shake(6);
  if (att && att.isPlayer) { addCraic(6, 'break'); hintDone('heavy'); }
  if (t.ai) t.ai.release();
}

function parry(p, att, m, opt) {
  p.blockT = 9;
  G.stats.parries++; G.score += 150 * mult();
  Sound.sfx.parry(); shake(5); G.hitstop = 0.09; slowmo(0.35, 0.4);
  for (let i = 0; i < 14; i++) { const a = rand(0, TAU); part('spark', p.x + p.face * 24, p.y, 90, Math.cos(a) * rand(200, 500), 0, Math.sin(a) * rand(200, 500), rand(0.15, 0.3)); }
  part('star', p.x + p.face * 24, p.y, 90, 0, 0, 0, 0.25, { size: 46, rot: 0.3 });
  hintDone('shield');
  if (opt.proj) { reflect(opt.proj, p); popup(p, 'RETURN TO SENDER!', '#ffe08a', 20); addCraic(11, 'reflect'); hintDone('reflect'); return; }
  if (opt.dogRef) { shooDog(opt.dogRef, p); popup(p, 'PARRY!', '#ffe08a', 24); addCraic(8, 'parry'); return; }
  if (att instanceof Fighter) { att.set('stagger'); att.staggerT = 1.05; att.vx = -att.face * 160; att.move = null; if (att.ai) att.ai.release(); }
  popup(p, 'PARRY!', '#ffe08a', 26); addCraic(10, 'parry');
  G.obs.block = lerp(G.obs.block, 1, 0.2);
}

function counterAttack(c, att) {
  popup(c, 'AM I NOT MERCIFUL?!', '#c46bff', 20);
  Voice.say('Am I not merciful?', 2);
  att.set('hurt'); att.hitstun = 0.22; att.move = null;
  c.face = att.x >= c.x ? 1 : -1;
  beginMove(c, MOVES.cRiposte); c.mt.s = 0.06;
  G.hitstop = 0.08; Sound.sfx.parry();
  G.obs.aggro = lerp(G.obs.aggro, 1, 0.3);
}

function ole(p) {
  G.stats.oles++; G.score += 100 * mult();
  popup(p, 'OLÉ!', '#ffd23a', 26); addCraic(8, 'ole'); slowmo(0.45, 0.3);
  Sound.sfx.cheer(0.6); if (G.stats.oles % 3 === 0) Sound.sfx.chant('ole');
  G.obs.dodge = lerp(G.obs.dodge, 1, 0.2);
  hintDone('dodge');
}

function onPlayerHit(t, m, dmg, opt) {
  G.stats.hits++;
  G.combo = G.comboT < 1.6 ? G.combo + 1 : 1; G.comboT = 0;
  G.stats.maxCombo = Math.max(G.stats.maxCombo, G.combo);
  G.score += Math.round(dmg * 10 * mult() * (1 + Math.min(G.combo, 30) * 0.05));
  const tag = opt.proj ? 'reflect' : m.tag || (m === MOVES.p1 ? 'jab' : m === MOVES.p2 ? 'swipe' : opt.special ? 'special' : 'hit');
  const base = { jab: 1.0, swipe: 1.15, combo3: 2.5, heavy: 3.5 + 2.5 * (opt.charge || 0), reflect: 6, hit: 0.8 }[tag] || 0;
  if (base) addCraic(base, tag);
  if (G.combo === 10 || G.combo === 20 || G.combo === 30) { Sound.sfx.cheer(0.9); addCraic(4, 'combo' + G.combo); }
  hintDone('strike');
}
function onPlayerHurt(att, m, dmg) {
  G.combo = 0; G.stats.dmgTaken += dmg; G.blockStreak = 0;
  if (G.phase === 'fight') G.craic = Math.max(0, G.craic - (m.knockdown ? 6 : 2));
  G.obs.block = lerp(G.obs.block, 0, 0.08); G.obs.dodge = lerp(G.obs.dodge, 0, 0.08);
}
function onKO(t, att, m, opt) {
  if (t.isPlayer) { slowmo(0.3, 1.0); Sound.sfx.ko(); return; }
  G.stats.kos++; G.lastKO = G.time; G.score += (t.A.score || 100) * mult();
  addCraic(t.A.boss ? 22 : 4, 'ko');
  Sound.sfx.ko(); Sound.sfx.cheer(t.A.boss ? 1.6 : 0.8);
  if (t.ai) t.ai.release();
  const last = G.mode === 'story' && G.spawnQueue.length === 0 && G.waveIdx >= G.waves.length - 1 && G.enemiesLeft() === 0;
  if (last || t.A.boss) { slowmo(0.25, 0.9); G.cam.focus = t; G.zoomT = 1.1; }
  else slowmo(0.5, 0.15);
  G.hostMood = G.host === 'commodus' ? 'angry' : 'cheer'; G.hostMoodT = 1.6;
  if (G.mode === 'story' && G.bout && G.bout.id === 'zucchabar') showHint('taunt');
}
function stampKO(f) {
  if (f.isPlayer) {
    G.phase = 'dead'; G.phaseT = 0;
    banner("YOU'RE BARRED!", pick(TIPS), '#e2433a', 46, 3.2, 0.4);
    Music.stinger('lose'); Sound.sfx.boo(); Sound.sfx.stamp(); Voice.say("You're barred!", 2);
    for (const e of G.fighters) if (e.team === 1 && (e.state === 'idle' || e.state === 'attack' || e.state === 'block')) e.set('victory');
    G.hostMood = G.host === 'commodus' ? 'up' : 'down'; G.hostMoodT = 99;
    return;
  }
  popup(f, 'BARRED!', '#e2433a', 30); Sound.sfx.stamp();
}

function slowmo(scale, dur) { if (G.slowT > 0 && G.slowScale < scale) return; G.slowScale = scale; G.slowT = dur; }
function shake(m) { if (Store.data.settings.shake) G.shake = Math.max(G.shake, m); }

/* ============================================================ PLAYER */
function startCombo(p) {
  p.buffer = null;
  if (p.state === 'attack' || p.comboWin > 0) p.combo = Math.min(3, p.combo + 1); else p.combo = 1;
  if (p.combo < 1) p.combo = 1;
  aim(p); beginMove(p, MOVES['p' + p.combo]);
}
function startBlock(p, fresh) {
  p.set('block'); p.blockT = fresh && p.parryLock <= 0 ? 0 : 9; p.parryOK = true; p.move = null;
  let best = null, bd = 1e9;
  for (const f of G.fighters) { if (f.team !== 1 || f.state === 'ko' || f.state === 'enter') continue; const d = Math.abs(f.x - p.x) + Math.abs(f.y - p.y) * 2 - (f.state === 'attack' ? 200 : 0); if (d < bd) { bd = d; best = f; } }
  for (const pr of G.projectiles) { if (pr.team === p.team) continue; const d = Math.abs(pr.x - p.x) + Math.abs(pr.y - p.y) * 2 - 260; if (d < bd) { bd = d; best = pr; } }
  if (best && bd < 600) p.face = best.x >= p.x ? 1 : -1;
}
function startDodge(p, mx, my) {
  p.buffer = null;
  if (p.wind < 14) { popup(p, 'OUT OF PUFF', '#ff8a5a', 14); return; }
  p.wind -= 20; p.windDelay = 0.6;
  let dx = mx, dy = my; const l = Math.hypot(dx, dy);
  if (l < 0.3) { dx = -p.face; dy = 0; } else { dx /= l; dy /= l; }
  p.dodgeDX = dx; p.dodgeDY = dy; p.dodgeFwd = Math.abs(dx) > 0.3 ? sgn(dx) === p.face : false;
  p.set('dodge'); p.inv = 0.27; p.oleDone = false; p.move = null;
  Sound.sfx.dodge(); dustFX(p.x, p.y, 5);
  G.stats.dodges++;
}
function startCharge(p) { p.set('charge'); p.charge = 0; p.move = null; p.chargeDing = false; aim(p); }
function releaseHeavy(p) {
  const ch = p.charge; aim(p); p.attackId++;
  beginMove(p, MOVES.heavy); p.heavyCharge = ch;
  p.wind = Math.max(0, p.wind - 12); p.windDelay = 0.5; G.stats.heavies++;
}
function startTaunt(p) {
  p.set('taunt'); p.move = null;
  if (G.time - G.lastTaunt > 4 && chance(0.6)) Voice.say('Are you not entertained?', 1);
}
function finishTaunt(p) {
  const recent = G.time - G.lastTaunt < 6;
  let downed = 0, near = 0;
  for (const f of G.fighters) {
    if (f.team !== 1) continue;
    if (f.down) downed++;
    else if (f.state !== 'enter' && Math.abs(f.x - p.x) < 170 && Math.abs(f.y - p.y) < 60) near++;
  }
  const fresh = G.time - G.lastKO < 3.5;
  let gain = 4 + downed * 6 + (fresh ? 8 : 0);
  if (recent) gain *= 0.35;
  if (near) gain *= 0.6;
  addCraic(gain, 'taunt');
  G.lastTaunt = G.time; G.stats.taunts++;
  const big = gain >= 11;
  popup(p, big ? 'ARE YOU NOT ENTERTAINED?!' : 'COME ON!', big ? '#ffe08a' : '#f3e6c4', big ? 20 : 16);
  if (big) { Sound.sfx.cheer(1.2); Sound.sfx.chant('kerry'); G.crowdPulse = 1; } else Sound.sfx.cheer(0.5);
  hintDone('taunt');
  p.set('idle');
}
function startSpecial(p) {
  p.set('special'); p.inv = 1.4; p.move = null; p.specialFired = false;
  G.craic = 0; G.craicHist = []; G.stats.specials++;
  banner('AT MY SIGNAL...', null, '#ffe08a', 34, 1.0, 0.36);
  Voice.say('At my signal... unleash hell!', 2, { rate: 0.95 });
  Sound.sfx.special(); slowmo(0.5, 0.6);
  hintDone('special');
}
function fireSpecial(p) {
  p.specialFired = true; G.flash = 0.45; shake(8);
  banner('UNLEASH HELL!', null, '#ff8a3a', 46, 1.3, 0.36);
  Sound.sfx.cheer(1.6);
  const targets = G.fighters.filter((f) => f.team === 1 && f.state !== 'ko' && f.state !== 'enter' && f.hp > 0);
  targets.forEach((t, i) => { const shots = t.A.boss ? 5 : 3; for (let k = 0; k < shots; k++) spawnSambuca(t, 0.1 + k * 0.2 + i * 0.07, k === shots - 1); });
  if (!targets.length) for (let k = 0; k < 6; k++) spawnSambuca(null, k * 0.1, false);
  for (const d of G.dogs) shooDog(d, p);
}

function updatePlayer(p, inp, dt) {
  p.vengeance = p.hp > 0 && p.hp < p.maxHp * 0.25;
  if (p.parryLock > 0) p.parryLock -= dt;
  if (p.windDelay > 0) p.windDelay -= dt; else p.wind = Math.min(100, p.wind + 38 * dt);
  if (p.healQ > 0) { const h = Math.min(p.healQ, 45 * dt); p.hp = Math.min(p.maxHp, p.hp + h); p.healQ -= h; }
  let mx = inp.mx, my = inp.my;
  if (p.spiked > 0) { const k = Math.min(1, p.spiked / 2); mx += Math.sin(G.time * 1.9) * 0.4 * k; my += Math.cos(G.time * 1.4) * 0.3 * k; }
  const mag = Math.hypot(mx, my); if (mag > 1) { mx /= mag; my /= mag; }
  if (Math.hypot(inp.mx, inp.my) > 0.2) { G.stats.moved += dt; if (G.stats.moved > 0.8) hintDone('move'); }
  if (inp.strike.pressed) { p.buffer = 'strike'; p.bufT = 0.22; p.held = 0; p.attackId++; }
  if (inp.strike.down) p.held += dt; else p.held = 0;
  if (inp.dodge.pressed) { p.buffer = 'dodge'; p.bufT = 0.2; }
  if (inp.crowd.pressed) { p.buffer = 'crowd'; p.bufT = 0.2; }
  const shP = inp.shield.pressed, shD = inp.shield.down || shP;
  if (p.bufT > 0) { p.bufT -= dt; if (p.bufT <= 0) p.buffer = null; }
  if (p.comboWin > 0) p.comboWin -= dt;
  switch (p.state) {
    case 'idle': {
      if (shD) { startBlock(p, shP); break; }
      if (p.buffer === 'dodge') { startDodge(p, mx, my); if (p.state === 'dodge') break; }
      if (p.buffer === 'crowd') { p.buffer = null; if (G.craic >= 90) startSpecial(p); else startTaunt(p); break; }
      if (p.buffer === 'strike') { startCombo(p); break; }
      if (inp.strike.down && p.held > HOLD_T) { startCharge(p); break; }
      p.vx = damp(p.vx, mx * p.A.speed, 16, dt); p.vy = damp(p.vy, my * p.A.speed * 0.72, 16, dt);
      if (Math.abs(mx) > 0.12) p.face = mx > 0 ? 1 : -1;
      break;
    }
    case 'attack': {
      const m = p.move, s = p.mt.s, a = p.mt.a, r = p.mt.r;
      if (p.st >= s + a) {
        if (inp.strike.down && p.held > HOLD_T && m !== MOVES.heavy) { startCharge(p); break; }
        if (shP) { startBlock(p, true); break; }
        if (p.buffer === 'dodge') { startDodge(p, mx, my); if (p.state === 'dodge') break; }
        if (p.buffer === 'strike' && (m === MOVES.p1 || m === MOVES.p2)) { startCombo(p); break; }
      }
      stepAttack(p, dt);
      if (p.state === 'attack' && p.st >= s + a + r) {
        p.set('idle');
        if (m === MOVES.p3 || m === MOVES.heavy) { p.combo = 0; p.comboWin = 0; } else p.comboWin = 0.36;
      }
      break;
    }
    case 'charge': {
      p.charge = Math.min(1, p.charge + dt / 0.7);
      if (p.charge >= 1 && !p.chargeDing) { p.chargeDing = true; Sound.sfx.charge(); }
      p.vx = damp(p.vx, mx * 80, 10, dt); p.vy = damp(p.vy, my * 56, 10, dt);
      if (Math.abs(mx) > 0.3) p.face = mx > 0 ? 1 : -1;
      if (!inp.strike.down) releaseHeavy(p);
      else if (shP) startBlock(p, true);
      else if (p.buffer === 'dodge') startDodge(p, mx, my);
      break;
    }
    case 'block': {
      p.blockT += dt;
      if (!shD && p.st >= G.parryWin) { p.parryLock = p.st < 0.3 ? 0.28 : 0.1; p.set('idle'); break; }
      if (p.buffer === 'dodge') { startDodge(p, mx, my); if (p.state === 'dodge') break; }
      if (p.buffer === 'strike' && p.st > 0.08) { startCombo(p); break; }
      p.vx = damp(p.vx, mx * 70, 12, dt); p.vy = damp(p.vy, my * 50, 12, dt);
      break;
    }
    case 'dodge': {
      const k = Math.max(0, 1 - p.st / DODGE_T), sp = 660 * Math.pow(k, 1.4);
      p.vx = p.dodgeDX * sp; p.vy = p.dodgeDY * sp * 0.62;
      if (p.st >= DODGE_T) p.set('idle');
      break;
    }
    case 'taunt': p.vx = damp(p.vx, 0, 10, dt); p.vy = damp(p.vy, 0, 10, dt); if (p.st >= 0.95) finishTaunt(p); break;
    case 'special': p.vx = damp(p.vx, 0, 10, dt); p.vy = damp(p.vy, 0, 10, dt); if (p.st > 0.7 && !p.specialFired) fireSpecial(p); if (p.st > 1.15) p.set('idle'); break;
    default: break;
  }
}

/* ============================================================ PHYSICS */
function physics(f, dt) {
  f.st += dt;
  if (f.inv > 0 && f.inv < 50) f.inv -= dt;
  if (f.flash > 0) f.flash -= dt;
  if (f.hpShow > 0) f.hpShow -= dt;
  f.blinkT -= dt; if (f.blinkT < -0.12) f.blinkT = rand(2.5, 5);
  f.hpShown = f.hpShown > f.hp ? Math.max(f.hp, f.hpShown - f.maxHp * 0.45 * dt) : f.hp;
  if (f.spiked > 0) f.spiked -= dt;
  if (f.blind > 0) f.blind -= dt;
  if (f.dutch > 0) f.dutch -= dt;
  switch (f.state) {
    case 'enter': {
      const t = f.enterTo, dx = t.x - f.x, dy = t.y - f.y, d = Math.hypot(dx, dy);
      if (d < 8 || f.st > 3) { f.set('idle'); f.inv = 0; f.vx = 0; f.vy = 0; }
      else { const sp = f.A.speed * 1.15; f.vx = (dx / d) * sp; f.vy = (dy / d) * sp * 0.85; f.face = dx > 0 ? 1 : -1; }
      break;
    }
    case 'launched': {
      f.vz -= GRAV * dt; f.z += f.vz * dt;
      if (f.z <= 0) {
        f.z = 0;
        if (!f.bounced && f.vz < -260) { f.vz = -f.vz * 0.32; f.vx *= 0.55; f.bounced = true; dustFX(f.x, f.y, 6); Sound.sfx.thud(); shake(2); }
        else { f.vz = 0; f.set('down'); f.downT = f.willKO ? 0.5 : f.isPlayer ? 0.55 : 0.8; f.vx *= 0.3; f.juggles = 0; dustFX(f.x, f.y, 10); Sound.sfx.thud(); }
      }
      break;
    }
    case 'down':
      f.vx = damp(f.vx, 0, 8, dt); f.vy = 0;
      if (f.st >= f.downT) { if (f.willKO) { f.set('ko'); f.koT = 0; stampKO(f); } else { f.set('getup'); f.inv = 0.6; } }
      break;
    case 'getup': f.vx = 0; f.vy = 0; if (f.st >= 0.42) { f.set('idle'); f.inv = 0.25; } break;
    case 'ko': f.koT += dt; f.vx = damp(f.vx, 0, 6, dt); if (!f.isPlayer && f.koT > 2.3) f.remove = true; break;
    case 'hurt': f.vx = damp(f.vx, 0, 7, dt); f.vy = damp(f.vy, 0, 7, dt); if (f.st >= f.hitstun) f.set('idle'); break;
    case 'stagger': f.vx = damp(f.vx, 0, 6, dt); f.vy = damp(f.vy, 0, 6, dt); if (f.st >= f.staggerT) f.set('idle'); break;
    case 'victory': case 'shh': case 'drink': f.vx = damp(f.vx, 0, 8, dt); f.vy = damp(f.vy, 0, 8, dt); break;
    default: break;
  }
  if (f.state !== 'launched' && f.state !== 'down' && f.state !== 'ko') f.walkPhase += (Math.abs(f.vx) + Math.abs(f.vy) * 0.6) * dt * 0.075 * (f.vx * f.face >= 0 ? 1 : -1);
  f.x += f.vx * dt; f.y += f.vy * dt;
  if (f.state === 'enter') return;
  if (f.x < WORLD.minX) { f.x = WORLD.minX; if (f.state === 'launched' && f.vx < -150) wallSplat(f, 1); else f.vx = Math.max(0, f.vx); }
  if (f.x > WORLD.maxX) { f.x = WORLD.maxX; if (f.state === 'launched' && f.vx > 150) wallSplat(f, -1); else f.vx = Math.min(0, f.vx); }
  if (f.y < WORLD.minY) { f.y = WORLD.minY; f.vy = Math.max(0, f.vy); }
  if (f.y > WORLD.maxY) { f.y = WORLD.maxY; f.vy = Math.min(0, f.vy); }
}
function wallSplat(f, dir) {
  f.vx = dir * 110; f.vz = Math.max(f.vz, 180);
  shake(6); Sound.sfx.thud(); dustFX(f.x, f.y, 8);
  if (f.team === 1 && f.hp > 0) { f.hp = Math.max(1, f.hp - 5); f.flash = 0.1; popup(f, dir > 0 ? 'INTO THE SNUG!' : 'INTO THE JACKS!', '#ffb03a', 18); addCraic(5, 'splat'); G.score += 80; }
}
function separate() {
  const fs = G.fighters;
  for (let i = 0; i < fs.length; i++) {
    const a = fs[i];
    if (a.state === 'ko' || a.state === 'enter' || a.state === 'down' || a.z > 30) continue;
    for (let j = i + 1; j < fs.length; j++) {
      const b = fs[j];
      if (b.state === 'ko' || b.state === 'enter' || b.state === 'down' || b.z > 30) continue;
      const dx = b.x - a.x, dy = (b.y - a.y) * 2.2, d = Math.hypot(dx, dy), min = (a.radius + b.radius) * 0.85;
      if (d < min) {
        const ux = d > 0.01 ? dx / d : chance(0.5) ? 1 : -1, uy = d > 0.01 ? dy / d / 2.2 : 0;
        const push = min - d, ka = a.isPlayer ? 0.3 : b.isPlayer ? 0.7 : 0.5, kb = 1 - ka;
        a.x -= ux * push * ka; a.y -= uy * push * ka * 0.5;
        b.x += ux * push * kb; b.y += uy * push * kb * 0.5;
      }
    }
  }
}

/* ======================================================= PROJECTILES */
function spawnProj(f, m) {
  const p = G.player; if (!p) return;
  if (m.proj === 'dart') {
    const tx = p.x + p.vx * 0.22, ty = p.y + p.vy * 0.18, sx = f.x + f.face * 30;
    const dx = tx - sx, dy = ty - f.y, d = Math.hypot(dx, dy) || 1, sp = 600;
    G.projectiles.push({ kind: 'dart', team: f.team, owner: f, x: sx, y: f.y, z: 100 * f.scale, vx: (dx / d) * sp, vy: (dy / d) * sp, vz: 0, dmg: m.dmg, life: 1.7, t: 0 });
    Sound.sfx.dart();
  } else if (m.proj === 'turf') {
    const T = clamp(Math.abs(p.x - f.x) / 520, 0.62, 1.05);
    const tx = clamp(p.x + p.vx * T * 0.55, WORLD.minX, WORLD.maxX), ty = clamp(p.y + p.vy * T * 0.45, WORLD.minY, WORLD.maxY);
    G.projectiles.push({ kind: 'turf', arc: true, team: f.team, owner: f, sx: f.x + f.face * 24, sy: f.y, z0: 100 * f.scale, tx, ty, T, t: 0, peak: 150, x: f.x, y: f.y, z: 100, vx: 0, vy: 0, dmg: m.dmg });
  } else if (m.proj === 'crisps') {
    const sx = f.x + f.face * 30, dx = p.x - sx, dy = p.y - f.y, d = Math.hypot(dx, dy) || 1, sp = 430;
    G.projectiles.push({ kind: 'crisps', team: f.team, owner: f, x: sx, y: f.y, z: 90, vx: (dx / d) * sp, vy: (dy / d) * sp * 0.8, vz: 0, dmg: m.dmg, life: 0.95, t: 0 });
    Sound.sfx.crunch();
  }
}
function spawnSambuca(target, delay, last) {
  const tx = target ? target.x + rand(-16, 16) : rand(WORLD.minX + 60, WORLD.maxX - 60), ty = target ? target.y + rand(-8, 8) : rand(WORLD.minY + 20, WORLD.maxY - 20);
  const sx = tx + rand(-260, 260);
  G.projectiles.push({ kind: 'sambuca', arc: true, team: 0, owner: G.player, sx, sy: 790, z0: 20, tx, ty, T: 0.72, t: 0, peak: 260, x: sx, y: 790, z: 20, vx: 0, vy: 0, vz: 0, dmg: MOVES.sambuca.dmg, delay, last });
}
function throwMat() {
  const p = G.player; if (!p) return;
  const sx = p.x + rand(-320, 320);
  G.projectiles.push({ kind: 'mat', arc: true, team: -1, owner: null, sx, sy: 790, z0: 30, tx: clamp(p.x + p.vx * 0.5, WORLD.minX, WORLD.maxX), ty: p.y, T: 0.9, t: 0, peak: 170, x: sx, y: 790, z: 30, vx: 0, vy: 0, dmg: 2 });
}
function reflect(pr, p) {
  const o = pr.owner;
  pr.team = p.team; pr.owner = p; pr.reflected = true;
  if (pr.arc) { pr.sx = pr.x; pr.sy = pr.y; pr.z0 = Math.max(40, pr.z); pr.tx = o ? o.x : pr.x - p.face * 300; pr.ty = o ? o.y : pr.y; pr.t = 0; pr.T = 0.6; return; }
  if (o && o.hp > 0) { const dx = o.x - pr.x, dy = o.y - pr.y, d = Math.hypot(dx, dy) || 1, sp = Math.hypot(pr.vx, pr.vy) * 1.3; pr.vx = (dx / d) * sp; pr.vy = (dy / d) * sp; }
  else { pr.vx = -pr.vx * 1.3; pr.vy = -pr.vy; }
  pr.life = 1.4;
}
function blindTarget(f) {
  if (f.isPlayer) { f.blind = 2.2; popup(f, 'SALT & VINEGAR IN THE EYES!', '#ffd23a', 16); }
  else { f.set('stagger'); f.staggerT = 1.3; f.move = null; popup(f, 'SALT IN HIS OWN EYES!', '#ffd23a', 18); addCraic(10, 'reflect'); }
}
function updateProjectiles(dt) {
  for (const p of G.projectiles) {
    if (p.delay > 0) { p.delay -= dt; continue; }
    p.t += dt;
    if (p.arc) {
      const k = clamp(p.t / p.T, 0, 1), px = p.x, py = p.y;
      p.x = lerp(p.sx, p.tx, k); p.y = lerp(p.sy, p.ty, k); p.z = lerp(p.z0, 0, k) + 4 * p.peak * k * (1 - k);
      p.vx = (p.x - px) / Math.max(dt, 1e-4); p.vy = (p.y - py) / Math.max(dt, 1e-4);
      if (p.kind === 'sambuca' && chance(0.6)) part('fire', p.x, p.y, p.z, rand(-30, 30), 0, rand(-20, 40), 0.3, { size: rand(5, 9) });
      if (k >= 1 && !landProj(p)) p.dead = true;
      continue;
    }
    p.life -= dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    for (const f of G.fighters) {
      if (f.team === p.team || f.state === 'ko' || f.state === 'enter' || f.down || f.hp <= 0) continue;
      if (Math.abs(f.x - p.x) < 26 * f.scale && Math.abs(f.y - p.y) < 24 && p.z > 20 && p.z < 170 * f.scale) {
        if (f.inv > 0) { if (f.isPlayer && f.state === 'dodge' && !f.oleDone) { f.oleDone = true; ole(f); } continue; }
        const res = resolveHit(p.owner || f, f, { dmg: p.dmg, hitstun: p.kind === 'crisps' ? 0.35 : 0.22, kb: 60, depth: 30 }, { proj: p, dirX: sgn(p.vx) });
        if (res === 'parry') break;
        if (res === 'hit' && p.kind === 'crisps') blindTarget(f);
        if (res === 'hit' && p.kind === 'dart') Sound.sfx.thunk();
        p.dead = true; break;
      }
    }
    if (p.kind === 'crisps' && chance(0.5)) part('crisp', p.x + rand(-10, 10), p.y, p.z + rand(-10, 10), rand(-40, 40), 0, rand(-60, 20), 0.4, { size: rand(2.5, 4), rot: rand(0, 6), grav: true });
    if (p.x < WORLD.sceneL || p.x > WORLD.sceneR || p.life <= 0) p.dead = true;
  }
  G.projectiles = G.projectiles.filter((p) => !p.dead);
}
function landProj(p) {
  if (p.kind === 'turf') {
    dustFX(p.x, p.y, 8); Sound.sfx.thud();
    for (const f of G.fighters) {
      if (f.team === p.team || f.state === 'ko' || f.state === 'enter' || f.down) continue;
      if (Math.abs(f.x - p.x) < 48 && Math.abs(f.y - p.y) < 26) {
        if (f.inv > 0) { if (f.isPlayer && f.state === 'dodge' && !f.oleDone) { f.oleDone = true; ole(f); } continue; }
        const res = resolveHit(p.owner || f, f, { dmg: p.dmg, hitstun: 0.32, kb: 120, depth: 30 }, { proj: p, dirX: sgn(p.tx - p.sx) });
        if (res === 'parry') return true;
      }
    }
    for (let i = 0; i < 8; i++) part('drop', p.x, p.y, 10, rand(-160, 160), rand(-30, 30), rand(60, 220), rand(0.3, 0.5), { size: rand(2, 4), color: '#4a2e18', grav: true });
    return false;
  }
  if (p.kind === 'mat') {
    const f = G.player;
    if (f && f.hp > 0 && !f.down && Math.abs(f.x - p.x) < 34 && Math.abs(f.y - p.y) < 24) {
      if (f.inv > 0) return false;
      if (f.state === 'block') { Sound.sfx.block(); return false; }
      f.hp = Math.max(1, f.hp - 2 * DIFF().dmg); f.flash = 0.08; popup(f, 'OI!', '#f3e6c4', 14); Sound.sfx.thunk();
    }
    for (let i = 0; i < 3; i++) part('glass', p.x, p.y, 4, rand(-80, 80), 0, rand(40, 120), 0.4, { rot: rand(0, 6), grav: true });
    return false;
  }
  if (p.kind === 'sambuca') {
    Sound.sfx.fire(); shake(4);
    for (let i = 0; i < 14; i++) part('fire', p.x + rand(-26, 26), p.y + rand(-8, 8), rand(0, 30), rand(-90, 90), rand(-20, 20), rand(40, 200), rand(0.3, 0.6), { size: rand(7, 14) });
    for (let i = 0; i < 6; i++) part('glass', p.x, p.y, 6, rand(-180, 180), rand(-30, 30), rand(80, 260), rand(0.3, 0.6), { rot: rand(0, 6), grav: true });
    for (const f of G.fighters) {
      if (f.team !== 1 || f.state === 'ko' || f.state === 'enter' || f.hp <= 0) continue;
      if (Math.abs(f.x - p.x) < 64 && Math.abs(f.y - p.y) < 34) {
        const m = p.last ? { dmg: MOVES.sambuca.dmg, kb: 200, launch: 280, knockdown: true } : MOVES.sambuca;
        resolveHit(G.player, f, m, { env: true, special: true, mult: f.A.boss ? 0.6 : 1, dirX: sgn(f.x - p.sx) });
      }
    }
    for (const d of G.dogs) if (Math.abs(d.x - p.x) < 70) shooDog(d, null);
    return false;
  }
  return false;
}

/* ============================================================ PICKUPS */
function throwGift(kind, at) {
  const p = G.player; if (!p) return;
  let tx, ty, tries = 0;
  if (at) { tx = at.x; ty = at.y; }
  else do { tx = clamp(p.x + rand(-340, 340), WORLD.minX + 30, WORLD.maxX - 30); ty = rand(WORLD.minY + 15, WORLD.maxY - 15); tries++; } while (Math.hypot(tx - p.x, (ty - p.y) * 2) < 140 && tries < 12);
  const sx = tx + rand(-180, 180);
  G.pickups.push({ kind, x: sx, y: 790, z: 30, sx, sy: 790, tx, ty, T: 0.95, t: 0, flying: true, landed: false, settle: kind === 'pint' ? 0 : 1, life: 14 });
  Sound.sfx.whoosh(0.6);
}
function updatePickups(dt) {
  for (const k of G.pickups) {
    if (k.flying) {
      k.t += dt; const u = clamp(k.t / k.T, 0, 1);
      k.x = lerp(k.sx, k.tx, u); k.y = lerp(k.sy, k.ty, u); k.z = lerp(30, 0, u) + 4 * 220 * u * (1 - u);
      if (u >= 1) { k.flying = false; k.landed = true; k.z = 0; Sound.sfx.clink(); dustFX(k.x, k.y, 4); }
      continue;
    }
    k.life -= dt;
    if (k.kind === 'pint' && k.settle < 1) k.settle = Math.min(1, k.settle + dt / 1.5);
    if (k.life <= 0) { k.dead = true; continue; }
    const p = G.player;
    if (p && p.hp > 0 && !p.down && Math.abs(p.x - k.x) < 36 && Math.abs(p.y - k.y) < 24 && (k.kind !== 'pint' || k.settle >= 1)) consume(p, k);
  }
  G.pickups = G.pickups.filter((k) => !k.dead);
}
function consume(p, k) {
  k.dead = true;
  p.healQ += { pint: 30, toastie: 20, crisps: 10, tea: 15 }[k.kind] || 10;
  if (k.kind === 'tea') p.wind = 100;
  const line = { pint: pick(['SLÁINTE!', 'A PINT OF PLAIN IS YOUR ONLY MAN!', 'SLÁINTE!']), toastie: 'TOASTED SPECIAL!', crisps: 'CHEESE & ONION!', tea: 'A CUP OF TAE!' }[k.kind];
  popup(p, line, '#f3e6c4', 18);
  if (k.kind === 'pint') { Sound.sfx.gulp(); G.stats.pints++; p.dutch = 6; foamFX(p.x, p.y); } else Sound.sfx.crunch();
  G.score += 50;
}

/* ============================================================ CROWD */
function addCraic(amount, tag) {
  if (G.phase !== 'fight') return;
  if (amount < 0) { G.craic = clamp(G.craic + amount, 0, 90); return; }
  let m = 1;
  if (tag) {
    const h = G.craicHist; h.push(tag); if (h.length > 6) h.shift();
    let same = 0; for (const x of h) if (x === tag) same++;
    if (same >= 5) m = 0.3; else if (same >= 4) m = 0.6;
    if (h.length >= 4 && new Set(h.slice(-4)).size === 4) m *= 1.35;   // the crowd loves variety
    if (same >= 5 && G.time - G.lastBoring > 7) { G.lastBoring = G.time; popup(G.player, 'BORING!', '#d9c48a', 16); Sound.sfx.boo(); }
  }
  m *= 0.7 + 0.65 * (G.craic / 90);  // excitement is contagious: the louder they are, the louder they get
  const before = G.craic;
  G.craic = clamp(G.craic + amount * m * DIFF().craic, 0, 90);
  G.craicIdle = 0;
  G.crowdPulse = Math.max(G.crowdPulse, clamp(amount / 12, 0.1, 1));
  if (before < 90 && G.craic >= 90) {
    banner('THE CRAIC IS NINETY!', Input.usingTouch ? 'Tap UNLEASH HELL' : 'Press I to UNLEASH HELL', '#ffe08a', 34, 1.8, 0.3);
    Voice.say('The crack is ninety!', 1); Sound.sfx.cheer(1.4); Sound.sfx.chant('kerry');
    showHint('special');
  }
}
function updateCrowd(dt) {
  G.craicIdle += dt;
  if (G.craicIdle > 3 && G.craic < 90) G.craic = Math.max(0, G.craic - (G.craicIdle > 8 ? 4.5 : 1.8) * dt);
  if (G.craic >= 50) {
    G.giftT -= dt * (0.5 + G.craic / 90) * DIFF().gift;
    if (G.giftT <= 0 && G.pickups.length < 2) {
      G.giftT = rand(8, 12);
      const r = Math.random();
      throwGift(G.craic > 75 && r < 0.45 ? 'pint' : r < 0.3 ? 'toastie' : r < 0.55 ? 'tea' : r < 0.8 ? 'crisps' : 'pint');
      popup(G.player, pick(['THE CROWD SENDS A GIFT', 'ONE FROM THE BAR', 'FAIR PLAY!']), '#d9c48a', 13);
    }
  }
  if (G.craic < 12 && G.craicIdle > 6) { G.matT -= dt; if (G.matT <= 0) { G.matT = rand(1.8, 3); throwMat(); if (chance(0.4)) Sound.sfx.boo(); } }
  if (G.hostMoodT > 0) { G.hostMoodT -= dt; if (G.hostMoodT <= 0) G.hostMood = 'polish'; }
  else if (G.host === 'commodus' && G.craic > 70) G.hostMood = 'angry';
  else if (G.craic > 75) G.hostMood = 'cheer';
  else G.hostMood = 'polish';
}

/* ============================================================ HAZARDS */
const ENV_ATT = { isPlayer: false, team: -1, x: 0, A: {} };
function triggerHatch() {
  const p = G.player; if (!p) return;
  const free = G.hatches.filter((h) => h.state === 'closed');
  if (!free.length) return;
  free.sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x));
  const h = free[0]; h.state = 'rumble'; h.t = 0; Sound.sfx.growl(); showHint('hatch');
}
function updateHatches(dt) {
  for (const h of G.hatches) {
    h.t += dt;
    if (h.state === 'rumble') { if (h.t > 0.95) { h.state = 'out'; h.t = 0; spawnDog(h); Sound.sfx.bark(); } }
    else if (h.state === 'out') { h.lid = Math.min(1, h.lid + dt * 6); if (!h.dog || h.dog.state === 'gone') { h.state = 'closing'; h.t = 0; } }
    else if (h.state === 'closing') { h.lid = Math.max(0, h.lid - dt * 5); if (h.lid <= 0) { h.state = 'closed'; h.t = 0; h.dog = null; Sound.sfx.thud(); } }
  }
}
function spawnDog(h) { const d = { id: FID++, hatch: h, x: h.x, y: h.y + 2, z: 0, state: 'peek', t: 0, face: 1, bark: 0, target: null, sx: 0, sy: 0, tx: 0, ty: 0 }; h.dog = d; G.dogs.push(d); }
function updateDogs(dt) {
  for (const d of G.dogs) {
    d.t += dt; d.bark = Math.max(0, d.bark - dt);
    if (d.state === 'peek') {
      d.z = Math.min(14, d.t * 60);
      if (d.t > 0.35) {
        let best = null, bd = 320;
        for (const f of G.fighters) { if (f.state === 'ko' || f.state === 'enter' || f.down) continue; const dd = Math.hypot(f.x - d.x, (f.y - d.y) * 1.5); if (dd < bd) { bd = dd; best = f; } }
        if (best) { d.state = 'lunge'; d.t = 0; d.target = best; d.sx = d.x; d.sy = d.y; d.tx = best.x - sgn(best.x - d.x) * 18; d.ty = best.y; d.face = best.x >= d.x ? 1 : -1; d.bark = 0.3; Sound.sfx.bark(); }
        else if (d.t > 1.4) { d.state = 'return'; d.t = 0; d.sx = d.x; d.sy = d.y; }
      }
    } else if (d.state === 'lunge') {
      const k = clamp(d.t / 0.32, 0, 1);
      d.x = lerp(d.sx, d.tx, k); d.y = lerp(d.sy, d.ty, k); d.z = 14 + Math.sin(k * Math.PI) * 26;
      if (k >= 1) {
        const f = d.target;
        if (f && !f.down && f.state !== 'ko' && Math.abs(f.x - d.x) < 52 && Math.abs(f.y - d.y) < 30) {
          if (f.inv > 0) { if (f.isPlayer && f.state === 'dodge' && !f.oleDone) { f.oleDone = true; ole(f); } }
          else {
            const att = { isPlayer: false, team: -1, x: d.x - d.face * 10, A: {} };
            const r = resolveHit(att, f, MOVES.bite, { env: !f.isPlayer, dirX: d.face, dogRef: d });
            if (f.team === 1 && r === 'hit') { popup(f, 'GOOD BOY, TIGER!', '#ffe08a', 16); addCraic(5, 'dog'); }
          }
        }
        if (d.state === 'lunge') { d.state = 'linger'; d.t = 0; d.bark = 0.4; Sound.sfx.bark(); }
      }
    } else if (d.state === 'linger') { d.z = 0; if (d.t > 0.9) { d.state = 'return'; d.t = 0; d.sx = d.x; d.sy = d.y; } }
    else if (d.state === 'return' || d.state === 'flee') {
      const T = d.state === 'flee' ? 0.3 : 0.55, k = clamp(d.t / T, 0, 1);
      d.x = lerp(d.sx, d.hatch.x, k); d.y = lerp(d.sy, d.hatch.y + 2, k); d.z = Math.sin(k * Math.PI) * 14;
      d.face = d.hatch.x >= d.sx ? 1 : -1;
      if (k >= 1) d.state = 'gone';
    }
  }
  G.dogs = G.dogs.filter((d) => d.state !== 'gone');
}
function shooDog(d, by) {
  if (!d || d.state === 'gone' || d.state === 'flee') return;
  d.state = 'flee'; d.t = 0; d.sx = d.x; d.sy = d.y; Sound.sfx.yelp();
  if (by && by.isPlayer) { popup(d, 'DOWN, TIGER!', '#ffe08a', 18); addCraic(6, 'dog'); G.score += 80; }
}
function updateHazards(dt) {
  const trolleys = (G.bout && G.bout.trolleys) || (G.mode === 'lockin' && G.waveNum >= 3);
  if (trolleys) {
    G.trolleyT -= dt;
    if (G.trolleyT <= 0 && G.enemiesLeft() > 0) {
      G.trolleyT = rand(9, 14);
      const dir = chance(0.5) ? 1 : -1, p = G.player;
      const y = chance(0.65) ? clamp(p.y, WORLD.minY + 24, WORLD.maxY - 24) : rand(WORLD.minY + 24, WORLD.maxY - 24);
      G.hazards.push({ type: 'trolley', dir, y, x: dir > 0 ? WORLD.minX - 300 : WORLD.maxX + 300, state: 'warn', t: 0, look: LOOKS.stag(), hitSet: new Set() });
      Sound.sfx.rattle(1.0); showHint('trolley');
      popup({ x: dir > 0 ? G.cam.x - 300 : G.cam.x + 300, y: y + 120, z: 0, scale: 1 }, 'TROLLEY!', '#ff6a4a', 22);
    }
  }
  if (G.mode === 'lockin' && G.waveNum >= 6) { G.hatchT -= dt; if (G.hatchT <= 0) { G.hatchT = rand(12, 18); triggerHatch(); } }
  for (const h of G.hazards) {
    if (h.type !== 'trolley') continue;
    h.t += dt;
    if (h.state === 'warn') { if (h.t >= 1.15) { h.state = 'go'; h.t = 0; Sound.sfx.rattle(1.6); } continue; }
    h.x += h.dir * 760 * dt;
    if (chance(0.5)) part('spark', h.x - h.dir * 40, h.y, 2, -h.dir * rand(40, 140), 0, rand(20, 80), 0.2);
    for (const f of G.fighters) {
      if (h.hitSet.has(f.id) || f.state === 'ko' || f.state === 'enter' || f.z > 40) continue;
      if (Math.abs(f.y - h.y) < 30 && Math.abs(f.x - h.x) < 58) {
        h.hitSet.add(f.id);
        if (f.inv > 0) { if (f.isPlayer && f.state === 'dodge' && !f.oleDone) { f.oleDone = true; ole(f); } continue; }
        if (f.down) continue;
        ENV_ATT.x = h.x - h.dir * 50;
        resolveHit(ENV_ATT, f, MOVES.trolley, { env: true, dirX: h.dir });
        Sound.sfx.crash();
        if (f.team === 1) { popup(f, 'CARTHAGE!', '#ffb03a', 20); addCraic(8, 'trolley'); G.score += 120; }
      }
    }
    if ((h.dir > 0 && h.x > WORLD.maxX + 320) || (h.dir < 0 && h.x < WORLD.minX - 320)) h.dead = true;
  }
  G.hazards = G.hazards.filter((h) => !h.dead);
}

/* ============================================================ FX */
function part(kind, x, y, z, vx, vy, vz, life, extra) {
  if (G.particles.length > 420) return;
  const p = { kind, x, y, z, vx, vy, vz, life, max: life, size: 4, rot: 0, grav: false };
  if (extra) Object.assign(p, extra);
  G.particles.push(p);
}
function hitFX(t, power, dirX) {
  const x = t.x - dirX * 10, y = t.y, z = (t.z || 0) + 85 * t.scale;
  for (let i = 0; i < 6 + power * 4; i++) { const a = rand(0, TAU), sp = rand(150, 420) * power; part('spark', x, y, z, Math.cos(a) * sp + dirX * 120, 0, Math.sin(a) * sp, rand(0.12, 0.25)); }
  part('star', x, y, z, 0, 0, 0, 0.18, { size: 22 + power * 14, rot: rand(0, 6) });
  for (let i = 0; i < 3 + power * 2; i++) part('drop', x, y, z, dirX * rand(60, 200), rand(-40, 40), rand(80, 260), rand(0.3, 0.6), { size: rand(2, 3.6), color: '#f2f6ff', grav: true });
}
function dustFX(x, y, n) { for (let i = 0; i < n; i++) part('dust', x + rand(-20, 20), y + rand(-6, 6), rand(0, 10), rand(-120, 120), rand(-20, 20), rand(20, 90), rand(0.3, 0.6), { size: rand(3, 7) }); }
function stoutFX(x, y, z) { for (let i = 0; i < 12; i++) part('drop', x, y, z, rand(-160, 160), rand(-30, 30), rand(40, 240), rand(0.4, 0.7), { size: rand(2.5, 4.5), color: i % 3 ? '#160b06' : '#f2e6c4', grav: true }); }
function foamFX(x, y) { for (let i = 0; i < 8; i++) part('foam', x + rand(-14, 14), y, rand(100, 130), rand(-40, 40), 0, rand(20, 80), rand(0.4, 0.7), { size: rand(3, 6) }); }
function updateFX(dt) {
  for (const p of G.particles) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rot += 5 * dt;
    if (p.grav) { p.vz -= 900 * dt; if (p.z < 0) { p.z = 0; p.vz = 0; p.vx *= 0.5; p.vy *= 0.5; } }
    else { p.vx *= 0.9; p.vy *= 0.9; p.vz *= 0.9; }
  }
  G.particles = G.particles.filter((p) => p.life > 0);
  for (const p of G.popups) { p.t += dt; p.life -= dt; p.y += p.vy * dt; p.vy *= 0.95; }
  G.popups = G.popups.filter((p) => p.life > 0);
  for (const b of G.banners) { b.t += dt; b.life -= dt; }
  G.banners = G.banners.filter((b) => b.life > 0);
  for (const d of DOORS) if (d.open > 0) d.open -= dt;
  G.shake *= Math.exp(-dt * 14); if (G.shake < 0.2) G.shake = 0;
  if (G.flash > 0) G.flash -= dt * 1.6;
  G.crowdPulse = Math.max(0, G.crowdPulse - dt * 1.6);
}
function popup(e, text, color, size) {
  G.popups.push({ x: e.x + rand(-6, 6), y: e.y - (e.z || 0) - 150 * (e.scale || 0.6), text, color, size: size || 18, t: 0, life: 1.1, vy: -46 });
  if (G.popups.length > 14) G.popups.shift();
}
function banner(text, sub, color, size, life, y) {
  for (const b of G.banners) b.life = Math.min(b.life, 0.25);
  G.banners.push({ text, sub, color, size: size || 36, life: life || 1.6, t: 0, y: y || 0.4 });
}

/* ============================================================ HINTS */
const HINTS = {
  move: { text: 'Drag anywhere on the left side to move', keys: 'Move with WASD or the arrow keys', anchor: 'joy' },
  strike: { text: 'Tap STRIKE to swing the hurley. Tap again for a combo', keys: 'Press J (or Z) to swing. Press again for a combo', anchor: 'strike' },
  shield: { text: 'White flash: hold BLOCK. Tap it right before the hit lands to PARRY', keys: 'White flash: hold K (or X) to block. Tap it right before the hit to PARRY', anchor: 'shield' },
  dodge: { text: 'Red flash means unblockable. LEG IT!', keys: 'Red flash means unblockable. Dodge with L, C or Space!', anchor: 'dodge' },
  special: { text: 'The craic is ninety! Tap UNLEASH HELL', keys: 'The craic is ninety! Press I (or V) to UNLEASH HELL', anchor: 'crowd' },
  craic: { text: 'Win the crowd: fill the CRAIC meter with variety and style', anchor: 'craic', dur: 5 },
  taunt: { text: 'Lad on the floor? TAUNT the crowd!', keys: 'Lad on the floor? Press I (or V) to TAUNT the crowd!', anchor: 'crowd', dur: 5 },
  heavy: { text: 'He is blocking. HOLD STRIKE for a Hurley Smash to break his guard', keys: 'He is blocking. HOLD J for a Hurley Smash to break his guard', anchor: 'strike' },
  reflect: { text: 'Tap BLOCK as a dart arrives to send it back', keys: 'Tap K as a dart arrives to send it back', anchor: 'shield', dur: 5 },
  trolley: { text: 'Flashing lane: a trolley is coming. Get out of the way!', anchor: 'center', dur: 3.5 },
  hatch: { text: 'Rattling hatch: mind your ankles! Hit the dog to shut it', anchor: 'center', dur: 4 },
  counter: { text: "Purple glow: don't swing. Wait for him to drop his guard", anchor: 'center', dur: 4 },
};
function showHint(id) {
  if (!Store.data.settings.hints || Store.data.seen[id] || !HINTS[id]) return;
  if (G.hint && G.hint.id === id) return;
  if (G.hint) { if (G.hintQueue.indexOf(id) < 0) G.hintQueue.push(id); return; }
  const h = HINTS[id];
  G.hint = { id, text: h.text, keys: h.keys, anchor: h.anchor, t: 0, life: h.dur || 14, timed: !!h.dur };
}
function hintDone(id) {
  if (G.hint && G.hint.id === id) G.hint.life = Math.min(G.hint.life, 0.35);
  if (HINTS[id] && !Store.data.seen[id]) { Store.data.seen[id] = true; Store.save(); }
  const qi = G.hintQueue.indexOf(id); if (qi >= 0) G.hintQueue.splice(qi, 1);
}
function updateHint(dt) {
  const h = G.hint;
  if (!h) { if (G.hintQueue.length) showHint(G.hintQueue.shift()); return; }
  h.t += dt; h.life -= dt;
  if (h.life <= 0) { if (h.timed && !Store.data.seen[h.id]) { Store.data.seen[h.id] = true; Store.save(); } G.hint = null; }
}

/* ============================================================ BOT (testing) */
const Bot = {
  input() {
    const p = G.player, out = { mx: 0, my: 0, strike: { down: false, pressed: false }, shield: { down: false, pressed: false }, dodge: { down: false, pressed: false }, crowd: { down: false, pressed: false }, pause: NULL_BTN };
    if (!p) return out;
    for (const f of G.fighters) {
      if (f.team !== 1 || f.state !== 'attack' || !f.move || !f.move.tele || f.st >= f.mt.s) continue;
      const dx = Math.abs(f.x - p.x);
      if (dx < (f.move.range || 100) * 1.5 + (f.move.lunge > 400 ? 260 : 0) && Math.abs(f.y - p.y) < 50) {
        const left = f.mt.s - f.st;
        if (f.move.unblockable || f.move.counter) { if (left < 0.25) { out.dodge.pressed = true; out.mx = -sgn(f.x - p.x); out.my = p.y < 540 ? 0.8 : -0.8; } }
        else if (left < 0.12) { out.shield.pressed = true; out.shield.down = true; }
        return out;
      }
    }
    if (G.craic >= 90) { out.crowd.pressed = true; return out; }
    let t = null, bd = 1e9;
    for (const f of G.fighters) { if (f.team !== 1 || f.state === 'ko' || f.state === 'enter' || f.hp <= 0) continue; const d = Math.abs(f.x - p.x) + Math.abs(f.y - p.y) * 2; if (d < bd) { bd = d; t = f; } }
    const pk = G.pickups.find((k) => k.landed && (k.kind !== 'pint' || k.settle >= 1));
    if (pk && p.hp < 70) { out.mx = clamp((pk.x - p.x) / 40, -1, 1); out.my = clamp((pk.y - p.y) / 20, -1, 1); return out; }
    if (t) {
      const dx = t.x - p.x, dy = t.y - p.y;
      if (t.state === 'block' && Math.abs(dx) < 120) { out.strike.down = true; if (p.state === 'idle') out.strike.pressed = true; return out; }
      if (Math.abs(dx) > 85 || Math.abs(dy) > 14) { out.mx = clamp(dx / 60, -1, 1); out.my = clamp(dy / 26, -1, 1); }
      else if (Math.random() < 0.55) out.strike.pressed = true;
      if (t.down && Math.random() < 0.02 && Math.abs(dx) > 120) out.crowd.pressed = true;
    }
    return out;
  },
};

/* ============================================================ GAME */
const Game = {
  resetFight() {
    G.fighters = []; G.projectiles = []; G.pickups = []; G.particles = []; G.popups = []; G.banners = []; G.hazards = []; G.dogs = [];
    G.craic = 0; G.craicIdle = 0; G.craicHist = []; G.crowdPulse = 0; G.score = 0; G.combo = 0; G.comboT = 9;
    G.hitstop = 0; G.slowT = 0; G.slowScale = 1; G.shake = 0; G.flash = 0; G.dim = 0; G.zoomT = 0;
    G.cam.zoom = 1; G.cam.tz = 1; G.cam.focus = null;
    G.stats = { hits: 0, maxCombo: 0, parries: 0, oles: 0, pints: 0, taunts: 0, specials: 0, kos: 0, blocks: 0, dodges: 0, heavies: 0, dmgTaken: 0, moved: 0, time: 0 };
    G.obs = { block: 0.3, dodge: 0.3, aggro: 0.3 };
    G.tokens.clear(); G.maxTokens = DIFF().tokens; G.parryWin = DIFF().parry;
    G.giftT = 9; G.matT = 3; G.trolleyT = rand(6, 9); G.hatchT = rand(8, 12);
    G.spawnQueue = []; G.waveClearT = 0; G.waveIdx = -1; G.waveNum = 0; G.shhDone = {};
    G.lastTaunt = -99; G.lastKO = -99; G.lastBoring = -99;
    G.hint = null; G.hintQueue = []; G.ended = false; G.crowdVerdict = false; G.verdictDone = false; G.blockStreak = 0; G.tigrisGift = false; G.giftAt = 0;
    for (const d of DOORS) d.open = 0;
    G.hatches = HATCHES.map((h) => ({ x: h.x, y: h.y, state: 'closed', t: 0, lid: 0, dog: null }));
    const p = new Fighter('mossie', 0, 330, 560); p.face = 1;
    G.player = p; G.fighters.push(p);
    G.cam.x = 650;
    G.paused = false;
  },
  startBout(idx) {
    const b = BOUTS[idx];
    G.mode = 'story'; G.bout = b; G.boutIdx = idx;
    this.resetFight();
    G.theme = b.theme; G.host = b.host; G.hostMood = 'polish'; G.hostMoodT = 0;
    G.waves = b.waves; G.timeLeft = b.time;
    const p = G.player;
    if (b.helmet) Object.assign(p.look, { hat: 'helmet', hatColor: '#2a2a2a', cage: true });
    if (b.spiked) { p.hp = Math.round(p.maxHp * 0.62); p.hpShown = p.hp; p.spiked = 9; }
    if (b.id === 'commodus' && Store.data.story.spared === true) G.tigrisGift = true;
    Music.play(b.music);
    this.intro('BOUT ' + b.num, b.title);
  },
  startLockIn() {
    G.mode = 'lockin'; G.bout = null; G.boutIdx = -1;
    this.resetFight();
    G.theme = 'lockin'; G.host = 'proximo'; G.hostMood = 'polish'; G.waves = null; G.timeLeft = null;
    Music.play('reel');
    this.intro('THE LOCK-IN', 'The doors are locked. The Guards are not invited.');
  },
  intro(title, sub) {
    G.phase = 'intro'; G.phaseT = 0;
    banner(title, sub, '#f3e6c4', 42, 1.7, 0.36);
    Input.setEnabled(true);
    G.player.set('special'); G.player.specialFired = true; G.player.inv = 1.4;
    popup(G.player, 'WE WHO ARE ABOUT TO GET BARRED SALUTE YOU!', '#d9c48a', 13);
    if (!Store.data.seen.move) showHint('move');
    if (G.bout && G.bout.id === 'zucchabar') showHint('craic');
  },
  spawnBouncers() { this.spawn('bouncer', 0); this.spawn('bouncer', 2); },
  spawn(kind, door) {
    const d = DOORS[door];
    const f = new Fighter(kind, 1, d.x, d.y);
    f.set('enter'); f.enterTo = { x: d.tx + rand(-24, 24), y: d.ty + rand(-16, 16) }; f.inv = 99;
    f.face = f.enterTo.x > f.x ? 1 : -1;
    if (G.mode === 'lockin') {
      const n = G.waveNum;
      const k = f.A.boss ? Math.min(1, 0.55 + 0.03 * n) : Math.min(1.8, 1 + 0.045 * (n - 1));
      f.maxHp = Math.round(f.maxHp * k); f.hp = f.maxHp; f.hpShown = f.hp;
    }
    d.open = 1.3; Sound.sfx.door();
    G.fighters.push(f);
    return f;
  },
  queueWave(list) {
    list.forEach((kind, i) => {
      let door;
      if (kind === 'commodus') door = 0; else if (kind === 'tigris') door = 2;
      else door = (i + Math.max(0, G.waveIdx) + G.waveNum) % 4;
      G.spawnQueue.push({ kind, door, t: 0.35 + i * 0.75 });
    });
  },
  genWave(n) {
    if (n % 10 === 0) return ['commodus', 'stag'];
    if (n % 5 === 0) return ['tigris', 'stag'];
    const unlock = { stag: 1, rugby: 2, hustler: 2, darts: 2, farmer: 3, bouncer: 3 };
    const pool = LOCKIN_POOL.filter(([k]) => n >= unlock[k]);
    let budget = 2 + n * 1.25; const list = [];
    while (budget >= 1 && list.length < 3 + Math.floor(n / 3)) { const opts = pool.filter(([, c]) => c <= budget); if (!opts.length) break; const [k, c] = pick(opts); list.push(k); budget -= c; }
    return list;
  },
  nextWave() {
    if (G.mode === 'lockin') {
      const n = G.waveNum + 1;
      if (n % 5 === 4 && !G.shhDone[n]) { G.shhDone[n] = true; this.startShh(); return; }
      G.waveNum = n;
      if (n > 1) G.player.healQ += 12;
      this.queueWave(this.genWave(n));
      banner('ROUND ' + roman(n), ROUND_LINES[(n - 1) % ROUND_LINES.length], '#f3e6c4', 36, 1.5, 0.34);
    } else {
      G.waveIdx++;
      if (G.waveIdx >= G.waves.length) { this.cleared(); return; }
      this.queueWave(G.waves[G.waveIdx]);
      const lastW = G.waveIdx === G.waves.length - 1 && G.waves.length > 1;
      banner('ROUND ' + roman(G.waveIdx + 1), lastW ? 'Last round, lads' : ROUND_LINES[G.waveIdx % ROUND_LINES.length], '#f3e6c4', 36, 1.5, 0.34);
      if (G.bout.tutorial && G.waveIdx === 2) { G.craic = 89; addCraic(6, null); popup(G.player, 'THE LADS ARE READY, MOSSIE. GIVE THE SIGNAL.', '#ffe08a', 14); }
      if (G.waveIdx === 0 && G.tigrisGift) G.giftAt = G.time + 1.6;
    }
    Sound.sfx.bell(2);
  },
  startShh() {
    G.phase = 'shh'; G.phaseT = 0;
    banner('SHHH! THE GUARDS!', 'Everybody freeze...', '#9fc3ff', 38, 2.6, 0.38);
    Sound.sfx.shh(); Music.stop();
    for (const f of G.fighters) if (!f.down && f.state !== 'enter') { f.set('shh'); f.vx = 0; f.vy = 0; }
    G.hostMood = 'shh'; G.hostMoodT = 3.4;
  },
  cleared() {
    G.phase = 'won'; G.phaseT = 0;
    const p = G.player; p.set('victory'); p.inv = 99;
    const tigris = G.bout && G.bout.verdict;
    banner(tigris ? 'BAR HIM!' : 'SLÁINTE VICTOR!', tigris ? 'The Landlord gives the thumbs down...' : G.crowdVerdict ? 'The crowd has spoken' : null, tigris ? '#e2433a' : '#ffe08a', 44, 2.6, 0.36);
    Music.stinger('win'); Sound.sfx.cheer(1.6); Sound.sfx.chant('kerry');
    G.hostMood = tigris ? 'down' : G.host === 'commodus' ? 'angry' : 'cheer'; G.hostMoodT = 99;
    if (G.mode === 'story') { const b = Store.data.best.bouts[G.bout.id]; const r = this.results(); if (!b || r.total > b.score) Store.data.best.bouts[G.bout.id] = { score: r.total, grade: r.grade }; Store.save(); }
  },
  timeUp() {
    G.phase = 'timeout'; G.phaseT = 0;
    banner('TIME, GENTLEMEN, PLEASE!', 'The crowd will decide...', '#f3e6c4', 34, 2.2, 0.36);
    Sound.sfx.bell(3); Voice.say('Time, gentlemen, please.', 2);
    for (const f of G.fighters) if (f.team === 1 && !f.down && f.state !== 'enter') { f.set('idle'); f.vx = 0; f.vy = 0; if (f.ai) f.ai.release(); }
  },
  results() {
    const s = G.stats, p = G.player;
    const won = G.phase === 'won';
    const timeBonus = won && G.timeLeft != null ? Math.max(0, Math.floor(G.timeLeft)) * 20 : 0;
    const hpBonus = won ? Math.round(p.hp * 10) : 0, craicBonus = won ? Math.round(G.craic * 12) : 0;
    const total = Math.floor(G.score + timeBonus + hpBonus + craicBonus);
    let par = 2500;
    if (G.waves) for (const w of G.waves) for (const k of w) par += (ARCH[k].score || 100) * 1.3 + ARCH[k].hp * 16;
    else par = 1500 + G.waveNum * 1200;
    const ratio = total / par;
    const g = GRADES.find((x) => ratio >= x[0]) || GRADES[GRADES.length - 1];
    return { won, crowdVerdict: G.crowdVerdict, total, timeBonus, hpBonus, craicBonus, grade: g[1], gradeName: g[2], stats: s, craic: G.craic, mode: G.mode, wave: G.waveNum, bout: G.bout, time: s.time };
  },

  update(dt) {
    if (G.paused) return;
    G.time += dt;
    if (G.phase === 'idle') { updateFX(dt); return; }
    if (G.hitstop > 0) { G.hitstop -= dt; updateFX(dt * 0.2); return; }
    let wdt = dt;
    if (G.slowT > 0) { G.slowT -= dt; wdt = dt * G.slowScale; if (G.slowT <= 0) G.slowScale = 1; }
    G.phaseT += dt;
    const inp = G.autopilot ? Bot.input() : Input.poll();
    if (inp.pause.pressed && (G.phase === 'fight' || G.phase === 'intro')) { Flow.pause(); return; }
    const p = G.player;
    switch (G.phase) {
      case 'intro':
        if (G.phaseT > 1.25) { if (p.state === 'special') p.set('idle'); G.phase = 'fight'; G.phaseT = 0; this.nextWave(); }
        this.simulate(wdt, NULL_INPUT, false);
        break;
      case 'fight':
        if (G.timeLeft != null) { G.timeLeft -= wdt; if (G.timeLeft < 20 && G.timeLeft + wdt >= 20) { banner('LAST ORDERS!', null, '#ffb03a', 34, 1.4, 0.3); Sound.sfx.bell(2); Voice.say('Last orders!', 1); } if (G.timeLeft <= 0) { G.timeLeft = 0; this.timeUp(); break; } }
        G.stats.time += wdt;
        this.simulate(wdt, inp, true);
        break;
      case 'shh':
        G.dim = Math.min(0.62, G.phaseT * 1.6);
        this.simulate(wdt, NULL_INPUT, false);
        if (G.phaseT > 3.3) {
          G.phase = 'fight'; G.phaseT = 0; G.dim = 0;
          for (const f of G.fighters) if (f.state === 'shh') f.set('idle');
          banner("...THEY'RE GONE", 'As you were, lads.', '#f3e6c4', 30, 1.4, 0.36);
          Music.play('reel'); addCraic(10, 'shh'); this.nextWave();
        }
        break;
      case 'timeout':
        this.simulate(wdt, NULL_INPUT, false);
        if (G.phaseT > 2.4 && !G.verdictDone) {
          G.verdictDone = true;
          const win = G.craic >= 45;
          G.crowdVerdict = true;
          if (win) { banner('THUMBS UP!', 'The crowd loved you. Win the crowd, win the bout.', '#ffe08a', 40, 2.4, 0.36); G.hostMood = 'up'; this.cleared(); }
          else { banner('THUMBS DOWN', "The crowd wasn't entertained.", '#e2433a', 40, 2.4, 0.36); G.hostMood = 'down'; G.phase = 'dead'; G.phaseT = 0; Music.stinger('lose'); Sound.sfx.boo(); }
        }
        break;
      case 'won': case 'dead':
        this.simulate(wdt, NULL_INPUT, false);
        if (G.phaseT > (G.phase === 'won' ? 2.8 : 2.6) && !G.ended) {
          G.ended = true;
          const r = this.results();
          if (G.mode === 'lockin' && G.phase === 'dead') { if (r.total > Store.data.best.lockin) Store.data.best.lockin = r.total; if (G.waveNum > Store.data.best.lockinWave) Store.data.best.lockinWave = G.waveNum; Store.save(); }
          if (G.phase === 'won') Flow.onWin(r); else Flow.onLose(r);
        }
        break;
      default: break;
    }
  },

  simulate(dt, inp, active) {
    const p = G.player;
    if (active) {
      let alive = 0; for (const f of G.fighters) if (f.team === 1 && f.state !== 'ko') alive++;
      for (const q of G.spawnQueue) q.t -= dt;
      while (G.spawnQueue.length && G.spawnQueue[0].t <= 0 && alive < 5) { const q = G.spawnQueue.shift(); this.spawn(q.kind, q.door); alive++; }
    }
    if (p) {
      const control = (active || G.phase === 'intro') && !p.down && ['idle', 'attack', 'charge', 'block', 'dodge', 'taunt', 'special'].indexOf(p.state) >= 0;
      if (control) updatePlayer(p, inp, dt);
    }
    G.rangedBusy = 0;
    for (const f of G.fighters) if (f.team === 1 && f.state === 'attack' && f.move && f.move.proj) G.rangedBusy++;
    for (const f of G.fighters) {
      if (!f.ai) continue;
      if (active) f.ai.update(dt);
      else if (f.state === 'attack') { stepAttack(f, dt); if (f.st > f.mt.s + f.mt.a + f.mt.r) f.set('idle'); }
      else if (f.state === 'idle' || f.state === 'block') { f.vx = damp(f.vx, 0, 6, dt); f.vy = damp(f.vy, 0, 6, dt); }
    }
    for (const f of G.fighters) physics(f, dt);
    separate();
    G.fighters = G.fighters.filter((f) => !f.remove);
    if (active) {
      updateHazards(dt); updateCrowd(dt);
      G.comboT += dt;
      if (G.spawnQueue.length === 0 && G.enemiesLeft() === 0) { G.waveClearT += dt; if (G.waveClearT > (G.mode === 'lockin' ? 1.6 : 1.25)) { G.waveClearT = 0; this.nextWave(); } }
      else G.waveClearT = 0;
      if (G.tigrisGift && G.giftAt && G.time > G.giftAt) { G.tigrisGift = false; throwGift('pint', { x: clamp(p.x + 160, WORLD.minX + 40, WORLD.maxX - 40), y: p.y }); popup(p, 'TIGRIS THROWS YOU A PINT!', '#ffe08a', 16); }
      if (G.stats.hits === 0 && !Store.data.seen.strike) for (const f of G.fighters) if (f.team === 1 && f.state !== 'enter' && Math.abs(f.x - p.x) < 260) { showHint('strike'); break; }
    } else if (G.phase !== 'idle') { G.crowdPulse = Math.max(G.crowdPulse, G.phase === 'won' ? 0.8 : 0); Sound.crowdLevel(G.craic / 90); }
    updateProjectiles(dt); updatePickups(dt); updateDogs(dt); updateHatches(dt); updateFX(dt); updateHint(dt);
    if (G.zoomT > 0) { G.zoomT -= dt; if (G.zoomT <= 0) G.cam.focus = null; }
    this.camera(dt);
  },

  camera(dt) {
    const p = G.player; let tx = p ? p.x : 650;
    let sx = p ? p.x * 2 : 0, n = p ? 2 : 0;
    for (const f of G.fighters) if (f.team === 1 && f.state !== 'ko' && f.state !== 'enter' && Math.abs(f.x - tx) < 700) { sx += f.x; n++; }
    if (n) tx = sx / n;
    if (G.cam.focus && G.zoomT > 0) tx = lerp(tx, G.cam.focus.x, 0.6);
    G.cam.tz = G.zoomT > 0 ? 1.22 : 1;
    G.cam.zoom = damp(G.cam.zoom, G.cam.tz, 5, dt);
    const half = G.viewW / 2 / G.cam.zoom;
    if (p && G.phase !== 'idle') tx += half * 0.12;  // keep Mossie a little left of centre, away from the right-thumb buttons
    const lo = Math.max(WORLD.sceneL + half, Math.min(650, -150 + half)), hi = Math.min(WORLD.sceneR - half, Math.max(650, 1470 - half));
    tx = lo <= hi ? clamp(tx, lo, hi) : 650;
    G.cam.x = damp(G.cam.x, tx, 4.5, dt);
  },

  render(c, W, H, dpr, sf) {
    const t = G.time;
    const S = H / WORLD.viewH, z = G.cam.zoom, k = S * z;
    G.viewW = W / S;
    const vw = W / k, vh = H / k;
    let top = WORLD.H - vh;
    if (z > 1.001) top = lerp(top, 470 - vh / 2, clamp((z - 1) / 0.22, 0, 1));
    top = Math.min(top, WORLD.H - vh);
    const left = G.cam.x - vw / 2;
    const sx = G.shake ? rand(-1, 1) * G.shake : 0, sy = G.shake ? rand(-1, 1) * G.shake : 0;
    Object.assign(G.cam, { left, top, k, sl: sf.l, sr: sf.r });
    Art.ensureBg(G.theme, S * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#0b0604'; c.fillRect(0, 0, W, H);
    c.setTransform(k * dpr, 0, 0, k * dpr, (-left * k + sx) * dpr, (-top * k + sy) * dpr);
    c.drawImage(Art.bg, WORLD.sceneL, 0, WORLD.sceneR - WORLD.sceneL, WORLD.H);
    Art.drawBack(c, G, t);
    for (const h of G.hatches) Art.drawHatch(c, h, t);
    Art.drawFloorWarn(c, G, t);
    for (const f of G.fighters) Art.drawShadow(c, f.x, f.y, f.z, f.scale * depthScale(f.y));
    for (const pk of G.pickups) Art.drawShadow(c, pk.flying ? pk.tx : pk.x, pk.flying ? pk.ty : pk.y, pk.z, 0.5);
    for (const d of G.dogs) Art.drawShadow(c, d.x, d.y, d.z || 0, 0.6);
    for (const pr of G.projectiles) if (!(pr.delay > 0)) Art.drawShadow(c, pr.x, pr.y, pr.z, 0.3);
    const list = [];
    for (const f of G.fighters) list.push([f.y + (f.state === 'down' || f.state === 'ko' ? -6 : 0), 0, f]);
    for (const pk of G.pickups) list.push([pk.y, 1, pk]);
    for (const d of G.dogs) list.push([d.y + 1, 2, d]);
    for (const h of G.hazards) if (h.state === 'go') list.push([h.y + 2, 3, h]);
    for (const pr of G.projectiles) if (!(pr.delay > 0)) list.push([pr.y + 3, 4, pr]);
    list.sort((a, b) => a[0] - b[0]);
    for (const it of list) {
      const o = it[2];
      switch (it[1]) {
        case 0: Art.drawFighter(c, o, t); break;
        case 1: Art.drawPickup(c, o, t); break;
        case 2: Art.drawDog(c, o, t); break;
        case 3: Art.drawTrolley(c, o, t); break;
        case 4: Art.drawProjectile(c, o, t); break;
        default: break;
      }
    }
    for (const f of G.fighters) Art.drawTelegraph(c, f, t);
    for (const f of G.fighters) {
      if (f.team !== 1 || f.hpShow <= 0 || f.A.boss || f.state === 'ko' || !f.pts) continue;
      const bx = f.x - 24, by = f.pts.headY - 36 * f.scale, a = clamp(f.hpShow / 0.4, 0, 1);
      c.globalAlpha = a; c.fillStyle = OUTLINE; c.fillRect(bx - 2, by - 2, 52, 9); c.fillStyle = '#3a1410'; c.fillRect(bx, by, 48, 5);
      c.fillStyle = '#e2433a'; c.fillRect(bx, by, 48 * clamp(f.hp / f.maxHp, 0, 1), 5); c.globalAlpha = 1;
    }
    Art.drawParticles(c, G.particles);
    Art.drawPopups(c, G.popups);
    Art.drawFront(c, G, t, G.cam.x);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    Art.drawScreenFX(c, G, W, H);
    if (G.player && G.phase !== 'idle') {
      Art.drawOffscreen(c, G, G.cam, W, H);
      Art.drawHUD(c, G, W, H, sf);
      if (Input.enabled && (G.phase === 'fight' || G.phase === 'intro')) Art.drawControls(c, G, W, H);
      Art.drawHint(c, G, W, H, sf);
    }
    Art.drawBanners(c, G, W, H);
  },
};
