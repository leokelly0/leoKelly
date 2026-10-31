'use strict';
/* =====================================================================
   STOUT & HONOUR — art.js
   Everything on screen is drawn here with canvas paths: the pub, the
   rigged cartoon fighters, the crowd, the effects, the HUD and the
   on-screen controls. World units: the arena floor is 1300 wide and
   the scene is 720 tall; the camera shows the bottom ~590 of it.
   ===================================================================== */

const FONT_D = "'Cinzel', 'Copperplate', 'Copperplate Gothic Bold', 'Trajan Pro', Georgia, serif";
const FONT_B = "'Alegreya Sans', 'Avenir Next', 'Segoe UI', system-ui, sans-serif";
const FONT_I = "'Uncial Antiqua', 'Cinzel', Georgia, serif";
const FONT_C = "'Chalkduster', 'Chalkboard SE', 'Bradley Hand', 'Comic Sans MS', cursive";

const WORLD = { W: 1300, H: 720, minX: 60, maxX: 1240, minY: 434, maxY: 652, sceneL: -440, sceneR: 1740, viewH: 590, wallY: 400, counterY: 262 };
const OUTLINE = '#1a0e07';
const DOORS = [
  { name: 'fir', x: 1127, y: 404, tx: 1120, ty: 470, open: 0 },
  { name: 'mna', x: 1224, y: 404, tx: 1200, ty: 488, open: 0 },
  { name: 'front', x: 1490, y: 470, tx: 1205, ty: 560, open: 0 },
  { name: 'snug', x: -180, y: 520, tx: 95, ty: 540, open: 0 },
];
const HATCHES = [{ x: 360, y: 566 }, { x: 948, y: 600 }, { x: 650, y: 478 }];
const LAMPS = [-330, 205, 418, 882, 1115, 1490];

const THEMES = {
  colosseum: { ceil: '#2a170d', beam: '#3e2414', beamDk: '#22120a', wall: '#1d3b2e', wallStripe: 'rgba(255,240,200,0.035)', brass: '#c9a046', wood: '#4b2715', woodHi: '#6e3c1f', woodDk: '#2b150b', floorA: '#3f2716', floorB: '#6a4428', door: '#5a2e16', mirror: 'THE COLOSSEVM', mirrorSub: 'BAR & LOUNGE  ·  EST. A.D. 180', chalk: ['TONIGHT:', 'GLADIATORS', 'FRI  trad session', 'SAT  table quiz', 'toasted special 4.50', 'NO SINGING'], light: 1, poster: ['TRAD', 'SESSION', 'FRIDAYS'], curtains: false },
  zucchabar: { ceil: '#21140c', beam: '#3a2616', beamDk: '#1d1209', wall: '#4d2219', wallStripe: 'rgba(0,0,0,0.13)', brass: '#a88a46', wood: '#553419', woodHi: '#73482a', woodDk: '#2e1a0c', floorA: '#38281a', floorB: '#5a4026', door: '#4a3a2a', mirror: "PROXIMO'S", mirrorSub: 'LOUNGE  ·  BOOKIES  ·  BACK ROOM', chalk: ['BACK ROOM', 'TONIGHT', 'NO CREDIT', 'NO DOGS', '(except Tiger)', 'WIN THE CROWD'], light: 0.86, poster: ['THE', 'RACES', 'LIVE'], curtains: false },
  lockin: { ceil: '#120c08', beam: '#2a190e', beamDk: '#160d07', wall: '#15282b', wallStripe: 'rgba(255,240,200,0.025)', brass: '#a8863e', wood: '#3e2012', woodHi: '#5e3219', woodDk: '#241108', floorA: '#2c1d12', floorB: '#4a301c', door: '#4a2612', mirror: 'THE COLOSSEVM', mirrorSub: 'AFTER HOURS  ·  STRICTLY NO GUARDS', chalk: ['LOCK-IN', 'WE ARE CLOSED', '(we are not)', 'SHHH...', 'if the Guards ask:', "it's a christening"], light: 0.62, poster: ['LOCK-IN', 'RULES:', 'SHHH'], curtains: true },
};

/* ------------------------------------------------------------ helpers */
const shadeCache = new Map();
function shade(hex, k) {
  const key = hex + '|' + k;
  let v = shadeCache.get(key);
  if (v) return v;
  if (typeof hex !== 'string' || hex[0] !== '#') return hex;
  const n = hex.length === 4 ? hex.slice(1).split('').map((ch) => ch + ch).join('') : hex.slice(1, 7);
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
  const f = (x) => clamp(Math.round(k >= 1 ? x + (255 - x) * (k - 1) : x * k), 0, 255);
  v = 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  shadeCache.set(key, v);
  return v;
}
function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function circle(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); }
function ell(c, x, y, rx, ry, rot) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); }
function seg(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
function txt(c, s, x, y, fill, stroke, lw) {
  c.lineJoin = 'round'; c.miterLimit = 2;
  if (stroke && lw) { c.strokeStyle = stroke; c.lineWidth = lw; c.strokeText(s, x, y); }
  c.fillStyle = fill; c.fillText(s, x, y);
}
function star(c, x, y, r1, r2, n, rot) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r2 : r1, a = rot + (i * Math.PI) / n; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath();
}
const depthScale = (y) => lerp(0.9, 1.04, clamp((y - WORLD.minY) / (WORLD.maxY - WORLD.minY), 0, 1.2));

/* =============================================================== BODY RIG
   Ground frame: origin between the feet, facing +x, y down.
   Angles: 0 points down, PI/2 points forward, PI points up.          */
const BODY = { thigh: 34, shin: 33, tor: 52, neck: 6, hr: 17, ua: 26, fa: 24 };
BODY.leg = BODY.thigh + BODY.shin;

function ik(hx, hy, fx, fy, l1, l2) {
  let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy);
  const max = l1 + l2 - 0.5;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  if (d < 1) d = 1;
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const ang = Math.atan2(dy, dx) - a;
  return { kx: hx + Math.cos(ang) * l1, ky: hy + Math.sin(ang) * l1, fx: hx + dx, fy: hy + dy };
}

function basePose() {
  return { hipX: 0, hipY: 4, lean: 0.08, head: 0, aF: [0.9, 0.9], aB: [0.35, 1.1], fF: [12, 0], fB: [-12, 0], wa: 2.3, waB: 2.2, rot: 0, dy: 0, shield: 0, face: 'n', thumb: 0, hold: null };
}
function mixPose(P, Q, t) {
  if (t <= 0) return P;
  const R = Object.assign({}, P);
  for (const k in Q) {
    const q = Q[k], p = P[k];
    if (Array.isArray(q)) R[k] = [lerp(p ? p[0] : q[0], q[0], t), lerp(p ? p[1] : q[1], q[1], t)];
    else if (typeof q === 'number') R[k] = lerp(typeof p === 'number' ? p : q, q, t);
    else if (t >= 0.5) R[k] = q;
  }
  return R;
}

function drawLimb2(c, x0, y0, x1, y1, x2, y2, w1, w2, col1, col2) {
  c.lineCap = 'round'; c.strokeStyle = OUTLINE;
  c.lineWidth = w1 + 5; seg(c, x0, y0, x1, y1);
  c.lineWidth = w2 + 5; seg(c, x1, y1, x2, y2);
  c.strokeStyle = col1; c.lineWidth = w1; seg(c, x0, y0, x1, y1);
  c.strokeStyle = col2; c.lineWidth = w2; seg(c, x1, y1, x2, y2);
}
function partial(c, x0, y0, x1, y1, t0, t1, w, col) {
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'butt';
  seg(c, lerp(x0, x1, t0), lerp(y0, y1, t0), lerp(x0, x1, t1), lerp(y0, y1, t1));
  c.lineCap = 'round';
}

function drawWeapon(c, kind, hx, hy, wa, C, glow) {
  const dx = Math.sin(wa), dy = Math.cos(wa), th = Math.atan2(dy, dx);
  c.lineCap = 'round';
  if (kind === 'hurley' || kind === 'hurley2') {
    const gx = hx - dx * 12, gy = hy - dy * 12, ex = hx + dx * 50, ey = hy + dy * 50;
    c.strokeStyle = OUTLINE; c.lineWidth = 10; seg(c, gx, gy, ex, ey);
    c.save(); c.translate(hx + dx * 57, hy + dy * 57); c.rotate(th);
    c.fillStyle = OUTLINE; ell(c, 0, 2.5, 18, 10.5); c.fill();
    c.fillStyle = C('#e4c38c'); ell(c, 0, 2.5, 15, 8); c.fill();
    c.fillStyle = C('#cfa66a'); ell(c, 2, 4.5, 10, 4.5); c.fill();
    c.strokeStyle = '#5a5a5a'; c.lineWidth = 2; seg(c, -6, -3.5, -6, 8.5);
    c.restore();
    c.strokeStyle = C('#e4c38c'); c.lineWidth = 5.5; seg(c, gx, gy, ex, ey);
    c.strokeStyle = C('#3a3a3a'); c.lineWidth = 6.2; seg(c, gx, gy, hx + dx * 6, hy + dy * 6);
    if (glow) { c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = glow; c.lineWidth = 14; c.globalAlpha = 0.45; seg(c, hx, hy, hx + dx * 66, hy + dy * 66); c.restore(); }
  } else if (kind === 'shillelagh') {
    const gx = hx - dx * 8, gy = hy - dy * 8, ex = hx + dx * 56, ey = hy + dy * 56;
    c.strokeStyle = OUTLINE; c.lineWidth = 10.5; seg(c, gx, gy, ex, ey);
    c.fillStyle = OUTLINE; circle(c, ex, ey, 10); c.fill();
    c.strokeStyle = C('#4a2c18'); c.lineWidth = 6; seg(c, gx, gy, ex, ey);
    c.fillStyle = C('#5a361e'); circle(c, ex, ey, 7.5); c.fill();
    c.fillStyle = C('#d8b25a'); circle(c, ex - dx * 2, ey - dy * 2 - 1, 2.4); c.fill();
    for (const k of [18, 32, 44]) { c.fillStyle = C('#3a2414'); circle(c, hx + dx * k - dy * 3, hy + dy * k + dx * 3, 2.6); c.fill(); }
  } else if (kind === 'cue') {
    const bx = hx - dx * 40, by = hy - dy * 40, tx = hx + dx * 90, ty = hy + dy * 90;
    c.strokeStyle = OUTLINE; c.lineWidth = 8; seg(c, bx, by, tx, ty);
    c.strokeStyle = C('#e8d3a0'); c.lineWidth = 3.6; seg(c, hx, hy, tx, ty);
    c.strokeStyle = C('#3a2414'); c.lineWidth = 5.4; seg(c, bx, by, hx + dx * 4, hy + dy * 4);
    c.strokeStyle = C('#3a7bd5'); c.lineWidth = 3.8; seg(c, tx - dx * 3, ty - dy * 3, tx, ty);
  }
}

function drawBodhran(c, x, y, rx, ry, rot, C) {
  c.save(); c.translate(x, y); c.rotate(rot || 0);
  c.fillStyle = OUTLINE; ell(c, 0, 0, rx + 2.6, ry + 2.6); c.fill();
  c.fillStyle = C('#8a5a2a'); ell(c, 0, 0, rx, ry); c.fill();
  c.fillStyle = C('#efdfb8'); ell(c, 0, 0, rx - 3, ry - 3); c.fill();
  c.strokeStyle = C('#7a3a1a'); c.lineWidth = 1.6;
  const s = Math.min(rx, ry) * 0.42;
  for (let i = 0; i < 3; i++) {
    const a = (i * TAU) / 3 - Math.PI / 2;
    c.beginPath(); c.arc(Math.cos(a) * s * 0.55 * (rx / ry), Math.sin(a) * s * 0.55, s * 0.5, a + 0.6, a + 3.6); c.stroke();
  }
  c.restore();
}

function drawPint(c, x, y, sc, settle, C) { // base at (x, y)
  C = C || ((h) => h);
  const s = sc || 1, w0 = 7 * s, w1 = 9.5 * s, h = 30 * s;
  c.fillStyle = OUTLINE;
  c.beginPath(); c.moveTo(x - w0 - 2, y + 1); c.lineTo(x + w0 + 2, y + 1); c.lineTo(x + w1 + 2, y - h - 2); c.lineTo(x - w1 - 2, y - h - 2); c.closePath(); c.fill();
  const st = settle == null ? 1 : settle;
  const head = (4 + 3 * st) * s;
  c.fillStyle = st < 1 ? C('#5a3a22') : C('#170c07');
  c.beginPath(); c.moveTo(x - w0, y); c.lineTo(x + w0, y); c.lineTo(x + w1 - 0.4, y - h + head); c.lineTo(x - w1 + 0.4, y - h + head); c.closePath(); c.fill();
  if (st < 1) { c.fillStyle = 'rgba(23,12,7,' + (0.25 + st * 0.75) + ')'; c.fillRect(x - w1, y - h * st * 0.9, w1 * 2, h * st * 0.9); }
  c.fillStyle = C('#f2e6c4');
  c.beginPath(); c.moveTo(x - w1 + 0.4, y - h + head); c.lineTo(x + w1 - 0.4, y - h + head); c.lineTo(x + w1, y - h); c.lineTo(x - w1, y - h); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillRect(x - w0 + 1.5 * s, y - h + head + 2, 2 * s, h - head - 5);
}

/* the big one: draw a whole person from a look (L) and a pose (P) */
function drawBody(c, L, P, o) {
  o = o || {};
  const fl = o.flash;
  const C = fl ? () => '#fff3e0' : (h) => h;
  const D = fl ? () => '#f2e2c8' : (h) => shade(h, 0.8);
  const b = L.build || 1, B = BODY;
  const hipX = P.hipX || 0, hipY = -B.leg + (P.hipY || 0), lean = P.lean || 0;
  const ax = Math.sin(lean), ay = -Math.cos(lean), nx = Math.cos(lean), ny = Math.sin(lean);
  const neckX = hipX + ax * B.tor, neckY = hipY + ay * B.tor;
  const ha = lean + (P.head || 0);
  const hcx = neckX + Math.sin(ha) * (B.neck + B.hr - 2), hcy = neckY - Math.cos(ha) * (B.neck + B.hr - 2);
  const legF = ik(hipX + 4, hipY, P.fF[0], -P.fF[1], B.thigh, B.shin);
  const legB = ik(hipX - 4, hipY, P.fB[0], -P.fB[1], B.thigh, B.shin);
  const shFx = neckX + nx * 3 - ax * 7, shFy = neckY + ny * 3 - ay * 7;
  const shBx = neckX - nx * 4 - ax * 7, shBy = neckY - ny * 4 - ay * 7;
  const arm = (sx, sy, a) => { const ex = sx + Math.sin(a[0]) * B.ua, ey = sy + Math.cos(a[0]) * B.ua; const hx = ex + Math.sin(a[0] + a[1]) * B.fa, hy = ey + Math.cos(a[0] + a[1]) * B.fa; return { ex, ey, hx, hy }; };
  const aF = arm(shFx, shFy, P.aF), aBk = arm(shBx, shBy, P.aB);
  const fist = L.weapon === 'fists' || L.weapon === 'darts' || L.weapon === 'turf' || !L.weapon;
  const handR = (fist ? 7 : 6) * Math.min(1.25, b);
  const sleeveCol = L.jacket || L.shirt;
  const longS = L.sleeves === 'long', rolled = L.sleeves === 'rolled';
  const uaW = 11 * b, faW = 9.5 * b, thW = 15 * b, shW = 12 * b;

  function drawArm(A, sx, sy, CC) {
    c.lineCap = 'round'; c.strokeStyle = OUTLINE;
    c.lineWidth = uaW + 5; seg(c, sx, sy, A.ex, A.ey);
    c.lineWidth = faW + 5; seg(c, A.ex, A.ey, A.hx, A.hy);
    c.strokeStyle = CC(L.skin); c.lineWidth = uaW; seg(c, sx, sy, A.ex, A.ey);
    c.lineWidth = faW; seg(c, A.ex, A.ey, A.hx, A.hy);
    if (longS) { partial(c, sx, sy, A.ex, A.ey, 0, 1.06, uaW, CC(sleeveCol)); partial(c, A.ex, A.ey, A.hx, A.hy, -0.05, 0.78, faW, CC(sleeveCol)); }
    else if (rolled) { partial(c, sx, sy, A.ex, A.ey, 0, 1.06, uaW, CC(sleeveCol)); partial(c, A.ex, A.ey, A.hx, A.hy, -0.05, 0.22, faW + 1.5, CC(shade(sleeveCol, 0.92))); }
    else { c.strokeStyle = CC(sleeveCol); c.lineWidth = uaW + 1.5; c.lineCap = 'round'; seg(c, sx, sy, lerp(sx, A.ex, 0.5), lerp(sy, A.ey, 0.5)); if (L.trim && L.pattern === 'hoops') partial(c, sx, sy, A.ex, A.ey, 0.42, 0.55, uaW + 1.6, CC(L.trim)); }
  }
  function drawHand(A, CC, thumb) {
    c.fillStyle = OUTLINE; circle(c, A.hx, A.hy, handR + 2.4); c.fill();
    c.fillStyle = CC(L.skin); circle(c, A.hx, A.hy, handR); c.fill();
    if (thumb) {
      c.fillStyle = OUTLINE; rr(c, A.hx - 3.6, thumb > 0 ? A.hy - 15 : A.hy + 1, 7.2, 14, 3.6); c.fill();
      c.fillStyle = CC(L.skin); rr(c, A.hx - 2, thumb > 0 ? A.hy - 13.4 : A.hy + 2.4, 4, 11, 2); c.fill();
    }
  }
  function drawLeg(G, hx, CC) {
    const pants = L.pants || '#333';
    drawLimb2(c, hx, hipY, G.kx, G.ky, G.fx, G.fy, thW, shW, CC(L.shorts ? L.skin : pants), CC(L.shorts ? L.skin : pants));
    if (L.shorts) partial(c, hx, hipY, G.kx, G.ky, -0.1, 0.55, thW + 3, CC(pants));
    if (L.socks) { partial(c, G.kx, G.ky, G.fx, G.fy, 0.4, 1, shW + 0.6, CC(L.socks)); if (L.sockTrim) partial(c, G.kx, G.ky, G.fx, G.fy, 0.46, 0.56, shW + 0.8, CC(L.sockTrim)); }
    if (L.wellies) partial(c, G.kx, G.ky, G.fx, G.fy, 0.38, 1, shW + 3.5, CC(L.shoes));
    // shoe
    c.fillStyle = OUTLINE; ell(c, G.fx + 6, G.fy - 1, 12.5, 7.2, 0); c.fill();
    c.fillStyle = CC(L.shoes || '#222'); ell(c, G.fx + 6, G.fy - 1, 10, 5); c.fill();
  }

  // ---- back arm (and bodhrán if lowered)
  drawArm(aBk, shBx, shBy, D);
  if (L.weapon === 'hurley2') drawWeapon(c, 'hurley', aBk.hx, aBk.hy, P.waB, D);
  if (L.shield === 'bodhran' && P.shield < 0.5) drawBodhran(c, aBk.hx + 2, aBk.hy - 2, 8.5, 21, -0.1, D);
  if (P.hold === 'pintB') drawPint(c, aBk.hx + 4, aBk.hy + 12, 0.8, 1, D);
  drawHand(aBk, D, 0);

  // ---- legs
  drawLeg(legB, hipX - 4, D);
  drawLeg(legF, hipX + 4, C);

  // ---- torso
  const hw = 11 * b, sw = 14 * b, bel = (L.belly || 0) * 15 + 2;
  const hbx = hipX - nx * hw, hby = hipY - ny * hw, hfx = hipX + nx * hw, hfy = hipY + ny * hw;
  const sfx = neckX + nx * sw, sfy = neckY + ny * sw, sbx = neckX - nx * sw, sby = neckY - ny * sw;
  const mx = (hipX + neckX) / 2, my = (hipY + neckY) / 2;
  const torso = () => {
    c.beginPath(); c.moveTo(hbx, hby); c.lineTo(hfx, hfy);
    c.quadraticCurveTo(mx + nx * (sw + bel), my + ny * (sw + bel), sfx, sfy);
    c.quadraticCurveTo(neckX + ax * 9, neckY + ay * 9, sbx, sby);
    c.quadraticCurveTo(mx - nx * (sw + 2), my - ny * (sw + 2), hbx, hby);
    c.closePath();
  };
  torso();
  c.lineJoin = 'round'; c.strokeStyle = OUTLINE; c.lineWidth = 5; c.stroke();
  const mainCol = L.jacket ? L.jacket : L.waistcoat ? L.waistcoat : L.shirt;
  c.fillStyle = C(mainCol); c.fill();
  c.save(); torso(); c.clip();
  c.translate(hipX, hipY); c.rotate(lean);
  if (L.pattern === 'hoops' && !L.jacket) { c.fillStyle = C(L.trim); for (const y of [-12, -28, -44]) c.fillRect(-40, y - 3.5, 80, 7); }
  else if (L.pattern === 'panel' && !L.jacket) { c.fillStyle = C(L.trim); c.fillRect(-4, -60, 4, 60); c.fillRect(-40, -52, 80, 4); }
  else if (L.pattern === 'text' && !L.jacket) {
    c.save(); if (o.mirror) c.scale(-1, 1);
    c.fillStyle = C('#1a1a1a'); c.font = '800 10px ' + FONT_B; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(L.text || 'STAG', o.mirror ? -3 : 3, -34); c.restore();
  }
  if (L.jacket) { c.fillStyle = C(L.shirt); c.fillRect(hw - 4, -60, 6, 60); c.fillStyle = C(shade(L.jacket, 1.25)); c.fillRect(-hw, -14, 2 * hw, 2.5); }
  if (L.waistcoat) { c.fillStyle = C(L.shirt); c.beginPath(); c.moveTo(hw + 6, -54); c.lineTo(hw - 7, -54); c.lineTo(hw - 1, -30); c.closePath(); c.fill(); c.fillStyle = C('#d8b25a'); for (const y of [-27, -19, -11]) { circle(c, hw - 1.5, y, 1.6); c.fill(); } }
  if (L.apron) { c.fillStyle = C(L.apron); c.fillRect(-2, -30, 40, 40); }
  c.restore();
  if (L.apron) { // apron skirt over the thighs
    c.fillStyle = OUTLINE; c.beginPath(); c.moveTo(hipX - 2, hipY - 14); c.lineTo(hipX + hw + 6, hipY - 14); c.lineTo(hipX + hw + 9, hipY + 30); c.lineTo(hipX - 4, hipY + 30); c.closePath(); c.fill();
    c.fillStyle = C(L.apron); c.beginPath(); c.moveTo(hipX, hipY - 12); c.lineTo(hipX + hw + 4, hipY - 12); c.lineTo(hipX + hw + 7, hipY + 28); c.lineTo(hipX - 2, hipY + 28); c.closePath(); c.fill();
  }
  if (L.shorts) { c.fillStyle = C(L.pants); c.beginPath(); c.moveTo(hbx, hby); c.lineTo(hfx, hfy); c.lineTo(hfx + nx * 1 + ax * 6, hfy + ny + ay * 6); c.lineTo(hbx + ax * 6, hby + ay * 6); c.closePath(); c.fill(); }
  if (L.towel) {
    c.fillStyle = OUTLINE; c.beginPath(); c.moveTo(sbx - 2, sby - 3); c.lineTo(sbx + nx * 9, sby + ny * 9 - 3); c.lineTo(sbx + nx * 9 - ax * 30, sby + ny * 9 - ay * 30); c.lineTo(sbx - 2 - ax * 32, sby - ay * 32); c.closePath(); c.fill();
    c.fillStyle = C('#efe6cf'); c.beginPath(); c.moveTo(sbx, sby - 1); c.lineTo(sbx + nx * 7, sby + ny * 7 - 1); c.lineTo(sbx + nx * 7 - ax * 28, sby + ny * 7 - ay * 28); c.lineTo(sbx - ax * 30, sby - ay * 30); c.closePath(); c.fill();
    c.strokeStyle = C('#2f7a3a'); c.lineWidth = 1.6; seg(c, sbx - ax * 20, sby - ay * 20, sbx + nx * 7 - ax * 19, sby + ny * 7 - ay * 19); seg(c, sbx - ax * 24, sby - ay * 24, sbx + nx * 7 - ax * 23, sby + ny * 7 - ay * 23);
  }
  if (L.collar) { c.fillStyle = OUTLINE; c.beginPath(); c.moveTo(neckX - 6, neckY + 2); c.lineTo(neckX + 9, neckY + 1); c.lineTo(neckX + 4, neckY + 9); c.closePath(); c.fill(); c.fillStyle = C(L.collar); c.beginPath(); c.moveTo(neckX - 4, neckY + 2.5); c.lineTo(neckX + 7, neckY + 2); c.lineTo(neckX + 3.5, neckY + 7.5); c.closePath(); c.fill(); }
  if (L.chain) { c.strokeStyle = C('#e2b23a'); c.lineWidth = 1.8; c.beginPath(); c.arc(neckX + nx * 4, neckY + 6, 7, 0.2, 2.6); c.stroke(); }
  if (L.bowtie) { const bx = neckX + nx * 7, by = neckY + 5; c.fillStyle = OUTLINE; c.fillRect(bx - 5, by - 3.5, 10, 7); c.fillStyle = C(L.bowtie); c.beginPath(); c.moveTo(bx, by); c.lineTo(bx - 4, by - 2.5); c.lineTo(bx - 4, by + 2.5); c.closePath(); c.fill(); c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + 4, by - 2.5); c.lineTo(bx + 4, by + 2.5); c.closePath(); c.fill(); }

  // ---- head
  drawHead(c, L, P, hcx, hcy, ha, C, o);

  // ---- bodhrán raised in front
  if (L.shield === 'bodhran' && P.shield >= 0.5) drawBodhran(c, neckX + nx * 15 + ax * -22, neckY + ny * 15 + ay * -22, 12, 25, lean * 0.6, C);

  // ---- front arm + weapon
  drawArm(aF, shFx, shFy, C);
  const wk = L.weapon;
  if (wk === 'hurley' || wk === 'hurley2' || wk === 'shillelagh' || wk === 'cue') drawWeapon(c, wk === 'hurley2' ? 'hurley' : wk, aF.hx, aF.hy, wk === 'cue' && P.waCue != null ? P.waCue : P.wa, C, o.glow);
  if (P.hold === 'dart') { c.strokeStyle = OUTLINE; c.lineWidth = 3.5; seg(c, aF.hx - 6, aF.hy, aF.hx + 8, aF.hy - 2); c.strokeStyle = C('#d0d0d0'); c.lineWidth = 1.6; seg(c, aF.hx - 6, aF.hy, aF.hx + 8, aF.hy - 2); c.fillStyle = C('#e23b3b'); c.beginPath(); c.moveTo(aF.hx - 6, aF.hy); c.lineTo(aF.hx - 11, aF.hy - 4); c.lineTo(aF.hx - 11, aF.hy + 4); c.closePath(); c.fill(); }
  if (P.hold === 'turf') { c.save(); c.translate(aF.hx, aF.hy - 4); c.rotate(0.3); c.fillStyle = OUTLINE; c.fillRect(-9, -7, 18, 14); c.fillStyle = C('#4a2e18'); c.fillRect(-7, -5, 14, 10); c.restore(); }
  if (P.hold === 'crisps') { c.fillStyle = OUTLINE; c.fillRect(aF.hx - 7, aF.hy - 12, 14, 16); c.fillStyle = C('#e8c23a'); c.fillRect(aF.hx - 5, aF.hy - 10, 10, 12); }
  if (P.hold === 'glass') drawPint(c, aF.hx + 3, aF.hy + 10, 0.7, 1, C);
  if (L.mic) { c.fillStyle = OUTLINE; circle(c, aF.hx + 3, aF.hy - 9, 5.5); c.fill(); c.fillStyle = C('#888'); circle(c, aF.hx + 3, aF.hy - 9, 3.6); c.fill(); }
  drawHand(aF, C, P.thumb);

  return { hfx: aF.hx, hfy: aF.hy, hbx: aBk.hx, hby: aBk.hy, hcx, hcy, wtx: aF.hx + Math.sin(P.wa) * 58, wty: aF.hy + Math.cos(P.wa) * 58 };
}

function drawHead(c, L, P, x, y, ang, C, o) {
  const r = BODY.hr;
  c.save(); c.translate(x, y); c.rotate(ang);
  // neck stub
  c.strokeStyle = OUTLINE; c.lineWidth = 13; c.lineCap = 'round'; seg(c, -1, r - 2, -1, r + 5);
  c.strokeStyle = C(L.skin); c.lineWidth = 8.5; seg(c, -1, r - 2, -1, r + 5);
  if (L.hairStyle === 'mullet') { c.fillStyle = OUTLINE; rr(c, -r - 1, -2, 14, r + 12, 6); c.fill(); c.fillStyle = C(L.hair); rr(c, -r + 1, -1, 10, r + 9, 5); c.fill(); }
  c.fillStyle = OUTLINE; circle(c, 0, 0, r + 2.5); c.fill();
  c.fillStyle = C(L.skin); circle(c, 0, 0, r); c.fill();
  // ear
  c.fillStyle = OUTLINE; ell(c, -3.5, 2, 4.6, 5.8); c.fill(); c.fillStyle = C(shade(L.skin, 0.92)); ell(c, -3.5, 2, 3, 4.2); c.fill();
  // hair
  const hair = C(L.hair || '#2a1a10');
  const hs = L.hairStyle;
  if (hs && hs !== 'bald' && L.hat !== 'helmet') {
    c.fillStyle = hair;
    if (hs === 'sides') { c.beginPath(); c.arc(0, 0, r + 1, Math.PI * 0.62, Math.PI * 1.08); c.arc(0, 0, r - 5, Math.PI * 1.08, Math.PI * 0.62, true); c.closePath(); c.fill(); }
    else {
      const front = hs === 'slick' ? 1.86 : 1.9;
      c.beginPath(); c.arc(0, 0, r + 1.6, Math.PI * 0.8, Math.PI * front); c.quadraticCurveTo(r * 0.2, -r * 0.55, -r * 0.35, -r * 0.05); c.quadraticCurveTo(-r * 0.6, r * 0.25, -r * 0.92, r * 0.42); c.closePath(); c.fill();
      if (hs === 'spiky') { for (let i = 0; i < 4; i++) { const a = Math.PI * (1.15 + i * 0.2); c.beginPath(); c.moveTo(Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r); c.lineTo(Math.cos(a) * (r + 8), Math.sin(a) * (r + 8)); c.lineTo(Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r); c.fill(); } }
      if (hs === 'curly') { for (let i = 0; i < 6; i++) { const a = Math.PI * (0.9 + i * 0.18); circle(c, Math.cos(a) * (r + 1), Math.sin(a) * (r + 1), 5.2); c.fill(); } }
      if (hs === 'slick') { c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = 1.6; c.beginPath(); c.arc(0, 0, r - 2, Math.PI * 1.2, Math.PI * 1.6); c.stroke(); }
    }
  } else if (hs === 'bald' && L.hat !== 'helmet') { c.fillStyle = 'rgba(255,255,255,0.22)'; ell(c, -2, -r * 0.6, 6, 3, -0.3); c.fill(); }
  // face
  const face = P.face || 'n';
  if (L.cheeks || o.drunk) { c.fillStyle = 'rgba(230,80,80,0.32)'; ell(c, r * 0.5, r * 0.38, 4.5, 3); c.fill(); }
  if (L.beard) {
    c.fillStyle = L.beard === 'stubble' ? 'rgba(40,20,10,0.3)' : C(L.beardColor || L.hair);
    if (L.beard === 'mustache') { ell(c, r * 0.66, r * 0.4, 6, 2.6, 0.1); c.fill(); }
    else { c.beginPath(); c.arc(0, 0, r + (L.beard === 'full' ? 1.5 : 0), -0.05, Math.PI * 0.74); c.quadraticCurveTo(-r * 0.15, r * 0.42, r * 0.25, r * 0.3); c.quadraticCurveTo(r * 0.7, r * 0.18, r * 0.98, r * 0.05); c.closePath(); c.fill(); }
  }
  // nose
  c.fillStyle = OUTLINE; circle(c, r * 0.95, r * 0.14, 5.4); c.fill();
  c.fillStyle = C(shade(L.skin, 0.95)); circle(c, r * 0.95, r * 0.14, 3.8); c.fill();
  // eyes
  const blink = o.blink;
  const eye = (ex, ey, s) => {
    if (face === 'k') { c.strokeStyle = OUTLINE; c.lineWidth = 1.8; seg(c, ex - 2.6 * s, ey - 2.6 * s, ex + 2.6 * s, ey + 2.6 * s); seg(c, ex - 2.6 * s, ey + 2.6 * s, ex + 2.6 * s, ey - 2.6 * s); return; }
    if (blink) { c.strokeStyle = OUTLINE; c.lineWidth = 1.6; seg(c, ex - 2.6 * s, ey, ex + 2.6 * s, ey); return; }
    c.fillStyle = OUTLINE; ell(c, ex, ey, 3.6 * s, 4.1 * s); c.fill();
    c.fillStyle = '#fbf6ea'; ell(c, ex, ey, 2.6 * s, 3.1 * s); c.fill();
    c.fillStyle = '#1a120c'; circle(c, ex + 0.9 * s, ey + 0.3, 1.6 * s); c.fill();
  };
  eye(r * 0.36, -r * 0.1, 1); eye(r * 0.74, -r * 0.12, 0.82);
  if (L.glasses) { c.strokeStyle = OUTLINE; c.lineWidth = 1.6; circle(c, r * 0.36, -r * 0.1, 5); c.stroke(); circle(c, r * 0.76, -r * 0.12, 4.2); c.stroke(); }
  // brows
  c.strokeStyle = C(L.hair === '#e2e2e2' ? '#cfcfcf' : shade(L.hair || '#2a1a10', 0.8)); c.lineWidth = 2.2; c.lineCap = 'round';
  if (face === 'a' || face === 'o') { seg(c, r * 0.16, -r * 0.5, r * 0.52, -r * 0.34); seg(c, r * 0.62, -r * 0.36, r * 0.92, -r * 0.48); }
  else if (face === 'h' || face === 'k') { seg(c, r * 0.16, -r * 0.36, r * 0.52, -r * 0.5); seg(c, r * 0.62, -r * 0.5, r * 0.92, -r * 0.4); }
  else if (face === 's') { seg(c, r * 0.16, -r * 0.42, r * 0.52, -r * 0.46); seg(c, r * 0.62, -r * 0.52, r * 0.92, -r * 0.46); }
  else { seg(c, r * 0.16, -r * 0.44, r * 0.52, -r * 0.42); seg(c, r * 0.62, -r * 0.44, r * 0.92, -r * 0.42); }
  // mouth
  c.strokeStyle = OUTLINE; c.lineWidth = 1.9;
  if (face === 'o' || face === 'k') { c.fillStyle = '#3a0e0a'; ell(c, r * 0.68, r * 0.56, 3.6, face === 'k' ? 3 : 4.4); c.fill(); }
  else if (face === 'a') { c.fillStyle = '#f8f2e4'; rr(c, r * 0.46, r * 0.46, 8, 4.4, 1.5); c.fill(); c.stroke(); }
  else if (face === 'h') { c.beginPath(); c.moveTo(r * 0.46, r * 0.6); c.quadraticCurveTo(r * 0.64, r * 0.44, r * 0.86, r * 0.6); c.stroke(); }
  else if (face === 's') { c.beginPath(); c.moveTo(r * 0.42, r * 0.5); c.quadraticCurveTo(r * 0.64, r * 0.68, r * 0.88, r * 0.42); c.stroke(); }
  else { seg(c, r * 0.5, r * 0.56, r * 0.84, r * 0.52); }
  // hats
  if (L.hat === 'cap') {
    c.fillStyle = OUTLINE; c.beginPath(); c.arc(0, -1, r + 3.6, Math.PI * 1.02, Math.PI * 1.98); c.lineTo(r + 12, -r * 0.06); c.lineTo(r * 0.5, -r * 0.02); c.closePath(); c.fill();
    c.fillStyle = C(L.hatColor || '#5a4a3a'); c.beginPath(); c.arc(0, -1, r + 1.4, Math.PI * 1.04, Math.PI * 1.96); c.lineTo(r + 9.5, -r * 0.14); c.lineTo(r * 0.5, -r * 0.12); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 1; seg(c, -r * 0.6, -r * 0.7, r * 0.6, -r * 0.8);
  } else if (L.hat === 'helmet') {
    c.fillStyle = OUTLINE; c.beginPath(); c.arc(0, 0, r + 4.5, Math.PI * 0.72, Math.PI * 2.02); c.lineTo(r * 0.4, 0); c.lineTo(-r * 0.6, r * 0.5); c.closePath(); c.fill();
    c.fillStyle = C(L.hatColor || '#2a2a2a'); c.beginPath(); c.arc(0, 0, r + 2.4, Math.PI * 0.74, Math.PI * 2.0); c.lineTo(r * 0.38, -1); c.lineTo(-r * 0.55, r * 0.45); c.closePath(); c.fill();
    if (L.hatStripe) { c.strokeStyle = C(L.hatStripe); c.lineWidth = 3; for (const a of [1.15, 1.4, 1.65]) { c.beginPath(); c.arc(0, 0, r - 2, Math.PI * a, Math.PI * (a + 0.12)); c.stroke(); } }
    c.fillStyle = 'rgba(255,255,255,0.22)'; ell(c, -3, -r * 0.62, 6, 2.5, -0.35); c.fill();
    if (L.cage) {
      c.strokeStyle = OUTLINE; c.lineWidth = 3.4;
      const bars = () => { seg(c, r * 0.5, -r * 0.3, r * 0.5, r * 0.86); seg(c, r * 0.86, -r * 0.3, r * 0.86, r * 0.82); seg(c, r * 1.12, -r * 0.24, r * 1.12, r * 0.7); seg(c, r * 0.4, r * 0.1, r * 1.16, r * 0.1); seg(c, r * 0.4, r * 0.46, r * 1.16, r * 0.46); seg(c, r * 0.4, r * 0.82, r * 1.04, r * 0.82); };
      bars(); c.strokeStyle = C('#a8aeb4'); c.lineWidth = 1.6; bars();
    }
  } else if (L.hat === 'viking') {
    const horn = (sx, dir) => { c.beginPath(); c.moveTo(sx - 4, -r * 0.62); c.quadraticCurveTo(sx + dir * 14, -r * 1.2, sx + dir * 10, -r * 1.75); c.quadraticCurveTo(sx + dir * 4, -r * 1.1, sx + 4, -r * 0.55); c.closePath(); };
    c.fillStyle = OUTLINE; horn(-r * 0.55, -1); c.fill(); horn(r * 0.45, 1); c.fill();
    c.fillStyle = C('#f2ead6'); c.save(); c.scale(0.86, 0.9); horn(-r * 0.55 / 0.86, -1); c.fill(); horn(r * 0.45 / 0.86, 1); c.fill(); c.restore();
    c.fillStyle = OUTLINE; c.beginPath(); c.arc(0, -1, r + 3.4, Math.PI, TAU); c.closePath(); c.fill();
    c.fillStyle = C('#9aa0a8'); c.beginPath(); c.arc(0, -1, r + 1.2, Math.PI, TAU); c.closePath(); c.fill();
    c.fillStyle = C('#c8ccd2'); c.fillRect(-r - 1, -3.5, 2 * r + 2, 3.5);
  } else if (L.hat === 'wreath') {
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * (1.02 + i * 0.12), lx = Math.cos(a) * (r + 1), ly = Math.sin(a) * (r + 0.5) + 1;
      c.fillStyle = OUTLINE; circle(c, lx, ly, 5.4); c.fill();
      c.fillStyle = C(i % 2 ? '#2f8f3e' : '#3aa84a');
      for (let k = 0; k < 3; k++) { const kk = a + (k - 1) * 1.6; circle(c, lx + Math.cos(kk) * 2.2, ly + Math.sin(kk) * 2.2, 2.5); c.fill(); }
    }
  }
  if (L.earpiece) { c.strokeStyle = '#2a2a2a'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-3.5, 4); c.quadraticCurveTo(-8, 12, -4, 20); c.stroke(); }
  c.restore();
}

/* =============================================================== POSES */
const ANIMS = {
  jab: { wind: { aF: [0.55, 0.75], wa: 1.9, lean: -0.02 }, hit: { aF: [1.55, 0.05], wa: 1.62, lean: 0.24, fF: [22, 0], fB: [-16, 0], face: 'a' } },
  swipe: { wind: { aF: [2.3, 0.35], wa: 3.2, lean: -0.05 }, hit: { aF: [1.2, -0.25], wa: 0.85, lean: 0.22, fF: [20, 0], fB: [-16, 0], face: 'a' } },
  swing: { wind: { aF: [-0.5, 0.9], wa: 3.6, lean: -0.15, hipY: 9, fF: [16, 0], fB: [-18, 0], face: 'a' }, hit: { aF: [1.7, 0.1], wa: 1.55, lean: 0.32, fF: [26, 0], fB: [-20, 0], hipY: 8, face: 'o' } },
  swingB: { wind: { aB: [-0.5, 0.9], waB: 3.6, lean: -0.12, hipY: 9, face: 'a' }, hit: { aB: [1.7, 0.1], waB: 1.55, lean: 0.3, fF: [26, 0], fB: [-20, 0], face: 'o' } },
  smash: { wind: { aF: [2.95, 0.25], wa: 3.9, aB: [0.6, 1.2], lean: -0.16, hipY: 11, fF: [16, 0], fB: [-18, 0], face: 'a' }, hit: { aF: [1.15, 0.2], wa: 0.55, lean: 0.48, hipY: 18, fF: [28, 0], fB: [-22, 0], face: 'o' } },
  punch: { wind: { aF: [0.55, 2.0], aB: [1.1, 1.7], lean: -0.06, face: 'a' }, hit: { aF: [1.62, 0.02], aB: [0.7, 1.9], lean: 0.22, fF: [20, 0], fB: [-14, 0], face: 'a' } },
  hook: { wind: { aF: [-0.7, 1.5], lean: -0.22, hipY: 8, head: -0.1, face: 'a' }, hit: { aF: [1.75, 0.45], lean: 0.32, fF: [22, 0], fB: [-18, 0], face: 'o' } },
  tackle: { wind: { lean: 0.55, hipY: 16, aF: [0.4, 0.9], aB: [0.3, 0.9], head: -0.3, face: 'a' }, hit: { lean: 0.78, hipY: 14, aF: [1.2, 0.6], aB: [1.1, 0.6], head: -0.38, face: 'o', run: true } },
  shove: { wind: { aF: [0.7, 1.8], aB: [0.6, 1.9], lean: -0.12, face: 'a' }, hit: { aF: [1.62, 0.0], aB: [1.55, 0.05], lean: 0.32, fF: [22, 0], face: 'o' } },
  throw: { wind: { aF: [2.7, 0.9], lean: -0.08, hold: 'dart', face: 'a' }, hit: { aF: [1.45, 0.15], lean: 0.18, fF: [18, 0] } },
  lob: { wind: { aF: [-0.9, 0.5], lean: 0.12, hipY: 8, hold: 'turf', face: 'a' }, hit: { aF: [2.5, 0.2], lean: -0.1 } },
  poke: { wind: { aF: [0.75, 0.85], aB: [0.95, 0.75], waCue: 1.57, lean: -0.05, face: 'a' }, hit: { aF: [1.45, 0.08], aB: [1.4, 0.15], waCue: 1.57, lean: 0.25, fF: [22, 0] } },
  sweep: { wind: { aF: [2.2, 0.4], aB: [2.0, 0.5], waCue: 2.7, lean: -0.1, face: 'a' }, hit: { aF: [1.0, 0.3], aB: [0.9, 0.35], waCue: 0.95, lean: 0.38, hipY: 14, face: 'o' } },
  kick: { wind: { fF: [-2, 16], lean: -0.12, aF: [1.2, 1.4], face: 'a' }, hit: { fF: [40, 34], lean: -0.22, aF: [1.6, 1.0], aB: [0.2, 0.8] } },
  overhead: { wind: { aF: [3.0, 0.2], aB: [2.95, 0.25], wa: 3.95, waB: 3.9, lean: -0.22, hipY: 10, face: 'o' }, hit: { aF: [1.05, 0.12], aB: [1.0, 0.15], wa: 0.6, waB: 0.65, lean: 0.48, hipY: 20, fF: [26, 0], face: 'o' } },
  stab: { wind: { aF: [0.5, 1.0], wa: 1.35, lean: -0.08, face: 'a' }, hit: { aF: [1.55, 0.0], wa: 1.57, lean: 0.3, fF: [28, 0], fB: [-18, 0], face: 'a' } },
  counter: { wind: { aF: [2.1, 0.3], aB: [2.0, 0.35], wa: 2.9, lean: -0.12, face: 's', head: -0.15 }, hit: { aF: [2.1, 0.3], aB: [2.0, 0.35], wa: 2.9, face: 's' } },
};

function idlePose(f, t) {
  const P = basePose();
  const L = f.look;
  const ph = f.phase || 0;
  P.hipY = 4 + Math.sin(t * 3 + ph) * 1.1;
  if (L.weapon === 'fists' || L.weapon === 'darts' || L.weapon === 'turf') { P.aF = [1.25, 1.55]; P.aB = [0.9, 1.7]; P.lean = 0.12; P.hipY += 2; }
  else if (L.weapon === 'cue') { P.aF = [1.0, 0.7]; P.aB = [0.85, 0.75]; P.waCue = 1.75; }
  else if (L.weapon === 'shillelagh') { P.aF = [0.85, 1.0]; P.wa = 2.2; P.aB = [0.3, 0.5]; P.face = 's'; }
  else if (L.weapon === 'hurley2') { P.aB = [0.75, 1.05]; P.waB = 2.4; P.aF = [0.95, 0.95]; P.wa = 2.2; }
  return P;
}
function walkPose(P, f, amt) {
  const ph = f.walkPhase;
  const s = Math.sin(ph), c2 = Math.cos(ph);
  const stride = 15 * amt;
  P.fF = [10 + s * stride, Math.max(0, c2) * 7 * amt];
  P.fB = [-10 - s * stride, Math.max(0, -c2) * 7 * amt];
  P.hipY += Math.abs(s) * 2.2 * amt;
  P.aF = [P.aF[0] - s * 0.22 * amt, P.aF[1]];
  P.aB = [P.aB[0] + s * 0.22 * amt, P.aB[1]];
  return P;
}
function attackPose(f, t) {
  const m = f.move, A = ANIMS[m.anim] || ANIMS.punch;
  const base = idlePose(f, t);
  const s = f.mt ? f.mt.s : m.startup, a = f.mt ? f.mt.a : m.active, r = f.mt ? f.mt.r : m.recovery;
  const st = f.st;
  const wind = mixPose(base, A.wind, 1), hit = mixPose(wind, A.hit, 1);
  let P;
  if (st < s) P = mixPose(base, A.wind, easeOutQuad(clamp(st / Math.max(0.01, s * 0.85), 0, 1)));
  else if (st < s + a) P = mixPose(wind, A.hit, easeOutQuad(clamp((st - s) / Math.max(0.01, a * 0.6), 0, 1)));
  else P = mixPose(hit, base, easeInOut(clamp((st - s - a) / Math.max(0.01, r), 0, 1)) * 0.85);
  if (A.hit.run && st >= s && st < s + a) { f.walkPhase += 0.6; walkPose(P, f, 1.2); }
  if (st < s && m.tele) { const tr = Math.sin(st * 50) * 0.6 * (m.tele === 'r' ? 1 : 0.4); P.hipX = tr; }
  return P;
}

function poseFor(f, t) {
  let P;
  switch (f.state) {
    case 'attack': P = f.move ? attackPose(f, t) : idlePose(f, t); break;
    case 'charge': { const A = ANIMS.smash; P = mixPose(idlePose(f, t), A.wind, clamp(f.st / 0.15, 0, 1)); const tr = Math.sin(t * 55) * 0.035 * (0.5 + f.charge); P.aF = [P.aF[0] + tr, P.aF[1]]; P.lean += tr; break; }
    case 'block':
      P = idlePose(f, t);
      if (f.isPlayer) P = mixPose(P, { aB: [1.25, 0.95], shield: 1, aF: [0.75, 1.5], wa: 2.7, lean: 0.06, hipY: 9, face: 'a' }, clamp(f.st / 0.06, 0, 1));
      else P = mixPose(P, { aF: [1.35, 1.7], aB: [1.25, 1.75], lean: 0.04, hipY: 8, head: 0.12, face: 'a' }, clamp(f.st / 0.08, 0, 1));
      break;
    case 'hurt': { const k = 1 - clamp(f.st / Math.max(0.05, f.hitstun), 0, 1); P = mixPose(idlePose(f, t), { lean: -0.38, head: -0.32, aF: [-0.25, 0.6], aB: [-0.45, 0.5], face: 'h', hipY: 7 }, Math.min(1, k * 1.6)); break; }
    case 'stagger': { const w = Math.sin(f.st * 9); P = mixPose(idlePose(f, t), { lean: -0.42 + w * 0.08, head: -0.2, aF: [2.0 + w * 0.3, 0.4], aB: [2.2 - w * 0.3, 0.4], face: 'h', hipY: 6, fF: [14 + w * 6, 0], fB: [-14 + w * 6, 0] }, 1); break; }
    case 'launched': { const spin = clamp(f.st * 2.2, 0, 1); P = mixPose(basePose(), { rot: -0.5 - spin * 0.7, lean: -0.2, aF: [2.6, 0.5], aB: [2.8, 0.4], fF: [18, 24], fB: [4, 16], face: 'h', hipY: 0 }, 1); break; }
    case 'down': case 'ko': P = mixPose(basePose(), { rot: -1.5, dy: BODY.leg - 13, lean: 0, hipY: 0, aF: [2.3, 0.4], aB: [2.6, 0.3], fF: [8, 0], fB: [-2, 2], face: f.hp <= 0 ? 'k' : 'h', head: 0.1 }, 1); break;
    case 'getup': { const dn = mixPose(basePose(), { rot: -1.5, dy: BODY.leg - 13, aF: [2.3, 0.4], aB: [2.6, 0.3], fF: [8, 0], fB: [-2, 2], face: 'h' }, 1); P = mixPose(dn, idlePose(f, t), easeInOut(clamp(f.st / 0.4, 0, 1))); P.rot = lerp(-1.5, 0, easeInOut(clamp(f.st / 0.4, 0, 1))); P.dy = lerp(BODY.leg - 13, 0, easeInOut(clamp(f.st / 0.4, 0, 1))); break; }
    case 'dodge': { const fw = f.dodgeFwd; P = mixPose(idlePose(f, t), { lean: fw ? 0.62 : -0.25, hipY: 17, aF: [-0.4, 0.7], aB: [-0.6, 0.5], fF: fw ? [26, 5] : [16, 3], fB: fw ? [-24, 6] : [-26, 8], face: 'a', wa: 0.8 }, clamp(f.st / 0.05, 0, 1)); break; }
    case 'taunt': { const pump = Math.sin(f.st * 13) * 0.12; P = mixPose(idlePose(f, t), { aF: [2.55 + pump, 0.25], aB: [2.6 - pump, 0.2], wa: 2.95, head: -0.32, lean: -0.1, face: 'o', hipY: 2 }, clamp(f.st / 0.12, 0, 1)); break; }
    case 'special': case 'victory': { const bounce = f.state === 'victory' ? Math.abs(Math.sin(t * 6)) * 5 : 0; P = mixPose(idlePose(f, t), { aF: [3.05, 0.05], wa: 3.14, aB: [2.0, 0.7], face: 'o', head: -0.22, lean: -0.05, hipY: 2 - bounce }, clamp(f.st / 0.15, 0, 1)); break; }
    case 'drink': P = mixPose(idlePose(f, t), { aB: [2.4, 1.3], head: -0.38, lean: -0.08, hold: 'pintB', face: 'n' }, clamp(f.st / 0.15, 0, 1)); break;
    case 'shh': P = mixPose(idlePose(f, t), { aF: [0.55, 2.55], face: 'n' }, 1); break;
    default: {
      P = idlePose(f, t);
      const sp = Math.hypot(f.vx, f.vy);
      if (sp > 25) walkPose(P, f, clamp(sp / 180, 0.4, 1.2));
    }
  }
  if (f.state === 'attack' && f.move && f.move.proj === 'crisps' && f.st < (f.mt ? f.mt.s : f.move.startup)) P.hold = 'crisps';
  return P;
}

/* ============================================================== THE ART */
const Art = {
  bg: null, bgKey: '', theme: 'colosseum', punters: [], front: [], band: [],

  init() {
    this.punters = [
      { x: 150, y: 404, look: LOOKS.punter(), ph: 0.3 },
      { x: 186, y: 410, look: LOOKS.punter(), ph: 1.7 },
      { x: 392, y: 402, look: LOOKS.punter(), ph: 2.2, sit: true },
      { x: 908, y: 402, look: LOOKS.punter(), ph: 0.9, sit: true },
      { x: 972, y: 408, look: LOOKS.punter(), ph: 3.1 },
      { x: 1018, y: 404, look: LOOKS.punter(), ph: 4.4 },
      { x: 1290, y: 410, look: LOOKS.punter(), ph: 2.8 },
      { x: 1330, y: 404, look: LOOKS.punter(), ph: 5.2 },
      { x: 1600, y: 408, look: LOOKS.punter(), ph: 1.1 },
    ];
    this.front = [];
    for (let x = -460; x < 1800; x += rand(62, 92)) this.front.push({ x, h: rand(0, 18), ph: rand(0, 6), pint: chance(0.3), cap: chance(0.25), big: rand(0.9, 1.2) });
    this.band = [
      { x: -205, role: 'fiddle', look: Object.assign(LOOKS.punter(), { shirt: '#6a4a2e', jacket: '#5a3e26', hat: null }) },
      { x: -128, role: 'bodhran', look: Object.assign(LOOKS.punter(), { shirt: '#2f6a3a', jacket: null, sleeves: 'long', hat: 'cap', hatColor: '#4a4a4a' }) },
      { x: -52, role: 'whistle', look: Object.assign(LOOKS.punter(), { shirt: '#9a3a2a', jacket: null, sleeves: 'long' }) },
    ];
  },

  hostLook(host) { if (!host) return null; if (!this._host || this._host.k !== host) this._host = { k: host, look: LOOKS[host]() }; return this._host.look; },

  /* ---------------------------------------------------- static pub */
  ensureBg(theme, res) {
    res = Math.min(res, 4000 / (WORLD.sceneR - WORLD.sceneL));
    const key = theme + '|' + res.toFixed(2) + '|' + (this.fontsReady ? 1 : 0);
    if (this.bg && this.bgKey === key) return;
    const w = Math.ceil((WORLD.sceneR - WORLD.sceneL) * res), h = Math.ceil(WORLD.H * res);
    const cv = this.bg && this.bg.width === w && this.bg.height === h ? this.bg : document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    c.setTransform(res, 0, 0, res, -WORLD.sceneL * res, 0);
    const seed = Math.random; let s = 1234567;
    Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    try { this.paintPub(c, THEMES[theme] || THEMES.colosseum, theme); } finally { Math.random = seed; }
    this.bg = cv; this.bgKey = key; this.bgRes = res; this.theme = theme;
  },

  paintPub(c, th, themeName) {
    const L = WORLD.sceneL, R = WORLD.sceneR, Wd = R - L;
    let g = c.createLinearGradient(0, 0, 0, 130);
    g.addColorStop(0, '#080403'); g.addColorStop(1, th.ceil);
    c.fillStyle = g; c.fillRect(L, 0, Wd, 130);
    c.fillStyle = th.beamDk; for (let x = L; x < R; x += 170) c.fillRect(x, 0, 24, 104);
    c.fillStyle = th.beam; c.fillRect(L, 98, Wd, 26); c.fillStyle = th.beamDk; c.fillRect(L, 121, Wd, 7);
    // upper wall
    c.fillStyle = th.wall; c.fillRect(L, 128, Wd, 175);
    c.fillStyle = th.wallStripe; for (let x = L; x < R; x += 26) c.fillRect(x, 128, 11, 175);
    c.fillStyle = th.brass; c.fillRect(L, 128, Wd, 2); c.fillRect(L, 299, Wd, 3);
    c.fillStyle = th.woodDk; c.fillRect(L, 302, Wd, 7);
    // wainscot
    c.fillStyle = th.wood; c.fillRect(L, 309, Wd, 91);
    for (let x = L + 6; x < R; x += 112) this.panel(c, x, 318, 98, 70, th);
    c.fillStyle = th.woodDk; c.fillRect(L, 392, Wd, 10);
    // floor
    g = c.createLinearGradient(0, 400, 0, 720); g.addColorStop(0, shade(th.floorA, 0.7)); g.addColorStop(0.35, th.floorB); g.addColorStop(1, th.floorA);
    c.fillStyle = g; c.fillRect(L, 400, Wd, 320);
    let y = 402, row = 0;
    while (y < 720) {
      const h = 12 + (y - 400) * 0.075;
      c.fillStyle = 'rgba(255,220,170,' + (0.02 + (row % 3) * 0.012) + ')'; c.fillRect(L, y, Wd, h);
      c.fillStyle = 'rgba(0,0,0,0.32)'; c.fillRect(L, y + h - 1.4, Wd, 1.4);
      let x = L + ((row * 137) % 260);
      while (x < R) { c.fillStyle = 'rgba(0,0,0,0.28)'; c.fillRect(x, y, 1.6, h); x += 190 + Math.random() * 160; }
      for (let i = 0; i < 6; i++) { c.fillStyle = 'rgba(0,0,0,0.07)'; c.fillRect(L + Math.random() * Wd, y + Math.random() * h, 60 + Math.random() * 140, 1); }
      y += h; row++;
    }
    // sawdust arena
    c.save(); ell(c, 650, 548, 600, 122); c.clip();
    c.fillStyle = 'rgba(214,168,104,0.13)'; c.fillRect(30, 420, 1240, 260);
    for (let i = 0; i < 2600; i++) { const a = Math.random() * TAU, rr2 = Math.sqrt(Math.random()); c.fillStyle = Math.random() < 0.5 ? 'rgba(232,196,132,0.32)' : 'rgba(120,80,40,0.25)'; c.fillRect(650 + Math.cos(a) * 600 * rr2, 548 + Math.sin(a) * 122 * rr2, 2, 1.4); }
    c.restore();
    c.save(); c.setLineDash([16, 12]); c.strokeStyle = 'rgba(244,232,206,0.32)'; c.lineWidth = 3; ell(c, 650, 548, 600, 122); c.stroke(); c.restore();
    // beer mats + puddle
    for (let i = 0; i < 9; i++) { const x = L + 300 + Math.random() * (Wd - 600), yy = 430 + Math.random() * 260; this.beerMat(c, x, yy, 0.8); }
    c.fillStyle = 'rgba(15,8,4,0.45)'; ell(c, 230, 640, 46, 9); c.fill();

    this.paintLeft(c, th, themeName);
    this.paintBar(c, th, themeName);
    this.paintRight(c, th, themeName);
    // lamps (fittings; glow is dynamic)
    for (const lx of LAMPS) {
      c.strokeStyle = '#120a06'; c.lineWidth = 2; seg(c, lx, 124, lx, 146);
      c.fillStyle = OUTLINE; c.beginPath(); c.moveTo(lx - 22, 168); c.lineTo(lx + 22, 168); c.lineTo(lx + 9, 144); c.lineTo(lx - 9, 144); c.closePath(); c.fill();
      c.fillStyle = th.brass; c.beginPath(); c.moveTo(lx - 19, 166); c.lineTo(lx + 19, 166); c.lineTo(lx + 8, 146); c.lineTo(lx - 8, 146); c.closePath(); c.fill();
      c.fillStyle = '#fff1c8'; ell(c, lx, 168, 13, 3.5); c.fill();
    }
    // light falloff
    g = c.createRadialGradient(650, 520, 120, 650, 520, 1150);
    g.addColorStop(0, 'rgba(255,200,120,0.07)'); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + (0.42 + (1 - th.light) * 0.4) + ')');
    c.fillStyle = g; c.fillRect(L, 0, Wd, 720);
    if (th.light < 1) { c.fillStyle = 'rgba(5,10,18,' + (1 - th.light) * 0.45 + ')'; c.fillRect(L, 0, Wd, 720); }
  },

  panel(c, x, y, w, h, th) {
    c.fillStyle = th.woodDk; c.fillRect(x, y, w, h);
    c.fillStyle = th.woodHi; c.fillRect(x + 3, y + 3, w - 6, h - 6);
    c.fillStyle = th.wood; c.fillRect(x + 7, y + 7, w - 14, h - 14);
    c.fillStyle = 'rgba(255,220,160,0.08)'; c.fillRect(x + 7, y + 7, w - 14, 3);
  },
  beerMat(c, x, y, s) {
    c.fillStyle = 'rgba(0,0,0,0.3)'; ell(c, x + 1, y + 1.5, 13 * s, 4.5 * s); c.fill();
    c.fillStyle = '#efe4c8'; ell(c, x, y, 13 * s, 4.5 * s); c.fill();
    c.strokeStyle = '#b0302a'; c.lineWidth = 2 * s; ell(c, x, y, 9 * s, 3 * s); c.stroke();
  },
  frame(c, x, y, w, h, th) {
    c.fillStyle = OUTLINE; c.fillRect(x - 3, y - 3, w + 6, h + 6);
    c.fillStyle = th.brass; c.fillRect(x, y, w, h);
    c.fillStyle = shade(th.brass, 0.7); c.fillRect(x + 4, y + 4, w - 8, h - 8);
  },

  paintLeft(c, th, themeName) {
    // snug partition
    c.fillStyle = th.woodDk; c.fillRect(-440, 128, 190, 272);
    c.fillStyle = th.wood; c.fillRect(-430, 140, 170, 250);
    c.fillStyle = 'rgba(232,226,206,0.78)'; c.fillRect(-418, 176, 146, 150);
    c.fillStyle = 'rgba(40,30,22,0.5)';
    for (const [sx, cap] of [[-380, true], [-318, false]]) { ell(c, sx, 266, 22, 46); c.fill(); circle(c, sx, 222, 15); c.fill(); if (cap) { c.fillRect(sx - 18, 206, 34, 8); } }
    c.fillStyle = 'rgba(255,255,255,0.18)'; for (let i = 0; i < 6; i++) c.fillRect(-418 + i * 26, 176, 2, 150);
    c.font = '700 24px ' + FONT_D; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(120,90,50,0.55)'; c.fillText('SNUG', -345, 196);
    this.panel(c, -430, 334, 170, 52, th);
    // trad corner: poster + jersey + crossed hurleys
    c.fillStyle = '#e8dcbc'; c.fillRect(-236, 150, 84, 112); c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(-236, 252, 84, 10);
    c.fillStyle = '#2a4a2a'; c.font = '700 15px ' + FONT_I; c.textAlign = 'center';
    th.poster.forEach((s, i) => c.fillText(s, -194, 178 + i * 24));
    this.frame(c, -130, 150, 88, 104, th);
    c.fillStyle = '#1c7a3e'; c.beginPath(); c.moveTo(-112, 172); c.lineTo(-60, 172); c.lineTo(-52, 188); c.lineTo(-62, 192); c.lineTo(-64, 240); c.lineTo(-108, 240); c.lineTo(-110, 192); c.lineTo(-120, 188); c.closePath(); c.fill();
    c.fillStyle = '#f2c230'; c.fillRect(-109, 196, 44, 8); c.fillRect(-109, 214, 44, 8);
    c.fillStyle = '#efe6cf'; c.font = '700 9px ' + FONT_B; c.fillText('KERRY · 97', -86, 248);
    c.save(); c.translate(-6, 200); for (const s of [-1, 1]) { c.save(); c.rotate(s * 0.55); drawWeapon(c, 'hurley', 0, -36, 0, (h) => h); c.restore(); } c.restore();
    // window
    c.fillStyle = th.woodDk; c.fillRect(30, 146, 128, 150);
    g2(c, 38, 154, 112, 134, th.curtains);
    c.fillStyle = th.woodDk; c.fillRect(92, 154, 5, 134); c.fillRect(38, 218, 112, 5);
    c.fillStyle = th.woodHi; c.fillRect(24, 292, 140, 8);
    // turnip lantern on the sill (Samhain, the original jack-o'-lantern)
    c.fillStyle = OUTLINE; ell(c, 70, 280, 15, 13); c.fill();
    c.fillStyle = '#e8dccf'; ell(c, 70, 280, 13, 11); c.fill();
    c.fillStyle = '#8a4a8a'; c.beginPath(); c.arc(70, 280, 13, Math.PI * 1.05, Math.PI * 1.95); c.closePath(); c.fill();
    c.fillStyle = '#ffb347'; c.beginPath(); c.moveTo(64, 278); c.lineTo(67, 274); c.lineTo(69, 279); c.fill(); c.beginPath(); c.moveTo(72, 279); c.lineTo(75, 274); c.lineTo(77, 278); c.fill(); c.fillRect(64, 283, 12, 3);
    c.strokeStyle = '#3a6a2a'; c.lineWidth = 2; seg(c, 70, 268, 72, 261);
    // fireplace
    c.fillStyle = shade(th.wall, 1.08); c.fillRect(184, 128, 172, 272);
    c.fillStyle = '#5a554e'; c.fillRect(194, 278, 152, 122);
    for (let yy = 280; yy < 398; yy += 16) for (let xx = 194 + ((yy / 16) % 2) * 12; xx < 346; xx += 24) { c.fillStyle = Math.random() < 0.5 ? '#6a645b' : '#625c54'; c.fillRect(xx + 1, yy + 1, 22, 14); }
    c.fillStyle = '#0c0705'; c.beginPath(); c.moveTo(222, 398); c.lineTo(222, 330); c.quadraticCurveTo(270, 300, 318, 330); c.lineTo(318, 398); c.closePath(); c.fill();
    c.fillStyle = th.woodHi; c.fillRect(178, 266, 184, 13); c.fillStyle = th.woodDk; c.fillRect(178, 277, 184, 4);
    c.fillStyle = '#7a756c'; c.fillRect(178, 396, 184, 10);
    // mantel bits: clock, horseshoe, candle
    c.fillStyle = OUTLINE; rr(c, 194, 238, 26, 28, 5); c.fill(); c.fillStyle = th.brass; rr(c, 196, 240, 22, 24, 4); c.fill();
    c.fillStyle = '#f4ecd8'; circle(c, 207, 250, 7); c.fill(); c.strokeStyle = '#1a1a1a'; c.lineWidth = 1.2; seg(c, 207, 250, 207, 245); seg(c, 207, 250, 211, 251);
    c.strokeStyle = '#8a8a8a'; c.lineWidth = 3; c.beginPath(); c.arc(336, 252, 9, 0.2, Math.PI - 0.2, true); c.stroke();
    // portrait of Marcus O'Reilly
    this.frame(c, 226, 148, 90, 106, th);
    c.fillStyle = '#2a2420'; c.fillRect(234, 156, 74, 82);
    c.save(); c.beginPath(); c.rect(234, 156, 74, 82); c.clip();
    c.translate(268, 318); c.scale(0.95, 0.95);
    drawBody(c, LOOKS.marcus(), Object.assign(basePose(), { aF: [0.2, 0.3], aB: [0.15, 0.3], face: 's', fF: [6, 0], fB: [-6, 0] }), {});
    c.restore();
    c.fillStyle = '#111'; c.beginPath(); c.moveTo(286, 148); c.lineTo(316, 148); c.lineTo(316, 178); c.closePath(); c.fill();
    c.fillStyle = '#e8d8a8'; c.fillRect(240, 240, 62, 11);
    c.fillStyle = '#2a1a10'; c.font = '700 7px ' + FONT_D; c.textAlign = 'center'; c.fillText("MARCUS O'REILLY · R.I.P.", 271, 246.5);
  },

  paintBar(c, th, themeName) {
    c.fillStyle = th.woodDk; c.fillRect(372, 128, 556, 140);
    // shelves + bottles
    for (const [x0, x1] of [[386, 448], [852, 914]]) for (const yy of [168, 208, 250]) {
      c.fillStyle = th.woodHi; c.fillRect(x0 - 4, yy, x1 - x0 + 8, 5);
      let x = x0;
      while (x < x1 - 8) { const w = 8 + Math.random() * 4, h = 20 + Math.random() * 14; this.bottle(c, x + w / 2, yy, w, h); x += w + 2 + Math.random() * 3; }
    }
    // mirror
    c.fillStyle = OUTLINE; c.fillRect(448, 136, 404, 106);
    c.fillStyle = th.brass; c.fillRect(451, 139, 398, 100);
    const g = c.createLinearGradient(456, 144, 520, 234); g.addColorStop(0, '#34484a'); g.addColorStop(1, '#0f1818');
    c.fillStyle = g; c.fillRect(457, 145, 386, 88);
    c.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(470 + i * 80, 233); c.lineTo(500 + i * 80, 145); c.lineTo(520 + i * 80, 145); c.lineTo(490 + i * 80, 233); c.fill(); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = '900 30px ' + FONT_D;
    const gg = c.createLinearGradient(0, 146, 0, 178); gg.addColorStop(0, '#fbe7a6'); gg.addColorStop(0.55, '#d5a640'); gg.addColorStop(1, '#8a6420');
    txt(c, th.mirror, 650, 162, gg, '#2a1a08', 3);
    c.font = '700 10px ' + FONT_D; c.fillStyle = '#d9b860'; c.fillText(th.mirrorSub, 650, 186);
    // glasses shelf
    c.fillStyle = th.woodHi; c.fillRect(456, 248, 388, 5);
    for (let x = 470; x < 840; x += 15) { c.fillStyle = 'rgba(220,235,240,0.35)'; c.fillRect(x, 236, 9, 12); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(x + 1, 237, 2, 9); }
    // counter
    c.fillStyle = OUTLINE; c.fillRect(368, 259, 564, 26);
    const cg = c.createLinearGradient(0, 262, 0, 282); cg.addColorStop(0, th.woodHi); cg.addColorStop(1, th.wood);
    c.fillStyle = cg; c.fillRect(370, 261, 560, 19);
    c.fillStyle = 'rgba(255,225,170,0.3)'; c.fillRect(370, 262, 560, 2);
    c.fillStyle = th.brass; c.fillRect(370, 279, 560, 4);
    c.fillStyle = th.wood; c.fillRect(380, 283, 540, 117);
    for (let x = 388; x < 912; x += 106) this.panel(c, x, 292, 96, 78, th);
    // foot rail
    c.fillStyle = OUTLINE; c.fillRect(376, 373, 548, 11);
    const rg = c.createLinearGradient(0, 375, 0, 383); rg.addColorStop(0, '#fbe6a0'); rg.addColorStop(0.5, th.brass); rg.addColorStop(1, '#6a4a18');
    c.fillStyle = rg; c.fillRect(378, 375, 544, 7);
    for (let x = 400; x < 920; x += 130) { c.fillStyle = shade(th.brass, 0.75); c.fillRect(x, 382, 5, 16); }
    // taps
    const handles = ['#141414', '#d6a33a', '#9a1f1f', '#2f7a3a', '#141414', '#e8e0cc'];
    [478, 518, 558, 742, 782, 822].forEach((x, i) => {
      c.fillStyle = OUTLINE; c.fillRect(x - 6, 226, 12, 36); c.fillStyle = th.brass; c.fillRect(x - 4, 228, 8, 34);
      c.fillStyle = OUTLINE; c.fillRect(x - 2, 236, 14, 6); c.fillStyle = th.brass; c.fillRect(x - 1, 237, 12, 4);
      c.fillStyle = OUTLINE; rr(c, x - 7, 192, 14, 40, 5); c.fill(); c.fillStyle = handles[i]; rr(c, x - 5, 194, 10, 36, 4); c.fill();
      if (i === 0 || i === 4) { c.fillStyle = '#f2e6c4'; ell(c, x, 204, 3.2, 5); c.fill(); }
    });
    c.fillStyle = '#8a8a8a'; c.fillRect(466, 258, 104, 3); c.fillRect(730, 258, 104, 3);
    for (const x of [404, 424, 878, 898]) drawPint(c, x, 261, 0.75, 1);
  },

  paintRight(c, th, themeName) {
    // chalkboard
    c.fillStyle = OUTLINE; c.fillRect(934, 146, 142, 138);
    c.fillStyle = th.woodHi; c.fillRect(937, 149, 136, 132);
    c.fillStyle = '#1d2622'; c.fillRect(944, 156, 122, 118);
    c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(944, 156, 122, 118);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    th.chalk.forEach((s, i) => { c.font = (i === 0 || i === 1 ? '700 14px ' : '400 11.5px ') + FONT_C; c.fillStyle = i === 1 ? 'rgba(255,214,120,0.92)' : 'rgba(240,240,232,0.86)'; c.fillText(s, 1005, 172 + i * 18); });
    // doors: FIR / MNÁ
    [[1086, 'FIR'], [1183, 'MNÁ']].forEach(([x, label]) => {
      c.fillStyle = OUTLINE; c.fillRect(x - 4, 218, 90, 182);
      c.fillStyle = th.woodDk; c.fillRect(x - 1, 221, 84, 179);
      c.fillStyle = th.door; c.fillRect(x + 4, 226, 74, 174);
      for (const [px, py, pw, ph] of [[x + 10, 252, 28, 56], [x + 44, 252, 28, 56], [x + 10, 316, 28, 70], [x + 44, 316, 28, 70]]) { c.fillStyle = shade(th.door, 0.78); c.fillRect(px, py, pw, ph); c.fillStyle = shade(th.door, 1.12); c.fillRect(px + 3, py + 3, pw - 6, ph - 6); }
      c.fillStyle = OUTLINE; ell(c, x + 41, 238, 22, 9); c.fill(); c.fillStyle = '#efe4c8'; ell(c, x + 41, 238, 20, 7.5); c.fill();
      c.fillStyle = '#2a1a10'; c.font = '900 11px ' + FONT_D; c.fillText(label, x + 41, 238.5);
      c.fillStyle = th.brass; circle(c, x + 68, 316, 4); c.fill();
    });
    // dartboard cabinet
    c.fillStyle = OUTLINE; c.fillRect(1284, 170, 92, 104);
    c.fillStyle = th.woodHi; c.fillRect(1287, 173, 86, 98);
    c.fillStyle = '#1d2622'; c.fillRect(1256, 176, 26, 92); c.fillRect(1378, 176, 26, 92);
    c.font = '400 9px ' + FONT_C; c.fillStyle = 'rgba(240,240,232,0.8)';
    ['501', '441', '320', '180!'].forEach((s, i) => { c.fillText(s, 1269, 192 + i * 18); c.fillText(['501', '459', '399', '260'][i], 1391, 192 + i * 18); });
    this.dartboard(c, 1330, 222, 36);
    // céad míle fáilte sign
    c.fillStyle = OUTLINE; c.fillRect(1404, 132, 172, 42);
    c.fillStyle = th.woodDk; c.fillRect(1407, 135, 166, 36);
    c.font = '400 15px ' + FONT_I; c.fillStyle = '#e8c05a'; c.fillText('Céad Míle Fáilte', 1490, 154);
    // front door with fanlight
    c.fillStyle = OUTLINE; c.fillRect(1420, 196, 140, 204);
    c.fillStyle = th.woodDk; c.fillRect(1423, 199, 134, 201);
    const cols = ['#2f7a3a', '#d6a33a', '#9a1f1f', '#2f6aa8', '#2f7a3a', '#d6a33a'];
    for (let i = 0; i < 6; i++) { c.fillStyle = th.curtains ? '#3a1a1a' : cols[i]; c.beginPath(); c.moveTo(1490, 240); c.arc(1490, 240, 58, Math.PI + (i * Math.PI) / 6, Math.PI + ((i + 1) * Math.PI) / 6); c.closePath(); c.fill(); }
    c.strokeStyle = th.woodDk; c.lineWidth = 3; for (let i = 1; i < 6; i++) { const a = Math.PI + (i * Math.PI) / 6; seg(c, 1490, 240, 1490 + Math.cos(a) * 58, 240 + Math.sin(a) * 58); }
    c.fillStyle = th.door; c.fillRect(1430, 242, 120, 158);
    for (const [px, py, pw, ph] of [[1438, 250, 48, 66], [1494, 250, 48, 66], [1438, 324, 48, 70], [1494, 324, 48, 70]]) { c.fillStyle = shade(th.door, 0.78); c.fillRect(px, py, pw, ph); c.fillStyle = shade(th.door, 1.12); c.fillRect(px + 3, py + 3, pw - 6, ph - 6); }
    c.fillStyle = th.brass; c.fillRect(1470, 330, 40, 6); circle(c, 1540, 322, 4.5); c.fill();
    // jukebox
    c.fillStyle = OUTLINE; rr(c, 1596, 262, 98, 140, 30); c.fill();
    c.fillStyle = '#5a2a1a'; rr(c, 1600, 266, 90, 134, 27); c.fill();
    c.fillStyle = '#c8a046'; rr(c, 1612, 280, 66, 40, 18); c.fill();
    c.fillStyle = '#2a1a10'; c.fillRect(1616, 330, 58, 30);
    c.fillStyle = '#efe4c8'; for (let i = 0; i < 4; i++) c.fillRect(1620, 333 + i * 7, 50, 4);
  },

  bottle(c, x, base, w, h) {
    const cols = ['#3a5a2a', '#6a3a12', '#2a4a5a', '#8a6a2a', '#5a1a1a', '#bdbda8', '#2a2a2a'];
    const col = cols[(Math.random() * cols.length) | 0];
    c.fillStyle = OUTLINE; rr(c, x - w / 2 - 1, base - h - 1, w + 2, h + 1, 2.5); c.fill();
    c.fillStyle = col; rr(c, x - w / 2, base - h * 0.7, w, h * 0.7, 2); c.fill();
    c.fillRect(x - w * 0.18, base - h, w * 0.36, h * 0.32);
    c.fillStyle = 'rgba(240,230,200,0.75)'; c.fillRect(x - w / 2 + 1, base - h * 0.48, w - 2, h * 0.2);
    c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(x - w / 2 + 1.2, base - h * 0.66, 1.4, h * 0.56);
  },
  dartboard(c, x, y, r) {
    c.fillStyle = OUTLINE; circle(c, x, y, r + 4); c.fill();
    c.fillStyle = '#151515'; circle(c, x, y, r + 1); c.fill();
    for (let i = 0; i < 20; i++) {
      const a0 = (i / 20) * TAU - Math.PI / 20, a1 = a0 + TAU / 20;
      for (const [r0, r1, cA, cB] of [[r * 0.62, r * 0.93, '#151515', '#efe4c8'], [r * 0.1, r * 0.55, '#151515', '#efe4c8'], [r * 0.93, r, '#b0302a', '#2f7a3a'], [r * 0.55, r * 0.62, '#b0302a', '#2f7a3a']]) {
        c.fillStyle = i % 2 ? cA : cB; c.beginPath(); c.arc(x, y, r1, a0, a1); c.arc(x, y, r0, a1, a0, true); c.closePath(); c.fill();
      }
    }
    c.fillStyle = '#2f7a3a'; circle(c, x, y, r * 0.1); c.fill(); c.fillStyle = '#b0302a'; circle(c, x, y, r * 0.05); c.fill();
  },

  /* ---------------------------------------------------- dynamic layers */
  drawBack(c, G, t) {
    const th = THEMES[this.theme] || THEMES.colosseum;
    // fire
    c.save();
    for (let i = 0; i < 6; i++) {
      const fx = 236 + i * 14, h = 28 + 16 * Math.sin(t * 7 + i * 1.9) + 8 * Math.sin(t * 13 + i);
      const fg = c.createLinearGradient(0, 398, 0, 398 - h);
      fg.addColorStop(0, 'rgba(255,170,60,0.95)'); fg.addColorStop(0.6, 'rgba(255,110,30,0.7)'); fg.addColorStop(1, 'rgba(255,60,10,0)');
      c.fillStyle = fg; c.beginPath(); c.moveTo(fx - 11, 396); c.quadraticCurveTo(fx - 6 + Math.sin(t * 9 + i) * 4, 396 - h * 0.6, fx + Math.sin(t * 5 + i) * 5, 396 - h); c.quadraticCurveTo(fx + 8, 396 - h * 0.5, fx + 11, 396); c.closePath(); c.fill();
    }
    c.fillStyle = '#2a1408'; for (let i = 0; i < 4; i++) c.fillRect(234 + i * 20, 386, 18, 10);
    c.fillStyle = 'rgba(255,120,40,0.6)'; for (let i = 0; i < 4; i++) c.fillRect(234 + i * 20, 385, 18, 2);
    c.globalCompositeOperation = 'lighter';
    const fl = 0.85 + Math.sin(t * 11) * 0.08 + Math.sin(t * 23) * 0.05;
    let g = c.createRadialGradient(270, 370, 10, 270, 370, 200); g.addColorStop(0, 'rgba(255,140,50,' + 0.26 * fl + ')'); g.addColorStop(1, 'rgba(255,140,50,0)');
    c.fillStyle = g; c.fillRect(70, 170, 400, 400);
    for (const lx of LAMPS) {
      const f2 = th.light * (0.92 + Math.sin(t * 3.1 + lx) * 0.04);
      g = c.createRadialGradient(lx, 172, 4, lx, 172, 210); g.addColorStop(0, 'rgba(255,214,140,' + 0.3 * f2 + ')'); g.addColorStop(1, 'rgba(255,214,140,0)');
      c.fillStyle = g; c.fillRect(lx - 210, 0, 420, 400);
    }
    g = c.createRadialGradient(70, 282, 2, 70, 282, 60); g.addColorStop(0, 'rgba(255,160,60,' + 0.45 * fl + ')'); g.addColorStop(1, 'rgba(255,160,60,0)');
    c.fillStyle = g; c.fillRect(10, 222, 120, 120);
    // jukebox lights
    const hue = (t * 40) % 360;
    c.fillStyle = 'hsla(' + hue + ',90%,60%,0.35)'; rr(c, 1606, 274, 78, 52, 22); c.fill();
    c.fillStyle = 'hsla(' + ((hue + 120) % 360) + ',90%,60%,0.3)'; c.fillRect(1604, 366, 82, 26);
    if (th.curtains) { // candles for the lock-in
      for (const cx of [436, 650, 866]) { g = c.createRadialGradient(cx, 246, 1, cx, 246, 60); g.addColorStop(0, 'rgba(255,190,90,' + 0.5 * fl + ')'); g.addColorStop(1, 'rgba(255,190,90,0)'); c.fillStyle = g; c.fillRect(cx - 60, 186, 120, 120); }
    }
    c.restore();
    if (th.curtains) for (const cx of [436, 650, 866]) { c.fillStyle = '#efe4c8'; c.fillRect(cx - 3, 248, 6, 14); c.fillStyle = '#ffcf6a'; ell(c, cx, 244 + Math.sin(t * 12 + cx) * 0.6, 2.4, 4.2); c.fill(); }
    // doors opening
    for (const d of DOORS) {
      if (d.open <= 0) continue;
      const a = clamp(d.open, 0, 1);
      if (d.name === 'fir' || d.name === 'mna') {
        const x = d.name === 'fir' ? 1086 : 1183;
        c.fillStyle = '#070404'; c.fillRect(x + 4, 226, 74, 174);
        c.fillStyle = 'rgba(255,240,200,' + 0.15 * a + ')'; c.fillRect(x + 4, 226, 74, 174);
        c.fillStyle = th.door; c.fillRect(x + 4, 226, 74 * (1 - a * 0.75), 174);
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x + 4 + 74 * (1 - a * 0.75) - 4, 226, 4, 174);
      } else if (d.name === 'front') {
        c.fillStyle = '#070404'; c.fillRect(1430, 242, 120, 158);
        c.fillStyle = 'rgba(80,110,160,' + 0.2 * a + ')'; c.fillRect(1430, 242, 120, 158);
        c.fillStyle = th.door; c.fillRect(1430, 242, 120 * (1 - a * 0.75), 158);
      }
    }
    // band
    const beat = Music.beatPhase();
    for (const m of this.band) this.drawMusician(c, m, t, beat);
    // regulars
    const ex = clamp(G.craic / 90, 0, 1);
    for (const p of this.punters) this.drawPunter(c, p, t, ex, G);
    // host behind the bar
    if (G.host) this.drawHost(c, G, t);
  },

  drawMusician(c, m, t, beat) {
    const L = m.look, sc = 0.82;
    const P = basePose();
    P.hipY = BODY.leg - 44; P.fF = [24, 0]; P.fB = [14, 0]; P.lean = 0.05;
    const bob = Math.sin(beat * TAU) * 1.5;
    P.head = Math.sin(beat * TAU) * 0.06;
    if (m.role === 'fiddle') { P.aB = [2.15, 0.45]; P.aF = [1.25, 1.1 + Math.sin(t * 8) * 0.35]; }
    else if (m.role === 'bodhran') { P.aB = [1.05, 1.0]; P.aF = [1.55 + Math.sin(t * 19) * 0.25, 1.25]; }
    else { P.aF = [1.05, 2.05]; P.aB = [0.95, 2.15]; P.head = 0.12; }
    c.save(); c.translate(m.x, 404 + bob * 0.3); c.scale(sc, sc);
    // stool
    c.fillStyle = OUTLINE; c.fillRect(-14, -48, 30, 7); c.fillRect(-12, -42, 4, 42); c.fillRect(8, -42, 4, 42);
    c.fillStyle = '#6a3a1e'; c.fillRect(-12, -47, 26, 4);
    const pts = drawBody(c, L, P, {});
    if (m.role === 'fiddle') { c.save(); c.translate(pts.hbx - 2, pts.hby - 4); c.rotate(-0.5); c.fillStyle = OUTLINE; ell(c, 0, 0, 12, 7); c.fill(); c.fillStyle = '#9a4a1a'; ell(c, 0, 0, 10, 5.5); c.fill(); c.strokeStyle = OUTLINE; c.lineWidth = 3; seg(c, 8, 0, 26, 0); c.restore(); c.strokeStyle = '#d8c8a0'; c.lineWidth = 1.5; seg(c, pts.hfx - 18, pts.hfy + 6, pts.hfx + 18, pts.hfy - 6); }
    if (m.role === 'bodhran') { drawBodhran(c, pts.hbx + 10, pts.hby - 8, 10, 22, 0.15, (h) => h); c.strokeStyle = OUTLINE; c.lineWidth = 3; seg(c, pts.hfx, pts.hfy, pts.hfx + 8, pts.hfy - 10); }
    if (m.role === 'whistle') { c.strokeStyle = OUTLINE; c.lineWidth = 4; seg(c, pts.hcx + 12, pts.hcy + 8, pts.hcx + 30, pts.hcy + 34); c.strokeStyle = '#d8d8d8'; c.lineWidth = 2; seg(c, pts.hcx + 12, pts.hcy + 8, pts.hcx + 30, pts.hcy + 34); }
    c.restore();
  },

  drawPunter(c, p, t, ex, G) {
    const P = basePose();
    const e = clamp(ex + 0.35 * Math.sin(t * 1.3 + p.ph) + (G.crowdPulse || 0) * 0.6, 0, 1.4);
    const jump = e > 0.7 ? Math.max(0, Math.sin(t * 9 + p.ph)) * 6 * (e - 0.6) : 0;
    if (p.sit) { P.hipY = BODY.leg - 46; P.fF = [20, 0]; P.fB = [12, 0]; }
    if (e > 0.62) { const w = Math.sin(t * 8 + p.ph) * 0.25; P.aF = [2.6 + w, 0.3]; P.aB = [2.5 - w, 0.4]; P.face = 'o'; }
    else if (e < 0.18) { P.aF = [0.9, 1.9]; P.aB = [0.85, 2.0]; P.face = 'h'; }
    else { P.aF = [0.6, 1.4]; P.aB = [0.25, 0.4]; P.hold = null; }
    c.save(); c.translate(p.x, p.y - jump); c.scale(-sgn(p.x - 650) * 0.86, 0.86);
    if (p.sit) { c.fillStyle = OUTLINE; c.fillRect(-14, -50, 30, 7); c.fillRect(-11, -44, 4, 44); c.fillRect(9, -44, 4, 44); c.fillStyle = '#6a3a1e'; c.fillRect(-12, -49, 26, 4); }
    const pts = drawBody(c, p.look, P, {});
    if (e >= 0.18 && e <= 0.62) drawPint(c, pts.hfx + 3, pts.hfy + 10, 0.65, 1);
    c.restore();
  },

  drawHost(c, G, t) {
    const L = this.hostLook(G.host);
    if (!L) return;
    const P = basePose();
    P.hipY = 0; P.lean = 0.02;
    const mood = G.hostMood || 'polish';
    if (mood === 'polish') { P.aF = [1.0 + Math.sin(t * 4) * 0.12, 1.6 + Math.cos(t * 4) * 0.15]; P.aB = [0.9, 1.7]; P.hold = 'glass'; }
    else if (mood === 'cheer') { const w = Math.sin(t * 9) * 0.2; P.aF = [2.7 + w, 0.2]; P.aB = [2.6 - w, 0.3]; P.face = 'o'; }
    else if (mood === 'up') { P.aF = [2.1, 1.0]; P.thumb = 1; P.face = 's'; }
    else if (mood === 'down') { P.aF = [1.6, -0.05]; P.thumb = -1; P.face = 'a'; P.lean = 0.12; }
    else if (mood === 'angry') { const w = Math.sin(t * 20) * 0.15; P.aF = [1.4 + w, 1.8]; P.aB = [1.3 - w, 1.8]; P.face = 'a'; }
    else if (mood === 'shh') { P.aF = [0.55, 2.55]; }
    c.save();
    c.beginPath(); c.rect(372, 0, 556, 262.5); c.clip();
    c.translate(650, 342); c.scale(-0.92, 0.92);
    drawBody(c, L, P, { blink: Math.sin(t * 1.7) > 0.985 });
    c.restore();
  },

  drawFront(c, G, t, camX) {
    const ex = clamp(G.craic / 90, 0, 1), pulse = G.crowdPulse || 0, par = (camX - 650) * 0.16;
    for (const m of this.front) {
      const x = m.x - par, e = clamp(ex + 0.3 * Math.sin(t * 1.1 + m.ph) + pulse * 0.7, 0, 1.4);
      const bob = Math.sin(t * (2 + m.ph * 0.3) + m.ph) * 2 + (e > 0.65 ? Math.max(0, Math.sin(t * 10 + m.ph)) * 9 * (e - 0.5) : 0);
      const y = 704 + m.h - bob, s = m.big;
      c.fillStyle = '#0b0604';
      ell(c, x, y + 30 * s, 34 * s, 26 * s); c.fill();
      circle(c, x, y, 16 * s); c.fill();
      if (m.cap) { c.fillRect(x - 17 * s, y - 13 * s, 36 * s, 7 * s); }
      if (e > 0.6) {
        const w = Math.sin(t * 8 + m.ph) * 6;
        c.strokeStyle = '#0b0604'; c.lineWidth = 9 * s; c.lineCap = 'round';
        seg(c, x - 22 * s, y + 18 * s, x - 30 * s + w, y - 26 * s); seg(c, x + 22 * s, y + 18 * s, x + 30 * s - w, y - 26 * s);
        if (m.pint) drawPint(c, x + 31 * s - w, y - 24 * s, 0.8, 1);
      } else if (m.pint) { drawPint(c, x + 24 * s, y + 20 * s, 0.8, 1); }
      c.strokeStyle = 'rgba(255,190,110,0.16)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 16 * s, Math.PI * 1.1, Math.PI * 1.7); c.stroke();
    }
  },

  /* ---------------------------------------------------- actors */
  drawShadow(c, x, y, z, s) {
    const k = clamp(1 - z / 360, 0.35, 1);
    c.fillStyle = 'rgba(8,4,2,' + 0.38 * k + ')';
    ell(c, x, y + 2, 30 * s * k, 7.5 * s * k); c.fill();
  },

  drawFighter(c, f, t) {
    const s = f.scale * depthScale(f.y);
    const P = poseFor(f, t);
    let alpha = 1;
    if (f.state === 'ko' && f.koT > 1.4) alpha = clamp(1 - (f.koT - 1.4) / 0.8, 0, 1);
    if (f.state === 'enter') alpha = clamp(f.st / 0.25, 0, 1);
    if (alpha <= 0) return null;
    c.save();
    if (alpha < 1) c.globalAlpha = alpha;
    if (f.state === 'dodge') { // afterimages
      for (let i = 2; i >= 1; i--) {
        c.save(); c.globalAlpha = 0.18 * i * alpha;
        c.translate(f.x - f.vx * 0.035 * i, f.y - f.z - f.vy * 0.035 * i); c.scale(f.face * s, s);
        drawBody(c, f.look, P, { flash: true, mirror: f.face < 0 }); c.restore();
      }
    }
    c.translate(f.x, f.y - f.z);
    c.scale(f.face * s, s);
    if (P.rot) { const hx = P.hipX || 0, hy = -BODY.leg + (P.hipY || 0); c.translate(0, P.dy || 0); c.translate(hx, hy); c.rotate(P.rot); c.translate(-hx, -hy); }
    let glow = null;
    if (f.state === 'charge') glow = f.charge >= 1 ? 'rgba(255,220,120,1)' : 'rgba(255,170,60,' + (0.4 + f.charge * 0.6) + ')';
    if (f.state === 'special') glow = 'rgba(255,120,40,1)';
    const pts = drawBody(c, f.look, P, { flash: f.flash > 0, mirror: f.face < 0, glow, blink: f.blinkT < 0.12, drunk: f.isPlayer && f.spiked > 0 });
    c.restore();
    if (pts) { f.pts = { hx: f.x + f.face * s * pts.hfx, hy: f.y - f.z + s * pts.hfy, headX: f.x + f.face * s * pts.hcx, headY: f.y - f.z + s * pts.hcy, wx: f.x + f.face * s * pts.wtx, wy: f.y - f.z + s * pts.wty }; }
    return pts;
  },

  drawTelegraph(c, f, t) {
    if (f.state !== 'attack' || !f.move || !f.move.tele || !f.pts) return;
    const ms = f.mt ? f.mt.s : f.move.startup;
    if (f.st >= ms) return;
    const k = f.st / ms, tele = f.move.tele;
    const col = tele === 'r' ? '#ff3b2f' : tele === 'y' ? '#ffd23a' : tele === 'p' ? '#c46bff' : '#ffffff';
    const useWeapon = f.look.weapon === 'hurley' || f.look.weapon === 'hurley2' || f.look.weapon === 'shillelagh';
    const gx = useWeapon ? f.pts.wx : f.pts.hx, gy = useWeapon ? f.pts.wy : f.pts.hy;
    const pulse = 0.6 + 0.4 * Math.sin(t * 30);
    const r = (10 + 16 * easeOutQuad(Math.min(1, k * 1.6))) * (tele === 'r' ? 1.25 : 1);
    c.save(); c.globalCompositeOperation = 'lighter';
    c.fillStyle = col; c.globalAlpha = 0.85 * pulse; star(c, gx, gy, r, r * 0.22, 4, t * 4); c.fill();
    c.globalAlpha = 0.35; circle(c, gx, gy, r * 0.7); c.fill();
    c.restore();
    if (tele === 'p') { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.25 + 0.15 * Math.sin(t * 8); c.fillStyle = col; ell(c, f.x, f.y - 80 * f.scale, 46 * f.scale, 92 * f.scale); c.fill(); c.restore(); }
    // ! above the head
    const hx = f.pts.headX, hy = f.pts.headY - 38 * f.scale;
    c.font = '900 ' + (tele === 'r' ? 30 : 24) + 'px ' + FONT_D; c.textAlign = 'center'; c.textBaseline = 'middle';
    txt(c, tele === 'r' ? '!!' : tele === 'p' ? '?' : '!', hx, hy - Math.sin(t * 14) * 2, col, OUTLINE, 6);
  },

  drawFloorWarn(c, G, t) {
    for (const f of G.fighters) {
      if (f.state === 'attack' && f.move && f.move.tele === 'r' && f.st < (f.mt ? f.mt.s : f.move.startup) && !f.move.proj) {
        const range = (f.move.lunge > 400 ? 320 : f.move.range) * f.scale;
        const a = 0.18 + 0.14 * Math.sin(t * 22);
        c.fillStyle = 'rgba(255,50,40,' + a + ')';
        ell(c, f.x + f.face * range * 0.55, f.y, range * 0.62, 24); c.fill();
        c.strokeStyle = 'rgba(255,80,60,0.7)'; c.lineWidth = 2.5; ell(c, f.x + f.face * range * 0.55, f.y, range * 0.62, 24); c.stroke();
      }
      if (f.state === 'charge' && f.isPlayer) {
        c.strokeStyle = f.charge >= 1 ? 'rgba(255,230,140,0.9)' : 'rgba(255,170,60,0.6)'; c.lineWidth = 3;
        ell(c, f.x, f.y + 2, 40 + f.charge * 40, 10 + f.charge * 8); c.stroke();
      }
    }
    for (const h of G.hazards) {
      if (h.type === 'trolley' && h.state === 'warn') {
        const a = 0.12 + 0.14 * (Math.sin(t * 18) * 0.5 + 0.5);
        c.fillStyle = 'rgba(255,60,40,' + a + ')'; c.fillRect(WORLD.minX - 80, h.y - 26, WORLD.maxX - WORLD.minX + 160, 52);
        c.fillStyle = 'rgba(255,220,180,' + (a + 0.25) + ')';
        for (let i = 0; i < 8; i++) { const x = WORLD.minX + ((i * 160 + t * 260 * h.dir) % 1280 + 1280) % 1280; c.beginPath(); c.moveTo(x + h.dir * 18, h.y); c.lineTo(x - h.dir * 8, h.y - 12); c.lineTo(x - h.dir * 8, h.y + 12); c.closePath(); c.fill(); }
      }
    }
    for (const p of G.projectiles) {
      if ((p.kind === 'turf' || p.kind === 'mat' || p.kind === 'sambuca') && p.tx != null) {
        const k = clamp(p.t / p.T, 0, 1);
        c.strokeStyle = p.kind === 'sambuca' ? 'rgba(255,140,40,0.8)' : 'rgba(255,70,50,0.75)'; c.lineWidth = 2.5;
        ell(c, p.tx, p.ty, 34 * (1.2 - k * 0.5), 9 * (1.2 - k * 0.5)); c.stroke();
        c.fillStyle = 'rgba(0,0,0,0.25)'; ell(c, p.tx, p.ty, 14 + k * 10, 4 + k * 3); c.fill();
      }
    }
  },

  drawHatch(c, h, t) {
    const open = h.lid || 0;
    c.fillStyle = OUTLINE; c.beginPath(); c.moveTo(h.x - 42, h.y - 14); c.lineTo(h.x + 42, h.y - 14); c.lineTo(h.x + 48, h.y + 14); c.lineTo(h.x - 48, h.y + 14); c.closePath(); c.fill();
    if (open > 0.02) {
      c.fillStyle = '#050302'; c.beginPath(); c.moveTo(h.x - 38, h.y - 11); c.lineTo(h.x + 38, h.y - 11); c.lineTo(h.x + 43, h.y + 11); c.lineTo(h.x - 43, h.y + 11); c.closePath(); c.fill();
      if (h.state === 'rumble' || h.state === 'out') { c.fillStyle = '#ffd23a'; circle(c, h.x - 6, h.y + 1, 2.4); c.fill(); circle(c, h.x + 6, h.y + 1, 2.4); c.fill(); }
      c.fillStyle = '#5a3a1e'; c.beginPath(); c.moveTo(h.x - 42, h.y - 14); c.lineTo(h.x + 42, h.y - 14); c.lineTo(h.x + 40, h.y - 14 - 40 * open); c.lineTo(h.x - 40, h.y - 14 - 40 * open); c.closePath(); c.fill();
      c.strokeStyle = OUTLINE; c.lineWidth = 2; c.stroke();
    } else {
      const j = h.state === 'rumble' ? Math.sin(t * 60) * 1.5 : 0;
      c.fillStyle = '#6a4424'; c.beginPath(); c.moveTo(h.x - 38, h.y - 11 + j); c.lineTo(h.x + 38, h.y - 11 - j); c.lineTo(h.x + 43, h.y + 11); c.lineTo(h.x - 43, h.y + 11); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1.5; for (let i = -2; i <= 2; i++) seg(c, h.x + i * 16, h.y - 11, h.x + i * 18, h.y + 11);
      c.fillStyle = '#9a9a9a'; c.fillRect(h.x - 6, h.y - 2, 12, 4);
    }
  },

  drawDog(c, d, t) {
    c.save(); c.translate(d.x, d.y - (d.z || 0)); c.scale(d.face || 1, 1);
    const run = Math.sin(t * 30) * 4;
    c.strokeStyle = OUTLINE; c.lineWidth = 6; c.lineCap = 'round';
    for (const lx of [-10, -4, 8, 14]) seg(c, lx, -10, lx + (lx > 0 ? run : -run) * 0.5, 0);
    c.strokeStyle = '#f4f0e6'; c.lineWidth = 3.4; for (const lx of [-10, -4, 8, 14]) seg(c, lx, -10, lx + (lx > 0 ? run : -run) * 0.5, 0);
    c.fillStyle = OUTLINE; ell(c, 2, -16, 19, 10); c.fill(); c.fillStyle = '#f4f0e6'; ell(c, 2, -16, 16.5, 7.6); c.fill();
    c.fillStyle = '#9a5a2a'; ell(c, -6, -18, 6, 4); c.fill();
    c.strokeStyle = OUTLINE; c.lineWidth = 5; seg(c, -14, -18, -22, -30 + Math.sin(t * 25) * 3); c.strokeStyle = '#f4f0e6'; c.lineWidth = 2.6; seg(c, -14, -18, -22, -30 + Math.sin(t * 25) * 3);
    c.fillStyle = OUTLINE; circle(c, 20, -24, 10); c.fill(); c.fillStyle = '#f4f0e6'; circle(c, 20, -24, 7.8); c.fill();
    c.fillStyle = '#9a5a2a'; ell(c, 16, -30, 4.5, 6, -0.4); c.fill();
    c.fillStyle = OUTLINE; ell(c, 29, -21, 6, 4.2); c.fill(); c.fillStyle = '#f4f0e6'; ell(c, 28, -21, 4.4, 3); c.fill();
    c.fillStyle = '#111'; circle(c, 32, -22, 1.8); c.fill(); circle(c, 22, -26, 1.6); c.fill();
    if (d.bark > 0) { c.fillStyle = '#7a1a1a'; ell(c, 28, -17, 3.5, 2); c.fill(); }
    c.restore();
  },

  drawTrolley(c, h, t) {
    const x = h.x, y = h.y, d = h.dir;
    c.save(); c.translate(x, y); c.scale(d, 1);
    const shake = Math.sin(t * 50) * 1.5;
    c.translate(0, shake * 0.3);
    // rider
    const L = h.look;
    const P = basePose(); P.hipY = BODY.leg - 30; P.fF = [30, 26]; P.fB = [24, 24]; P.aF = [2.6 + Math.sin(t * 12) * 0.2, 0.3]; P.aB = [2.4, 0.5]; P.face = 'o'; P.lean = -0.25;
    c.save(); c.translate(-6, -52); c.scale(0.8, 0.8); const pts = drawBody(c, L, P, {}); drawPint(c, pts.hfx + 3, pts.hfy + 10, 0.8, 1); c.restore();
    // basket
    c.fillStyle = OUTLINE; c.beginPath(); c.moveTo(-58, -86); c.lineTo(52, -86); c.lineTo(40, -26); c.lineTo(-48, -26); c.closePath(); c.fill();
    c.strokeStyle = '#b8c0c8'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(-55, -83); c.lineTo(49, -83); c.lineTo(38, -29); c.lineTo(-46, -29); c.closePath(); c.stroke();
    for (let i = -48; i <= 40; i += 11) seg(c, i, -83, i * 0.92 - 2, -29);
    for (let j = -72; j <= -34; j += 12) seg(c, -54 + (j + 83) * 0.15, j, 48 - (j + 83) * 0.2, j);
    c.strokeStyle = OUTLINE; c.lineWidth = 6; seg(c, -58, -90, -74, -100); c.strokeStyle = '#d0302a'; c.lineWidth = 4; seg(c, -60, -91, -76, -101);
    c.strokeStyle = '#b8c0c8'; c.lineWidth = 3; seg(c, -44, -26, -40, -8); seg(c, 36, -26, 32, -8);
    for (const wx of [-40, 32]) { c.fillStyle = OUTLINE; circle(c, wx, -6, 7.5); c.fill(); c.fillStyle = '#3a3a3a'; circle(c, wx, -6, 5); c.fill(); }
    c.restore();
  },

  drawPickup(c, p, t) {
    const y = p.y - p.z;
    if (p.life < 3 && Math.sin(t * 20) > 0.3) return;
    c.save();
    if (p.kind === 'pint') {
      drawPint(c, p.x, y, 1.15, p.settle);
      if (p.landed && p.settle < 1) { c.font = '800 12px ' + FONT_B; c.textAlign = 'center'; txt(c, 'SETTLING', p.x, y - 46, '#f2e6c4', OUTLINE, 4); }
    } else if (p.kind === 'toastie') {
      c.fillStyle = OUTLINE; ell(c, p.x, y - 2, 22, 7); c.fill(); c.fillStyle = '#f4f0e6'; ell(c, p.x, y - 3, 19, 5.5); c.fill();
      c.fillStyle = OUTLINE; c.beginPath(); c.moveTo(p.x - 16, y - 6); c.lineTo(p.x + 16, y - 6); c.lineTo(p.x, y - 30); c.closePath(); c.fill();
      c.fillStyle = '#d99a4a'; c.beginPath(); c.moveTo(p.x - 12, y - 8); c.lineTo(p.x + 12, y - 8); c.lineTo(p.x, y - 26); c.closePath(); c.fill();
      c.strokeStyle = '#8a5a22'; c.lineWidth = 1.5; seg(c, p.x - 6, y - 10, p.x + 2, y - 22); seg(c, p.x + 2, y - 10, p.x + 8, y - 19);
      c.fillStyle = '#ffd23a'; c.fillRect(p.x - 12, y - 9, 24, 2);
    } else if (p.kind === 'crisps') {
      c.save(); c.translate(p.x, y - 14); c.rotate(Math.sin(p.x) * 0.2);
      c.fillStyle = OUTLINE; rr(c, -12, -15, 24, 30, 3); c.fill(); c.fillStyle = '#2f7a3a'; rr(c, -10, -13, 20, 26, 2); c.fill();
      c.fillStyle = '#ffd23a'; circle(c, 0, 0, 6); c.fill(); c.fillStyle = '#f4f0e6'; c.fillRect(-10, -13, 20, 4);
      c.restore();
    } else if (p.kind === 'tea') {
      c.fillStyle = OUTLINE; ell(c, p.x, y - 2, 18, 6); c.fill(); c.fillStyle = '#f4f0e6'; ell(c, p.x, y - 3, 15, 4.5); c.fill();
      c.fillStyle = OUTLINE; rr(c, p.x - 11, y - 22, 22, 19, 5); c.fill(); c.fillStyle = '#f4f0e6'; rr(c, p.x - 9, y - 20, 18, 15, 4); c.fill();
      c.fillStyle = '#8a5a3a'; c.fillRect(p.x - 8, y - 19, 16, 3);
      c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 2; for (let i = 0; i < 2; i++) { c.beginPath(); c.moveTo(p.x - 3 + i * 6, y - 24); c.quadraticCurveTo(p.x + 3 + i * 6 + Math.sin(t * 3 + i) * 3, y - 32, p.x - 2 + i * 6, y - 40); c.stroke(); }
    }
    c.restore();
  },

  drawProjectile(c, p, t) {
    const x = p.x, y = p.y - p.z;
    if (p.kind === 'dart') {
      const a = Math.atan2(p.vy * 0.5, p.vx);
      c.save(); c.translate(x, y); c.rotate(a);
      c.strokeStyle = OUTLINE; c.lineWidth = 4.5; seg(c, -14, 0, 12, 0);
      c.strokeStyle = p.team === 0 ? '#ffd23a' : '#d8d8d8'; c.lineWidth = 2; seg(c, -14, 0, 12, 0);
      c.fillStyle = p.team === 0 ? '#2f7a3a' : '#e23b3b'; c.beginPath(); c.moveTo(-10, 0); c.lineTo(-19, -6); c.lineTo(-19, 6); c.closePath(); c.fill();
      c.restore();
    } else if (p.kind === 'turf') {
      c.save(); c.translate(x, y); c.rotate(p.t * 9);
      c.fillStyle = OUTLINE; c.fillRect(-11, -8, 22, 16); c.fillStyle = '#4a2e18'; c.fillRect(-9, -6, 18, 12);
      c.fillStyle = '#6a4424'; c.fillRect(-9, -6, 18, 3); c.restore();
    } else if (p.kind === 'crisps') {
      for (let i = 0; i < 7; i++) { const ox = Math.sin(i * 2.3 + p.t * 9) * 16, oy = Math.cos(i * 1.7 + p.t * 7) * 12; c.fillStyle = OUTLINE; ell(c, x + ox, y + oy, 6, 4.4, i); c.fill(); c.fillStyle = '#f2c84a'; ell(c, x + ox, y + oy, 4.4, 3, i); c.fill(); }
    } else if (p.kind === 'mat') {
      c.save(); c.translate(x, y); c.scale(1, Math.abs(Math.cos(p.t * 12)) * 0.8 + 0.2);
      c.fillStyle = OUTLINE; circle(c, 0, 0, 11); c.fill(); c.fillStyle = '#efe4c8'; circle(c, 0, 0, 9); c.fill(); c.strokeStyle = '#b0302a'; c.lineWidth = 2; circle(c, 0, 0, 6); c.stroke();
      c.restore();
    } else if (p.kind === 'sambuca') {
      c.save(); c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(255,' + (120 + i * 25) + ',40,' + (0.5 - i * 0.08) + ')'; circle(c, x - p.vx * 0.012 * i, y + (p.vz - p.vy) * 0.01 * i, 12 - i * 1.6); c.fill(); }
      c.restore();
      c.fillStyle = OUTLINE; c.fillRect(x - 6, y - 4, 12, 12); c.fillStyle = 'rgba(200,230,255,0.85)'; c.fillRect(x - 4.5, y - 2.5, 9, 9);
    }
  },

  drawParticles(c, list) {
    for (const p of list) {
      const k = p.life / p.max, x = p.x, y = p.y - (p.z || 0);
      switch (p.kind) {
        case 'spark': c.strokeStyle = 'rgba(255,240,200,' + k + ')'; c.lineWidth = 3 * k + 1; seg(c, x, y, x - p.vx * 0.03, y - (p.vy - (p.vz || 0)) * 0.03); break;
        case 'star': c.fillStyle = 'rgba(255,215,80,' + k + ')'; star(c, x, y, p.size * (0.5 + k * 0.5), p.size * 0.3, 5, p.rot); c.fill(); break;
        case 'drop': c.fillStyle = p.color; c.globalAlpha = k; circle(c, x, y, p.size); c.fill(); c.globalAlpha = 1; break;
        case 'dust': c.fillStyle = 'rgba(214,176,120,' + k * 0.6 + ')'; circle(c, x, y, p.size * (1.6 - k * 0.6)); c.fill(); break;
        case 'fire': c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = 'rgba(255,' + (100 + 120 * k) + ',40,' + k * 0.8 + ')'; circle(c, x, y, p.size * (0.5 + k)); c.fill(); c.restore(); break;
        case 'glass': c.fillStyle = 'rgba(210,235,255,' + k + ')'; c.save(); c.translate(x, y); c.rotate(p.rot); c.fillRect(-3, -1.5, 6, 3); c.restore(); break;
        case 'crisp': c.fillStyle = 'rgba(242,200,74,' + k + ')'; ell(c, x, y, p.size, p.size * 0.7, p.rot); c.fill(); break;
        case 'foam': c.fillStyle = 'rgba(242,230,196,' + k + ')'; circle(c, x, y, p.size * (0.6 + k * 0.4)); c.fill(); break;
        case 'ring': c.strokeStyle = 'rgba(255,240,200,' + k * 0.8 + ')'; c.lineWidth = 4 * k; ell(c, x, y, p.size * (1.6 - k), p.size * 0.3 * (1.6 - k)); c.stroke(); break;
        default: break;
      }
    }
  },

  drawPopups(c, list) {
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const p of list) {
      const k = clamp(p.t / 0.18, 0, 1), fade = clamp(p.life / 0.4, 0, 1);
      const sz = p.size * (p.t < 0.18 ? easeOutBack(k) : 1);
      c.globalAlpha = fade;
      c.font = '900 ' + Math.round(sz) + 'px ' + FONT_D;
      txt(c, p.text, p.x, p.y, p.color, OUTLINE, Math.max(4, sz * 0.2));
      c.globalAlpha = 1;
    }
  },

  /* ---------------------------------------------------- HUD (screen px) */
  drawHUD(c, G, W, H, sf) {
    const p = G.player; if (!p) return;
    const k = clamp(H / 390, 0.82, 1.3);
    const x0 = sf.l + 12, y0 = sf.t + 10;
    const band = c.createLinearGradient(0, 0, 0, sf.t + 104 * k); band.addColorStop(0, 'rgba(8,4,2,0.72)'); band.addColorStop(1, 'rgba(8,4,2,0)');
    c.fillStyle = band; c.fillRect(0, 0, W, sf.t + 104 * k);
    // portrait disc
    const pr = 23 * k, px = x0 + pr, py = y0 + pr;
    c.fillStyle = OUTLINE; circle(c, px, py, pr + 3); c.fill();
    c.fillStyle = '#1c7a3e'; circle(c, px, py, pr); c.fill();
    c.save(); circle(c, px, py, pr); c.clip(); c.translate(px - 7 * k, py + 128 * k); c.scale(0.98 * k, 0.98 * k); drawBody(c, p.look, Object.assign(basePose(), { face: p.hp < p.maxHp * 0.25 ? 'a' : 'n', aF: [0.3, 0.2], aB: [0.2, 0.2] }), {}); c.restore();
    c.strokeStyle = '#d4a846'; c.lineWidth = 2; circle(c, px, py, pr + 1); c.stroke();
    // name + bars
    const bx = x0 + pr * 2 + 10 * k, bw = clamp(W * 0.24, 150, 250) * k * 0.9, bh = 13 * k;
    c.font = '900 ' + Math.round(12 * k) + 'px ' + FONT_D; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    txt(c, 'MOSSIE', bx, y0 + 12 * k, '#f3e6c4', OUTLINE, 4);
    if (p.vengeance) { c.font = '900 ' + Math.round(10 * k) + 'px ' + FONT_D; txt(c, 'VENGEANCE', bx + 62 * k, y0 + 12 * k, '#ff5a40', OUTLINE, 4); }
    const hy = y0 + 17 * k;
    c.fillStyle = OUTLINE; rr(c, bx - 2, hy - 2, bw + 4, bh + 4, 4); c.fill();
    c.fillStyle = '#3a1410'; rr(c, bx, hy, bw, bh, 3); c.fill();
    const hp = clamp(p.hpShown / p.maxHp, 0, 1), hpReal = clamp(p.hp / p.maxHp, 0, 1);
    c.fillStyle = '#f2e6c4'; rr(c, bx, hy, bw * hp, bh, 3); c.fill();
    c.fillStyle = hpReal > 0.5 ? '#3fae5a' : hpReal > 0.25 ? '#e8b23a' : '#e2433a'; rr(c, bx, hy, Math.max(0, bw * hpReal), bh, 3); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(bx + 2, hy + 2, Math.max(0, bw * hpReal - 4), bh * 0.3);
    c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = 1; for (let i = 1; i < 10; i++) seg(c, bx + (bw * i) / 10, hy + 2, bx + (bw * i) / 10, hy + bh - 2);
    const wy = hy + bh + 5 * k, wh = 6 * k;
    c.fillStyle = OUTLINE; rr(c, bx - 2, wy - 2, bw * 0.7 + 4, wh + 4, 3); c.fill();
    c.fillStyle = '#2a2016'; c.fillRect(bx, wy, bw * 0.7, wh);
    c.fillStyle = p.wind < 25 ? '#e2433a' : '#d9c48a'; c.fillRect(bx, wy, bw * 0.7 * clamp(p.wind / 100, 0, 1), wh);
    c.font = '700 ' + Math.round(9 * k) + 'px ' + FONT_B; txt(c, 'WIND', bx + bw * 0.7 + 7 * k, wy + wh, '#d9c48a', OUTLINE, 3);
    // timer beer mat + craic meter (top centre)
    const cx = W / 2, mr = 24 * k, my = y0 + mr;
    c.fillStyle = OUTLINE; circle(c, cx, my, mr + 3); c.fill();
    c.fillStyle = '#efe4c8'; circle(c, cx, my, mr); c.fill();
    c.strokeStyle = '#b0302a'; c.lineWidth = 2.5 * k; circle(c, cx, my, mr - 4 * k); c.stroke();
    c.textAlign = 'center'; c.textBaseline = 'middle';
    let tstr;
    if (G.timeLeft == null) tstr = roman(Math.max(1, G.waveNum || 1));
    else { const tl = Math.max(0, Math.ceil(G.timeLeft)); tstr = Math.floor(tl / 60) + ':' + String(tl % 60).padStart(2, '0'); }
    const urgent = G.timeLeft != null && G.timeLeft < 20 && Math.sin(G.time * 12) > 0;
    c.font = '800 ' + Math.round(15 * k) + 'px ' + FONT_B; c.fillStyle = urgent ? '#c0202a' : '#2a1a10'; c.fillText(tstr, cx, my + 1);
    c.font = '900 ' + Math.round(8 * k) + 'px ' + FONT_D;
    txt(c, G.timeLeft == null ? 'LOCK-IN' : G.timeLeft < 20 ? 'LAST ORDERS' : 'TIME', cx, my + mr + 9 * k, urgent ? '#ff6a5a' : '#f3e6c4', OUTLINE, 3);
    const cw = clamp(W * 0.26, 170, 280) * k * 0.85, ch = 11 * k, cyy = my + mr + 18 * k;
    const full = G.craic >= 90;
    c.fillStyle = OUTLINE; rr(c, cx - cw / 2 - 2, cyy - 2, cw + 4, ch + 4, 4); c.fill();
    c.fillStyle = '#20140c'; rr(c, cx - cw / 2, cyy, cw, ch, 3); c.fill();
    const cg = c.createLinearGradient(cx - cw / 2, 0, cx + cw / 2, 0); cg.addColorStop(0, '#7a3a1a'); cg.addColorStop(0.6, '#e8902a'); cg.addColorStop(1, '#ffe08a');
    c.fillStyle = full ? (Math.sin(G.time * 10) > 0 ? '#ffe08a' : '#ffb03a') : cg; rr(c, cx - cw / 2, cyy, cw * clamp(G.craic / 90, 0, 1), ch, 3); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.4)'; c.lineWidth = 1; for (const q of [30, 60]) { const qx = cx - cw / 2 + (cw * q) / 90; seg(c, qx, cyy + 1, qx, cyy + ch - 1); }
    c.font = '900 ' + Math.round(9 * k) + 'px ' + FONT_D;
    txt(c, full ? 'THE CRAIC IS NINETY' : 'CRAIC  ' + Math.floor(G.craic) + ' / 90', cx, cyy + ch + 9 * k, full ? '#ffe08a' : '#f3e6c4', OUTLINE, 3);
    // right side: boss bar or lads left
    const rx = W - sf.r - 62, ry = y0 + 6 * k;
    const boss = G.fighters.find((f) => f.A.boss && f.team === 1 && f.state !== 'ko');
    c.textAlign = 'right'; c.textBaseline = 'alphabetic';
    if (boss) {
      const bw2 = clamp(W * 0.25, 150, 260) * k * 0.85;
      c.font = '900 ' + Math.round(11 * k) + 'px ' + FONT_D; txt(c, boss.A.name.toUpperCase(), rx, ry + 8 * k, '#f3e6c4', OUTLINE, 4);
      c.fillStyle = OUTLINE; rr(c, rx - bw2 - 2, ry + 12 * k, bw2 + 4, 12 * k + 4, 4); c.fill();
      c.fillStyle = '#3a1410'; rr(c, rx - bw2, ry + 14 * k, bw2, 12 * k, 3); c.fill();
      const bp = clamp(boss.hp / boss.maxHp, 0, 1);
      c.fillStyle = '#b0302a'; rr(c, rx - bw2 * bp, ry + 14 * k, bw2 * bp, 12 * k, 3); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.2)'; c.fillRect(rx - bw2 * bp + 2, ry + 16 * k, Math.max(0, bw2 * bp - 4), 3 * k);
    } else {
      const left = G.enemiesLeft();
      c.font = '900 ' + Math.round(11 * k) + 'px ' + FONT_D;
      txt(c, G.mode === 'lockin' ? 'ROUND ' + roman(G.waveNum || 1) : 'ROUND ' + roman(clamp((G.waveIdx || 0) + 1, 1, G.waves ? G.waves.length : 1)) + ' OF ' + roman(G.waves ? G.waves.length : 1), rx, ry + 8 * k, '#f3e6c4', OUTLINE, 4);
      c.font = '700 ' + Math.round(11 * k) + 'px ' + FONT_B;
      txt(c, left === 1 ? '1 lad left standing' : left + ' lads left standing', rx, ry + 23 * k, '#d9c48a', OUTLINE, 3);
    }
    c.font = '800 ' + Math.round(12 * k) + 'px ' + FONT_B;
    txt(c, String(Math.floor(G.score)).padStart(6, '0'), rx, ry + 42 * k, '#f3e6c4', OUTLINE, 4);
    // pause beer mat
    const pb = Input.B.pause;
    c.fillStyle = OUTLINE; circle(c, pb.x, pb.y, pb.r + 2.5); c.fill();
    c.fillStyle = '#efe4c8'; circle(c, pb.x, pb.y, pb.r); c.fill();
    c.fillStyle = '#2a1a10'; c.fillRect(pb.x - 5, pb.y - 6, 3.6, 12); c.fillRect(pb.x + 1.4, pb.y - 6, 3.6, 12);
    // combo
    if (G.combo >= 3 && G.comboT < 1.6) {
      const a = clamp((1.6 - G.comboT) / 0.4, 0, 1);
      c.globalAlpha = a; c.textAlign = 'right';
      const word = (COMBO_WORDS.find((w) => G.combo >= w[0]) || [0, ''])[1];
      c.font = '900 ' + Math.round(30 * k) + 'px ' + FONT_D; txt(c, G.combo + ' HITS', W - sf.r - 20, H * 0.42, '#ffe08a', OUTLINE, 7);
      if (word) { c.font = '900 ' + Math.round(15 * k) + 'px ' + FONT_D; txt(c, word + '!', W - sf.r - 20, H * 0.42 + 22 * k, '#f3e6c4', OUTLINE, 5); }
      c.globalAlpha = 1;
    }
  },

  drawOffscreen(c, G, cam, W, H) {
    for (const f of G.fighters) {
      if (f.team !== 1 || f.state === 'ko' || f.state === 'enter') continue;
      const sx = (f.x - cam.left) * cam.k, sy = (f.y - 70 - cam.top) * cam.k;
      if (sx >= -10 && sx <= W + 10) continue;
      const left = sx < 0, x = left ? 18 + cam.sl : W - 18 - cam.sr, y = clamp(sy, 90, H - 40);
      c.fillStyle = f.state === 'attack' ? '#ff4a3a' : '#f3e6c4';
      c.strokeStyle = OUTLINE; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x + (left ? -10 : 10), y); c.lineTo(x + (left ? 6 : -6), y - 11); c.lineTo(x + (left ? 6 : -6), y + 11); c.closePath(); c.stroke(); c.fill();
    }
  },

  drawControls(c, G, W, H) {
    const B = Input.B, J = Input.joy;
    const p = G.player;
    // joystick
    if (J.active) {
      c.fillStyle = 'rgba(20,12,7,0.35)'; circle(c, J.bx, J.by, J.R + 8); c.fill();
      c.strokeStyle = 'rgba(243,230,196,0.55)'; c.lineWidth = 3; circle(c, J.bx, J.by, J.R + 8); c.stroke();
      c.fillStyle = 'rgba(243,230,196,0.85)'; circle(c, J.bx + J.vx * J.R, J.by + J.vy * J.R, J.R * 0.48); c.fill();
      c.strokeStyle = OUTLINE; c.lineWidth = 3; circle(c, J.bx + J.vx * J.R, J.by + J.vy * J.R, J.R * 0.48); c.stroke();
    } else if (Input.usingTouch) {
      c.strokeStyle = 'rgba(243,230,196,0.28)'; c.lineWidth = 3; circle(c, J.gx, J.gy, J.R + 8); c.stroke();
      c.fillStyle = 'rgba(243,230,196,0.16)'; circle(c, J.gx, J.gy, J.R * 0.48); c.fill();
      c.font = '800 11px ' + FONT_B; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(243,230,196,0.5)'; c.fillText('MOVE', J.gx, J.gy);
    }
    if (!Input.usingTouch) return;
    const full = G.craic >= 90;
    const btn = (name, label, fill, icon) => {
      const b = B[name], down = Input.isDown(name);
      const r = b.r * (down ? 0.92 : 1);
      c.fillStyle = 'rgba(10,6,3,0.45)'; circle(c, b.x, b.y + 3, r + 3); c.fill();
      c.fillStyle = OUTLINE; circle(c, b.x, b.y, r + 3); c.fill();
      c.fillStyle = down ? shade(fill, 1.25) : fill; c.globalAlpha = down ? 0.92 : 0.74; circle(c, b.x, b.y, r); c.fill(); c.globalAlpha = 1;
      c.strokeStyle = 'rgba(255,240,200,0.45)'; c.lineWidth = 2; c.beginPath(); c.arc(b.x, b.y, r - 3, Math.PI * 1.1, Math.PI * 1.75); c.stroke();
      icon(b.x, b.y, r);
      c.font = '900 ' + Math.round(Math.max(9, r * 0.27)) + 'px ' + FONT_D; c.textAlign = 'center'; c.textBaseline = 'middle';
      txt(c, label, b.x, b.y + r + 9, '#f3e6c4', OUTLINE, 3.5);
    };
    btn('shield', 'BLOCK', '#7a4a22', (x, y, r) => drawBodhran(c, x, y, r * 0.5, r * 0.56, 0, (h) => h));
    btn('dodge', 'LEG IT', '#2c5a7a', (x, y, r) => { c.strokeStyle = '#f3e6c4'; c.lineWidth = r * 0.12; c.lineCap = 'round'; for (let i = 0; i < 3; i++) seg(c, x - r * 0.5, y - r * 0.3 + i * r * 0.3, x - r * 0.1, y - r * 0.3 + i * r * 0.3); c.beginPath(); c.moveTo(x, y - r * 0.4); c.lineTo(x + r * 0.45, y); c.lineTo(x, y + r * 0.4); c.stroke(); });
    btn('crowd', full ? 'UNLEASH HELL' : 'TAUNT', full ? (Math.sin(G.time * 10) > 0 ? '#e8582a' : '#c03a1a') : '#5b2a86', (x, y, r) => {
      if (full) { c.fillStyle = '#ffe08a'; c.beginPath(); c.moveTo(x, y - r * 0.6); c.quadraticCurveTo(x + r * 0.5, y - r * 0.1, x + r * 0.28, y + r * 0.45); c.quadraticCurveTo(x, y + r * 0.62, x - r * 0.28, y + r * 0.45); c.quadraticCurveTo(x - r * 0.5, y - r * 0.1, x, y - r * 0.6); c.fill(); c.fillStyle = '#e8582a'; ell(c, x, y + r * 0.22, r * 0.14, r * 0.24); c.fill(); }
      else { c.strokeStyle = '#f3e6c4'; c.lineWidth = r * 0.13; c.lineCap = 'round'; c.fillStyle = '#f3e6c4'; circle(c, x, y - r * 0.28, r * 0.17); c.fill(); seg(c, x, y - r * 0.08, x, y + r * 0.32); seg(c, x, y, x - r * 0.42, y - r * 0.42); seg(c, x, y, x + r * 0.42, y - r * 0.42); seg(c, x, y + r * 0.32, x - r * 0.22, y + r * 0.6); seg(c, x, y + r * 0.32, x + r * 0.22, y + r * 0.6); }
    });
    btn('strike', 'STRIKE', '#1c7a3e', (x, y, r) => { c.save(); c.translate(x, y); c.rotate(-0.7); drawWeapon(c, 'hurley', -r * 0.05, r * 0.42, Math.PI, (h) => h); c.restore(); });
    if (p && p.state === 'charge') {
      const b = B.strike; c.strokeStyle = p.charge >= 1 ? '#ffe08a' : '#ffb03a'; c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.arc(b.x, b.y, b.r + 8, -Math.PI / 2, -Math.PI / 2 + TAU * p.charge); c.stroke();
    }
    if (full) { const b = B.crowd; c.strokeStyle = 'rgba(255,200,90,' + (0.5 + 0.5 * Math.sin(G.time * 10)) + ')'; c.lineWidth = 4; circle(c, b.x, b.y, b.r + 9); c.stroke(); }
  },

  drawBanners(c, G, W, H) {
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const k = clamp(H / 390, 0.82, 1.4);
    for (const b of G.banners) {
      const t = b.t, inK = clamp(t / 0.28, 0, 1), out = clamp(b.life / 0.35, 0, 1);
      const sc = t < 0.28 ? easeOutBack(inK) : 1;
      c.globalAlpha = out;
      const y = H * (b.y || 0.4);
      const sz = Math.min(b.size * k, (W * 0.92) / Math.max(4, b.text.length * 0.72));
      c.save(); c.translate(W / 2, y); c.scale(sc, sc);
      c.font = '900 ' + Math.round(sz) + 'px ' + FONT_D;
      txt(c, b.text, 0, 0, b.color || '#f3e6c4', OUTLINE, Math.max(5, sz * 0.18));
      if (b.sub) { c.font = '800 ' + Math.round(Math.min(sz * 0.42, 22 * k)) + 'px ' + FONT_B; txt(c, b.sub, 0, sz * 0.78, '#e8c05a', OUTLINE, 5); }
      c.restore();
      c.globalAlpha = 1;
    }
  },

  drawHint(c, G, W, H, sf) {
    const h = G.hint; if (!h) return;
    const k = clamp(H / 390, 0.82, 1.3);
    const a = clamp(h.t / 0.25, 0, 1) * clamp(h.life / 0.3, 0, 1);
    if (a <= 0) return;
    let ax = W / 2, ay = H * 0.6, tx = W / 2, ty = H * 0.62;
    const B = Input.B, touch = Input.usingTouch;
    if (touch && h.anchor && B[h.anchor]) { const b = B[h.anchor]; ax = b.x; ay = b.y - b.r - 10; tx = clamp(b.x - 210 * k, W * 0.32, W - 220 * k); ty = b.y - b.r - 70 * k; }
    else if (touch && h.anchor === 'joy') { ax = Input.joy.gx; ay = Input.joy.gy - 70 * k; tx = Input.joy.gx + 120 * k; ty = Input.joy.gy - 110 * k; }
    else if (h.anchor === 'craic') { ax = W / 2; ay = sf.t + 100 * k; tx = W / 2; ty = sf.t + 140 * k; }
    const text = touch ? h.text : (h.keys || h.text);
    c.font = '800 ' + Math.round(14 * k) + 'px ' + FONT_B;
    const lines = wrapText(c, text, Math.min(W * 0.5, 330 * k));
    const lh = 17 * k, bw = Math.max(...lines.map((l) => c.measureText(l).width)) + 24 * k, bh = lines.length * lh + 16 * k;
    const bob = Math.sin(G.time * 5) * 3;
    c.globalAlpha = a;
    const bx = clamp(tx - bw / 2, sf.l + 8, W - sf.r - bw - 8), by = clamp(ty - bh / 2 + bob, sf.t + 90 * k, H - bh - 8);
    c.fillStyle = OUTLINE; rr(c, bx - 3, by - 3, bw + 6, bh + 6, 10); c.fill();
    c.fillStyle = '#f3e6c4'; rr(c, bx, by, bw, bh, 8); c.fill();
    if (touch && (h.anchor === 'joy' || B[h.anchor])) {
      c.strokeStyle = '#f3e6c4'; c.lineWidth = 5; c.lineCap = 'round';
      const sx = clamp(ax, bx + 12, bx + bw - 12), sy = by + bh;
      seg(c, sx, sy, ax, ay + bob);
      c.fillStyle = '#f3e6c4'; c.beginPath(); c.moveTo(ax, ay + 8 + bob); c.lineTo(ax - 9, ay - 6 + bob); c.lineTo(ax + 9, ay - 6 + bob); c.closePath(); c.fill();
    }
    c.fillStyle = '#2a1a10'; c.textAlign = 'center'; c.textBaseline = 'middle';
    lines.forEach((l, i) => c.fillText(l, bx + bw / 2, by + 8 * k + lh * (i + 0.5)));
    c.globalAlpha = 1;
  },

  drawScreenFX(c, G, W, H) {
    const p = G.player;
    if (p && p.vengeance && G.phase === 'fight') {
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(180,20,10,0)'); g.addColorStop(1, 'rgba(180,20,10,' + (0.32 + 0.1 * Math.sin(G.time * 6)) + ')');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
    if (p && p.blind > 0) {
      const a = clamp(p.blind / 0.6, 0, 1);
      c.fillStyle = 'rgba(242,200,74,' + 0.22 * a + ')'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 26; i++) { const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1 * W, y = (Math.sin(i * 78.233) * 12543.21 % 1 + 1) % 1 * H; c.fillStyle = 'rgba(242,200,74,' + 0.85 * a + ')'; ell(c, x, y, 28 + (i % 5) * 9, 18 + (i % 3) * 6, i); c.fill(); c.strokeStyle = 'rgba(160,110,30,' + 0.6 * a + ')'; c.lineWidth = 2; c.stroke(); }
    }
    if (G.flash > 0) { c.fillStyle = 'rgba(255,170,80,' + clamp(G.flash, 0, 0.6) + ')'; c.fillRect(0, 0, W, H); }
    if (G.dim > 0) { c.fillStyle = 'rgba(4,6,14,' + clamp(G.dim, 0, 0.75) + ')'; c.fillRect(0, 0, W, H); }
  },

  /* ---------------------------------------------------- portraits */
  drawPortrait(cv, who) {
    const c = cv.getContext('2d');
    const w = cv.width, h = cv.height;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
    const s = w / 160;
    c.setTransform(s, 0, 0, s, 0, 0);
    const g = c.createRadialGradient(80, 70, 10, 80, 80, 90); g.addColorStop(0, '#5a3a22'); g.addColorStop(1, '#1a0e07');
    c.fillStyle = g; circle(c, 80, 80, 76); c.fill();
    c.save(); circle(c, 80, 80, 74); c.clip();
    if (who === 'narrator') {
      for (let i = 0; i < 14; i++) { const a = Math.PI * (0.65 + i * 0.12); c.fillStyle = i % 2 ? '#2f8f3e' : '#3aa84a'; ell(c, 80 + Math.cos(a) * 46, 84 + Math.sin(a) * 46, 9, 5, a + 1.2); c.fill(); }
      drawPint(c, 80, 112, 2.2, 1);
    } else if (who === 'crowd') {
      for (let i = 0; i < 7; i++) { const x = 20 + i * 21, y = 108 + (i % 2) * 10; c.fillStyle = '#120a06'; circle(c, x, y, 13); c.fill(); ell(c, x, y + 30, 20, 18); c.fill(); c.strokeStyle = '#120a06'; c.lineWidth = 6; c.lineCap = 'round'; seg(c, x - 12, y + 14, x - 18, y - 22); seg(c, x + 12, y + 14, x + 18, y - 22); }
      c.fillStyle = 'rgba(255,200,120,0.2)'; c.fillRect(0, 0, 160, 160);
    } else {
      const L = (who === 'mossie' && this.portraitHelmet) ? Object.assign(LOOKS.mossie(), { hat: 'helmet', hatColor: '#2a2a2a', cage: true }) : LOOKS[who] ? LOOKS[who]() : LOOKS.punter();
      const P = Object.assign(basePose(), { aF: [0.35, 0.4], aB: [0.25, 0.4], face: who === 'commodus' ? 's' : who === 'tigris' || who === 'mossie' ? 'a' : 'n', wa: 2.6 });
      c.translate(70, 336); c.scale(1.9, 1.9);
      drawBody(c, L, P, {});
    }
    c.restore();
    c.setTransform(s, 0, 0, s, 0, 0);
    c.strokeStyle = '#d4a846'; c.lineWidth = 4; circle(c, 80, 80, 75); c.stroke();
    c.strokeStyle = OUTLINE; c.lineWidth = 2; circle(c, 80, 80, 78); c.stroke();
  },

  drawIcon(cv) {
    const c = cv.getContext('2d'), w = cv.width, s = w / 200;
    c.setTransform(s, 0, 0, s, 0, 0);
    const g = c.createRadialGradient(100, 92, 10, 100, 100, 140); g.addColorStop(0, '#2f6a4c'); g.addColorStop(1, '#0e1f17');
    c.fillStyle = g; c.fillRect(0, 0, 200, 200);
    c.strokeStyle = '#d4a846'; c.lineWidth = 7; circle(c, 100, 100, 88); c.stroke();
    for (const sd of [-1, 1]) { c.save(); c.translate(100, 122); c.rotate(sd * 0.7); c.scale(1.8, 1.8); drawWeapon(c, 'hurley', 0, 24, Math.PI, (h) => h); c.restore(); }
    drawPint(c, 100, 162, 2.4, 1);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.18 + i * 0.08), lx = 100 + Math.cos(a) * 74, ly = 100 + Math.sin(a) * 74;
      c.fillStyle = OUTLINE; circle(c, lx, ly, 7); c.fill();
      c.fillStyle = i % 2 ? '#2f8f3e' : '#3aa84a';
      for (let k = 0; k < 3; k++) { const kk = a + (k - 1) * 1.7; circle(c, lx + Math.cos(kk) * 3, ly + Math.sin(kk) * 3, 3.3); c.fill(); }
    }
  },
};

function g2(c, x, y, w, h, curtains) {
  if (curtains) {
    c.fillStyle = '#4a1414'; c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(0,0,0,0.3)'; for (let i = 0; i < 8; i++) c.fillRect(x + i * (w / 8), y, 3, h);
    return;
  }
  const g = c.createLinearGradient(x, y, x, y + h); g.addColorStop(0, '#0d1830'); g.addColorStop(1, '#1d2a48');
  c.fillStyle = g; c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(240,240,220,0.9)'; circle(c, x + w * 0.72, y + h * 0.26, 9); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < 12; i++) c.fillRect(x + Math.random() * w, y + Math.random() * h * 0.6, 1.4, 1.4);
}

function wrapText(c, s, maxW) {
  const words = String(s).split(' '), lines = [];
  let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}
