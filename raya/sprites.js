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
  GBONE: spr([   // goldener Knochen
    '.KK.....KK.',
    'KYwK...KYYK',
    'KYwYKKKYYyK',
    '.KYYYYYYyK.',
    'KYYYKKKYyyK',
    'KYyK...KyyK',
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
  TUB: spr([
    '..ww.w.ww...',
    '.w..w.w..w..',
    'KKKKKKKKKKKK',
    'KSSSSSSSSSSK',
    '.KSSSSSSSsK.',
    '.KsSSSSSssK.',
    '..KKKKKKKK..',
    '..Yy....yY..',
  ]),
  CHOC: spr([   // Schokoladentafel – für Hunde giftig!
    'KKKKKKKKK',
    'KMmMKMmMK',
    'KmMMKmMMK',
    'KKKKKKKKK',
    'KMmMKMmMK',
    'KmMMKmMMK',
    'KKKKKKKKK',
    'KSSsSSsSK',
    'KSsSSsSSK',
    'KKKKKKKKK',
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
