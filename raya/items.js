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
  { id: 'halstuch', name: 'Rotes Halstuch', desc: 'Klassisch und frech – passt zu jedem Gassigang.', category: 'kleidung', price: 150, icon: 'ICON_SCARF', wear: 'scarf' },
  { id: 'regenmantel', name: 'Blauer Regenmantel', desc: 'Für Schmuddelwetter. Pfützen? Kein Problem.', category: 'kleidung', price: 300, icon: 'ICON_COAT', wear: 'coat' },
  { id: 'weihnachtsmuetze', name: 'Weihnachtsmütze', desc: 'Ho ho hund!', category: 'kleidung', price: 220, icon: 'ICON_XMAS', wear: 'xmas' },
  { id: 'blumenkranz', name: 'Blumenkranz', desc: 'Frühlingsgefühle zwischen den Ohren.', category: 'kleidung', price: 180, icon: 'ICON_WREATH', wear: 'wreath' },
  { id: 'abenteuerhut', name: 'Abenteurer-Hut', desc: 'Für Expeditionen bis zur nächsten Laterne.', category: 'kleidung', price: 250, icon: 'ICON_HAT', wear: 'hat' },
  // Deko
  { id: 'hundebett', name: 'Hundebett', desc: 'Eigenes Bett vor der Couch – Raya schläft dann hier.', category: 'deko', price: 350, icon: 'BED', place: { x: 55, y: 270, sort: 255, u: 3 } },
  { id: 'kuscheldecke', name: 'Kuscheldecke', desc: 'Lila Decke auf der Couch, Rayas Lieblingsplatz.', category: 'deko', price: 150, icon: 'BLANKET', place: { x: 178, y: 186, sort: 206.5, u: 1 } },
  { id: 'spielzeugkorb', name: 'Spielzeugkorb', desc: 'Bälle und Quietschies vor dem Sessel.', category: 'deko', price: 180, icon: 'BASKET', place: { x: 306, y: 188, sort: 188, u: 1 } },
  { id: 'futternapf2', name: 'Zweiter Futternapf', desc: 'Türkiser Napf am Futterplatz.', category: 'deko', price: 100, icon: 'BOWL2', place: { x: 318, y: 282, sort: 282, u: 2 } },
  { id: 'pflanzen', name: 'Topfpflanze', desc: 'Ein bisschen Dschungel neben dem TV-Board.', category: 'deko', price: 160, icon: 'PLANT', place: { x: 18, y: 286, sort: 286, u: 2 } },
  { id: 'saison', name: 'Saison-Deko', desc: 'Wechselt mit der Jahreszeit: Tulpen, Kürbis oder Tannenbaum.', category: 'deko', price: 220, icon: 'seasonal', place: { x: 290, y: 150, sort: 150, u: 1 } },
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
/* Kleidung: pro Pose und Größenstufe passgenau vorgezeichnet (raya-wear.png, Daten in raya-atlas.json).
   Jede Kachel kennt ihren Versatz zur Raya-Kachel derselben Stufe. */
const WEAR_KEY = { halstuch: 'scarf', regenmantel: 'coat', weihnachtsmuetze: 'xmas', blumenkranz: 'wreath', abenteuerhut: 'hat' };
function drawWear(itemId, poseName, li, x, y, w, flip) {
  const key = WEAR_KEY[itemId]; if (!key || !ATLAS.wimg) return;
  const set = ATLAS.wear[key]; if (!set) return;
  const t = (set[poseName.replace('-closed', '')] || [])[li]; if (!t) return;
  const [sx, sy, tw, th, dx, dy] = t;
  const ox = flip ? x + w - dx - tw : x + dx;
  if (flip) { ctx.save(); ctx.scale(-1, 1); ctx.drawImage(ATLAS.wimg, sx, sy, tw, th, -ox - tw, y + dy, tw, th); ctx.restore(); }
  else ctx.drawImage(ATLAS.wimg, sx, sy, tw, th, ox, y + dy, tw, th);
  return [ox, y + dy, ox + tw, y + dy + th];
}
