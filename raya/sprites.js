'use strict';
/* Raya – Pixel-Renderer & Sprites
   Alle Figuren werden prozedural in kleine Pixel-Puffer gezeichnet
   (ohne Kantenglättung) und danach mit einer dunklen Kontur versehen. */

const PAL = {
  K: '#24120a', // Kontur
  D: '#3a1b0c', // dunkler Sattel / Ohren
  d: '#5a2c14',
  R: '#a8481c', // Rost (Grundfell)
  r: '#c2602a',
  O: '#dc8240', // Orange-Highlight
  L: '#efc38f', // Creme (Brust, Pfoten)
  G: '#8c7c70', // graue Schnauze
  g: '#b6a594',
  N: '#141010', // Nase
  E: '#1a0c06', // Augen
  w: '#ffffff',
  P: '#e2647e', // Zunge
  p: '#a83a56',
  B: '#3f8fd8', b: '#93cdf2',
  Y: '#f2c94c', y: '#c4952a',
  T: '#4f9a4a', t: '#2f6b33',
  M: '#6b3f1e', m: '#8f5a2e',
  S: '#d3d8de', s: '#8a919b',
  X: '#d94040', x: '#962828',
  Z: '#f7ead2',
};

function hash(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function inPoly(x, y, p) {
  let c = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [xi, yi] = p[i], [xj, yj] = p[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const fur = (a, b, c, p1 = 0.1, p2 = 0.94) => (X, Y) => {
  const h = hash(Math.floor(X), Math.floor(Y * 0.7));
  return h < p1 ? b : h > p2 ? c : a;
};
const lerp = (a, b, t) => a + (b - a) * t;

class PBuf {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); this.T = []; }
  push(t) { this.T.push(Object.assign({ dx: 0, dy: 0, a: 0, px: 0, py: 0 }, t)); }
  pop() { this.T.pop(); }
  loc(x, y) {
    let X = x + 0.5, Y = y + 0.5;
    for (const t of this.T) {
      X -= t.dx; Y -= t.dy;
      if (t.a) {
        const c = Math.cos(-t.a), s = Math.sin(-t.a), ux = X - t.px, uy = Y - t.py;
        X = t.px + ux * c - uy * s; Y = t.py + ux * s + uy * c;
      }
    }
    return [X, Y];
  }
  fill(test, col) {
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const [X, Y] = this.loc(x, y);
      if (test(X, Y)) { const c = typeof col === 'function' ? col(X, Y) : col; if (c) this.d[y * this.w + x] = c; }
    }
  }
  ell(cx, cy, rx, ry, col) { this.fill((X, Y) => ((X - cx) / rx) ** 2 + ((Y - cy) / ry) ** 2 <= 1, col); }
  rect(x, y, w, h, col) { this.fill((X, Y) => X >= x && X < x + w && Y >= y && Y < y + h, col); }
  poly(p, col) { this.fill((X, Y) => inPoly(X, Y, p), col); }
  outline(c = 'K') {
    const { w, h, d } = this, o = d.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (d[y * w + x]) continue;
      if ((x > 0 && d[y * w + x - 1]) || (x < w - 1 && d[y * w + x + 1]) ||
          (y > 0 && d[(y - 1) * w + x]) || (y < h - 1 && d[(y + 1) * w + x])) o[y * w + x] = c;
    }
    this.d = o;
  }
  toCanvas() {
    const c = document.createElement('canvas'); c.width = this.w; c.height = this.h;
    const x = c.getContext('2d');
    for (let i = 0; i < this.d.length; i++) {
      const k = this.d[i]; if (!k) continue;
      x.fillStyle = PAL[k] || k; x.fillRect(i % this.w, (i / this.w) | 0, 1, 1);
    }
    return c;
  }
}

/* ---------- Raya von vorn (48×48) ----------
   o: pose 'sit'|'lie', tilt (rad), earL/earR (0 hoch … 1 hängend),
      eyes 'open'|'closed'|'happy'|'sad'|'half', tongue, mouth, tail (-1…1), headDy, bob */
function drawDog(o = {}) {
  const b = new PBuf(48, 48);
  const sit = o.pose !== 'lie';
  const tw = o.tail || 0;
  b.push({ dy: o.bob || 0 });

  // Rute
  if (sit) {
    b.ell(35 + tw * 2.4, 37 - Math.abs(tw) * 1.5, 4.8, 3.5, fur('d', 'D', 'R'));
    b.ell(37.6 + tw * 3.2, 35 - Math.abs(tw), 2.1, 1.7, fur('R', 'r', 'O'));
  } else {
    b.ell(40 + tw * 1.6, 41 - Math.abs(tw), 5.2, 2.7, fur('d', 'D', 'R'));
  }

  if (sit) {
    b.ell(14.5, 42.5, 4, 3.2, fur('d', 'D', 'R'));
    b.ell(33.5, 42.5, 4, 3.2, fur('d', 'D', 'R'));
    b.ell(24, 34.5, 10.6, 10.6, (X, Y) => {
      const dx = Math.abs(X - 24);
      if (dx > 7 && Y < 40) return fur('D', 'd', 'R')(X, Y);
      if (dx < 4.2 + (Y - 26) * 0.12 && Y < 42) return fur('O', 'r', 'L', 0.12, 0.8)(X, Y);
      return fur('R', 'r', 'O')(X, Y);
    });
    const leg = (X, Y) => (Y >= 43.6 ? fur('L', 'O', 'L')(X, Y) : fur('R', 'r', 'O')(X, Y));
    b.rect(17, 36, 4.6, 10, leg);
    b.rect(26.4, 36, 4.6, 10, leg);
  } else {
    b.ell(25, 39.5, 15.5, 6.5, (X, Y) => (Y < 37.5 ? fur('D', 'd', 'R')(X, Y) : fur('R', 'r', 'O')(X, Y)));
    const paw = (X, Y) => (X < 19.6 || (X > 28 && X < 33.6) ? fur('L', 'O', 'L')(X, Y) : fur('R', 'r', 'O')(X, Y));
    b.rect(13, 42, 7, 4, (X, Y) => (X < 16 ? fur('L', 'O', 'L')(X, Y) : fur('R', 'r', 'O')(X, Y)));
    b.rect(28, 42, 7, 4, (X, Y) => (X > 31 ? fur('L', 'O', 'L')(X, Y) : fur('R', 'r', 'O')(X, Y)));
    void paw;
  }

  // Kopf
  b.push({ dy: (sit ? 0 : 9) + (o.headDy || 0), a: o.tilt || 0, px: 24, py: 25 });
  const ear = (side, droop) => {
    const m = (x) => (side < 0 ? x : 48 - x);
    const tipX = lerp(11, 4.5, droop), tipY = lerp(3, 15.5, droop);
    const A = [m(15.5), 17], Bp = [m(21.5), 12.5], T = [m(tipX), tipY];
    const F = [m(lerp(13.2, 9, droop) - 2.6), lerp(9, 17, droop)];
    b.poly([A, F, T, [m(lerp(17.5, 13, droop)), lerp(5.5, 11, droop)], Bp], fur('D', 'd', 'R', 0.2, 0.95));
    b.poly([[m(16.8), 15.5], [m(tipX + lerp(2.3, 2, droop)), lerp(5.8, 14.6, droop)], [m(20.2), 13]], fur('R', 'd', 'r', 0.25, 0.9));
  };
  ear(-1, o.earL ?? 0.15);
  ear(1, o.earR ?? 0.15);
  b.ell(15.3, 23.3, 3.3, 3.8, fur('d', 'R', 'r'));
  b.ell(32.7, 23.3, 3.3, 3.8, fur('d', 'R', 'r'));
  b.ell(24, 20, 9.6, 8, (X, Y) => {
    const dx = Math.abs(X - 24);
    if (dx > 6.2) return fur('r', 'R', 'O')(X, Y);
    if (Y < 14.5) return fur('R', 'd', 'r')(X, Y);
    return fur('R', 'r', 'O', 0.12, 0.88)(X, Y);
  });
  b.ell(24, 24.7, 4.7, 3.4, fur('g', 'G', 'L', 0.22, 0.86));

  const eye = (cx, cy, side) => {
    const st = o.eyes || 'open';
    if (st === 'open' || st === 'sad') {
      b.ell(cx, cy, 1.95, st === 'sad' ? 1.7 : 2.05, 'E');
      b.rect(cx - 1.2, cy - 1.3, 1, 1, 'w');
    } else if (st === 'half') {
      b.fill((X, Y) => ((X - cx) / 1.75) ** 2 + ((Y - cy) / 1.8) ** 2 <= 1 && Y > cy - 0.2, 'E');
      b.rect(cx - 1.8, cy - 1.1, 3.6, 1, 'd');
    } else if (st === 'closed') {
      b.rect(cx - 1.8, cy, 3.6, 1, 'E');
    } else if (st === 'happy') {
      b.fill((X, Y) => Math.abs(X - cx) < 2 && Math.abs(Y - (cy + 0.4 - (1.5 - Math.abs(X - cx) * 0.9))) < 0.55, 'E');
    }
    if (st === 'sad') {
      b.fill((X, Y) => Math.abs(X - cx) < 1.9 && Math.abs(Y - (cy - 2.6 - (X - cx) * 0.35 * side)) < 0.55, 'd');
    } else {
      b.ell(cx - 0.1 * side, cy - 2.8, 1.7, 0.9, 'O');
    }
  };
  eye(20.4, 19.2, -1);
  eye(27.6, 19.2, 1);

  b.ell(24, 22.4, 2.2, 1.5, 'N');
  b.rect(23, 21.5, 1, 1, 'g');
  if (o.mouth) {
    b.ell(24, 26.1, 2.6, 1.7, 'p');
    if (o.tongue !== false) b.ell(24.3, 27, 1.5, 1.2, 'P');
  } else {
    b.rect(23.6, 23.6, 0.9, 1.4, 'K');
    b.fill((X, Y) => Math.abs(X - 24) < 2.6 && Math.abs(Y - (25.4 + (Math.abs(X - 24) < 1 ? 0.6 : 0))) < 0.5, 'K');
    if (o.tongue) { b.ell(24.6, 27.4, 1.7, 2.1, 'P'); b.rect(24.4, 26.4, 0.7, 2, 'p'); }
  }
  b.pop();
  b.pop();
  b.outline();
  return b;
}

/* ---------- Raya von der Seite (34×24), schaut nach rechts ---------- */
function drawSide(frame = 0, jump = false, tail = 0) {
  const b = new PBuf(34, 24);
  const legA = jump ? [-0.9, -0.7, 0.9, 0.7] : [
    [0.55, -0.45, -0.5, 0.5], [0.15, 0.15, 0, 0], [-0.45, 0.55, 0.5, -0.5], [0.15, 0.15, 0, 0],
  ][frame % 4];
  const leg = (x, y, a, col, paw) => {
    b.push({ a, px: x + 1.5, py: y });
    b.rect(x, y, 3, 7.5, (X, Y) => (Y > y + 5.6 ? paw : col));
    b.pop();
  };
  b.push({ a: -0.35 + tail * 0.25, px: 9, py: 10 });
  b.ell(5.5, 8, 3.8, 2.2, fur('d', 'D', 'R'));
  b.pop();
  leg(19, 13, legA[1], 'd', 'g');
  leg(11, 13, legA[3], 'd', 'g');
  b.ell(15, 12, 8.6, 5, (X, Y) => (Y < 10.3 ? fur('D', 'd', 'R')(X, Y) : fur('R', 'r', 'O')(X, Y)));
  leg(21, 13, legA[0], 'R', 'L');
  leg(9, 13, legA[2], 'R', 'L');
  b.poly([[22, 6], [25.6, 4.6], [20.4, -0.5], [19.4, 3]], fur('D', 'd', 'R'));
  b.ell(22, 11, 2.6, 3.2, fur('d', 'R', 'r'));
  b.ell(25, 8.5, 5, 4.4, fur('R', 'r', 'O'));
  b.ell(29.4, 10.2, 2.9, 2, fur('g', 'G', 'L'));
  b.ell(31.6, 9.5, 1.1, 1, 'N');
  b.rect(25.4, 6.8, 1.2, 1.6, 'E');
  b.rect(24.6, 5.4, 2.2, 0.9, 'O');
  if (!jump) b.ell(29, 12.7, 1, 1.4, 'P');
  b.outline();
  return b;
}

/* ---------- kleine Sprites als Strings ---------- */
function spr(rows) {
  const w = Math.max(...rows.map((r) => r.length));
  const b = new PBuf(w, rows.length);
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') b.d[y * w + x] = ch; }));
  return b;
}

const SPR = {
  FOOD: spr([
    '...m.M.m...',
    '..MmmMmMm..',
    '.mMmMmMmMm.',
    'KXXXXXXXXXK',
    'KXwXXXXXXXK',
    '.KXXXXXXXK.',
    '..KxxxxxK..',
    '...KKKKK...',
  ]),
  BONE: spr([
    '.KK.....KK.',
    'KLLK...KLLK',
    'KLLLKKKLLLK',
    '.KLLLLLLLK.',
    'KLLLKKKLLLK',
    'KLLK...KLLK',
    '.KK.....KK.',
  ]),
  DROP: spr([
    '....K....',
    '...KbK...',
    '...KbK...',
    '..KbbbK..',
    '.KbbBbbK.',
    '.KbwBBbK.',
    'KbwBBBBbK',
    'KbwBBBBBK',
    'KbBBBBBBK',
    '.KBBBBBK.',
    '..KKKKK..',
  ]),
  BALL: spr([
    '..KKKKK..',
    '.KYYYYyK.',
    'KYwYYYyyK',
    'KYYYwwYYK',
    'KYYwYYYYK',
    'KywYYYYYK',
    'KYYYYYYyK',
    '.KyYYYyK.',
    '..KKKKK..',
  ]),
  PAW: spr([
    '...KK.KK...',
    '..KMMKMMK..',
    '..KMMKMMK..',
    'KK.KK.KK.KK',
    'MMK.....KMM',
    'KKK.KKK.KKK',
    '...KMMMK...',
    '..KMMMMMK..',
    '..KMMMMMK..',
    '...KKKKK...',
  ]),
  HEART: spr([
    '.KK...KK.',
    'KXXK.KXXK',
    'KXwXKXXXK',
    'KXXXXXXXK',
    '.KXXXXXK.',
    '..KXXXK..',
    '...KXK...',
    '....K....',
  ]),
  MOON: spr([
    '...KKK...',
    '..KYYK...',
    '.KYYK....',
    'KYYYK....',
    'KYYK.....',
    'KYYYK...K',
    '.KYYYKKKK',
    '..KYYYYK.',
    '...KKKK..',
  ]),
  BRUSH: spr([
    '........KK.',
    '.......KmmK',
    '......KmmK.',
    '.....KmmK..',
    '.KKKKKKK...',
    'KmmmmmmK...',
    'KMMMMMMK...',
    'KKKKKKKK...',
    'S.S.S.S....',
  ]),
  POOP: spr([
    '....K....',
    '...KMK...',
    '..KMmMK..',
    '..KMMMK..',
    '.KMmMMMK.',
    '.KMMMmMK.',
    'KMMmMMMMK',
    '.KKKKKKK.',
  ]),
  CROSS: spr([
    '..KKKKK..',
    '..KXXXK..',
    'KKKXXXKKK',
    'KXXXXXXXK',
    'KXXXwXXXK',
    'KXXXXXXXK',
    'KKKXXXKKK',
    '..KXXXK..',
    '..KKKKK..',
  ]),
  WBOWL: spr([
    '.bbbbbbbbb.',
    'KBBwBBBBBBK',
    'KBBBBBBBBBK',
    '.KBBBBBBBK.',
    '..KbbbbbK..',
    '...KKKKK...',
  ]),
  SYRINGE: spr([
    '.KKKKKKK....',
    'KSwbbbbSKK..',
    'KSbbbbbSKsss',
    '.KKKKKKK....',
  ]),
  Z: spr(['ZZZZ', '..Z.', '.Z..', 'ZZZZ']),
  SPARK: spr(['..Y..', '..Y..', 'YYwYY', '..Y..', '..Y..']),
  MINIHEART: spr(['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..']),
  HYDRANT: spr([
    '..KKK..',
    '.KXXXK.',
    'KKXXXKK',
    'KXXwXXK',
    'KKXXXKK',
    '.KXXXK.',
    '.KXwXK.',
    '.KXXXK.',
    '.KXXXK.',
    'KKKKKKK',
    'KxxxxxK',
  ]),
};

/* App-Icon (für Manifest), Raya auf orangem Kreis */
function renderIcon(size, maskable) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const x = c.getContext('2d'); x.imageSmoothingEnabled = false;
  x.fillStyle = '#2b1a10'; x.fillRect(0, 0, size, size);
  x.fillStyle = '#d9772f';
  x.beginPath(); x.arc(size / 2, size / 2, size * (maskable ? 0.4 : 0.47), 0, Math.PI * 2); x.fill();
  const dog = drawDog({ eyes: 'open', tongue: true, tail: 0.5, tilt: -0.12 }).toCanvas();
  const s = (size * (maskable ? 0.62 : 0.8)) / 38;
  x.drawImage(dog, 5, 1, 38, 38, size / 2 - 19 * s, size / 2 - 19.5 * s, 38 * s, 38 * s);
  return c;
}
