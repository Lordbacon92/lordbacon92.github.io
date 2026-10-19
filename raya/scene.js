'use strict';
/* Raya – Wohnzimmer-Szene (384×288)
   Laufkarte aus Alex' Markierung (room-map.json): Boden frei begehbar, grüne Flächen auf Couch,
   Chaiselongue/Hocker und Sessel per Sprung erreichbar, Möbel gesperrt. Wegfindung per A* auf
   einem 3-px-Raster. Verdeckung pixelgenau über eine Tiefenkarte (room-depth.png): jedes
   Möbelpixel kennt seine Tiefe, Raya wird nur dort verdeckt, wo ein Möbel wirklich vor ihr steht. */

const RW = 384, RH = 288;
const MAP = { ready: false, cell: 3, cols: 0, rows: 0, cells: null, depth: null, jumps: new Map(), spots: {}, occ: null, occOff: 40 };
const SURF = { couch: 2, chaise: 3, stool: 3, chair: 4 };
const BOWL = 'bowl';
// Couchtische: Antippen gibt einen Hinweis
const TABLES = [[196, 177], [216, 166], [264, 165], [267, 190], [255, 208], [200, 211], [195, 196]];

/* Sitzhöhe in Pixeln abhängig von der Tiefe (y der Kontaktlinie am Boden) */
const hSit = (depth) => clamp(36 + 0.52 * (depth - 178), 30, 96);

/* ---------- Atlas (Raya in 9 Tiefenstufen) + Karten ---------- */
const ATLAS = { img: null, wimg: null, levels: [], tiles: {}, wear: {} };
const DECOR = { img: null, meta: {} };   // Deko in Raumperspektive (raya-decor.png): [sx, sy, w, h, x, y, sort]
async function loadAtlas() {
  const [img, meta, map, dimg] = await Promise.all([
    loadImg('raya-atlas.png'), fetch('raya-atlas.json').then((r) => r.json()),
    fetch('room-map.json').then((r) => r.json()), loadImg('room-depth.png'),
  ]);
  ATLAS.img = img; ATLAS.levels = meta.levels; ATLAS.tiles = meta.tiles; ATLAS.wear = meta.wear || {};
  loadImg('raya-wear.png').then((w) => { ATLAS.wimg = w; }).catch(() => {});
  Promise.all([loadImg('raya-decor.png'), fetch('raya-decor.json').then((r) => r.json())]).then(([i, m]) => { DECOR.img = i; DECOR.meta = m; }).catch(() => {});
  MAP.cell = map.cell; MAP.cols = map.cols; MAP.rows = map.rows; MAP.spots = map.spots; MAP.occOff = map.depthOffset;
  MAP.cells = Uint8Array.from(map.cells, (c) => +c); MAP.depth = Int16Array.from(map.depth);
  for (const [a, b] of map.jumps) { (MAP.jumps.get(a) || MAP.jumps.set(a, []).get(a)).push(b); (MAP.jumps.get(b) || MAP.jumps.set(b, []).get(b)).push(a); }
  const c = document.createElement('canvas'); c.width = RW; c.height = RH;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(dimg, 0, 0);
  const d = x.getImageData(0, 0, RW, RH).data; MAP.occ = new Int16Array(RW * RH);
  for (let i = 0; i < RW * RH; i++) MAP.occ[i] = d[i * 4] ? d[i * 4] + MAP.occOff : 0;
  MAP.ready = true;
  if (!S.sleeping) placeFloor('start');
}
function levelFor(depth) {
  const want = hSit(depth) / 90; let best = 0;
  ATLAS.levels.forEach((l, i) => { if (Math.abs(l - want) < Math.abs(ATLAS.levels[best] - want)) best = i; });
  return best;
}

/* ---------- Raster-Helfer ---------- */
const cIdx = (x, y) => Math.floor(clamp(y, 0, RH - 1) / MAP.cell) * MAP.cols + Math.floor(clamp(x, 0, RW - 1) / MAP.cell);
const cPt = (k) => ({ x: (k % MAP.cols) * MAP.cell + 1, y: Math.floor(k / MAP.cols) * MAP.cell + 1 });
const cType = (k) => MAP.cells[k];
function inPolyPt(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
/* nächste begehbare Zelle (optional nur ein bestimmter Flächentyp) */
function nearestCell(x, y, type = 0, maxR = 40) {
  const ci = Math.floor(x / MAP.cell), cj = Math.floor(y / MAP.cell);
  let best = -1, bd = Infinity;
  for (let r = 0; r <= maxR && best < 0; r++) {
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (i < 0 || j < 0 || i >= MAP.cols || j >= MAP.rows) continue;
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r) continue;
      const k = j * MAP.cols + i, t = MAP.cells[k];
      if (!t || (type && t !== type)) continue;
      const d = Math.hypot(i - ci, j - cj); if (d < bd) { bd = d; best = k; }
    }
  }
  return best;
}
function nodePt(name) { const [x, y] = MAP.spots[name] || MAP.spots.start; return { x, y }; }
function randomFloorPoint() {
  if (!MAP.ready) return { x: 280, y: 250 };
  for (let n = 0; n < 200; n++) {
    const k = Math.floor(Math.random() * MAP.cells.length);
    if (MAP.cells[k] === 1) { const p = cPt(k); if (p.y > 190) return p; }
  }
  return nodePt('start');
}
function randomCellOf(type) {
  const ks = []; for (let k = 0; k < MAP.cells.length; k++) if (MAP.cells[k] === type) ks.push(k);
  return ks.length ? ks[Math.floor(Math.random() * ks.length)] : -1;
}

/* A*: Nachbarn auf derselben Fläche + Sprünge zwischen Flächen */
function astar(from, to) {
  if (from < 0 || to < 0) return null;
  const C = MAP.cols, N = MAP.cells.length, g = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const tx = to % C, ty = Math.floor(to / C), h = (k) => Math.hypot(k % C - tx, Math.floor(k / C) - ty);
  const open = [[h(from), from]]; g[from] = 0;
  const push = (f, k) => { open.push([f, k]); let i = open.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (open[p][0] <= open[i][0]) break; [open[p], open[i]] = [open[i], open[p]]; i = p; } };
  const pop = () => { const top = open[0], last = open.pop(); if (open.length) { open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
  open.length = 0; push(h(from), from);
  while (open.length) {
    const [, k] = pop(); if (closed[k]) continue; closed[k] = 1;
    if (k === to) break;
    const x = k % C, y = Math.floor(k / C), t = MAP.cells[k];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= C || ny >= MAP.rows) continue;
      const n = ny * C + nx; if (MAP.cells[n] !== t || closed[n]) continue;
      if (dx && dy && (MAP.cells[y * C + nx] !== t || MAP.cells[ny * C + x] !== t)) continue;
      const ng = g[k] + (dx && dy ? 1.414 : 1);
      if (ng < g[n]) { g[n] = ng; prev[n] = k; push(ng + h(n), n); }
    }
    for (const n of MAP.jumps.get(k) || []) {
      const ng = g[k] + 14 + Math.hypot(n % C - x, Math.floor(n / C) - y);
      if (ng < g[n] && !closed[n]) { g[n] = ng; prev[n] = k; push(ng + h(n), n); }
    }
  }
  if (!isFinite(g[to])) return null;
  const out = []; for (let k = to; k !== -1; k = prev[k]) out.unshift(k);
  return out;
}
/* Sichtlinie auf derselben Fläche (für glatte Wege) */
function lineClear(a, b) {
  const t = MAP.cells[a], C = MAP.cols; let x0 = a % C, y0 = Math.floor(a / C); const x1 = b % C, y1 = Math.floor(b / C);
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
  for (let i = 1; i <= n; i++) {
    const x = Math.round(x0 + (x1 - x0) * i / n), y = Math.round(y0 + (y1 - y0) * i / n);
    if (MAP.cells[y * C + x] !== t) return false;
  }
  return true;
}
function sameSurfNeighbor(a, b) {
  const C = MAP.cols;
  return MAP.cells[a] === MAP.cells[b] && Math.abs(a % C - b % C) <= 1 && Math.abs(Math.floor(a / C) - Math.floor(b / C)) <= 1;
}
/* Pfad in Lauf-Abschnitte (pro Fläche, geglättet) und Sprünge zerlegen */
function pathSteps(cells) {
  const steps = []; let segStart = 0;
  for (let i = 1; i <= cells.length; i++) {
    if (i < cells.length && sameSurfNeighbor(cells[i - 1], cells[i])) continue;
    const seg = cells.slice(segStart, i);
    let a = 0;
    while (a < seg.length - 1) {
      let b = seg.length - 1;
      while (b > a + 1 && !lineClear(seg[a], seg[b])) b--;
      steps.push({ cell: seg[b], ...cPt(seg[b]) }); a = b;
    }
    if (i < cells.length) steps.push({ cell: cells[i], ...cPt(cells[i]), jump: true });
    segStart = i;
  }
  return steps;
}

/* ---------- Raya als Figur im Raum ---------- */
const R = {
  x: 271, y: 226, cell: -1, path: [], jump: null, dir: -1,
  task: null, nextDecision: 4, userUntil: 0, blinkAt: 2, blinkEnd: 0, tiltAt: 6, tiltEnd: 0, tiltDir: 1,
  standEnd: 0, hopEnd: 0, bubbleAt: 4, bubbleEnd: 0, box: [0, 0, 0, 0],
};
const rType = () => (R.cell >= 0 ? MAP.cells[R.cell] : 1);
Object.defineProperty(R, 'perch', { get() { const t = rType(); return t === 2 ? 'couch' : t === 3 ? 'chaise' : t === 4 ? 'chair' : null; } });
function cellDepth(k) { return k >= 0 ? MAP.depth[k] : R.y + 3; }
function rDepth() { return R.jump ? R.jump.depth : cellDepth(R.cell); }
/* Größe: nach dem Bodenpunkt unter Raya. Auf dem Boden ihre Fußhöhe; auf Sitzflächen
   (gleiche Höhe über dem Boden) wird die Bildhöhe perspektivisch auf den Boden umgerechnet –
   so wächst sie stetig, ohne Sprünge zwischen Polsterteilen. */
const HORIZON = 109, RAISE = 1.5;
function sizeDepth(y, t) { return t === 1 ? y + 3 : HORIZON + (y - HORIZON) * RAISE; }
function rSize() {
  if (R.jump) { const j = R.jump, k = Math.min(1, j.t / j.dur); return j.s0 + (j.s1 - j.s0) * k; }
  return sizeDepth(R.y, rType());
}
function placeAt(k) { if (k < 0) return; Object.assign(R, cPt(k), { cell: k, path: [], jump: null, task: null }); }
function placeFloor(n = 'start') { if (!MAP.ready) return; const p = nodePt(n === 'R' ? 'start' : n); placeAt(nearestCell(p.x, p.y, 1)); }
function placePerch(p) { if (!MAP.ready) return; const s = nodePt(p); placeAt(nearestCell(s.x, s.y, SURF[p] || 0)); }
/* Schlafplatz: Couch – oder das Hundebett, wenn es aufgestellt ist */
function sleepSpot() { return EXTRAS.decor.has('hundebett') ? { floor: nodePt('bed') } : { perch: 'couch' }; }
function atSleepSpot() {
  if (R.jump || R.path.length) return false;
  if (EXTRAS.decor.has('hundebett')) { const b = nodePt('bed'); return rType() === 1 && Math.hypot(R.x - b.x, R.y - b.y) < 8; }
  return rType() === SURF.couch;
}
function placeSleep() { if (EXTRAS.decor.has('hundebett')) placeFloor('bed'); else placePerch('couch'); }
/* besondere Schlafanimation: Mond und funkelnde Sterne über Raya */
function drawStarSleep() {
  const [x0, y0, x1] = R.box, cx = (x0 + x1) / 2;
  drawSpr('MOON', cx - 30, y0 - 40, false, 2);
  for (let i = 0; i < 7; i++) {
    const a = i * 0.9 + clock * 0.3, r = 26 + (i % 3) * 10;
    const sx = cx + Math.cos(a) * r * 1.4, sy = y0 - 6 + Math.sin(a) * r * 0.55;
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(clock * 3 + i * 1.7);
    drawSpr('SPARK', sx - 5, sy - 5, false, 2);
  }
  ctx.globalAlpha = 1;
}
function sceneBusy() { return R.path.length > 0 || !!R.jump; }
function stopMoving() { R.path = []; R.task = null; }

/* Ziel: { floor:{x,y} } | { perch:'couch'|'chaise'|'stool'|'chair' } | { cell } */
function goTo(target, task) {
  if (!MAP.ready || R.jump) { R.task = task || null; return; }
  if (R.cell < 0) R.cell = nearestCell(R.x, R.y);
  let to;
  if (target.cell !== undefined) to = target.cell;
  else if (target.perch) {
    if (rType() === SURF[target.perch] && target.perch !== 'stool') { R.path = []; R.task = task || null; return; }
    const s = nodePt(target.perch); to = nearestCell(s.x, s.y, SURF[target.perch]);
  } else to = nearestCell(target.floor.x, target.floor.y, 1);
  const cells = astar(R.cell, to);
  if (!cells || cells.length < 2) { R.path = []; R.task = task || null; return; }
  R.path = pathSteps(cells); R.task = task || null;
}
function startJump(step) {
  const d0 = rDepth(), d1 = cellDepth(step.cell);
  const s0 = rSize(), s1 = sizeDepth(step.y, MAP.cells[step.cell]);
  R.jump = { x0: R.x, y0: R.y, x1: step.x, y1: step.y, t: 0, dur: 0.5, d0, d1, s0, s1, depth: d0, cell: step.cell };
  R.dir = Math.sign(step.x - R.x) || R.dir;
  sfx.jump();
}

function sceneUpdate(dt) {
  clock += dt;
  if (anim) { anim.t += dt; if (anim.t >= anim.dur) { const a = anim; anim = null; a.end && a.end(); } }
  tickParticles(dt);
  if (!MAP.ready) return;

  // Sprung
  if (R.jump) {
    const j = R.jump; j.t += dt; const k = Math.min(1, j.t / j.dur);
    R.x = j.x0 + (j.x1 - j.x0) * k;
    R.y = j.y0 + (j.y1 - j.y0) * k - Math.sin(k * Math.PI) * hSit(Math.max(j.s0, j.s1)) * 0.45;
    // Tiefe: in der Luft die vordere der beiden, gelandet die des Ziels
    j.depth = k < 0.6 ? Math.max(j.d0, j.d1) : j.d1;
    if (k >= 1) { R.y = j.y1; R.cell = j.cell; R.jump = null; }
    return;
  }
  // Laufen
  if (R.path.length && !anim) {
    const step = R.path[0];
    if (step.jump) { R.path.shift(); startJump(step); return; }
    const sp = hSit(rSize()) * 1.0 * dt;
    const dx = step.x - R.x, dy = step.y - R.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.5) R.dir = Math.sign(dx);
    if (d <= sp) { R.x = step.x; R.y = step.y; R.cell = step.cell; R.path.shift(); if (!R.path.length) R.standEnd = clock + rnd(1, 2.5); }
    else { R.x += (dx / d) * sp; R.y += (dy / d) * sp; const k = cIdx(R.x, R.y); if (MAP.cells[k] === MAP.cells[step.cell]) R.cell = k; }
    return;
  }
  // angekommen → Aufgabe ausführen
  if (R.task && !anim) { const t = R.task; R.task = null; t(); return; }

  const m = mood();
  // Schlafenszeit
  if (S.sleeping) { if (!atSleepSpot() && !R.path.length) goTo(sleepSpot()); return; }
  if (anim) return;

  // eigene Entscheidungen
  if (clock > R.nextDecision && clock > R.userUntil) {
    R.nextDecision = clock + rnd(7, 15);
    const r = Math.random();
    if (S.energy < 35 && rType() !== SURF.chair && r < 0.6) goTo({ perch: 'chair' });
    else if (m === 'sick' || m === 'sad') { if (r < 0.3 && rType() !== SURF.couch) goTo({ perch: 'couch' }); }
    else if (r < 0.45) goTo({ floor: randomFloorPoint() });
    else if (r < 0.6) goTo({ cell: randomCellOf(SURF.couch) });
    else if (r < 0.75) goTo({ cell: randomCellOf(SURF.chaise) });
    else if (r < 0.83) goTo({ perch: 'chair' });
  }
  if (clock > R.tiltAt) { R.tiltEnd = clock + 1.8; R.tiltDir = Math.random() < 0.5 ? -1 : 1; R.tiltAt = clock + rnd(9, 16); }
  if (clock > R.blinkAt) { R.blinkEnd = clock + 0.14; R.blinkAt = clock + rnd(2.5, 5.5); }
  if (m === 'happy' && Math.random() < dt * 0.1) R.hopEnd = clock + 0.35;
  if (clock > R.bubbleAt) { if (need()) R.bubbleEnd = clock + 3; R.bubbleAt = clock + rnd(7, 10); }
}

/* welche Pose gerade gezeigt wird */
function scenePose() {
  const m = mood(), blink = clock < R.blinkEnd;
  let name = 'sit', flip = false, dy = 0, dx = 0;
  if (R.jump) return { name: 'side-w1', flip: R.dir > 0, dy: 0, dx: 0 };
  if (R.path.length && !anim) {
    const f = Math.floor(clock * 7) % 4;
    return { name: ['side', 'side-w1', 'side', 'side-w2'][f], flip: R.dir > 0, dy: f % 2 ? -1 : 0, dx: 0 };
  }
  if (S.sleeping) return { name: atSleepSpot() ? 'lie' : 'sit-closed', flip: true, dy: Math.sin(clock * 1.6) > 0.5 ? 1 : 0, dx: 0 };
  if (anim) {
    const t = anim.t;
    switch (anim.type) {
      case 'eat': case 'drink': name = Math.floor(t * 4) % 2 ? 'stand' : 'stand-closed'; dy = Math.floor(t * 4) % 2 ? 0 : 1; break;
      case 'treat': name = t > 0.55 ? 'stand-closed' : 'stand'; break;
      case 'pet': name = 'sit34'; flip = true; dy = Math.floor(t * 5) % 2; break;
      case 'brush': name = Math.floor(t * 3) % 2 ? 'sit-closed' : 'sit'; break;
      case 'vet': name = t < 1.4 ? 'sit' : 'stand'; dx = t < 1.4 ? Math.round(Math.sin(t * 30)) : 0; break;
      case 'nope': name = 'sit'; dx = Math.round(Math.sin(t * 30) * 2); break;
      case 'clean': name = 'stand'; dy = Math.floor(t * 6) % 2 ? -2 : 0; break;
      case 'wake': name = t < 0.6 ? 'sit-closed' : 'sit'; break;
    }
    return { name, flip, dy, dx };
  }
  if (clock < R.tiltEnd) { name = 'sit34'; flip = R.tiltDir < 0; }
  else if (rType() === 1 && (clock < R.standEnd || (m === 'happy' && Math.sin(clock * 0.21) > 0.6))) name = 'stand';
  if (blink && (name === 'sit' || name === 'stand')) name += '-closed';
  if (clock < R.hopEnd) dy = -Math.round(Math.sin(((R.hopEnd - clock) / 0.35) * Math.PI) * 4);
  return { name, flip, dy, dx };
}

function drawRaya() {
  const pose = scenePose(), li = levelFor(rSize());
  const t = ATLAS.tiles[pose.name][li], [sx, sy, w, h] = t;
  const x = Math.round(R.x - w / 2 + pose.dx), y = Math.round(R.y - h + pose.dy);
  if (pose.flip) { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(ATLAS.img, sx, sy, w, h, -x - w, y, w, h); ctx.restore(); }
  else ctx.drawImage(ATLAS.img, sx, sy, w, h, x, y, w, h);
  R.box = [x, y, x + w, y + h];
  const wb = EXTRAS.outfit && drawWear(EXTRAS.outfit, pose.name, li, x, y, w, pose.flip);
  if (wb) R.box = [Math.min(x, wb[0]), Math.min(y, wb[1]), Math.max(x + w, wb[2]), Math.max(y + h, wb[3])];
  const sc = hSit(rSize()) / 90, u = sc > 0.7 ? 2 : 1;
  // Requisiten bei Raya
  if (anim) {
    const at = anim.t;
    if (anim.type === 'eat') drawSpr('FOOD', R.x - 5.5 * u, R.y - 6 * u, false, u);
    if (anim.type === 'drink') drawSpr('WBOWL', R.x - 5.5 * u, R.y - 4 * u, false, u);
    if (anim.type === 'treat' && at < 0.55) drawSpr('BONE', R.x - 5.5 * u, y - 30 + 30 * (at / 0.55), false, u);
    if (anim.type === 'brush') {
      drawSpr('BRUSH', R.x - 5 * u + Math.sin(at * 9) * w * 0.25, y + h * 0.35 + Math.cos(at * 4.5) * 3, false, u);
      if (Math.floor(at * 10) % 3 === 0) spark(R.x + rnd(-w / 3, w / 3), y + rnd(0, h * 0.7));
    }
    if (anim.type === 'vet') {
      if (at < 1.4) drawSpr('SYRINGE', R.x + w * 0.35 - Math.min(1, at / 0.8) * 5, y + h * 0.4, false, u);
      else if (Math.floor(at * 10) % 2 === 0) spark(R.x + rnd(-w / 2, w / 2), y + rnd(0, h));
    }
    if (anim.type === 'pet' && Math.floor(at * 8) !== Math.floor((at - 0.016) * 8)) heart(R.x + rnd(-w / 4, w / 4), y + 4);
  }
  if (S.clean < 35 && !S.sleeping) {
    ctx.fillStyle = '#5a3418';
    [[-0.18, 0.7], [0.12, 0.85], [-0.05, 0.92], [0.2, 0.55]].forEach(([a, b]) => ctx.fillRect(Math.round(R.x + a * w), Math.round(y + b * h), u, u));
    ctx.fillStyle = '#24120a'; ctx.fillRect(Math.round(R.x + Math.sin(clock * 7) * w * 0.4), Math.round(y + h * 0.2 + Math.cos(clock * 9) * 4), u, u);
  }
  if (S.sick && !S.sleeping && !anim) {
    const k = (clock * 0.8) % 1; ctx.fillStyle = '#93cdf2';
    ctx.fillRect(Math.round(R.x + w * 0.3), Math.round(y + 2 + k * 8), u, 2 * u);
  }
}

/* Möbelpixel, die vor Raya stehen, über sie zeichnen (pixelgenau per Tiefenkarte) */
const occCanvas = document.createElement('canvas'); const occCtx = occCanvas.getContext('2d', { willReadFrequently: true });
const bgData = {};
function bgPixels(ph) {
  if (!bgData[ph]) { const c = document.createElement('canvas'); c.width = RW; c.height = RH; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(ROOM[ph], 0, 0); bgData[ph] = x.getImageData(0, 0, RW, RH).data; }
  return bgData[ph];
}
function drawOccluders(ph, depth) {
  if (!MAP.ready) return;
  const pad = 2, x0 = clamp(Math.floor(R.box[0]) - pad - 10, 0, RW), x1 = clamp(Math.ceil(R.box[2]) + pad + 10, 0, RW);
  const y0 = clamp(Math.floor(R.box[1]) - 30, 0, RH), y1 = clamp(Math.ceil(R.box[3]) + pad, 0, RH);
  const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
  const src = bgPixels(ph), img = occCtx.createImageData(w, h), out = img.data; let any = false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const p = (y0 + y) * RW + x0 + x, od = MAP.occ[p];
    if (od && od > depth) { const o = (y * w + x) * 4, s4 = p * 4; out[o] = src[s4]; out[o + 1] = src[s4 + 1]; out[o + 2] = src[s4 + 2]; out[o + 3] = 255; any = true; }
  }
  if (!any) return;
  occCanvas.width = w; occCanvas.height = h; occCtx.putImageData(img, 0, 0);
  ctx.drawImage(occCanvas, x0, y0);
}

function sceneDraw() {
  const ph = skyPhase(), bg = ROOM[ph];
  ctx.drawImage(bg, 0, 0);
  const rd = rDepth() + 3;
  const items = [];
  S.poops.forEach((p, i) => items.push({ sort: p.y, draw: () => {
    const u = hSit(p.y) > 63 ? 2 : 1;
    drawSpr('POOP', p.x - 4.5 * u, p.y - 7 * u, false, u);
    ctx.fillStyle = '#24120a';
    ctx.fillRect(Math.round(p.x + Math.sin(clock * 6 + i) * 5 * u), Math.round(p.y - 11 * u + Math.cos(clock * 5 + i) * 2), 1, 1);
  } }));
  items.push({ sort: rd, raya: true, draw: () => { drawRaya(); drawOccluders(ph, rd); } });
  EXTRAS.decor.forEach((id) => {
    const it = ITEM_BY_ID[id]; if (!it || !it.place) return;
    const key = it.icon === 'seasonal' ? 'saison:' + seasonalSprite() : id;
    if (!DECOR.img || !DECOR.meta[key]) { items.push({ sort: it.place.sort, draw: () => drawDecor(it) }); return; }
    for (const k of [key, key + ':front']) {
      const m = DECOR.meta[k]; if (!m) continue;
      items.push({ sort: m[6], draw: () => ctx.drawImage(DECOR.img, m[0], m[1], m[2], m[3], m[4], m[5], m[2], m[3]) });
    }
  });
  items.sort((a, b) => a.sort - b.sort);
  for (const it of items) it.draw();

  // Sprechblase über dem Kopf
  if (!anim && !sceneBusy() && clock < R.bubbleEnd && need() && !S.sleeping) {
    const n = need(), bx = Math.round(clamp(R.box[2] - 6, 4, RW - 40)), by = Math.round(Math.max(4, R.box[1] - 34));
    ctx.fillStyle = '#24120a'; ctx.fillRect(bx - 2, by - 2, 34, 30); ctx.fillRect(bx - 4, by, 38, 26);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(bx, by, 30, 26); ctx.fillRect(bx - 2, by + 2, 34, 22);
    ctx.fillStyle = '#24120a'; ctx.fillRect(bx - 6, by + 30, 4, 4); ctx.fillRect(bx - 11, by + 36, 2, 2);
    const c = sprite(n);
    drawSpr(n, bx + Math.floor((30 - c.width * 2) / 2), by + Math.floor((26 - c.height * 2) / 2));
  }
  if (S.sleeping) {
    ctx.fillStyle = 'rgba(14,16,44,0.45)'; ctx.fillRect(0, 0, RW, RH);
    for (let i = 0; i < 3; i++) {
      const k = (clock * 0.5 + i / 3) % 1; ctx.globalAlpha = 1 - k;
      drawSpr('Z', R.box[2] - 12 + k * 14 + i * 3, R.box[1] - 8 - k * 26);
      ctx.globalAlpha = 1;
    }
    if (EXTRAS.decor.has('sternen-schlaf') && atSleepSpot()) drawStarSleep();
  }
  drawParticles();
}

/* Antippen im Raum */
function sceneTap(x, y) {
  if (anim || R.jump || !MAP.ready) return;
  const pi = S.poops.findIndex((p) => Math.abs(p.x - x) < 10 && y > p.y - 18 && y < p.y + 4);
  if (pi >= 0) { S.poops.splice(pi, 1); S.clean += 8; spark(x, y); sfx.good(); toast('Weggeräumt!'); clampAll(); save(); updateUI(); return; }
  const [x0, y0, x1, y1] = R.box;
  if (x > x0 - 4 && x < x1 + 4 && y > y0 - 4 && y < y1 + 4 && !sceneBusy()) { sfx.tap(); pet(); clampAll(); save(); updateUI(); return; }
  if (S.sleeping) { toast('Pssst … Raya schläft.'); return; }
  if (inPolyPt(x, y, TABLES)) { toast('Auf den Tisch darf Raya nicht!'); return; }
  R.userUntil = clock + 20; R.nextDecision = clock + 20;
  // getippte Zelle direkt begehbar? sonst nächste begehbare Stelle
  let k = cIdx(x, y);
  if (!MAP.cells[k]) k = nearestCell(x, y, 0, 12);
  if (k < 0) return;
  goTo({ cell: k }); sfx.tap();
}
