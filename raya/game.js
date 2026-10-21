'use strict';
/* Raya – Tamagotchi
   Echtzeit, gemütlicher Modus: Werte sinken langsam (auch offline), Raya stirbt nie.
   Bildschirm 384×288: Wohnzimmer in voller Auflösung (scene.js), Minispiele in 192×144 (2× skaliert). */

const W = 192, H = 144, FLOOR = 132, U = 2;
const cv = document.getElementById('screen');
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
const $ = (s) => document.querySelector(s);
const KEY = 'raya-tamagotchi-v1';
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const HOUR = 3600000;

/* ================= Zustand ================= */
function freshState() {
  const t = Date.now();
  return {
    v: 2, born: t, last: t,
    hunger: 85, thirst: 85, fun: 80, energy: 90, clean: 90, health: 100,
    sleeping: false, sick: false, poops: [], pending: [],
    treats: { day: '', n: 0 }, best: { walk: 0, play: 0 },
    counts: { fed: 0, walks: 0, pets: 0, games: 0 },
  };
}
function load() {
  if (window.RAYA_DEMO) return null;   // Demo: immer frisch, nichts laden
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) { s.v = 2; (s.poops || []).forEach((p) => { p.x *= 2; }); }
    if (s && s.v === 2) { s.poops = (s.poops || []).map((p) => (p.y ? p : (({ x, y }) => ({ x, y }))(randomFloorPoint()))); return Object.assign(freshState(), s); }
  } catch (e) { /* kein Speicher */ }
  return null;
}
let S = load();
const firstVisit = !S;
if (!S) S = freshState();
function save() { if (window.RAYA_DEMO) return; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignorieren */ } }

const STATS = [
  ['hunger', 'Satt'], ['thirst', 'Durst'], ['fun', 'Laune'],
  ['energy', 'Energie'], ['clean', 'Pflege'], ['health', 'Gesund'],
];
function clampAll() { for (const [k] of STATS) S[k] = clamp(S[k]); }

/* ================= Simulation ================= */
const pendingNotes = [];
function note(t) { if (!pendingNotes.includes(t)) pendingNotes.push(t); }

function stepMinute(t) {
  const h = 1 / 60, sl = S.sleeping, hr = new Date(t).getHours(), day = hr >= 7 && hr < 22;
  const np = S.poops.length;
  S.hunger -= (sl ? 2.5 : 5) * h;
  S.thirst -= (sl ? 3 : 7) * h;
  S.fun -= ((sl ? 0 : 4) + (S.sick ? 3 : 0) + np * 2) * h;
  S.energy += sl ? 22 * h : -(5 + (S.sick ? 2 : 0)) * h;
  S.clean -= ((sl ? 1 : 2.5) + np * 4) * h;
  let dh = 0;
  if (S.hunger < 15 || S.thirst < 15) dh -= 5;
  if (S.clean < 20) dh -= 3;
  if (np >= 3) dh -= 2;
  if (dh === 0 && !S.sick && S.hunger > 40 && S.thirst > 40 && S.clean > 40) dh = 3;
  S.health += dh * h;
  clampAll();
  if (S.health < 35 && !S.sick) { S.sick = true; note('Raya fühlt sich krank … ab zum Tierarzt!'); }
  for (let i = S.pending.length - 1; i >= 0; i--) {
    if (S.pending[i] <= t) { S.pending.splice(i, 1); if (S.poops.length < 4) { const p = randomFloorPoint(); S.poops.push({ x: p.x, y: p.y }); } }
  }
  if (sl && S.energy >= 100 && day) { S.sleeping = false; note('Raya ist ausgeschlafen und wach!'); }
  if (!sl && S.energy <= 2) { S.sleeping = true; note('Raya ist vor Erschöpfung eingeschlafen.'); }
}
function simulate() {
  const target = Date.now();
  let t = Math.max(S.last, target - 7 * 24 * HOUR);
  while (t + 60000 <= target) { stepMinute(t); t += 60000; }
  S.last = t;
}

/* ================= Sound ================= */
let actx = null, muted = false;
try { muted = localStorage.getItem('raya-mute') === '1'; } catch (e) { /* */ }
function beep(f = 660, d = 0.08, type = 'square', vol = 0.035, slide = 0) {
  if (muted) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.linearRampToValueAtTime(f + slide, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g).connect(actx.destination); o.start(t); o.stop(t + d + 0.02);
  } catch (e) { /* */ }
}
const sfx = {
  tap: () => beep(880, 0.04),
  good: () => { beep(660, 0.07); setTimeout(() => beep(990, 0.09), 80); },
  bad: () => beep(220, 0.18, 'square', 0.04, -60),
  bark: () => { beep(420, 0.07, 'sawtooth', 0.05, -120); setTimeout(() => beep(400, 0.08, 'sawtooth', 0.05, -140), 110); },
  catch: () => beep(1180, 0.05),
  jump: () => beep(520, 0.1, 'square', 0.03, 300),
};
function buzz(ms = 12) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* */ } }

/* ================= UI: Toast, Overlay, HUD ================= */
let toastTimer = 0;
const toastQ = [];
function toast(t, ms = 2400) { toastQ.push([t, ms]); if (!toastTimer) nextToast(); }
function nextToast() {
  const el = $('#toast');
  const n = toastQ.shift();
  if (!n) { el.classList.remove('show'); toastTimer = 0; return; }
  el.textContent = n[0]; el.classList.add('show');
  toastTimer = setTimeout(nextToast, n[1]);
}
function overlay(title, text, btn, cb) {
  const o = $('#overlay');
  o.innerHTML = '';
  const h = document.createElement('h2'); h.textContent = title;
  const p = document.createElement('p'); p.innerHTML = text;
  const b = document.createElement('button'); b.textContent = btn;
  b.addEventListener('click', (e) => { e.stopPropagation(); o.hidden = true; sfx.tap(); cb && cb(); });
  o.append(h, p, b); o.hidden = false;
}

/* ================= Raya-Sprites ================= */
const DOG = {};
const ROOM = {};
const EYES = {
  stand: [[5, 7, 3, 2], [11, 7, 3, 2]],
};
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
function toCanvas(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0); return c;
}
function closedEyes(img, eyes) {
  const c = toCanvas(img), x = c.getContext('2d');
  for (const [ex, ey, ew, eh] of eyes) {
    const p = x.getImageData(ex + 1, ey - 2, 1, 1).data;
    x.fillStyle = `rgb(${p[0]},${p[1]},${p[2]})`; x.fillRect(ex, ey, ew, eh);
    x.fillStyle = '#2a1206'; x.fillRect(ex, ey + eh - 1, ew, 1);
  }
  return c;
}
async function loadDog() {
  // Minispiel-Raya (Bälle fangen / Gassi)
  const rooms = ['day', 'dusk', 'night'];
  const bgs = await Promise.all(rooms.map((p) => loadImg('room-' + p + '.png')));
  rooms.forEach((p, i) => { ROOM[p] = bgs[i]; });
}
/* Zeichnet ein Raya-Sprite mit den Füßen auf y und horizontal zentriert auf cx */
function drawDog(name, cx, y = FLOOR, flip = false, dy = 0) {
  // Minispiel-Koordinaten (192×144); gezeichnet wird die 46-px-Stufe aus dem Atlas in echten Pixeln
  const ts = ATLAS.tiles[name]; if (!ts) return;
  const [sx, sy, w, h] = ts[ts.length - 1], x = Math.round(cx * 2 - w / 2), top = Math.round((y + dy) * 2 - h);
  ctx.save(); ctx.scale(0.5, 0.5);
  if (flip) { ctx.scale(-1, 1); ctx.drawImage(ATLAS.img, sx, sy, w, h, -x - w, top, w, h); }
  else ctx.drawImage(ATLAS.img, sx, sy, w, h, x, top, w, h);
  ctx.restore();
}

/* ================= Hintergrund (96×72, 2× gezeichnet) ================= */
const bgCache = {};
function skyPhase() {
  const h = new Date().getHours();
  return h >= 7 && h < 18 ? 'day' : h >= 18 && h < 21 ? 'dusk' : h >= 5 && h < 7 ? 'dusk' : 'night';
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }
function roomBg(phase) {
  if (bgCache[phase]) return bgCache[phase];
  const [c, x] = makeCanvas(96, 72);
  const R = (col, a, b, w, h) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  R('#efe3cc', 0, 0, 96, 48);
  for (let i = 0; i < 96; i += 6) R('#e8dac0', i, 0, 1, 48);
  R('#b07a4a', 0, 45, 96, 3); R('#8a5a32', 0, 47, 96, 1);
  R('#d9ccb6', 0, 48, 96, 24);
  for (let y = 48; y < 72; y += 6) R('#c6b79d', 0, y, 96, 1);
  for (let y = 48, k = 0; y < 72; y += 6, k++) for (let i = (k % 2) * 6; i < 96; i += 12) R('#c6b79d', i, y, 1, 6);
  const sky = { day: '#8fd0f0', dusk: '#f0a35e', night: '#1c2350' }[phase];
  R('#8a5a32', 61, 7, 26, 22); R(sky, 63, 9, 22, 18);
  if (phase === 'day') { R('#ffffff', 66, 13, 8, 2); R('#ffffff', 68, 12, 4, 1); R('#fff3a6', 80, 10, 3, 3); }
  if (phase === 'dusk') { R('#ffd27a', 70, 21, 6, 6); R('#d9784a', 63, 24, 22, 3); }
  if (phase === 'night') { R('#f7ead2', 78, 11, 3, 3); R('#1c2350', 79, 11, 2, 2); [[66, 12], [71, 17], [75, 11], [68, 22], [82, 20]].forEach(([a, b]) => R('#ffffff', a, b, 1, 1)); }
  R('#8a5a32', 73, 9, 2, 18); R('#8a5a32', 63, 17, 22, 2);
  R('#6f4527', 60, 29, 28, 2);
  R('#24120a', 34, 7, 12, 15); R('#e9a35a', 35, 8, 10, 13); R('#c4552a', 35, 15, 10, 6); R('#24120a', 39, 11, 2, 7);
  const leaf = (lx, ly, rx, ry, col) => {
    for (let yy = -ry; yy <= ry; yy++) for (let xx = -rx; xx <= rx; xx++) {
      if ((xx / rx) ** 2 + (yy / ry) ** 2 > 1) continue;
      const notch = Math.abs(yy) === 1 && Math.abs(xx) > 1 && (xx + 9) % 3 === 0;
      if (!notch) R(col, lx + xx, ly + yy, 1, 1);
    }
  };
  R('#2f6b33', 12, 22, 1, 20); R('#2f6b33', 8, 26, 1, 14);
  leaf(7, 20, 5, 4, '#2f7d3b'); leaf(16, 15, 5, 4, '#3f9a49'); leaf(5, 31, 4, 3, '#3f9a49');
  leaf(17, 27, 5, 3, '#2f7d3b'); leaf(11, 10, 4, 3, '#2f7d3b');
  R('#24120a', 4, 38, 15, 11); R('#c9a26b', 5, 39, 13, 9); R('#a8814e', 5, 42, 13, 1); R('#a8814e', 5, 45, 13, 1);
  for (let i = 6; i < 18; i += 2) R('#e0bd86', i, 40, 1, 1);
  for (let yy = -6; yy <= 6; yy++) for (let xx = -32; xx <= 32; xx++) {
    if ((xx / 32) ** 2 + (yy / 6) ** 2 > 1) continue;
    R(hash(xx + 99, yy + 7) < 0.25 ? '#d8c59e' : '#e6d6b2', 48 + xx, 64 + yy, 1, 1);
  }
  bgCache[phase] = c;
  return c;
}
function drawRoomBg() { const r = ROOM[skyPhase()]; if (r) ctx.drawImage(r, 0, 0, W, H); else ctx.drawImage(roomBg(skyPhase()), 0, 0, W, H); }
/* Gassi-Landschaft: Baumreihe & Wiesenboden aus Alex' Pixelgrafik (walk-trees.png / walk-ground.png),
   gezeichnet in echten Bildschirmpixeln (384×288), mit Parallaxe */
const WALK = { trees: null, ground: null, bush: null };
Promise.all([loadImg('walk-trees.png'), loadImg('walk-ground.png'), loadImg('walk-bush.png')]).then(([t, g, b]) => { WALK.trees = t; WALK.ground = g; WALK.bush = b; }).catch(() => {});
function walkBg(dist) {
  ctx.save(); ctx.scale(0.5, 0.5);            // zurück auf 1:1-Pixel
  const ph = skyPhase(), off = dist * 4;      // Weg in echten Pixeln
  const sky = { day: ['#a9daf3', '#dff2fb'], dusk: ['#f0a35e', '#f7cf8a'], night: ['#1c2350', '#38407a'] }[ph];
  const grd = ctx.createLinearGradient(0, 0, 0, 210); grd.addColorStop(0, sky[0]); grd.addColorStop(1, sky[1]);
  ctx.fillStyle = grd; ctx.fillRect(0, 0, 384, 210);
  // ferne Berge (blass, wie im Vorbild)
  ctx.fillStyle = ph === 'night' ? '#2d3a5c' : ph === 'dusk' ? '#d9a88a' : '#c8d9e8';
  for (let x = 0; x < 384; x += 2) {
    const wx = x + off * 0.08;
    const h = 46 + Math.sin(wx / 61) * 22 + Math.sin(wx / 23 + 1.3) * 8;
    ctx.fillRect(x, Math.round(214 - h), 2, Math.ceil(h));
  }
  // Wiese hinter dem Weg
  ctx.fillStyle = ph === 'night' ? '#2b5a2c' : '#79ad42'; ctx.fillRect(0, 210, 384, 56);
  ctx.fillStyle = ph === 'night' ? '#244d26' : '#669c38'; ctx.fillRect(0, 238, 384, 28);
  // Baumreihe, abwechselnd gespiegelt, mit Lücke
  const T = WALK.trees;
  if (T) {
    const tw = T.width * 2, th = T.height * 2;   // Pixel verdoppelt
    const step = tw + 70, base = 252 - th, o = (off * 0.45) % (step * 2);
    for (let k = -1; k < 4; k++) {
      const x = Math.round(k * step - o), flip = ((k % 2) + 2) % 2 === 1;
      if (x > 384 || x + tw < 0) continue;
      if (flip) { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(T, -x - tw, base, tw, th); ctx.restore(); }
      else ctx.drawImage(T, x, base, tw, th);
    }
  }
  // Weg: Grasplatte (kachelbar) + Erde darunter
  const G2 = WALK.ground;
  if (G2) {
    const gw = G2.width * 2, gh = G2.height * 2, gy = 260, o = off % gw;
    for (let x = -Math.round(o); x < 384; x += gw) ctx.drawImage(G2, x, gy, gw, gh);
    ctx.fillStyle = '#2c4f22'; ctx.fillRect(0, gy + gh, 384, Math.max(0, 288 - gy - gh));
  } else { ctx.fillStyle = '#5fae4e'; ctx.fillRect(0, 262, 384, 26); }
  // Tageszeit-Tönung
  if (ph !== 'day') {
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = ph === 'night' ? '#4a5590' : '#f2b98a'; ctx.fillRect(0, 0, 384, 288);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
}

/* ================= Requisiten (2×) ================= */
const sprCache = {};
function sprite(name) { return sprCache[name] || (sprCache[name] = SPR[name].toCanvas()); }
function drawSpr(name, x, y, flip, u = U) {
  const c = sprite(name), w = c.width * u, h = c.height * u;
  if (flip) { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(c, -Math.round(x) - w, Math.round(y), w, h); ctx.restore(); }
  else ctx.drawImage(c, Math.round(x), Math.round(y), w, h);
}
function px(col, x, y, w = 1, h = 1) { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), w * U, h * U); }

/* ================= Raya im Zimmer (siehe scene.js) ================= */
let anim = null; // {type, t, dur}
let clock = 0;
const particles = [];

function mood() {
  if (S.sleeping) return 'sleep';
  if (S.sick) return 'sick';
  if (Math.min(S.hunger, S.thirst, S.fun, S.clean, S.energy) < 22) return 'sad';
  const avg = (S.hunger + S.thirst + S.fun + S.energy + S.clean + S.health) / 6;
  return avg > 68 ? 'happy' : 'ok';
}
function need() {
  if (S.sick) return 'CROSS';
  if (S.hunger < 30) return 'FOOD';
  if (S.thirst < 30) return 'DROP';
  if (S.poops.length) return 'POOP';
  if (S.clean < 30) return 'TUB';
  if (S.fun < 30) return 'BALL';
  if (S.energy < 22) return 'MOON';
  return null;
}
function statusText() {
  const m = mood();
  if (m === 'sleep') return 'Raya schläft … zzz';
  if (m === 'sick') return 'Raya ist krank';
  const n = need();
  const map = { FOOD: 'Raya hat Hunger', DROP: 'Raya hat Durst', POOP: 'Da liegt ein Häufchen …', TUB: 'Raya braucht ein Bad', BALL: 'Raya ist langweilig', MOON: 'Raya ist müde' };
  if (n) return map[n];
  return m === 'happy' ? 'Raya ist glücklich' : 'Raya ist zufrieden';
}

function tickParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.t > p.life) particles.splice(i, 1);
  }
}
function spark(x, y) { particles.push({ kind: 'SPARK', x, y, vx: 0, vy: -12, t: 0, life: 0.5 }); }
function heart(x, y) { particles.push({ kind: 'MINIHEART', x, y, vx: rnd(-8, 8), vy: -28, t: 0, life: 1.1 }); }
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    drawSpr(p.kind, p.x - 5, p.y - 5);
  }
  ctx.globalAlpha = 1;
}

/* ================= Aktionen ================= */
function play(type, dur, end) { anim = { type, t: 0, dur, end }; }
function busy() { return !!anim || !!G || !!R.jump; }
function todayKey() { const d = new Date(); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
function asleepGuard() {
  if (!S.sleeping) return false;
  toast('Pssst … Raya schläft. (Licht = wecken)'); sfx.bad(); return true;
}

const ACTIONS = [
  { id: 'feed', label: 'Futter', icon: 'FOOD', fn() {
    if (asleepGuard()) return;
    if (S.hunger > 92) { toast('Raya ist pappsatt.'); play('nope', 0.6); return; }
    S.hunger += 35; S.counts.fed++;
    if (S.pending.length < 3) S.pending.push(Date.now() + rnd(2, 4) * HOUR);
    toast('Futter steht bereit!'); sfx.good();
    goTo({ floor: nodePt(BOWL) }, () => { play('eat', 2.4); toast('Mampf mampf …'); });
  } },
  { id: 'treat', label: 'Leckerli', icon: 'BONE', fn() {
    if (asleepGuard()) return;
    const k = todayKey();
    if (S.treats.day !== k) S.treats = { day: k, n: 0 };
    S.treats.n++; S.hunger += 6; S.fun += 10;
    if (S.treats.n > 5) { S.health -= 4; toast('Zu viele Leckerli – Raya kriegt Bauchweh.'); }
    else toast('Leckerli! (' + S.treats.n + '/5 heute)');
    play('treat', 1.6); sfx.bark();
  } },
  { id: 'water', label: 'Wasser', icon: 'DROP', fn() {
    if (asleepGuard()) return;
    if (S.thirst > 95) { toast('Raya hat keinen Durst.'); play('nope', 0.6); return; }
    S.thirst += 45; sfx.good(); toast('Frisches Wasser!');
    goTo({ floor: nodePt(BOWL) }, () => { play('drink', 2.4); toast('Schlabber schlabber …'); });
  } },
  { id: 'walk', label: 'Gassi', icon: 'PAW', fn() { startGame('walk'); } },
  { id: 'play', label: 'Spielen', icon: 'BALL', fn() { startGame('play'); } },
  { id: 'pet', label: 'Kraulen', icon: 'HEART', fn() { pet(); } },
  { id: 'brush', label: 'Baden', icon: 'TUB', fn() {
    if (asleepGuard()) return;
    if (S.clean > 95) { toast('Raya glänzt schon.'); play('nope', 0.6); return; }
    startBath();
  } },
  { id: 'clean', label: 'Putzen', icon: 'POOP', fn() {
    if (!S.poops.length) { toast('Hier ist alles sauber!'); return; }
    S.clean += 8 * S.poops.length; S.poops = []; play('clean', 1); sfx.good(); toast('Weggeräumt!');
  } },
  { id: 'vet', label: 'Tierarzt', icon: 'CROSS', fn() {
    if (asleepGuard()) return;
    if (S.sick) { S.sick = false; S.health = Math.max(S.health, 80); S.fun -= 10; toast('Spritze, fertig – gute Besserung!'); }
    else { S.health += 8; S.fun -= 8; toast('Kerngesund! Den Pieks fand Raya doof.'); }
    play('vet', 2.6); sfx.bad();
  } },
  { id: 'light', label: 'Licht', icon: 'MOON', fn() {
    if (S.sleeping) {
      S.sleeping = false; S.fun -= 4;
      toast(S.energy < 40 ? 'Raya ist noch ganz verschlafen …' : 'Guten Morgen, Raya!');
      play('wake', 1); sfx.tap(); return;
    }
    if (S.energy > 85) { toast('Raya ist noch gar nicht müde.'); play('nope', 0.6); return; }
    S.sleeping = true; goTo(sleepSpot()); toast(EXTRAS.decor.has('hundebett') ? 'Licht aus – Raya kuschelt sich in ihr Bett.' : 'Licht aus – Raya kuschelt sich auf die Couch.'); sfx.tap();
  } },
];
function pet() {
  if (asleepGuard()) return;
  S.fun += 6; S.counts.pets++;
  play('pet', 1.6); sfx.bark();
}

/* ================= Minispiele ================= */
let G = null;
function startGame(mode) {
  if (busy()) return;
  if (asleepGuard()) return;
  if (S.energy < 15) { toast('Raya ist zu müde zum Toben.'); play('nope', 0.6); return; }
  if (S.sick) { toast('Raya ist krank – erst zum Tierarzt.'); play('nope', 0.6); return; }
  toastQ.length = 0; clearTimeout(toastTimer); toastTimer = 0; $('#toast').classList.remove('show');
  if (mode === 'walk') {
    G = { mode, paused: true, t: 0, score: 0, lives: 3, y: 0, vy: 0, obs: [], spawn: 1.4, speed: 84, dist: 0, hitT: 0 };
    overlay('Gassi gehen', 'Tipp auf „Springen“ oder ins Bild.<br>Sammle Leckerli – goldene zählen 5×!<br>Spring über Pfützen, Büsche &amp; Hydranten.<br>Es wird immer schneller – nach 3 Treffern ist Schluss.', 'Los!', () => { G.paused = false; updatePad(); });
  } else {
    G = { mode, paused: true, t: 0, score: 0, lives: 3, balls: [], spawn: 0.6, x: 96, tx: 96, catchT: 0, hurtT: 0 };
    overlay('Bälle fangen', 'Wisch auf dem großen Feld unten (oder im Bild) nach links und rechts und fang die Bälle.<br>Knochen zählen dreifach!<br>Finger weg von Schokolade – 3× erwischt, dann ist Schluss.', 'Los!', () => { G.paused = false; updatePad(); });
  }
  setGameUI(mode);
  updateUI();
}
function hud() {
  const el = $('#hud');
  if (!G || G.paused || G.mode === 'bath') { el.hidden = true; return; }
  el.hidden = false;
  const l = clamp(G.lives, 0, 3), lives = '♥'.repeat(l) + '♡'.repeat(3 - l);
  el.innerHTML = '<span class="hp">' + lives + '</span><span>' + (G.mode === 'walk' ? 'Leckerli ' : 'Bälle ') + G.score + '</span>';
}
const MOUTH_Y = FLOOR - 46 + 13; // Höhe des Mauls im Steh-Sprite
function updateGame(dt) {
  clock += dt;
  tickParticles(dt);
  if (G.paused) return;
  G.t += dt;   // Spieldauer – kein Zeitlimit, Ende nur über die Leben
  if (G.mode === 'play') {
    G.spawn -= dt;
    if (G.spawn <= 0) {
      const lvl = Math.min(1, G.t / 90);   // nach ~1,5 Minuten volle Schwierigkeit
      G.spawn = rnd(0.55, 0.95) * (1 - 0.5 * lvl);
      const r = Math.random(), choc = r < 0.12 + 0.18 * lvl;
      G.balls.push({ x: rnd(30, 162), y: -16, v: rnd(48, 68) + G.t * 0.9, bone: !choc && r < 0.27, choc });
    }
    G.x = clamp(G.tx, 26, 166);   // folgt dem Finger ohne Verzögerung
    G.catchT -= dt; G.hurtT -= dt;
    for (let i = G.balls.length - 1; i >= 0; i--) {
      const b = G.balls[i]; b.y += b.v * dt;
      if (b.y > MOUTH_Y - 12 && b.y < MOUTH_Y + 8 && Math.abs(b.x - G.x) < 11) {
        G.balls.splice(i, 1);
        if (b.choc) { G.lives--; G.hurtT = 0.6; sfx.bad(); buzz(80); for (let k = 0; k < 4; k++) spark(G.x + rnd(-8, 8), MOUTH_Y + rnd(-6, 6)); if (G.lives <= 0) { finishGame(); return; } continue; }
        G.score += b.bone ? 3 : 1; G.catchT = 0.3; sfx.catch(); buzz(8);
        for (let k = 0; k < 3; k++) spark(G.x + rnd(-8, 8), MOUTH_Y + rnd(-6, 6));
      } else if (b.y > H + 8) G.balls.splice(i, 1);
    }
  } else {
    G.speed = Math.min(300, G.speed + dt * (1.5 + G.t * 0.02)); G.dist += (G.speed / U) * dt; G.hitT -= dt;
    G.vy += 560 * dt; G.y = Math.min(0, G.y + G.vy * dt); if (G.y === 0) G.vy = 0;
    G.spawn -= dt;
    if (G.spawn <= 0) {
      G.spawn = rnd(1.0, 1.8) * (84 / G.speed);
      const r = Math.random();
      const o = r < 0.3 ? { k: 'bone', w: 22, h: 14, y: Math.round(rnd(58, 92)), gold: Math.random() < 0.12, ph: rnd(0, 6.28) }
        : r < 0.55 ? { k: 'puddle', w: 26, h: 6, y: FLOOR - 5 }
        : r < 0.8 ? { k: 'bush', w: 21, h: 22, y: FLOOR - 22 }
        : { k: 'hydrant', w: 14, h: 22, y: FLOOR - 22 };
      o.x = W + 8; G.obs.push(o);
    }
    const c = walkTile('side'), dx = 22, top = FLOOR - c[3] + G.y;
    // Trefferfläche: Rumpf und Beine, ohne Schwanz und Schnauzenspitze
    const box = [dx + c[2] * 0.2, top + c[3] * 0.3, dx + c[2] * 0.86, top + c[3] - 1];
    for (let i = G.obs.length - 1; i >= 0; i--) {
      const o = G.obs[i]; o.x -= G.speed * dt;
      if (o.x < -32) { G.obs.splice(i, 1); continue; }
      const hit = o.x + 2 < box[2] && o.x + o.w - 2 > box[0] && o.y + 2 < box[3] && o.y + o.h > box[1];
      if (!hit) continue;
      if (o.k === 'bone') { G.score += o.gold ? 5 : 1; G.obs.splice(i, 1); sfx.catch(); spark(o.x + 10, o.y + 6); if (o.gold) { buzz(20); for (let k = 0; k < 4; k++) spark(o.x + rnd(0, 20), o.y + rnd(-6, 12)); } }
      else if (G.hitT <= 0) { G.lives--; G.hitT = 1.2; sfx.bad(); buzz(60); }
    }
    if (G.lives <= 0) finishGame();
  }
}
/* Gassi-Raya: kleine Stufe aus dem Raya-Atlas (ca. 39 px lang) */
function walkTile(name) { const t = ATLAS.tiles[name]; return t ? t[1] : [0, 0, 39, 29]; }
function jump() {
  if (G && G.mode === 'walk' && !G.paused && G.y === 0) { G.vy = -250; G.y = -0.01; sfx.jump(); }
}
function drawGame() {
  if (G.mode === 'play') {
    drawRoomBg();
    for (const b of G.balls) drawSpr(b.choc ? 'CHOC' : b.bone ? 'BONE' : 'BALL', b.x - (b.bone ? 5 : 4), b.y - (b.choc ? 5 : 4), false, 1);
    const lookUp = G.balls.some((b) => b.y > MOUTH_Y - 40 && Math.abs(b.x - G.x) < 20);
    if (!(G.hurtT > 0 && Math.floor(G.hurtT * 12) % 2)) drawDog(G.catchT > 0 || G.hurtT > 0 ? 'stand-closed' : 'stand', G.x, FLOOR, false, G.catchT > 0 ? -4 : (lookUp ? -1 : 0));
  } else {
    walkBg(G.dist);
    for (const o of G.obs) {
      const ox = Math.round(o.x);
      if (o.k === 'bone') {   // schwebt ruhig auf und ab (halbe Pixel = echte Bildschirmpixel)
        const fy = Math.round(Math.sin(clock * 2.4 + o.ph) * 5) / 2;
        drawSpr(o.gold ? 'GBONE' : 'BONE', ox, o.y + fy);
        if (o.gold && Math.sin(clock * 7 + o.ph) > 0.85) spark(ox + rnd(2, 20), o.y + fy + rnd(-2, 10));
      }
      if (o.k === 'hydrant') drawSpr('HYDRANT', ox, o.y);
      if (o.k === 'puddle') {
        ctx.fillStyle = '#24120a'; ctx.fillRect(ox + 2, o.y, o.w - 4, 8);
        ctx.fillStyle = '#5aa6e0'; ctx.fillRect(ox + 4, o.y + 2, o.w - 8, 4);
        ctx.fillStyle = '#b7e1f7'; ctx.fillRect(ox + 8, o.y + 2, 6, 2);
      }
      if (o.k === 'bush' && WALK.bush) {
        ctx.fillStyle = 'rgba(20,12,6,0.35)'; ctx.fillRect(ox + 1, FLOOR - 1, 21, 2);   // Schatten auf dem Weg
        ctx.drawImage(WALK.bush, ox - 2, o.y + o.h - WALK.bush.height / 2, WALK.bush.width / 2, WALK.bush.height / 2);
      }
    }
    if (!(G.hitT > 0 && Math.floor(G.hitT * 10) % 2)) {
      const f = G.y < 0 ? 1 : Math.floor(G.dist / 5) % 4;
      const name = ['side', 'side-w1', 'side', 'side-w2'][f];
      const [sx, sy, w, h] = walkTile(name), x = 22, y = Math.round(FLOOR - h + G.y + (f % 2 ? -1 : 0));
      ctx.save(); ctx.scale(-1, 1); ctx.drawImage(ATLAS.img, sx, sy, w, h, -x - w, y, w, h); ctx.restore();
    }
  }
  drawParticles();
}
function finishGame() {
  const g = G; G = null; S.counts.games++; setGameUI(null);
  let msg, rec;
  if (g.mode === 'play') {
    const mins = g.t / 60; S.fun += Math.min(38, 10 + g.score * 2); S.energy -= Math.min(22, 8 + mins * 8); S.hunger -= 4; S.thirst -= Math.min(14, 6 + mins * 4);
    rec = g.score > S.best.play; if (rec) S.best.play = g.score;
    msg = g.score + (g.score === 1 ? ' Ball' : ' Bälle') + ' gefangen!' + (rec ? '<br>Neuer Rekord!' : '<br>Rekord: ' + S.best.play);
  } else {
    const mins = g.t / 60; S.fun += Math.min(38, 14 + g.score * 2); S.energy -= Math.min(26, 10 + mins * 9); S.thirst -= Math.min(18, 8 + mins * 5); S.clean -= 10; S.counts.walks++;
    rec = g.score > S.best.walk; if (rec) S.best.walk = g.score;
    msg = g.score + ' Leckerli gefunden!' + (rec ? '<br>Neuer Rekord!' : '<br>Rekord: ' + S.best.walk);
    if (S.pending.length || S.poops.length) {
      S.pending = []; S.clean += 6;
      msg += '<br>Raya hat ihr Geschäft draußen erledigt.';
    }
    msg += '<br>Pfoten sind etwas dreckig.';
  }
  clampAll(); save(); sfx.good();
  placeFloor('start');
  const title = g.mode === 'play' ? 'Super gespielt!' : 'Zurück vom Gassi!';
  overlay(title, msg, 'Weiter', () => play('pet', 1.2));
  updateUI();
  // Pfoten für den Shop – je mehr Punkte, desto mehr (mit Tageslimit)
  if (typeof awardGamePaws === 'function' && g.score > 0) {
    awardGamePaws(g.mode, g.score, rec).then((r) => {
      const p = $('#overlay p'); if (!p || $('#overlay').hidden) return;
      const line = document.createElement('span'); line.className = 'pawline';
      line.textContent = r.paws > 0 ? '+' + r.paws + ' Pfoten' + (r.capped ? ' (Tageslimit erreicht)' : '') : 'Heute gibt es keine Pfoten mehr aus Spielen.';
      p.append(document.createElement('br'), line);
      if (r.paws > 0) sfx.catch();
    }).catch(() => {});
  }
}

/* ================= Baden ================= */
const BATH = { room: null, tub: null, front: null, foam: null };
Promise.all(['bath-room', 'bath-tub', 'bath-tubfront', 'bath-foam'].map((n) => loadImg(n + '.png')))
  .then(([r, t, f, fo]) => Object.assign(BATH, { room: r, tub: t, front: f, foam: fo })).catch(() => {});
const TUB_X = 45, TUB_Y = 139, RAYA_FEET = 212, FOAM_Y = 150, BK = 1.5;   // Raya im Bad 1,5× groß
function bathRaya() { const t = ATLAS.tiles.sit; return t ? t[t.length - 1] : null; }
function startBath() {
  if (busy()) return;
  toastQ.length = 0; clearTimeout(toastTimer); toastTimer = 0; $('#toast').classList.remove('show');
  const tile = bathRaya(); if (!tile) return;
  const [sx, sy, w, h] = tile, x0 = Math.round(192 - w * BK / 2), y0 = RAYA_FEET - Math.round(h * BK);
  // Flecken nur auf sichtbarem Fell oberhalb von Schaum/Wannenrand
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(ATLAS.img, sx, sy, w, h, 0, 0, w, h);
  const px = cx.getImageData(0, 0, w, h).data;
  const n = clamp(4 + Math.round((100 - S.clean) / 10), 4, 13), spots = [];
  for (let tries = 0; spots.length < n && tries < 600; tries++) {
    const lx = Math.round(rnd(5, w - 5)), ly = Math.round(rnd(12, (FOAM_Y + 6 - y0) / BK));
    if (px[(ly * w + lx) * 4 + 3] < 200) continue;
    if (ly > 9 && ly < 27 && lx > 11 && lx < 36) continue;   // Augen & Schnauze frei lassen
    const X = x0 + Math.round(lx * BK), Y = y0 + Math.round(ly * BK);
    if (spots.some((p) => Math.hypot(p.x - X, p.y - Y) < 11)) continue;
    // Schlammfleck als zusammenhängender Pixelklecks (hell-graubraun, gut sichtbar auf dunklem Fell)
    const r = rnd(4, 6.5), pts = [], seed = Math.random() * 10;
    for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
      const ang = Math.atan2(dy, dx), rr = r * (0.9 + 0.1 * Math.sin(ang * 2 + seed) + 0.06 * Math.sin(ang * 3 - seed));
      const d = Math.hypot(dx, dy * 1.15);
      if (d > rr) continue;
      const tx = Math.floor((X + dx - x0) / BK), ty = Math.floor((Y + dy - y0) / BK);   // nur auf Rayas Fell
      if (tx < 0 || ty < 0 || tx >= w || ty >= h || px[(ty * w + tx) * 4 + 3] < 200) continue;
      pts.push([dx, dy, d > rr - 1.3 ? 0 : (dx < -1 && dy < -1 && d < rr * 0.5 ? 2 : 1)]);
    }
    spots.push({ x: X, y: Y, r, a: 1, pts });
  }
  G = { mode: 'bath', paused: false, t: 0, spots, total: spots.length, bubbles: [], fx: -99, fy: -99, down: false, happyT: 0, score: 0 };
  setGameUI('bath'); sfx.good(); updateUI();
}
function bathRub(x, y) {   // x, y in Bildschirmpixeln (384×288)
  if (!G || G.mode !== 'bath') return;
  const d = G.fx < 0 ? 0 : Math.hypot(x - G.fx, y - G.fy); G.fx = x; G.fy = y;
  if (Math.random() < 0.6) G.bubbles.push({ x: x + rnd(-6, 6), y: y + rnd(-6, 6), r: rnd(1.5, 3.5), t: 0, life: rnd(0.6, 1.2), vy: rnd(-14, -4) });
  for (let i = G.spots.length - 1; i >= 0; i--) {
    const p = G.spots[i]; if (Math.hypot(p.x - x, p.y - y) > p.r + 9) continue;
    p.a -= Math.max(0.04, d * 0.02);
    if (p.a <= 0) {
      G.spots.splice(i, 1); sfx.catch(); buzz(8); G.happyT = 0.6;
      for (let k = 0; k < 4; k++) spark((p.x + rnd(-6, 6)) / 2, (p.y + rnd(-6, 6)) / 2);
      if (!G.spots.length) { setTimeout(finishBath, 700); }
    }
  }
}
function updateBath(dt) {
  G.t += dt; G.happyT -= dt;
  for (let i = G.bubbles.length - 1; i >= 0; i--) { const b = G.bubbles[i]; b.t += dt; b.y += b.vy * dt; if (b.t > b.life) G.bubbles.splice(i, 1); }
}
function drawBath() {
  ctx.save(); ctx.scale(0.5, 0.5);
  if (BATH.room) ctx.drawImage(BATH.room, 0, 0); else { ctx.fillStyle = '#9fb7cc'; ctx.fillRect(0, 0, 384, 288); }
  if (BATH.tub) ctx.drawImage(BATH.tub, TUB_X, TUB_Y);
  const tile = bathRaya();
  if (tile) {
    const name = G.happyT > 0 || G.down ? 'sit-closed' : 'sit', t = ATLAS.tiles[name][ATLAS.tiles[name].length - 1];
    const bob = Math.round(Math.sin(G.t * 2.2));
    const dw = Math.round(t[2] * BK), dh = Math.round(t[3] * BK);
    ctx.drawImage(ATLAS.img, t[0], t[1], t[2], t[3], Math.round(192 - dw / 2), RAYA_FEET - dh + bob, dw, dh);
    // Flecken
    for (const p of G.spots) {
      ctx.globalAlpha = Math.max(0, p.a);
      const MUD = ['#3b2a1c', '#8b7356', '#b49c7c'];   // Rand, Schlamm, Glanz
      for (const [dx, dy, k] of p.pts) { ctx.fillStyle = MUD[k]; ctx.fillRect(Math.round(p.x + dx), Math.round(p.y + dy + bob), 1, 1); }
      ctx.globalAlpha = 1;
    }
  }
  if (BATH.foam) ctx.drawImage(BATH.foam, 0, 0, BATH.foam.width, 64, TUB_X + 22, FOAM_Y, 249, 44);
  if (BATH.front) ctx.drawImage(BATH.front, TUB_X, TUB_Y);
  // Seifenblasen unter dem Finger
  for (const b of G.bubbles) {
    const a = 1 - b.t / b.life; ctx.globalAlpha = a;
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#bfe4f7'; ctx.fillRect(Math.round(b.x - b.r * 0.5), Math.round(b.y - b.r * 0.5), 1, 1);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}
function finishBath() {
  if (!G || G.mode !== 'bath') return;
  const g = G; G = null; setGameUI(null);
  const share = 1 - g.spots.length / Math.max(1, g.total);
  S.clean += Math.round(70 * share); S.fun += Math.round(6 * share); S.energy -= 3;
  clampAll(); save();
  placeFloor('start');
  if (share >= 1) { sfx.good(); overlay('Blitzsauber!', 'Raya duftet wieder herrlich.<br>Pflege: ' + Math.round(S.clean) + ' %', 'Weiter', () => play('pet', 1.2)); }
  else overlay('Badezeit vorbei', 'Ein paar Flecken sind geblieben.<br>Pflege: ' + Math.round(S.clean) + ' %', 'Weiter', () => {});
  updateUI();
}

/* ---------- Bedienung während eines Minispiels ---------- */
function setGameUI(mode) {
  document.body.classList.toggle('ingame', !!mode);
  const pad = $('#gamepad'); if (!pad) return;
  pad.hidden = !mode;
  $('#jumpBtn').hidden = mode !== 'walk' && mode !== 'play';
  $('#gameHint').textContent = mode === 'bath' ? 'Wisch die Flecken mit dem Finger weg!' : '';
  $('#gameHint').hidden = mode !== 'bath';
  updatePad();
  $('#quitBtn').textContent = mode === 'bath' ? 'Fertig' : 'Spiel beenden';
}

/* ================= UI aufbauen ================= */
const statEls = {};
function buildUI() {
  const st = $('#stats');
  for (const [k, label] of STATS) {
    const row = document.createElement('div'); row.className = 'stat';
    row.innerHTML = '<span>' + label + '</span><div class="bar">' + '<i></i>'.repeat(10) + '</div>';
    st.append(row); statEls[k] = row.querySelectorAll('i');
  }
  const ac = $('#actions');
  for (const a of ACTIONS) {
    const b = document.createElement('button'); b.className = 'act'; b.dataset.id = a.id;
    const ic = SPR[a.icon].toCanvas(); ic.style.width = ic.width * 3 + 'px';
    const l = document.createElement('span'); l.textContent = a.label;
    b.append(ic, l);
    b.addEventListener('click', () => {
      if (busy()) return;
      if (!['feed', 'water', 'light', 'clean', 'walk', 'play'].includes(a.id)) stopMoving();
      sfx.tap(); buzz(); a.fn(); clampAll(); save(); updateUI();
    });
    ac.append(b);
  }
}
function updateUI() {
  for (const [k] of STATS) {
    const v = S[k], n = Math.ceil(v / 10), col = v > 60 ? 'var(--good)' : v > 30 ? 'var(--mid)' : 'var(--bad)';
    statEls[k].forEach((el, i) => { el.className = i < n ? 'on' : ''; el.style.setProperty('--c', col); });
  }
  $('#status').textContent = G ? (G.mode === 'walk' ? 'Gassi-Zeit!' : G.mode === 'bath' ? 'Badezeit!' : 'Fang den Ball!') : statusText();
  const days = Math.floor((Date.now() - S.born) / (24 * HOUR)) + 1;
  $('#age').textContent = 'Tag ' + days;
  const alerts = { vet: S.sick, clean: S.poops.length > 0, feed: S.hunger < 30, water: S.thirst < 30, light: S.sleeping || S.energy < 22, brush: S.clean < 30, play: S.fun < 30 };
  document.querySelectorAll('.act').forEach((b) => {
    b.classList.toggle('alert', !!alerts[b.dataset.id]);
    b.classList.toggle('dim', S.sleeping && b.dataset.id !== 'light' && b.dataset.id !== 'clean');
  });
  $('#muteBtn').textContent = muted ? 'Ton aus' : 'Ton an';
  hud();
}

/* ================= Eingabe ================= */
function toLogical(e) {
  const r = cv.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width) * RW, ((e.clientY - r.top) / r.height) * RH];
}
cv.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const [x, y] = toLogical(e);
  if (G) {
    if (G.mode === 'walk') jump(); else if (G.mode === 'bath') { G.down = true; G.fx = -99; bathRub(x, y); } else G.tx = x / 2;
    return;
  }
  sceneTap(x, y);
});
cv.addEventListener('pointermove', (e) => {
  if (G && G.mode === 'play' && (e.buttons || e.pointerType !== 'mouse')) G.tx = toLogical(e)[0] / 2;
  if (G && G.mode === 'bath' && G.down) { const [x, y] = toLogical(e); bathRub(x, y); }
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => cv.addEventListener(t, () => { if (G && G.mode === 'bath') { G.down = false; G.fx = -99; } }));
window.addEventListener('keydown', (e) => {
  if (!G || G.paused) return;
  if (G.mode === 'walk' && (e.code === 'Space' || e.code === 'ArrowUp')) { e.preventDefault(); jump(); }
  if (G.mode === 'play') { if (e.code === 'ArrowLeft') G.tx = G.x - 24; if (e.code === 'ArrowRight') G.tx = G.x + 24; }
});
$('#muteBtn').addEventListener('click', () => {
  muted = !muted; try { localStorage.setItem('raya-mute', muted ? '1' : '0'); } catch (e) { /* */ }
  updateUI(); sfx.tap();
});
$('#infoBtn').addEventListener('click', () => {
  const days = Math.floor((Date.now() - S.born) / (24 * HOUR)) + 1;
  $('#infoStats').innerHTML =
    '<li>Alter: ' + days + (days === 1 ? ' Tag' : ' Tage') + '</li>' +
    '<li>Gefüttert: ' + S.counts.fed + '×</li><li>Gekrault: ' + S.counts.pets + '×</li>' +
    '<li>Gassi: ' + S.counts.walks + '× · Rekord ' + S.best.walk + ' Leckerli</li>' +
    '<li>Bälle-Rekord: ' + S.best.play + '</li>';
  $('#info').showModal();
});
$('#closeInfo').addEventListener('click', () => $('#info').close());
/* Schnittstelle für den Cloud-Abgleich */
window.rayaGame = {
  get() { return S; },
  hasProgress() { const c = S.counts || {}; return (c.fed || 0) + (c.walks || 0) + (c.pets || 0) + (c.games || 0) > 0 || Date.now() - S.born > 12 * HOUR; },
  apply(ns) {
    if (!ns || ns.v !== 2) return;
    S = Object.assign(freshState(), ns);
    simulate(); save(); stopMoving();
    if (S.sleeping) placeSleep(); else placeFloor('start');
    updateUI();
  },
};

$('#resetBtn').addEventListener('click', () => {
  if (!confirm('Wirklich neu anfangen? Alle Werte und Rekorde werden zurückgesetzt.')) return;
  S = freshState(); save(); $('#info').close(); placeFloor('start'); updateUI(); toast('Hallo! Ich bin Raya.');
});

/* ================= Entwickler-Cheat ================= */
// 5× schnell auf „Tag X“ tippen → Energie 100 %. Am PC auch per Konsole: rayaCheat.energy()
function cheatEnergy() {
  S.energy = 100; clampAll(); save(); updateUI();
  toast('Dev-Cheat: Energie 100 %'); sfx.good();
}
window.rayaCheat = { energy: cheatEnergy };
(() => {
  let taps = [];
  $('#age').addEventListener('click', () => {
    const t = performance.now();
    taps = taps.filter((x) => t - x < 1500).concat(t);
    if (taps.length >= 5) { taps = []; cheatEnergy(); }
  });
})();

/* ================= Hauptschleife ================= */
let lastT = performance.now(), simT = 0, uiT = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (ts - lastT) / 1000); lastT = ts;
  simT += dt; uiT += dt;
  if (simT > 1) {
    simT = 0; const before = S.sleeping; simulate();
    if (before !== S.sleeping && !S.sleeping) play('wake', 1);
    flushNotes();
  }
  if (G) { if (G.mode === 'bath') { updateBath(dt); tickParticles(dt); } else updateGame(dt); }
  if (G) { ctx.save(); ctx.scale(2, 2); try { if (G.mode === 'bath') { drawBath(); drawParticles(); } else drawGame(); } finally { ctx.restore(); } }
  if (!G) { sceneUpdate(dt); sceneDraw(); }
  if (uiT > 0.5) { uiT = 0; updateUI(); }
}
function flushNotes() { while (pendingNotes.length) toast(pendingNotes.shift(), 3200); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) save(); else { simulate(); flushNotes(); updateUI(); }
});
window.addEventListener('pagehide', save);
setInterval(save, 10000);

buildUI();
const away = Date.now() - S.last;
simulate();
updateUI();
if (firstVisit) toast('Hallo! Ich bin Raya. Kümmerst du dich um mich?', 3600);
else if (away > HOUR) toast('Raya freut sich, dass du wieder da bist!', 2800);
flushNotes();
Promise.all([loadDog(), loadAtlas()]).then(() => { if (S.sleeping) placeSleep(); requestAnimationFrame(loop); }).catch(() => toast('Raya-Bilder konnten nicht geladen werden.'));

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

/* Großes Feld unter dem Bild: startet das Spiel, springt (Gassi) bzw. ist Wischfläche (Bälle) */
function updatePad() {
  const jb = $('#jumpBtn'); if (!jb || !G) return;
  jb.classList.toggle('swipe', G.mode === 'play' && !G.paused);
  jb.textContent = G.paused ? 'Los!' : G.mode === 'walk' ? 'Springen' : '⟵  Hier wischen  ⟶';
}
(() => {
  const jb = document.getElementById('jumpBtn'), qb = document.getElementById('quitBtn');
  if (jb) {
    const steer = (e) => { const r = jb.getBoundingClientRect(); G.tx = 26 + clamp((e.clientX - r.left) / r.width, 0, 1) * 140; };
    jb.addEventListener('pointerdown', (e) => {
      e.preventDefault(); if (!G) return;
      if (G.paused) { G.paused = false; $('#overlay').hidden = true; sfx.tap(); updatePad(); return; }
      jb.classList.add('down');
      if (G.mode === 'walk') jump();
      else if (G.mode === 'play') { try { jb.setPointerCapture(e.pointerId); } catch (x) { /* */ } steer(e); }
    });
    jb.addEventListener('pointermove', (e) => { if (G && G.mode === 'play' && !G.paused && (e.buttons || e.pointerType !== 'mouse')) steer(e); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => jb.addEventListener(t, () => jb.classList.remove('down')));
    jb.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  if (qb) qb.addEventListener('click', () => { if (!G) return; if (G.mode === 'bath') { finishBath(); return; } G.paused = false; $('#overlay').hidden = true; finishGame(); });
})();

/* Vollbild-Knopf (nur wo der Browser es kann und nicht schon als App läuft) */
(() => {
  const b = document.getElementById('fsBtn'), el = document.documentElement;
  if (!b || !el.requestFullscreen || matchMedia('(display-mode: standalone)').matches) return;
  b.hidden = false;
  const lab = () => { b.textContent = document.fullscreenElement ? 'Fenster' : 'Vollbild'; };
  b.addEventListener('click', () => { document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen().catch(() => {}); });
  document.addEventListener('fullscreenchange', lab);
})();
