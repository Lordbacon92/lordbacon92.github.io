'use strict';
/* Raya – Gegenstände (Kleidung & Deko) für Shop und Entdeckungen
   Zentrale, erweiterbare Definition. Grafiken sind Pixel-Platzhalter im Stil des Spiels. */

/* ---------- Belohnungsregeln (zentral konfigurierbar) ---------- */
const REWARD_RULES = {
  dailyFirstEntry: 20,                 // erster Gassi-Eintrag eines Tages
  milestones: [                        // einmalige Boni für unterschiedliche Gassi-Tage
    { days: 3, paws: 30 },
    { days: 7, paws: 70 },
  ],
  discoveries: [                       // einmalige Freischaltungen
    { id: 'first-wald', label: 'Erster Waldspaziergang', category: 'wald', unlocks: 'wald-ecke' },
    { id: 'first-strand', label: 'Erster Strandspaziergang', category: 'strand', unlocks: 'strandball' },
    { id: 'days-3', label: 'Gassi an 3 verschiedenen Tagen', days: 3, unlocks: 'sternen-schlaf' },
  ],
};
const WALK_CATEGORIES = [
  { id: 'park', label: 'Park' }, { id: 'wald', label: 'Wald' }, { id: 'stadt', label: 'Stadt' },
  { id: 'wiese', label: 'Wiese' }, { id: 'strand', label: 'Strand' }, { id: 'sonstiges', label: 'Sonstiges' },
];

/* zusätzliche Farben für die Gegenstände */
Object.assign(PAL, {
  V: '#7a4fb0', v: '#a98ad6', C: '#2f8f8a', c: '#6cc4bd', F: '#3d6b2f', f: '#6c9a3a',
  U: '#e07a1f', u: '#b25812', H: '#6e4a24', h: '#a87842', A: '#f28fb0', a: '#ffd1e0',
  I: '#b8463c', i: '#d86a5a', n: '#2a2f6a', W: '#f4f8ff', j: '#1f5fae',
});

/* ---------- Pixel-Grafiken ---------- */
const ITEM_SPR = {
  BED: spr([
    '....KKKKKKKKKKKKKKKKKK....',
    '..KKIIIIIIIIIIIIIIIIIIKK..',
    '.KIIiiiiiiiiiiiiiiiiiiIIK.',
    'KIIiZZZZZZZZZZZZZZZZZZiIIK',
    'KIiZZZZZZZZZZZZZZZZZZZZiIK',
    'KIiZZZZZZZZZZZZZZZZZZZZiIK',
    'KIIiiiZZZZZZZZZZZZZZiiiIIK',
    '.KIIIiiiiiiiiiiiiiiiiIIIK.',
    '..KKIIIIIIIIIIIIIIIIIIKK..',
    '....KKKKKKKKKKKKKKKKKK....',
  ]),
  BLANKET: spr([
    '.KKKKKKKKKKKKKKKKKKKKKK.',
    'KVvVvVvVvVvVvVvVvVvVvVvK',
    'KvVcVvVcVvVcVvVcVvVcVvVK',
    'KVvVvVvVvVvVvVvVvVvVvVvK',
    'KvVcVvVcVvVcVvVcVvVcVvVK',
    'KKKKKKKKKKKKKKKKKKKKKKKK',
    '.V.V.V.V.V.V.V.V.V.V.V..',
  ]),
  BASKET: spr([
    '...KK....KKK..',
    '..KXXK..KYYYK.',
    '..KXwK.KYYwYK.',
    '..KXXK.KYYYYK.',
    'KKKKKKKKKKKKKK',
    'KhHhHhHhHhHhHK',
    'KHhHhHhHhHhHhK',
    'KhHhHhHhHhHhHK',
    'KHhHhHhHhHhHhK',
    '.KhHhHhHhHhHK.',
    '..KKKKKKKKKK..',
  ]),
  BOWL2: spr([
    '...m.M.m...',
    '..MmmMmMm..',
    'KCCCCCCCCCK',
    'KCwCCCCCCCK',
    '.KCCCCCCCK.',
    '..KccccccK.',
    '...KKKKKK..',
  ]),
  PLANT: spr([
    '....T..t....',
    '..t.TT.t..T.',
    '.TT..TtT.TT.',
    '..TT.tTTTT..',
    'T..TTtTt..tT',
    '.TTt.TtT.TT.',
    '...TTtTtTT..',
    '....tTTt....',
    '.....tT.....',
    '..KKKKKKKK..',
    '..KUUUUUUK..',
    '..KuUUUUuK..',
    '...KuUUuK...',
    '...KuUUuK...',
    '...KKKKKK...',
  ]),
  PUMPKIN: spr([
    '.....tt.....',
    '....KtKK....',
    '..KKUUUUKK..',
    '.KUuUUUUuUK.',
    'KUuUUuUUuUUK',
    'KUuUUuUUuUUK',
    'KUuUUuUUuUUK',
    '.KUuUUUUuUK.',
    '..KKUUUUKK..',
    '....KKKK....',
  ]),
  TREE: spr([
    '.....Y.....',
    '....YYY....',
    '.....T.....',
    '....TTT....',
    '...TXTTT...',
    '....TTT....',
    '...TTTYT...',
    '..TTTTTTT..',
    '...TBTTT...',
    '..TTTTTXT..',
    '.TTYTTTTTT.',
    'TTTTTTBTTTT',
    '.....M.....',
    '....KMK....',
    '...KXXXK...',
    '...KXXXK...',
  ]),
  TULIPS: spr([
    '.X..A..Y..',
    'XXX.AA.YY.',
    'XXX.AAAYYY',
    '.X...A..Y.',
    '.t...t..t.',
    '..t..t.t..',
    '...t.tt...',
    '...ttt....',
    '..KKKKKK..',
    '..KbbbbK..',
    '..KBbbBK..',
    '..KBbbBK..',
    '..KBBBBK..',
    '...KKKK...',
  ]),
  FOREST: spr([
    '......X.......M...',
    '.....XwX.....MmM..',
    '....XXXXX...MmMmM.',
    '......L.....MmMmM.',
    '......L......MmM..',
    '..FFfFLFFfF...M...',
    '.FfFFfFFFfFFF.....',
    'FFFfFFFfFFFfFFF...',
    '.KKKKKKKKKKKKK....',
  ]),
  BEACHBALL: spr([
    '...KKKKK...',
    '..KXXwBBK..',
    '.KXXXwBBBK.',
    'KXXXwwwBBBK',
    'KYYwwwwwbbK',
    'KYYYwwwbbbK',
    'KYYYwwwbbbK',
    '.KYYYwbbbK.',
    '..KYYwbbK..',
    '...KKKKK...',
  ]),
  STARS: spr([
    '..Y.......Y.',
    '.YYY.....YwY',
    '..Y...KK..Y.',
    '.....KYYK...',
    '....KYYK....',
    '....KYK...Y.',
    '....KYYK..w.',
    '.Y...KYYK...',
    'YwY...KK....',
    '.Y.......Y..',
  ]),
  // Symbole für die Kleidung im Shop
  ICON_SCARF: spr([
    'KKKKKKKKKKKK',
    'KXXXXXXXXXXK',
    '.KXXwXXXwXK.',
    '..KXXXXXXK..',
    '...KXwXXK...',
    '....KXXK....',
    '.....KK.....',
  ]),
  ICON_COAT: spr([
    '...KKKKKK...',
    '..KjBBBBjK..',
    '.KBBBKKBBBK.',
    'KBBBK..KBBBK',
    'KBBBKYYKBBBK',
    '.KBBBBBBBBK.',
    '.KBBBYBBBBK.',
    '.KBBBBBBBBK.',
    '.KBBBYBBBBK.',
    '.KjBBBBBBjK.',
    '..KKKKKKKK..',
  ]),
  ICON_XMAS: spr([
    '........KK..',
    '.......KWWK.',
    '.....KKKWWK.',
    '....KXXK.K..',
    '...KXXXK....',
    '..KXXXXXK...',
    '.KXXXXXXXK..',
    'KWWWWWWWWWK.',
    'KWWWWWWWWWK.',
    '.KKKKKKKKK..',
  ]),
  ICON_WREATH: spr([
    '..A.Y.a.A...',
    '.AYAtaYatAY.',
    'tA.tYaAt.tA.',
    '.t........t.',
  ]),
  ICON_HAT: spr([
    '....KKKKKK....',
    '...KhhhhhhK...',
    '...KhhKKhhK...',
    '...KKKKKKKK...',
    '..KhhhhhhhhK..',
    'KKHHHHHHHHHHKK',
    '.KKKKKKKKKKKK.',
  ]),
};

/* ---------- Katalog ----------
   place: Position im Wohnzimmer (Fußpunkt), sort: Tiefenwert, u: Pixelgröße */
const ITEMS = [
  // Kleidung
  { id: 'halstuch', name: 'Rotes Halstuch', desc: 'Klassisch und frech – passt zu jedem Gassigang.', category: 'kleidung', price: 40, icon: 'ICON_SCARF', wear: 'scarf' },
  { id: 'regenmantel', name: 'Blauer Regenmantel', desc: 'Für Schmuddelwetter. Pfützen? Kein Problem.', category: 'kleidung', price: 80, icon: 'ICON_COAT', wear: 'coat' },
  { id: 'weihnachtsmuetze', name: 'Weihnachtsmütze', desc: 'Ho ho hund!', category: 'kleidung', price: 60, icon: 'ICON_XMAS', wear: 'xmas' },
  { id: 'blumenkranz', name: 'Blumenkranz', desc: 'Frühlingsgefühle zwischen den Ohren.', category: 'kleidung', price: 50, icon: 'ICON_WREATH', wear: 'wreath' },
  { id: 'abenteuerhut', name: 'Abenteurer-Hut', desc: 'Für Expeditionen bis zur nächsten Laterne.', category: 'kleidung', price: 70, icon: 'ICON_HAT', wear: 'hat' },
  // Deko
  { id: 'hundebett', name: 'Hundebett', desc: 'Eigenes Bett vor der Couch – Raya schläft dann hier.', category: 'deko', price: 90, icon: 'BED', place: { x: 55, y: 270, sort: 255, u: 3 } },
  { id: 'kuscheldecke', name: 'Kuscheldecke', desc: 'Lila Decke auf der Couch, Rayas Lieblingsplatz.', category: 'deko', price: 40, icon: 'BLANKET', place: { x: 178, y: 186, sort: 206.5, u: 1 } },
  { id: 'spielzeugkorb', name: 'Spielzeugkorb', desc: 'Bälle und Quietschies neben dem TV-Board.', category: 'deko', price: 50, icon: 'BASKET', place: { x: 306, y: 188, sort: 188, u: 1 } },
  { id: 'futternapf2', name: 'Zweiter Futternapf', desc: 'Türkiser Napf am Futterplatz.', category: 'deko', price: 30, icon: 'BOWL2', place: { x: 318, y: 282, sort: 282, u: 2 } },
  { id: 'pflanzen', name: 'Topfpflanze', desc: 'Ein bisschen Dschungel vor der Couch.', category: 'deko', price: 45, icon: 'PLANT', place: { x: 18, y: 286, sort: 286, u: 2 } },
  { id: 'saison', name: 'Saison-Deko', desc: 'Wechselt mit der Jahreszeit: Tulpen, Kürbis oder Tannenbaum.', category: 'deko', price: 60, icon: 'seasonal', place: { x: 290, y: 150, sort: 150, u: 1 } },
  // Entdeckungen (nicht kaufbar, nur freischaltbar)
  { id: 'wald-ecke', name: 'Wald-Ecke', desc: 'Moos, Fliegenpilz und Tannenzapfen.', category: 'deko', price: null, unlock: 'first-wald', icon: 'FOREST', place: { x: 150, y: 284, sort: 284, u: 2 } },
  { id: 'strandball', name: 'Strandball', desc: 'Ein Souvenir vom Strand.', category: 'deko', price: null, unlock: 'first-strand', icon: 'BEACHBALL', place: { x: 276, y: 284, sort: 284, u: 2 } },
  { id: 'sternen-schlaf', name: 'Sternen-Schlaf', desc: 'Besondere Schlafanimation mit Mond und Sternen.', category: 'deko', price: null, unlock: 'days-3', icon: 'STARS', effect: 'stars' },
];
const ITEM_BY_ID = Object.fromEntries(ITEMS.map((it) => [it.id, it]));

function seasonalSprite(d = new Date()) {
  const m = d.getMonth();            // 0 = Januar
  if (m === 11 || m === 0) return 'TREE';
  if (m >= 8 && m <= 10) return 'PUMPKIN';
  return 'TULIPS';
}
function itemSpriteName(it) { return it.icon === 'seasonal' ? seasonalSprite() : it.icon; }
const itemSprCache = {};
function itemCanvas(name) { return itemSprCache[name] || (itemSprCache[name] = ITEM_SPR[name].toCanvas()); }

/* Deko im Raum zeichnen (Fußpunkt unten mittig) */
function drawDecor(it) {
  const c = itemCanvas(itemSpriteName(it)), u = it.place.u;
  ctx.drawImage(c, Math.round(it.place.x - (c.width * u) / 2), Math.round(it.place.y - c.height * u), c.width * u, c.height * u);
}

/* ---------- Kleidung auf Raya ----------
   Ankerpunkte in Pixeln des 100-%-Sprites (ungespiegelt): Kopfoberseite, Hals, Mantelbereich */
const WEAR_ANCHORS = {
  sit: { W: 56, head: [28, 13], neck: [28, 41], coat: [15, 38, 41, 66] },
  stand: { W: 45, head: [22, 13], neck: [22, 41], coat: [10, 38, 35, 62] },
  sit34: { W: 75, head: [52, 11], neck: [50, 33], coat: [33, 36, 64, 64] },
  side: { W: 112, head: [20, 9], neck: [30, 33], back: [[36, 27], [84, 28], [90, 46], [40, 52]] },
  lie: { W: 112, head: [20, 16], neck: [30, 40], back: [[36, 34], [84, 35], [90, 52], [40, 58]] },
};
WEAR_ANCHORS['side-w1'] = WEAR_ANCHORS['side-w2'] = WEAR_ANCHORS.side;

function drawWear(itemId, poseName, x, y, w, flip) {
  const it = ITEM_BY_ID[itemId]; if (!it || !it.wear) return;
  const A = WEAR_ANCHORS[poseName.replace('-closed', '')]; if (!A) return;
  const k = w / A.W;
  const X = (px, pw = 0) => Math.round(x + (flip ? A.W - px - pw : px) * k);
  const Y = (py) => Math.round(y + py * k);
  const S = (v) => Math.max(1, Math.round(v * k));
  const rect = (px, py, pw, ph, col) => { ctx.fillStyle = PAL[col] || col; ctx.fillRect(X(px, pw), Y(py), S(pw), S(ph)); };
  const [hx, hy] = A.head, [nx, ny] = A.neck;
  switch (it.wear) {
    case 'xmas': {
      for (let i = 0; i < 14; i++) {
        const wdt = 16 * (1 - i / 15), cx = hx + i * 0.45;
        rect(cx - wdt / 2, hy - 4 - i, wdt, 1, 'X');
      }
      rect(hx - 10, hy - 4, 20, 4, 'W'); rect(hx - 10, hy - 1, 20, 1, 'S');
      rect(hx + 4, hy - 21, 5, 5, 'W');
      break;
    }
    case 'hat':
      rect(hx - 8, hy - 11, 16, 9, 'h'); rect(hx - 3, hy - 11, 6, 1, 'H');
      rect(hx - 8, hy - 5, 16, 2, 'K');
      rect(hx - 14, hy - 3, 28, 3, 'H'); rect(hx - 14, hy - 1, 28, 1, 'K');
      break;
    case 'wreath': {
      const cols = ['A', 'Y', 'a', 'A', 'w', 'Y', 'A'];
      for (let i = 0; i < 7; i++) {
        const ox = -12 + i * 4, oy = -Math.abs(ox) * 0.18;
        if (i < 6) rect(hx + ox + 2, hy - 1 + oy, 2, 1, 't');
        rect(hx + ox - 1.5, hy - 3 + oy, 3, 3, cols[i]); rect(hx + ox - 0.5, hy - 2 + oy, 1, 1, i % 2 ? 'X' : 'y');
      }
      break;
    }
    case 'scarf':
      rect(nx - 11, ny - 2, 22, 3, 'X'); rect(nx - 11, ny + 1, 22, 1, 'x');
      for (let i = 0; i < 9; i++) rect(nx - 9 + i, ny + 1 + i, 18 - 2 * i, 1, i % 3 === 1 ? 'x' : 'X');
      rect(nx - 4, ny + 3, 1, 1, 'w'); rect(nx + 3, ny + 2, 1, 1, 'w'); rect(nx, ny + 6, 1, 1, 'w');
      break;
    case 'coat':
      if (A.coat) {
        const [x0, y0, x1, y1] = A.coat;
        for (let yy = y0; yy < y1; yy++) {
          const f = (yy - y0) / (y1 - y0), pad = -1.5 * f;
          rect(x0 + pad, yy, x1 - x0 - 2 * pad, 1, yy === y1 - 1 ? 'j' : 'B');
        }
        rect(x0, y0, x1 - x0, 2, 'j'); rect((x0 + x1) / 2 - 0.5, y0 + 2, 1, y1 - y0 - 3, 'j');
        for (let b = 0; b < 3; b++) rect((x0 + x1) / 2 + 2, y0 + 6 + b * 7, 2, 2, 'Y');
      } else if (A.back) {
        ctx.fillStyle = PAL.B; ctx.beginPath();
        A.back.forEach(([px, py], i) => (i ? ctx.lineTo(X(px), Y(py)) : ctx.moveTo(X(px), Y(py))));
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = PAL.j;
        const [p0, p1] = A.back;
        ctx.fillRect(Math.min(X(p0[0]), X(p1[0])), Y(p0[1]), Math.abs(X(p1[0]) - X(p0[0])), S(2));
        rect((p0[0] + p1[0]) / 2, p0[1] + 6, 2, 2, 'Y'); rect((p0[0] + p1[0]) / 2 + 10, p0[1] + 7, 2, 2, 'Y');
      }
      break;
  }
}
