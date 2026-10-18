'use strict';
/* Raya – Gassi-Tagebuch, Pfoten, Shop
   Speicherung in IndexedDB "raya-db" (getrennt vom Spielstand in localStorage):
     photos   { id, blob, thumb, w, h }                 – Bilddaten (Blob, kein Base64)
     entries  { id, createdAt, day, date, note, category, photoId }
     meta     { key:'wallet',    paws }                 – Pfotenstand
              { key:'rewards',   days[], milestones[], discoveries[], log[] } – Belohnungshistorie
              { key:'inventory', owned[] }              – gekaufte / freigeschaltete Gegenstände
              { key:'active',    outfit, decor[] }      – angezogene / aufgestellte Gegenstände
   Belohnungen und Käufe passieren jeweils in EINER Transaktion – keine Doppelvergabe möglich. */

const DB_NAME = 'raya-db', DB_VERSION = 1;
const MAX_FILE_BYTES = 30 * 1024 * 1024;   // Originaldatei
const MAX_EDGE = 1280, THUMB_EDGE = 256;   // gespeicherte Größe
const EXTRAS = { ready: false, failed: false, paws: 0, owned: new Set(), outfit: null, decor: new Set() };

/* ---------- Datum (lokale Zeit des Spielers) ---------- */
function nowDate() { return window.__rayaNow ? new Date(window.__rayaNow) : new Date(); }   // Test-Hook
function dayKey(d = nowDate()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fmtDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' });
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---------- IndexedDB ---------- */
let dbP = null;
function openDB() {
  if (dbP) return dbP;
  dbP = new Promise((res, rej) => {
    if (!('indexedDB' in window)) { rej(new Error('nodb')); return; }
    let r;
    try { r = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('blocked'));
  });
  dbP.catch(() => { dbP = null; });
  return dbP;
}
const rq = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
function txDone(tx) {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('abort'));
  });
}
const META_DEFAULTS = {
  wallet: () => ({ key: 'wallet', paws: 0 }),
  rewards: () => ({ key: 'rewards', days: [], milestones: [], discoveries: [], log: [] }),
  inventory: () => ({ key: 'inventory', owned: [] }),
  active: () => ({ key: 'active', outfit: null, decor: [] }),
};
async function getMeta(store, key) { return (await rq(store.get(key))) || META_DEFAULTS[key](); }

async function loadExtras() {
  try {
    const db = await openDB();
    const tx = db.transaction('meta', 'readonly'), st = tx.objectStore('meta');
    const [w, inv, act] = await Promise.all([getMeta(st, 'wallet'), getMeta(st, 'inventory'), getMeta(st, 'active')]);
    applyExtras(w, inv, act);
    EXTRAS.ready = true;
  } catch (e) { EXTRAS.failed = true; }
  updatePawBadge();
}
function applyExtras(w, inv, act) {
  EXTRAS.paws = w.paws; EXTRAS.owned = new Set(inv.owned);
  EXTRAS.outfit = act.outfit && EXTRAS.owned.has(act.outfit) ? act.outfit : null;
  EXTRAS.decor = new Set(act.decor.filter((d) => EXTRAS.owned.has(d)));
}

/* ---------- Bildverarbeitung ---------- */
class PhotoError extends Error {}
function looksLikeImage(file) { return (file.type && file.type.startsWith('image/')) || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif)$/i.test(file.name || ''); }
async function decodeImage(file) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { /* weiter mit <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url;
    await img.decode();
    if (!img.naturalWidth) throw new Error('leer');
    return img;
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
function toBlob(canvas, q) {
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode'))), 'image/jpeg', q));
}
async function processPhoto(file) {
  if (!file) throw new PhotoError('Keine Datei ausgewählt.');
  if (!looksLikeImage(file)) throw new PhotoError('Das ist kein Foto. Bitte eine Bilddatei (JPG, PNG, WebP) wählen.');
  if (file.size > MAX_FILE_BYTES) throw new PhotoError('Das Foto ist zu groß (max. 30 MB).');
  let img;
  try { img = await decodeImage(file); } catch (e) {
    throw new PhotoError('Das Bild konnte nicht gelesen werden. Vielleicht ein nicht unterstütztes Format (z. B. HEIC)? Versuch es als JPG.');
  }
  const iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
  if (!iw || !ih) throw new PhotoError('Das Bild ist leer oder beschädigt.');
  const s = Math.min(1, MAX_EDGE / Math.max(iw, ih));
  const c = document.createElement('canvas'); c.width = Math.round(iw * s); c.height = Math.round(ih * s);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const t = document.createElement('canvas'); t.width = t.height = THUMB_EDGE;
  const side = Math.min(iw, ih);
  t.getContext('2d').drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, 0, 0, THUMB_EDGE, THUMB_EDGE);
  if (img.close) img.close();
  const [blob, thumb] = await Promise.all([toBlob(c, 0.82), toBlob(t, 0.75)]);
  return { blob, thumb, w: c.width, h: c.height };
}

/* ---------- Eintrag speichern + Belohnungen (eine Transaktion) ---------- */
async function saveEntry({ photo, date, note, category }) {
  const db = await openDB();
  const tx = db.transaction(['photos', 'entries', 'meta'], 'readwrite');
  const done = txDone(tx);
  const P = tx.objectStore('photos'), E = tx.objectStore('entries'), M = tx.objectStore('meta');
  const today = dayKey(), photoId = uid(), entry = {
    id: uid(), createdAt: Date.now(), day: today, date: date || today, note: (note || '').trim().slice(0, 140), category: category || null, photoId,
  };
  const gained = [];
  try {
    P.put({ id: photoId, blob: photo.blob, thumb: photo.thumb, w: photo.w, h: photo.h });
    E.put(entry);
    const [wallet, rewards, inv] = await Promise.all([getMeta(M, 'wallet'), getMeta(M, 'rewards'), getMeta(M, 'inventory')]);
    const owned = new Set(inv.owned);
    // Tagesbelohnung: zählt der Tag, an dem dokumentiert wird – rückdatierte Einträge bringen nichts extra
    if (!rewards.days.includes(today)) {
      rewards.days.push(today); wallet.paws += REWARD_RULES.dailyFirstEntry;
      gained.push({ type: 'daily', paws: REWARD_RULES.dailyFirstEntry, text: 'Erster Gassigang heute' });
    }
    for (const m of REWARD_RULES.milestones) {
      if (rewards.days.length >= m.days && !rewards.milestones.includes(m.days)) {
        rewards.milestones.push(m.days); wallet.paws += m.paws;
        gained.push({ type: 'milestone', paws: m.paws, text: m.days + ' verschiedene Gassi-Tage' });
      }
    }
    for (const d of REWARD_RULES.discoveries) {
      if (rewards.discoveries.includes(d.id)) continue;
      const hit = (d.category && d.category === entry.category) || (d.days && rewards.days.length >= d.days);
      if (!hit) continue;
      rewards.discoveries.push(d.id); owned.add(d.unlocks);
      gained.push({ type: 'unlock', item: d.unlocks, text: d.label });
    }
    gained.forEach((g) => rewards.log.push({ at: Date.now(), day: today, ...g }));
    inv.owned = [...owned];
    M.put(wallet); M.put(rewards); M.put(inv);
    await done;
    EXTRAS.paws = wallet.paws; EXTRAS.owned = owned;
  } catch (e) {
    try { tx.abort(); } catch (x) { /* schon beendet */ }
    await done.catch(() => {});
    throw e;
  }
  updatePawBadge();
  return { entry, gained };
}
async function listEntries() {
  const db = await openDB();
  const all = await rq(db.transaction('entries').objectStore('entries').getAll());
  return all.sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date < a.date ? -1 : 1));
}
async function getPhoto(id) { const db = await openDB(); return rq(db.transaction('photos').objectStore('photos').get(id)); }
async function deleteEntry(entry) {
  // Pfoten & Belohnungshistorie bleiben unberührt → Löschen gibt keine Belohnung erneut frei
  const db = await openDB();
  const tx = db.transaction(['photos', 'entries'], 'readwrite'), done = txDone(tx);
  tx.objectStore('entries').delete(entry.id); tx.objectStore('photos').delete(entry.photoId);
  await done;
}

/* ---------- Shop ---------- */
async function buyItem(id) {
  const it = ITEM_BY_ID[id];
  if (!it || it.price == null) throw new Error('Dieser Gegenstand ist nicht käuflich.');
  const db = await openDB();
  const tx = db.transaction('meta', 'readwrite'), done = txDone(tx), M = tx.objectStore('meta');
  const [wallet, inv] = await Promise.all([getMeta(M, 'wallet'), getMeta(M, 'inventory')]);
  if (inv.owned.includes(id)) { tx.abort(); await done.catch(() => {}); throw new Error('Schon gekauft.'); }
  if (wallet.paws < it.price) { tx.abort(); await done.catch(() => {}); throw new Error('Nicht genug Pfoten.'); }
  wallet.paws -= it.price; inv.owned.push(id);
  M.put(wallet); M.put(inv);
  const rewards = await getMeta(M, 'rewards');
  rewards.log.push({ at: Date.now(), day: dayKey(), type: 'purchase', item: id, paws: -it.price });
  M.put(rewards);
  await done;
  EXTRAS.paws = wallet.paws; EXTRAS.owned = new Set(inv.owned);
  updatePawBadge();
}
async function setActive(fn) {
  const db = await openDB();
  const tx = db.transaction('meta', 'readwrite'), done = txDone(tx), M = tx.objectStore('meta');
  const act = await getMeta(M, 'active');
  fn(act);
  act.decor = [...new Set(act.decor)].filter((d) => EXTRAS.owned.has(d));
  if (act.outfit && !EXTRAS.owned.has(act.outfit)) act.outfit = null;
  M.put(act); await done;
  EXTRAS.outfit = act.outfit; EXTRAS.decor = new Set(act.decor);
}

/* ============================== Oberfläche ============================== */
const dq = (s, root = document) => root.querySelector(s);
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function pawIcon(scale = 2) { const c = SPR.PAW.toCanvas(); c.className = 'pawicon'; c.style.width = c.width * scale + 'px'; return c; }
function itemIcon(it, scale = 3) {
  const c = itemCanvas(itemSpriteName(it)).cloneNode(); c.getContext('2d').drawImage(itemCanvas(itemSpriteName(it)), 0, 0);
  c.className = 'itemicon'; c.style.width = c.width * scale + 'px'; return c;
}
function friendlyError(e) {
  if (e instanceof PhotoError) return e.message;
  const n = e && (e.name || '');
  if (n === 'QuotaExceededError' || /quota/i.test(e && e.message)) return 'Der Speicher auf diesem Gerät ist voll. Lösche alte Tagebucheinträge oder gib Speicher frei.';
  if (e && e.message === 'nodb') return 'Dein Browser erlaubt hier keinen lokalen Speicher (z. B. im privaten Modus).';
  return 'Das hat leider nicht geklappt. Bitte versuch es nochmal.';
}
function updatePawBadge() {
  const b = dq('#pawCount'); if (b) b.textContent = EXTRAS.ready ? EXTRAS.paws : '–';
}

/* ---------- Tagebuch ---------- */
const urls = new Set();
function objURL(blob) { const u = URL.createObjectURL(blob); urls.add(u); return u; }
function freeURLs() { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); }

let draft = null;   // { photo } während des Erstellens
function showView(name) {
  ['list', 'form', 'detail'].forEach((v) => { dq('#diary-' + v).hidden = v !== name; });
  dq('#diary').scrollTop = 0;
}
async function openDiary() {
  dq('#diary').showModal(); showView('list'); await renderList();
}
async function renderList() {
  const box = dq('#diaryGrid'), state = dq('#diaryState');
  freeURLs(); box.innerHTML = ''; state.textContent = 'Lade Tagebuch …'; state.hidden = false;
  dq('#diaryPaws').textContent = EXTRAS.paws;
  let entries;
  try { entries = await listEntries(); } catch (e) { state.textContent = friendlyError(e); return; }
  if (!entries.length) {
    state.innerHTML = '';
    state.append(pawIcon(4), el('p', '', 'Noch keine Gassigänge im Tagebuch.'), el('p', 'muted', 'Mach beim nächsten Spaziergang ein Foto von Raya und trag es hier ein – das gibt Pfoten für den Shop.'));
    return;
  }
  state.hidden = true;
  const db = await openDB();
  for (const en of entries) {
    const card = el('button', 'thumb');
    card.type = 'button';
    const img = el('img'); img.alt = 'Gassi am ' + fmtDate(en.date); img.loading = 'lazy';
    rq(db.transaction('photos').objectStore('photos').get(en.photoId)).then((p) => { if (p) img.src = objURL(p.thumb); else img.alt = 'Foto fehlt'; });
    const cap = el('span', 'cap', fmtDate(en.date).replace(/ \d{4}$/, ''));
    card.append(img, cap);
    if (en.category) card.append(el('span', 'tag', (WALK_CATEGORIES.find((c) => c.id === en.category) || {}).label || ''));
    card.addEventListener('click', () => openDetail(en));
    box.append(card);
  }
}
function resetForm() {
  draft = null;
  dq('#diaryPreview').hidden = true; dq('#diaryPreviewImg').removeAttribute('src');
  dq('#diaryPick').hidden = false; dq('#diaryMsg').textContent = ''; dq('#diaryMsg').className = 'msg';
  dq('#diaryDate').value = dayKey(); dq('#diaryDate').max = dayKey();
  dq('#diaryNote').value = '';
  document.querySelectorAll('input[name=cat]').forEach((r) => { r.checked = false; });
  dq('#diarySave').disabled = true;
  dq('#diaryReward').hidden = true; dq('#diaryFields').hidden = false;
}
function openForm() { resetForm(); showView('form'); }
async function onFile(file) {
  const msg = dq('#diaryMsg');
  msg.className = 'msg'; msg.textContent = 'Foto wird vorbereitet …';
  dq('#diarySave').disabled = true;
  try {
    const photo = await processPhoto(file);
    draft = { photo };
    dq('#diaryPreviewImg').src = objURL(photo.blob);
    dq('#diaryPreview').hidden = false; dq('#diaryPick').hidden = true;
    msg.textContent = ''; dq('#diarySave').disabled = false;
  } catch (e) { draft = null; msg.className = 'msg err'; msg.textContent = friendlyError(e); }
}
let saving = false;
async function onSave() {
  if (!draft || saving) return;
  saving = true; dq('#diarySave').disabled = true;
  const msg = dq('#diaryMsg'); msg.className = 'msg'; msg.textContent = 'Speichere …';
  try {
    const cat = (document.querySelector('input[name=cat]:checked') || {}).value || null;
    let date = dq('#diaryDate').value || dayKey();
    if (date > dayKey()) date = dayKey();
    const { gained } = await saveEntry({ photo: draft.photo, date, note: dq('#diaryNote').value, category: cat });
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) { /* optional */ }
    draft = null; msg.textContent = '';
    showReward(gained);
    sfx.good(); buzz(20);
  } catch (e) {
    msg.className = 'msg err'; msg.textContent = friendlyError(e);
    dq('#diarySave').disabled = !draft;
  } finally { saving = false; }
}
function showReward(gained) {
  dq('#diaryFields').hidden = true;
  const r = dq('#diaryReward'); r.hidden = false;
  const list = dq('#diaryRewardList'); list.innerHTML = '';
  if (!gained.length) {
    list.append(el('li', '', 'Eintrag gespeichert! Für heute hast du deine Pfoten schon bekommen – Raya freut sich trotzdem über jeden Spaziergang.'));
  } else {
    for (const g of gained) {
      const li = el('li');
      if (g.paws) li.append(el('b', '', '+' + g.paws + ' '), pawIcon(2), document.createTextNode(' ' + g.text));
      else li.append(el('b', '', 'Freigeschaltet: '), document.createTextNode(ITEM_BY_ID[g.item].name + ' (' + g.text + ')'));
      list.append(li);
    }
  }
  dq('#diaryRewardTotal').textContent = EXTRAS.paws;
  const total = gained.reduce((s, g) => s + (g.paws || 0), 0);
  toast(total ? '+' + total + ' Pfoten fürs Gassi-Tagebuch!' : 'Gassigang gespeichert!');
}
async function openDetail(en) {
  showView('detail');
  const img = dq('#detailImg'); img.removeAttribute('src'); img.alt = 'Lade Foto …';
  dq('#detailDate').textContent = fmtDate(en.date);
  const cat = WALK_CATEGORIES.find((c) => c.id === en.category);
  dq('#detailCat').textContent = cat ? cat.label : ''; dq('#detailCat').hidden = !cat;
  dq('#detailNote').textContent = en.note || ''; dq('#detailNote').hidden = !en.note;
  dq('#detailConfirm').hidden = true; dq('#detailDelete').hidden = false;
  dq('#detailDelete').onclick = () => { dq('#detailConfirm').hidden = false; dq('#detailDelete').hidden = true; };
  dq('#detailNo').onclick = () => { dq('#detailConfirm').hidden = true; dq('#detailDelete').hidden = false; };
  dq('#detailYes').onclick = async () => {
    try { await deleteEntry(en); toast('Eintrag gelöscht.'); showView('list'); renderList(); }
    catch (e) { dq('#detailNote').hidden = false; dq('#detailNote').textContent = friendlyError(e); }
  };
  try { const p = await getPhoto(en.photoId); if (p) { img.src = objURL(p.blob); img.alt = 'Gassi-Foto'; } else img.alt = 'Foto nicht gefunden'; }
  catch (e) { img.alt = friendlyError(e); }
}

/* ---------- Shop ---------- */
let shopTab = 'kleidung';
async function openShop() {
  dq('#shop').showModal();
  if (!EXTRAS.ready) await loadExtras();
  renderShop();
}
function renderShop() {
  dq('#shopPaws').textContent = EXTRAS.ready ? EXTRAS.paws : '–';
  document.querySelectorAll('#shop .tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === shopTab));
  const list = dq('#shopList'); list.innerHTML = '';
  if (!EXTRAS.ready) { list.append(el('p', 'msg err', EXTRAS.failed ? 'Der Shop braucht lokalen Speicher, der in diesem Browser nicht verfügbar ist.' : 'Lade …')); return; }
  for (const it of ITEMS.filter((i) => i.category === shopTab)) {
    const owned = EXTRAS.owned.has(it.id);
    const card = el('div', 'item' + (owned ? ' owned' : ''));
    const info = el('div', 'iteminfo');
    info.append(el('h3', '', it.name), el('p', '', it.desc));
    const act = el('div', 'itemact');
    if (owned) {
      if (it.category === 'kleidung') {
        const on = EXTRAS.outfit === it.id;
        const b = el('button', 'small' + (on ? ' on' : ''), on ? 'Ausziehen' : 'Anziehen');
        b.onclick = () => runShop(b, () => setActive((a) => { a.outfit = on ? null : it.id; }), on ? 'Ausgezogen.' : it.name + ' steht Raya super!');
        act.append(el('span', 'badge', 'Gekauft'), b);
      } else {
        const on = EXTRAS.decor.has(it.id);
        const b = el('button', 'small' + (on ? ' on' : ''), on ? 'Wegräumen' : 'Aufstellen');
        b.onclick = () => runShop(b, () => setActive((a) => { a.decor = on ? a.decor.filter((d) => d !== it.id) : a.decor.concat(it.id); }), on ? 'Weggeräumt.' : it.name + ' ist jetzt im Wohnzimmer.');
        act.append(el('span', 'badge', it.price == null ? 'Freigeschaltet' : 'Gekauft'), b);
      }
    } else if (it.price == null) {
      const d = REWARD_RULES.discoveries.find((x) => x.unlocks === it.id);
      act.append(el('span', 'lock', 'Freischalten: ' + (d ? d.label : 'Entdeckung')));
    } else {
      const price = el('span', 'price'); price.append(String(it.price) + ' ', pawIcon(2));
      const b = el('button', 'small buy', 'Kaufen');
      if (EXTRAS.paws < it.price) { b.disabled = true; b.title = 'Nicht genug Pfoten'; }
      b.onclick = () => runShop(b, () => buyItem(it.id), it.name + ' gekauft!');
      act.append(price, b);
    }
    card.append(itemIcon(it), info, act);
    list.append(card);
  }
  const hint = dq('#shopHint');
  hint.textContent = EXTRAS.paws === 0 ? 'Pfoten bekommst du für Einträge im Gassi-Tagebuch.' : '';
}
let shopBusy = false;
async function runShop(btn, fn, okText) {
  if (shopBusy) return;
  shopBusy = true; btn.disabled = true;
  try { await fn(); toast(okText); sfx.good(); }
  catch (e) { toast(e.message && e.message.length < 60 ? e.message : friendlyError(e)); sfx.bad(); }
  finally { shopBusy = false; renderShop(); }
}

/* ---------- Verdrahtung ---------- */
function initDiaryUI() {
  dq('#diaryBtn').addEventListener('click', () => { sfx.tap(); openDiary(); });
  dq('#shopBtn').addEventListener('click', () => { sfx.tap(); openShop(); });
  dq('#diaryNew').addEventListener('click', openForm);
  dq('#diaryCam').addEventListener('click', () => dq('#fileCam').click());
  dq('#diaryFile').addEventListener('click', () => dq('#fileAny').click());
  ['#fileCam', '#fileAny'].forEach((s) => dq(s).addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onFile(f); }));
  dq('#diaryRepick').addEventListener('click', () => { draft = null; dq('#diaryPreview').hidden = true; dq('#diaryPick').hidden = false; dq('#diarySave').disabled = true; });
  dq('#diarySave').addEventListener('click', onSave);
  dq('#diaryCancel').addEventListener('click', () => { draft = null; showView('list'); });
  dq('#diaryDone').addEventListener('click', () => { showView('list'); renderList(); });
  dq('#detailBack').addEventListener('click', () => { showView('list'); });
  dq('#diaryClose').addEventListener('click', () => dq('#diary').close());
  dq('#diary').addEventListener('close', () => { draft = null; freeURLs(); });
  dq('#shopClose').addEventListener('click', () => dq('#shop').close());
  document.querySelectorAll('#shop .tabs button').forEach((b) => b.addEventListener('click', () => { shopTab = b.dataset.tab; renderShop(); }));
  const cats = dq('#diaryCats');
  for (const c of WALK_CATEGORIES) {
    const l = el('label', 'chip'); const r = el('input'); r.type = 'radio'; r.name = 'cat'; r.value = c.id;
    r.addEventListener('click', () => { if (r.dataset.was === '1') { r.checked = false; r.dataset.was = ''; } else { document.querySelectorAll('input[name=cat]').forEach((x) => { x.dataset.was = ''; }); r.dataset.was = '1'; } });
    l.append(r, el('span', '', c.label)); cats.append(l);
  }
  const pb = dq('#shopBtn'); const pi = pawIcon(2); pb.prepend(pi);
  loadExtras();
}
