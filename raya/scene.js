'use strict';
/* Raya – Wohnzimmer-Szene (384×288)
   Perspektivischer Raum: Raya läuft auf einem Wegnetz über den Boden, springt auf Couch, Hocker
   und Sessel, wird von Möbeln im Vordergrund verdeckt und wird nach hinten kleiner. */

const RW = 384, RH = 288;

/* ---------- Raumgeometrie (in Pixeln des Hintergrundbilds) ---------- */
const NODES = {
  F2: [55, 262],   // vor der Couch, links
  F: [118, 276],   // vor der Couch
  L: [190, 208],   // zwischen Couch-Armlehne und Hocker
  B: [232, 205],   // hinter dem Hocker, vor dem Couchtisch
  R: [272, 226],   // rechts neben dem Hocker
  RB: [272, 192],  // zwischen Couchtisch und Sessel
  RF: [292, 276],  // vorne rechts (Napfplatz)
  FS: [205, 296],  // ganz vorne, vor dem Hocker (nah an der Kamera)
  C: [322, 258],   // vor dem Sessel
};
const EDGES = [['F2', 'F'], ['F', 'FS'], ['FS', 'RF'], ['L', 'B'], ['B', 'R'], ['R', 'RB'], ['R', 'RF'], ['RF', 'C'], ['R', 'C']];

const PERCHES = {
  couch: { x: 180, y: 184, depth: 206, sort: 207, from: 'L', name: 'die Couch',
    hit: [[96, 156], [210, 158], [214, 194], [150, 194], [96, 178]] },
  stool: { x: 216, y: 224, depth: 262, sort: 263.5, from: 'R', name: 'den Hocker',
    hit: [[171, 204], [262, 204], [262, 250], [173, 250]] },
  // Der Sessel steht mit der Lehne zum Betrachter: Raya sitzt dahinter, nur der Kopf schaut über die Lehne
  chair: { x: 320, y: 207, depth: 242, sort: 241, from: 'R', name: 'den Sessel',
    hit: [[281, 186], [316, 158], [370, 154], [370, 212], [361, 240], [306, 243], [281, 200]] },
};
const BOWL = 'RF';

// Möbel, die Raya verdecken können (Polygon wird aus dem Hintergrund ausgeschnitten), sort = Fußlinie
const OCCLUDERS = [
  { sort: 250, poly: [[0, 150], [40, 152], [100, 165], [150, 178], [162, 196], [168, 222], [172, 270], [160, 276], [20, 244], [0, 246]] },
  { sort: 263, poly: [[171, 212], [200, 202], [232, 200], [256, 206], [263, 222], [261, 262], [254, 270], [238, 262], [237, 288], [176, 288], [171, 248]] },
  { sort: 200, poly: [[217, 168], [240, 165], [263, 169], [262, 180], [254, 182], [252, 203], [248, 203], [246, 184], [232, 184], [226, 203], [222, 203], [222, 182], [217, 179]] },
  { sort: 206, poly: [[197, 180], [214, 177], [232, 180], [232, 188], [222, 190], [220, 207], [216, 207], [214, 191], [206, 190], [204, 206], [200, 206], [201, 189], [197, 186]] },
  { sort: 242, poly: [[281, 186], [292, 186], [316, 160], [317, 153], [369, 154], [370, 212], [361, 240], [306, 243], [287, 226], [281, 200]] },
  { sort: 286, poly: [[352, 168], [384, 158], [384, 288], [359, 288], [361, 214], [350, 198]] },
];
OCCLUDERS.forEach((o) => {
  const p = new Path2D(); o.poly.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); o.path = p;
});

/* Sitzhöhe in Pixeln abhängig von der Tiefe (y der Fußlinie) */
const hSit = (depth) => clamp(36 + 0.52 * (depth - 178), 30, 96);

/* ---------- Atlas (Raya in 9 Tiefenstufen) ---------- */
const ATLAS = { img: null, levels: [], tiles: {} };
async function loadAtlas() {
  const [img, meta] = await Promise.all([loadImg('raya-atlas.png'), fetch('raya-atlas.json').then((r) => r.json())]);
  ATLAS.img = img; ATLAS.levels = meta.levels; ATLAS.tiles = meta.tiles;
}
function levelFor(depth) {
  const want = hSit(depth) / 90; let best = 0;
  ATLAS.levels.forEach((l, i) => { if (Math.abs(l - want) < Math.abs(ATLAS.levels[best] - want)) best = i; });
  return best;
}

/* ---------- Geometrie-Helfer ---------- */
function inPolyPt(x, y, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
function nearestOnGraph(x, y) {
  let best = null;
  for (const [a, b] of EDGES) {
    const [ax, ay] = NODES[a], [bx, by] = NODES[b];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / L, 0, 1);
    const px = ax + dx * t, py = ay + dy * t, d = Math.hypot(px - x, (py - y) * 1.6);
    if (!best || d < best.d) best = { x: px, y: py, a, b, d };
  }
  return best;
}
function nodePt(n) { return { x: NODES[n][0], y: NODES[n][1], a: n, b: n }; }
function randomFloorPoint() {
  const [a, b] = EDGES[Math.floor(Math.random() * EDGES.length)], t = Math.random();
  return { x: Math.round(NODES[a][0] + (NODES[b][0] - NODES[a][0]) * t), y: Math.round(NODES[a][1] + (NODES[b][1] - NODES[a][1]) * t), a, b };
}
/* kürzester Weg über das Wegnetz (Dijkstra mit Start/Ziel als Zusatzknoten) */
function route(from, to) {
  const P = {}; for (const n in NODES) P[n] = NODES[n];
  P.$s = [from.x, from.y]; P.$t = [to.x, to.y];
  const adj = {}; const link = (u, v) => { (adj[u] = adj[u] || []).push(v); (adj[v] = adj[v] || []).push(u); };
  EDGES.forEach(([a, b]) => link(a, b));
  link('$s', from.a); link('$s', from.b); link('$t', to.a); link('$t', to.b);
  if ((from.a === to.a && from.b === to.b) || (from.a === to.b && from.b === to.a) || from.a === to.a || from.b === to.b) link('$s', '$t');
  const dist = { $s: 0 }, prev = {}, open = new Set(Object.keys(P));
  while (open.size) {
    let u = null; for (const n of open) if (dist[n] !== undefined && (u === null || dist[n] < dist[u])) u = n;
    if (u === null || u === '$t') break;
    open.delete(u);
    for (const v of adj[u] || []) {
      const d = dist[u] + Math.hypot(P[u][0] - P[v][0], P[u][1] - P[v][1]);
      if (dist[v] === undefined || d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  const out = []; let n = '$t';
  while (n && n !== '$s') {
    out.unshift(n === '$t' ? { x: to.x, y: to.y, a: to.a, b: to.b } : nodePt(n));
    n = prev[n];
  }
  return out;
}

/* ---------- Raya als Figur im Raum ---------- */
const R = {
  x: NODES.R[0], y: NODES.R[1], a: 'R', b: 'R', perch: null, path: [], jump: null, dir: -1,
  task: null, nextDecision: 4, userUntil: 0, blinkAt: 2, blinkEnd: 0, tiltAt: 6, tiltEnd: 0, tiltDir: 1,
  standEnd: 0, hopEnd: 0, bubbleAt: 4, bubbleEnd: 0, box: [0, 0, 0, 0],
};
function rDepth() { return R.perch ? PERCHES[R.perch].depth : (R.jump ? R.jump.depth : R.y); }
function rSort() { return R.perch ? PERCHES[R.perch].sort : (R.jump ? R.jump.sort : R.y); }
function placeFloor(n = 'R') { Object.assign(R, nodePt(n), { perch: null, path: [], jump: null, task: null }); }
function placePerch(p) { const P = PERCHES[p]; Object.assign(R, { x: P.x, y: P.y, perch: p, path: [], jump: null }); }
/* Schlafplatz: Couch – oder das Hundebett, wenn es aufgestellt ist */
function sleepSpot() { return EXTRAS.decor.has('hundebett') ? { floor: nodePt('F2') } : { perch: 'couch' }; }
function atSleepSpot() {
  if (EXTRAS.decor.has('hundebett')) return !R.perch && !R.jump && Math.hypot(R.x - NODES.F2[0], R.y - NODES.F2[1]) < 1;
  return R.perch === 'couch';
}
function placeSleep() { if (EXTRAS.decor.has('hundebett')) placeFloor('F2'); else placePerch('couch'); }
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

function goTo(target, task) {
  const path = [];
  let start = { x: R.x, y: R.y, a: R.a, b: R.b };
  if (R.jump) { R.path = []; return; }
  if (R.perch) {
    if (target.perch === R.perch) { R.path = []; R.task = task || null; return; }
    const f = PERCHES[R.perch].from; path.push({ jumpDown: f }); start = nodePt(f);
  }
  if (target.perch) {
    const f = PERCHES[target.perch].from;
    path.push(...route(start, nodePt(f)), { jumpTo: target.perch });
  } else {
    path.push(...route(start, target.floor));
  }
  R.path = path; R.task = task || null;
}
function startJump(toX, toY, fromDepth, toDepth, fromSort, toSort, end) {
  R.jump = { x0: R.x, y0: R.y, x1: toX, y1: toY, t: 0, dur: 0.5, d0: fromDepth, d1: toDepth, s0: fromSort, s1: toSort, end, depth: fromDepth, sort: fromSort };
  R.dir = Math.sign(toX - R.x) || R.dir;
  sfx.jump();
}

function sceneUpdate(dt) {
  clock += dt;
  if (anim) { anim.t += dt; if (anim.t >= anim.dur) { const a = anim; anim = null; a.end && a.end(); } }
  tickParticles(dt);

  // Sprung
  if (R.jump) {
    const j = R.jump; j.t += dt; const k = Math.min(1, j.t / j.dur);
    R.x = j.x0 + (j.x1 - j.x0) * k;
    R.y = j.y0 + (j.y1 - j.y0) * k - Math.sin(k * Math.PI) * hSit(Math.max(j.d0, j.d1)) * 0.45;
    j.depth = j.d0 + (j.d1 - j.d0) * k; j.sort = k < 0.6 ? Math.max(j.s0, j.s1) + 0.1 : j.s1;
    if (k >= 1) { R.y = j.y1; const e = j.end; R.jump = null; e(); }
    return;
  }
  // Laufen
  if (R.path.length && !anim) {
    const step = R.path[0];
    if (step.jumpTo) {
      const P = PERCHES[step.jumpTo]; R.path.shift();
      startJump(P.x, P.y, R.y, P.depth, R.y, P.sort, () => { R.perch = step.jumpTo; });
      return;
    }
    if (step.jumpDown) {
      const P = PERCHES[R.perch], n = nodePt(step.jumpDown); R.path.shift();
      R.perch = null;
      startJump(n.x, n.y, P.depth, n.y, P.sort, n.y, () => { Object.assign(R, { a: n.a, b: n.b }); });
      return;
    }
    const sp = hSit(R.y) * 1.0 * dt;
    const dx = step.x - R.x, dy = step.y - R.y, d = Math.hypot(dx, dy);
    if (Math.abs(dx) > 0.5) R.dir = Math.sign(dx);
    if (d <= sp) { R.x = step.x; R.y = step.y; R.a = step.a; R.b = step.b; R.path.shift(); if (!R.path.length) R.standEnd = clock + rnd(1, 2.5); }
    else { R.x += (dx / d) * sp; R.y += (dy / d) * sp; }
    return;
  }
  // angekommen → Aufgabe ausführen
  if (R.task && !anim) { const t = R.task; R.task = null; t(); return; }

  const m = mood();
  // Schlafenszeit: auf die Couch
  if (S.sleeping) { if (!atSleepSpot() && !R.path.length) goTo(sleepSpot()); return; }
  if (anim) return;

  // eigene Entscheidungen
  if (clock > R.nextDecision && clock > R.userUntil) {
    R.nextDecision = clock + rnd(7, 15);
    const r = Math.random();
    if (S.energy < 35 && R.perch !== 'chair' && r < 0.6) goTo({ perch: 'chair' });
    else if (m === 'sick' || m === 'sad') { if (r < 0.3 && R.perch !== 'couch') goTo({ perch: 'couch' }); }
    else if (r < 0.42) goTo({ floor: randomFloorPoint() });
    else if (r < 0.6) goTo({ perch: 'couch' });
    else if (r < 0.72) goTo({ perch: 'stool' });
    else if (r < 0.82) goTo({ perch: 'chair' });
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
  else if (!R.perch && (clock < R.standEnd || (m === 'happy' && Math.sin(clock * 0.21) > 0.6))) name = 'stand';
  if (blink && (name === 'sit' || name === 'stand')) name += '-closed';
  if (clock < R.hopEnd) dy = -Math.round(Math.sin(((R.hopEnd - clock) / 0.35) * Math.PI) * 4);
  return { name, flip, dy, dx };
}

function drawRaya() {
  const pose = scenePose(), li = levelFor(rDepth());
  const t = ATLAS.tiles[pose.name][li], [sx, sy, w, h] = t;
  const x = Math.round(R.x - w / 2 + pose.dx), y = Math.round(R.y - h + pose.dy);
  if (pose.flip) { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(ATLAS.img, sx, sy, w, h, -x - w, y, w, h); ctx.restore(); }
  else ctx.drawImage(ATLAS.img, sx, sy, w, h, x, y, w, h);
  if (EXTRAS.outfit) drawWear(EXTRAS.outfit, pose.name, x, y, w, pose.flip);
  R.box = [x, y, x + w, y + h];
  const sc = hSit(rDepth()) / 90, u = sc > 0.7 ? 2 : 1;
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

function sceneDraw() {
  const ph = skyPhase(), bg = ROOM[ph];
  ctx.drawImage(bg, 0, 0);
  // alles nach Tiefe sortiert zeichnen
  const items = [];
  S.poops.forEach((p, i) => items.push({ sort: p.y, draw: () => {
    const u = hSit(p.y) > 63 ? 2 : 1;
    drawSpr('POOP', p.x - 4.5 * u, p.y - 7 * u, false, u);
    ctx.fillStyle = '#24120a';
    ctx.fillRect(Math.round(p.x + Math.sin(clock * 6 + i) * 5 * u), Math.round(p.y - 11 * u + Math.cos(clock * 5 + i) * 2), 1, 1);
  } }));
  items.push({ sort: rSort(), raya: true, draw: drawRaya });
  EXTRAS.decor.forEach((id) => { const it = ITEM_BY_ID[id]; if (it && it.place) items.push({ sort: it.place.sort, draw: () => drawDecor(it) }); });
  OCCLUDERS.forEach((o) => items.push({ sort: o.sort, occ: true, draw: () => { ctx.save(); ctx.clip(o.path); ctx.drawImage(bg, 0, 0); ctx.restore(); } }));
  items.sort((a, b) => a.sort - b.sort);
  // Möbel hinter Raya müssen nicht neu gezeichnet werden
  let seen = false;
  for (const it of items) { if (it.raya) seen = true; if (seen || !it.occ) it.draw(); }

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
  if (anim || R.jump) return;
  const pi = S.poops.findIndex((p) => Math.abs(p.x - x) < 10 && y > p.y - 18 && y < p.y + 4);
  if (pi >= 0) { S.poops.splice(pi, 1); S.clean += 8; spark(x, y); sfx.good(); toast('Weggeräumt!'); clampAll(); save(); updateUI(); return; }
  const [x0, y0, x1, y1] = R.box;
  if (x > x0 - 4 && x < x1 + 4 && y > y0 - 4 && y < y1 + 4 && !sceneBusy()) { sfx.tap(); pet(); clampAll(); save(); updateUI(); return; }
  if (S.sleeping) { toast('Pssst … Raya schläft.'); return; }
  R.userUntil = clock + 20; R.nextDecision = clock + 20;
  for (const k in PERCHES) {
    if (inPolyPt(x, y, PERCHES[k].hit)) { goTo({ perch: k }); sfx.tap(); return; }
  }
  if (OCCLUDERS[2].poly && (inPolyPt(x, y, OCCLUDERS[2].poly) || inPolyPt(x, y, OCCLUDERS[3].poly))) { toast('Auf den Tisch darf Raya nicht!'); return; }
  const p = nearestOnGraph(x, y);
  if (p.d > 70) return;
  goTo({ floor: p }); sfx.tap();
}
