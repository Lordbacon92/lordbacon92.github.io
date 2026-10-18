'use strict';
/* Raya – Tamagotchi
   Echtzeit, gemütlicher Modus: Werte sinken langsam (auch offline), Raya stirbt nie. */

const W = 96, H = 72, FLOOR = 66;
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
    v: 1, born: t, last: t,
    hunger: 85, thirst: 85, fun: 80, energy: 90, clean: 90, health: 100,
    sleeping: false, sick: false, poops: [], pending: [],
    treats: { day: '', n: 0 }, best: { walk: 0, play: 0 },
    counts: { fed: 0, walks: 0, pets: 0, games: 0 },
  };
}
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.v === 1) return Object.assign(freshState(), s);
  } catch (e) { /* kein Speicher */ }
  return null;
}
let S = load();
const firstVisit = !S;
if (!S) S = freshState();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignorieren */ } }

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
    if (S.pending[i] <= t) { S.pending.splice(i, 1); if (S.poops.length < 4) S.poops.push({ x: poopX() }); }
  }
  if (sl && S.energy >= 100 && day) { S.sleeping = false; note('Raya ist ausgeschlafen und wach!'); }
  if (!sl && S.energy <= 2) { S.sleeping = true; note('Raya ist vor Erschöpfung eingeschlafen.'); }
}
function poopX() {
  for (let k = 0; k < 10; k++) {
    const x = Math.round(rnd(8, 88));
    if (Math.abs(x - 48) > 14 && S.poops.every((p) => Math.abs(p.x - x) > 9)) return x;
  }
  return Math.round(rnd(8, 88));
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

/* ================= Hintergrund ================= */
const bgCache = {};
function skyPhase() {
  const h = new Date().getHours();
  return h >= 7 && h < 18 ? 'day' : h >= 18 && h < 21 ? 'dusk' : h >= 5 && h < 7 ? 'dusk' : 'night';
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; }
function roomBg(phase) {
  if (bgCache[phase]) return bgCache[phase];
  const [c, x] = makeCanvas(W, H);
  const R = (col, a, b, w, h) => { x.fillStyle = col; x.fillRect(a, b, w, h); };
  R('#efe3cc', 0, 0, W, 48);
  for (let i = 0; i < W; i += 6) R('#e8dac0', i, 0, 1, 48);
  R('#b07a4a', 0, 45, W, 3); R('#8a5a32', 0, 47, W, 1);
  R('#d9ccb6', 0, 48, W, 24);
  for (let y = 48; y < H; y += 6) R('#c6b79d', 0, y, W, 1);
  for (let y = 48, k = 0; y < H; y += 6, k++) for (let i = (k % 2) * 6; i < W; i += 12) R('#c6b79d', i, y, 1, 6);
  // Fenster
  const sky = { day: '#8fd0f0', dusk: '#f0a35e', night: '#1c2350' }[phase];
  R('#8a5a32', 61, 7, 26, 22); R(sky, 63, 9, 22, 18);
  if (phase === 'day') { R('#ffffff', 66, 13, 8, 2); R('#ffffff', 68, 12, 4, 1); R('#fff3a6', 80, 10, 3, 3); }
  if (phase === 'dusk') { R('#ffd27a', 70, 21, 6, 6); R('#d9784a', 63, 24, 22, 3); }
  if (phase === 'night') { R('#f7ead2', 78, 11, 3, 3); R('#1c2350', 79, 11, 2, 2); [[66, 12], [71, 17], [75, 11], [68, 22], [82, 20]].forEach(([a, b]) => R('#ffffff', a, b, 1, 1)); }
  R('#8a5a32', 73, 9, 2, 18); R('#8a5a32', 63, 17, 22, 2);
  R('#6f4527', 60, 29, 28, 2);
  // Bild an der Wand (wie im Flur)
  R('#24120a', 34, 7, 12, 15); R('#e9a35a', 35, 8, 10, 13); R('#c4552a', 35, 15, 10, 6); R('#24120a', 39, 11, 2, 7);
  // Monstera im Korb
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
  // Teppich
  for (let yy = -6; yy <= 6; yy++) for (let xx = -32; xx <= 32; xx++) {
    if ((xx / 32) ** 2 + (yy / 6) ** 2 > 1) continue;
    R(hash(xx + 99, yy + 7) < 0.25 ? '#d8c59e' : '#e6d6b2', 48 + xx, 64 + yy, 1, 1);
  }
  bgCache[phase] = c;
  return c;
}
function walkBg(dist) {
  const ph = skyPhase();
  const sky = { day: ['#9ad6f2', '#cfeefa'], dusk: ['#f0a35e', '#f7cf8a'], night: ['#1c2350', '#38407a'] }[ph];
  ctx.fillStyle = sky[0]; ctx.fillRect(0, 0, W, 30);
  ctx.fillStyle = sky[1]; ctx.fillRect(0, 30, W, 18);
  for (let i = -1; i < 4; i++) {
    const hx = Math.floor(i * 40 - ((dist * 0.15) % 40));
    ctx.fillStyle = ph === 'night' ? '#2b3a4a' : '#8cbf7a';
    for (let xx = 0; xx < 40; xx++) {
      const hh = Math.round(8 + Math.sin((xx / 40) * Math.PI) * 9);
      ctx.fillRect(hx + xx, 48 - hh, 1, hh);
    }
  }
  for (let i = -1; i < 5; i++) {
    const tx = Math.floor(i * 28 - ((dist * 0.45) % 28)) + 10;
    ctx.fillStyle = '#5a3a20'; ctx.fillRect(tx + 3, 36, 3, 14);
    ctx.fillStyle = ph === 'night' ? '#1f4a2c' : '#3f8a44';
    for (let yy = -7; yy <= 7; yy++) for (let xx = -7; xx <= 7; xx++) {
      if (xx * xx + yy * yy <= 46) ctx.fillRect(tx + 4 + xx, 31 + yy, 1, 1);
    }
  }
  ctx.fillStyle = ph === 'night' ? '#26502c' : '#5fae4e'; ctx.fillRect(0, 48, W, 12);
  ctx.fillStyle = '#b89a72'; ctx.fillRect(0, 60, W, 12);
  ctx.fillStyle = '#9c7f5a';
  for (let i = 0; i < 14; i++) {
    const px = Math.floor((i * 23 - dist) % W + W) % W;
    ctx.fillRect(px, 63 + (i % 4) * 2, 2, 1);
  }
  ctx.fillStyle = ph === 'night' ? '#1d3d22' : '#4a9a3e';
  for (let i = 0; i < 20; i++) {
    const px = Math.floor((i * 17 - dist) % W + W) % W;
    ctx.fillRect(px, 59, 1, 2);
  }
}

/* ================= Sprite-Cache ================= */
const dogCache = new Map();
function dogCanvas(o) {
  const k = JSON.stringify(o);
  let c = dogCache.get(k);
  if (!c) {
    if (dogCache.size > 300) dogCache.clear();
    c = (o.side ? drawSide(o.frame, o.jump, o.tail) : drawDog(o)).toCanvas();
    dogCache.set(k, c);
  }
  return c;
}
const sprCache = {};
function sprite(name) { return sprCache[name] || (sprCache[name] = SPR[name].toCanvas()); }
function drawSpr(name, x, y, flip) {
  const c = sprite(name);
  if (flip) { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(c, -Math.round(x) - c.width, Math.round(y)); ctx.restore(); }
  else ctx.drawImage(c, Math.round(x), Math.round(y));
}

/* ================= Raya im Zimmer ================= */
const D = {
  x: 48, tx: 48, walking: false, dir: 1,
  blinkAt: 2, blinkEnd: 0, tiltAt: 6, tiltEnd: 0, tiltDir: 1, tilt: 0,
  wanderAt: 5, twitchEnd: 0, twitchSide: 0, bubbleAt: 4, bubbleEnd: 0,
};
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
  if (S.clean < 30) return 'BRUSH';
  if (S.fun < 30) return 'BALL';
  if (S.energy < 22) return 'MOON';
  return null;
}
function statusText() {
  const m = mood();
  if (m === 'sleep') return 'Raya schläft … zzz';
  if (m === 'sick') return 'Raya ist krank';
  const n = need();
  const map = { FOOD: 'Raya hat Hunger', DROP: 'Raya hat Durst', POOP: 'Da liegt ein Häufchen …', BRUSH: 'Raya braucht Pflege', BALL: 'Raya ist langweilig', MOON: 'Raya ist müde' };
  if (n) return map[n];
  return m === 'happy' ? 'Raya ist glücklich' : 'Raya ist zufrieden';
}

function updateIdle(dt) {
  clock += dt;
  const m = mood();
  if (anim) { anim.t += dt; if (anim.t >= anim.dur) { const a = anim; anim = null; a.end && a.end(); } }
  if (!anim && m !== 'sleep') {
    if (clock > D.wanderAt && !D.walking && (m === 'happy' || m === 'ok')) {
      D.tx = Math.round(rnd(30, 66)); D.wanderAt = clock + rnd(7, 15);
    }
    if (Math.abs(D.tx - D.x) > 0.6) {
      D.walking = true; D.dir = Math.sign(D.tx - D.x);
      D.x += D.dir * Math.min(Math.abs(D.tx - D.x), 11 * dt);
    } else { D.walking = false; D.x = Math.round(D.x); }
    if (clock > D.tiltAt) { D.tiltEnd = clock + 1.6; D.tiltDir = Math.random() < 0.5 ? -1 : 1; D.tiltAt = clock + rnd(8, 16); }
    if (clock > D.blinkAt) { D.blinkEnd = clock + 0.14; D.blinkAt = clock + rnd(2.5, 5.5); }
    if (Math.random() < dt * 0.25) { D.twitchEnd = clock + 0.25; D.twitchSide = Math.random() < 0.5 ? 0 : 1; }
    if (clock > D.bubbleAt) { if (need()) D.bubbleEnd = clock + 3; D.bubbleAt = clock + rnd(7, 10); }
  } else { D.walking = false; }
  const target = clock < D.tiltEnd ? D.tiltDir * 0.26 : 0;
  D.tilt += (target - D.tilt) * Math.min(1, dt * 8);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.t > p.life) particles.splice(i, 1);
  }
}

function dogOpts() {
  const m = mood();
  const q = (v, s = 0.04) => Math.round(v / s) * s;
  const wagSpeed = { happy: 12, ok: 6, sad: 1.5, sick: 1, sleep: 0 }[m];
  const wagAmp = { happy: 1, ok: 0.7, sad: 0.3, sick: 0.2, sleep: 0 }[m];
  const o = {
    eyes: 'open', tilt: q(D.tilt), tail: q(Math.sin(clock * wagSpeed) * wagAmp, 0.5),
    earL: 0.12, earR: 0.12, tongue: false,
  };
  if (m === 'happy') { o.tongue = true; o.earL = o.earR = 0.05; }
  if (m === 'ok') { o.tongue = Math.sin(clock * 0.4) > 0.2; }
  if (m === 'sad') { o.eyes = 'sad'; o.earL = o.earR = 0.75; }
  if (m === 'sick') { o.eyes = 'half'; o.earL = o.earR = 0.85; }
  if (m === 'sleep') { o.pose = 'lie'; o.eyes = 'closed'; o.earL = 0.45; o.earR = 0.5; o.tail = 0; o.tilt = 0; o.bob = Math.sin(clock * 1.5) > 0.6 ? 1 : 0; }
  if (clock < D.blinkEnd && o.eyes !== 'closed') o.eyes = 'closed';
  if (clock < D.twitchEnd) { if (D.twitchSide) o.earR = q(Math.min(1, o.earR + 0.35)); else o.earL = q(Math.min(1, o.earL + 0.35)); }
  if (anim) {
    const t = anim.t;
    switch (anim.type) {
      case 'eat': case 'drink':
        o.headDy = 4; o.tilt = 0; o.eyes = 'closed'; o.mouth = Math.floor(t * 5) % 2 === 0; o.tongue = anim.type === 'drink';
        o.tail = q(Math.sin(clock * 10), 0.5); break;
      case 'treat':
        if (t > 0.55) { o.eyes = 'happy'; o.mouth = Math.floor(t * 6) % 2 === 0; o.tongue = false; } else { o.mouth = true; o.tongue = false; }
        o.tail = q(Math.sin(clock * 14), 0.5); break;
      case 'pet':
        o.eyes = 'happy'; o.tilt = -0.24; o.tongue = true; o.earL = o.earR = 0.4; o.tail = q(Math.sin(clock * 14), 0.5); break;
      case 'brush':
        o.eyes = 'happy'; o.tilt = q(Math.sin(t * 3) * 0.12); o.tail = q(Math.sin(clock * 8) * 0.8, 0.5); break;
      case 'vet':
        o.eyes = t < 1.4 ? 'sad' : 'happy'; o.earL = o.earR = t < 1.4 ? 0.9 : 0.2; o.tail = 0; o.tongue = t >= 1.4; break;
      case 'nope':
        o.tilt = q(Math.sin(t * 18) * 0.18); o.eyes = 'open'; o.tongue = false; break;
      case 'clean':
        o.eyes = 'happy'; o.tongue = true; break;
      case 'wake':
        o.eyes = t < 0.6 ? 'half' : 'open'; break;
    }
  }
  return o;
}

function drawRoom() {
  ctx.drawImage(roomBg(skyPhase()), 0, 0);
  // Häufchen
  S.poops.forEach((p, i) => {
    drawSpr('POOP', p.x - 4, FLOOR - 6);
    const fx = p.x + Math.round(Math.sin(clock * 6 + i) * 4), fy = FLOOR - 10 + Math.round(Math.cos(clock * 5 + i) * 2);
    ctx.fillStyle = '#24120a'; ctx.fillRect(fx, fy, 1, 1);
  });

  // Raya
  if (D.walking && !anim) {
    const c = dogCanvas({ side: 1, frame: Math.floor(clock * 8) % 4, jump: false, tail: Math.round(Math.sin(clock * 12)) });
    const x = Math.round(D.x - 17), y = FLOOR - 21;
    if (D.dir < 0) { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(c, -x - c.width, y); ctx.restore(); } else ctx.drawImage(c, x, y);
  } else {
    const o = dogOpts();
    ctx.drawImage(dogCanvas(o), Math.round(D.x - 24), FLOOR - 46);
    if (S.clean < 35 && !S.sleeping) {
      ctx.fillStyle = '#5a3418';
      [[-5, -12], [4, -6], [-2, -3], [7, -14]].forEach(([a, b]) => ctx.fillRect(Math.round(D.x + a), FLOOR + b, 1, 1));
      ctx.fillStyle = '#24120a';
      ctx.fillRect(Math.round(D.x + Math.sin(clock * 7) * 8), FLOOR - 30 + Math.round(Math.cos(clock * 9) * 3), 1, 1);
    }
  }
  // Animations-Requisiten
  if (anim) {
    const t = anim.t;
    if (anim.type === 'eat') drawSpr('FOOD', D.x - 5, FLOOR - 4);
    if (anim.type === 'drink') drawSpr('WBOWL', D.x - 5, FLOOR - 2);
    if (anim.type === 'treat' && t < 0.55) drawSpr('BONE', D.x - 5, -6 + (FLOOR - 40) * (t / 0.55));
    if (anim.type === 'brush') {
      drawSpr('BRUSH', D.x - 4 + Math.sin(t * 9) * 7, FLOOR - 22 + Math.cos(t * 4.5) * 2);
      if (Math.floor(t * 10) % 3 === 0) spark(D.x + rnd(-10, 10), FLOOR - rnd(10, 30));
    }
    if (anim.type === 'vet') {
      if (t < 1.4) drawSpr('SYRINGE', D.x + 12 - Math.min(1, t / 0.8) * 4, FLOOR - 22);
      else if (Math.floor(t * 10) % 2 === 0) spark(D.x + rnd(-12, 12), FLOOR - rnd(10, 40));
    }
    if (anim.type === 'pet' && Math.floor(t * 8) !== Math.floor((t - 0.016) * 8)) heart(D.x + rnd(-8, 8), FLOOR - 40);
    if (anim.type === 'clean' && t < 0.8 && Math.random() < 0.5) spark(rnd(6, 90), FLOOR - rnd(0, 8));
  }
  // Sprechblase
  if (!anim && clock < D.bubbleEnd && need() && !S.sleeping) {
    const n = need(), bx = Math.round(D.x + 10), by = 4;
    ctx.fillStyle = '#24120a'; ctx.fillRect(bx - 1, by - 1, 17, 15); ctx.fillRect(bx - 2, by, 19, 13);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, 15, 13); ctx.fillRect(bx - 1, by + 1, 17, 11);
    ctx.fillStyle = '#24120a'; ctx.fillRect(bx - 3, by + 15, 2, 2); ctx.fillRect(bx - 6, by + 18, 1, 1);
    const c = sprite(n);
    ctx.drawImage(c, bx + Math.floor((15 - c.width) / 2), by + Math.floor((13 - c.height) / 2));
  }
  // Schlaf: Licht aus + Zzz
  if (S.sleeping) {
    ctx.fillStyle = 'rgba(14,16,44,0.58)'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 3; i++) {
      const k = (clock * 0.5 + i / 3) % 1;
      ctx.globalAlpha = 1 - k;
      drawSpr('Z', D.x + 10 + k * 10 + i * 2, FLOOR - 24 - k * 18);
      ctx.globalAlpha = 1;
    }
  }
  // Krank: Schweißtropfen
  if (S.sick && !S.sleeping && !anim) {
    ctx.fillStyle = '#93cdf2';
    const k = (clock * 0.8) % 1;
    ctx.fillRect(Math.round(D.x + 9), Math.round(FLOOR - 40 + k * 6), 1, 2);
  }
  drawParticles();
}
function spark(x, y) { particles.push({ kind: 'SPARK', x, y, vx: 0, vy: -6, t: 0, life: 0.5 }); }
function heart(x, y) { particles.push({ kind: 'MINIHEART', x, y, vx: rnd(-4, 4), vy: -14, t: 0, life: 1.1 }); }
function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    drawSpr(p.kind, p.x - 2, p.y - 2);
  }
  ctx.globalAlpha = 1;
}

/* ================= Aktionen ================= */
function play(type, dur, end) { anim = { type, t: 0, dur, end }; }
function busy() { return !!anim || !!G; }
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
    play('eat', 2.4); sfx.good(); toast('Mampf mampf …');
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
    S.thirst += 45; play('drink', 2.4); sfx.good(); toast('Schlabber schlabber …');
  } },
  { id: 'walk', label: 'Gassi', icon: 'PAW', fn() { startGame('walk'); } },
  { id: 'play', label: 'Spielen', icon: 'BALL', fn() { startGame('play'); } },
  { id: 'pet', label: 'Kraulen', icon: 'HEART', fn() { pet(); } },
  { id: 'brush', label: 'Bürsten', icon: 'BRUSH', fn() {
    if (asleepGuard()) return;
    if (S.clean > 95) { toast('Raya glänzt schon.'); play('nope', 0.6); return; }
    S.clean += 30; S.fun += 2; play('brush', 2.2); sfx.good(); toast('Bürste, bürste …');
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
    S.sleeping = true; D.x = Math.round(D.x); D.tx = D.x; toast('Licht aus. Gute Nacht, Raya!'); sfx.tap();
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
  if (mode === 'walk') {
    G = { mode, paused: true, t: 30, score: 0, lives: 3, y: 0, vy: 0, obs: [], spawn: 1.4, speed: 40, dist: 0, hitT: 0 };
    overlay('Gassi gehen', 'Tippen = springen.<br>Sammle Leckerli, spring über Pfützen, Büsche &amp; Hydranten.', 'Los!', () => { G.paused = false; });
  } else {
    G = { mode, paused: true, t: 20, score: 0, balls: [], spawn: 0.6, x: 48, tx: 48, catchT: 0 };
    overlay('Bälle fangen', 'Zieh Raya nach links und rechts und fang die Bälle.<br>Knochen zählen dreifach!', 'Los!', () => { G.paused = false; });
  }
  updateUI();
}
function hud() {
  const el = $('#hud');
  if (!G || G.paused) { el.hidden = true; return; }
  el.hidden = false;
  const lives = G.mode === 'walk' ? ' ' + '♥'.repeat(G.lives) + '♡'.repeat(3 - G.lives) : '';
  el.innerHTML = '<span>' + Math.ceil(G.t) + 's</span><span>' + (G.mode === 'walk' ? 'Leckerli ' : 'Bälle ') + G.score + lives + '</span>';
}
function updateGame(dt) {
  clock += dt;
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.t > p.life) particles.splice(i, 1);
  }
  if (G.paused) return;
  G.t -= dt;
  if (G.mode === 'play') {
    G.spawn -= dt;
    if (G.spawn <= 0) {
      G.spawn = rnd(0.55, 0.95) * (0.55 + 0.45 * (G.t / 20));
      G.balls.push({ x: rnd(16, 80), y: -8, v: rnd(24, 34) + (20 - G.t) * 1.3, bone: Math.random() < 0.15 });
    }
    G.x += Math.sign(G.tx - G.x) * Math.min(Math.abs(G.tx - G.x), 75 * dt);
    G.x = clamp(G.x, 20, 76);
    G.catchT -= dt;
    for (let i = G.balls.length - 1; i >= 0; i--) {
      const b = G.balls[i]; b.y += b.v * dt;
      if (b.y > 38 && b.y < 48 && Math.abs(b.x - G.x) < 7) {
        G.score += b.bone ? 3 : 1; G.catchT = 0.3; G.balls.splice(i, 1); sfx.catch(); buzz(8);
        for (let k = 0; k < 3; k++) spark(G.x + rnd(-6, 6), 40 + rnd(-4, 4));
      } else if (b.y > H + 4) G.balls.splice(i, 1);
    }
  } else {
    G.speed += dt * 0.9; G.dist += G.speed * dt; G.hitT -= dt;
    G.vy += 330 * dt; G.y = Math.min(0, G.y + G.vy * dt); if (G.y === 0) G.vy = 0;
    G.spawn -= dt;
    if (G.spawn <= 0) {
      G.spawn = rnd(1.0, 1.8) * (42 / G.speed);
      const r = Math.random();
      const o = r < 0.3 ? { k: 'bone', w: 11, h: 7, y: Math.round(rnd(30, 46)) }
        : r < 0.55 ? { k: 'puddle', w: 13, h: 3, y: 59 }
        : r < 0.8 ? { k: 'bush', w: 11, h: 8, y: 54 }
        : { k: 'hydrant', w: 7, h: 11, y: 51 };
      o.x = W + 4; G.obs.push(o);
    }
    const dy = FLOOR - 21 + G.y, box = [20, dy + 4, 44, dy + 20];
    for (let i = G.obs.length - 1; i >= 0; i--) {
      const o = G.obs[i]; o.x -= G.speed * dt;
      if (o.x < -16) { G.obs.splice(i, 1); continue; }
      const hit = o.x + 1 < box[2] && o.x + o.w - 1 > box[0] && o.y + 1 < box[3] && o.y + o.h > box[1];
      if (!hit) continue;
      if (o.k === 'bone') { G.score++; G.obs.splice(i, 1); sfx.catch(); spark(o.x + 5, o.y + 3); }
      else if (G.hitT <= 0) { G.lives--; G.hitT = 1.2; sfx.bad(); buzz(60); }
    }
    if (G.lives <= 0) G.t = 0;
  }
  if (G.t <= 0) finishGame();
}
function jump() {
  if (G && G.mode === 'walk' && !G.paused && G.y === 0) { G.vy = -122; G.y = -0.01; sfx.jump(); }
}
function drawGame() {
  if (G.mode === 'play') {
    ctx.drawImage(roomBg(skyPhase()), 0, 0);
    for (const b of G.balls) drawSpr(b.bone ? 'BONE' : 'BALL', b.x - (b.bone ? 5 : 4), b.y - 4);
    const o = { eyes: G.catchT > 0 ? 'happy' : 'open', mouth: G.catchT > 0 || G.balls.some((b) => b.y > 26 && Math.abs(b.x - G.x) < 9), tongue: true, tail: Math.round(Math.sin(clock * 14)) / 1, earL: 0.05, earR: 0.05 };
    ctx.drawImage(dogCanvas(o), Math.round(G.x - 24), FLOOR - 46);
  } else {
    walkBg(G.dist);
    for (const o of G.obs) {
      if (o.k === 'bone') drawSpr('BONE', o.x, o.y + Math.round(Math.sin(clock * 6 + o.x) * 1));
      if (o.k === 'hydrant') drawSpr('HYDRANT', o.x, o.y);
      if (o.k === 'puddle') {
        ctx.fillStyle = '#24120a'; ctx.fillRect(Math.round(o.x) + 1, o.y, o.w - 2, 4);
        ctx.fillStyle = '#5aa6e0'; ctx.fillRect(Math.round(o.x) + 2, o.y + 1, o.w - 4, 2);
        ctx.fillStyle = '#b7e1f7'; ctx.fillRect(Math.round(o.x) + 4, o.y + 1, 3, 1);
      }
      if (o.k === 'bush') {
        const bx = Math.round(o.x);
        for (let yy = 0; yy < 8; yy++) for (let xx = 0; xx < 11; xx++) {
          const e = ((xx - 5) / 5.6) ** 2 + ((yy - 7) / 7.2) ** 2;
          if (e > 1) continue;
          ctx.fillStyle = e > 0.75 ? '#24120a' : hash(xx, yy) < 0.3 ? '#2f6b33' : '#3f9a49';
          ctx.fillRect(bx + xx, o.y + yy, 1, 1);
        }
      }
    }
    if (!(G.hitT > 0 && Math.floor(G.hitT * 10) % 2)) {
      const c = dogCanvas({ side: 1, frame: Math.floor(G.dist / 5) % 4, jump: G.y < 0, tail: Math.round(Math.sin(clock * 14)) });
      ctx.drawImage(c, 14, Math.round(FLOOR - 21 + G.y));
    }
  }
  drawParticles();
}
function finishGame() {
  const g = G; G = null; S.counts.games++;
  let msg;
  if (g.mode === 'play') {
    S.fun += Math.min(38, 10 + g.score * 2); S.energy -= 12; S.hunger -= 4; S.thirst -= 8;
    const rec = g.score > S.best.play; if (rec) S.best.play = g.score;
    msg = g.score + ' Bälle gefangen!' + (rec ? '<br>Neuer Rekord!' : '<br>Rekord: ' + S.best.play);
  } else {
    S.fun += Math.min(38, 14 + g.score * 2); S.energy -= 18; S.thirst -= 12; S.clean -= 10; S.counts.walks++;
    const rec = g.score > S.best.walk; if (rec) S.best.walk = g.score;
    msg = g.score + ' Leckerli gefunden!' + (rec ? '<br>Neuer Rekord!' : '<br>Rekord: ' + S.best.walk);
    if (S.pending.length || S.poops.length) {
      S.pending = []; S.clean += 6;
      msg += '<br>Raya hat ihr Geschäft draußen erledigt.';
    }
    msg += '<br>Pfoten sind etwas dreckig.';
  }
  clampAll(); save(); sfx.good();
  D.x = 48; D.tx = 48;
  overlay(g.mode === 'play' ? 'Super gespielt!' : 'Zurück vom Gassi!', msg, 'Weiter', () => play('pet', 1.2));
  updateUI();
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
  $('#status').textContent = G ? (G.mode === 'walk' ? 'Gassi-Zeit!' : 'Fang den Ball!') : statusText();
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
  return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
}
cv.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const [x, y] = toLogical(e);
  if (G) {
    if (G.mode === 'walk') jump(); else G.tx = x;
    return;
  }
  if (anim) return;
  const pi = S.poops.findIndex((p) => Math.abs(p.x - x) < 6 && y > FLOOR - 10);
  if (pi >= 0) { S.poops.splice(pi, 1); S.clean += 8; spark(x, FLOOR - 4); sfx.good(); toast('Weggeräumt!'); clampAll(); save(); updateUI(); return; }
  if (Math.abs(x - D.x) < 16 && y > FLOOR - 46) { sfx.tap(); pet(); clampAll(); save(); updateUI(); }
});
cv.addEventListener('pointermove', (e) => { if (G && G.mode === 'play' && (e.buttons || e.pointerType !== 'mouse')) G.tx = toLogical(e)[0]; });
window.addEventListener('keydown', (e) => {
  if (!G || G.paused) return;
  if (G.mode === 'walk' && (e.code === 'Space' || e.code === 'ArrowUp')) { e.preventDefault(); jump(); }
  if (G.mode === 'play') { if (e.code === 'ArrowLeft') G.tx = G.x - 12; if (e.code === 'ArrowRight') G.tx = G.x + 12; }
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
$('#resetBtn').addEventListener('click', () => {
  if (!confirm('Wirklich neu anfangen? Alle Werte und Rekorde werden zurückgesetzt.')) return;
  S = freshState(); save(); $('#info').close(); D.x = D.tx = 48; updateUI(); toast('Hallo! Ich bin Raya.');
});

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
  if (G) updateGame(dt); else updateIdle(dt);
  if (G) drawGame(); else drawRoom();
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
requestAnimationFrame(loop);

window.__renderIcon = (size, maskable) => renderIcon(size, maskable).toDataURL('image/png');

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
