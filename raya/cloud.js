/* Raya – Login (Google) & Cloud-Abgleich über Firebase
   Firestore:
     users/{uid}                    { game: JSON-String des Spielstands, meta: {wallet,rewards,inventory,active}, updatedAt }
     users/{uid}/entries/{id}       Tagebuch-Eintrag ohne Bild (klein, wird komplett gelistet) – gelöscht: { deleted: true }
     users/{uid}/photos/{photoId}   { photo, thumb (JPEG als data-URL), w, h }
   Regeln: Spielstand → der zuletzt hochgeladene gewinnt. Pfoten/Belohnungen/Käufe → werden zusammengeführt,
   jede Belohnung zählt höchstens einmal. Tagebuch → alle Einträge von allen Geräten. */
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const SYNC_KEY = 'raya-sync';
const $c = (s) => document.querySelector(s);

const C = {
  ready: false, enabled: false, user: null, busy: false, again: false, error: '', lastSync: 0,
  changed() { if (C.user) { clearTimeout(C._t); C._t = setTimeout(() => C.sync(), 3000); } },
  deleted(entry) {
    const st = syncState(); st.pendingDel = [...(st.pendingDel || []).filter((e) => e.id !== entry.id), { id: entry.id, photoId: entry.photoId }];
    saveSyncState(st); C.changed();
  },
  async signIn() { C.error = ''; render(); try { await B.signIn(); } catch (e) { C.error = authMsg(e); render(); } },
  async signOut() { await C.sync(); await B.signOut(); },
  sync: () => sync(),
};
window.RayaCloud = C;
let B = null;   // Backend (Firebase oder Test-Attrappe)

function syncState() { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } }
function saveSyncState(s) { try { localStorage.setItem(SYNC_KEY, JSON.stringify(s)); } catch (e) { /* */ } }
const clean = (o) => JSON.parse(JSON.stringify(o));   // Firestore mag kein undefined

/* ---------- Belohnungen zusammenführen ---------- */
function logKey(g) {
  if (g.type === 'daily') return 'd:' + g.day;
  if (g.type === 'milestone') return 'm:' + g.text;
  if (g.type === 'unlock' || g.type === 'purchase') return g.type + ':' + g.item;
  return g.type + ':' + g.at;
}
const uni = (a, b) => [...new Set([...(a || []), ...(b || [])])];
function mergeMeta(local, cloud, cloudNewer) {
  if (!cloud) return local;
  const newer = cloudNewer ? cloud : local, older = cloudNewer ? local : cloud;
  const keys = new Set(newer.rewards.log.map(logKey));
  const extra = older.rewards.log.filter((g) => !keys.has(logKey(g)));
  const log = [...newer.rewards.log, ...extra].sort((a, b) => a.at - b.at);
  return {
    wallet: { key: 'wallet', paws: Math.max(0, newer.wallet.paws + extra.reduce((s, g) => s + (g.paws || 0), 0)) },
    rewards: {
      key: 'rewards', days: uni(newer.rewards.days, older.rewards.days).sort(),
      milestones: uni(newer.rewards.milestones, older.rewards.milestones), discoveries: uni(newer.rewards.discoveries, older.rewards.discoveries), log,
    },
    inventory: { key: 'inventory', owned: uni(newer.inventory.owned, older.inventory.owned) },
    active: newer.active,
  };
}

/* ---------- Bilder ---------- */
const toDataURL = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
async function shrink(blob, edge, q) {
  const img = await createImageBitmap(blob); const k = Math.min(1, edge / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, 'image/jpeg', q));
}
async function photoOut(p) {
  let photo = await toDataURL(p.blob);
  if (photo.length > 900000) photo = await toDataURL(await shrink(p.blob, 1024, 0.7));   // Firestore: max. 1 MB je Dokument
  return { photo, thumb: await toDataURL(p.thumb), w: p.w, h: p.h };
}
async function photoIn(d) {
  const blob = async (u) => (await fetch(u)).blob();
  return { blob: await blob(d.photo), thumb: await blob(d.thumb), w: d.w, h: d.h };
}

/* ---------- Abgleich ---------- */
async function sync() {
  if (!C.user || !window.LocalStore) return;
  if (C.busy) { C.again = true; return; }
  C.busy = true; C.error = ''; render();
  const uid = C.user.uid;
  try {
    const st = syncState(), first = st.uid !== uid, last = first ? 0 : st.lastSyncedAt || 0;
    const root = await B.getRoot(uid);
    const localMeta = await LocalStore.exportMeta();
    let cloudNewer = false;
    if (root && root.game) {
      const cloudS = JSON.parse(root.game);
      if (first) {
        cloudNewer = !rayaGame.hasProgress() || (await askChoice(cloudS, root.meta, localMeta)) === 'cloud';
      } else cloudNewer = root.updatedAt > last;
      if (cloudNewer) rayaGame.apply(cloudS);
    }
    if (root && root.meta) await LocalStore.importMeta(mergeMeta(localMeta, root.meta, cloudNewer));

    // Tagebuch
    const cloudList = await B.listEntries(uid), local = await LocalStore.listEntries();
    const cloudById = new Map(cloudList.map((e) => [e.id, e])), localIds = new Set(local.map((e) => e.id));
    for (const d of st.pendingDel || []) {
      await B.putEntry(uid, { id: d.id, photoId: d.photoId, deleted: true });
      if (d.photoId) await B.deletePhoto(uid, d.photoId);
      cloudById.set(d.id, { id: d.id, deleted: true });
    }
    st.pendingDel = []; saveSyncState({ ...syncState(), pendingDel: [] });
    let changedList = false;
    for (const e of local) {
      const c = cloudById.get(e.id);
      if (c && c.deleted) { await LocalStore.removeEntry(e); changedList = true; }
      else if (!c) {
        const p = await LocalStore.getPhoto(e.photoId);
        if (p) await B.putPhoto(uid, e.photoId, await photoOut(p));
        await B.putEntry(uid, clean(e));
      }
    }
    for (const c of cloudById.values()) {
      if (c.deleted || localIds.has(c.id)) continue;
      const d = await B.getPhoto(uid, c.photoId);
      if (d) { await LocalStore.importEntry(c, await photoIn(d)); changedList = true; }
    }
    // hochladen
    const now = Date.now();
    await B.setRoot(uid, clean({ game: JSON.stringify(rayaGame.get()), meta: await LocalStore.exportMeta(), updatedAt: now }));
    saveSyncState({ uid, lastSyncedAt: now, pendingDel: syncState().pendingDel || [] });
    C.lastSync = now;
    if (changedList || cloudNewer) LocalStore.refresh();
  } catch (e) {
    C.error = navigator.onLine === false ? 'Offline – wird später abgeglichen.' : 'Abgleich fehlgeschlagen: ' + (e.code || e.message || e);
    console.warn('Raya-Sync', e);
  } finally {
    C.busy = false; render();
    if (C.again) { C.again = false; setTimeout(sync, 500); }
  }
}

/* Erste Anmeldung auf einem Gerät, das schon einen eigenen Spielstand hat */
function askChoice(cloudS, cloudMeta, localMeta) {
  const days = (s) => Math.max(1, Math.floor((Date.now() - s.born) / 86400000) + 1);
  $c('#choiceCloud').textContent = `Tag ${days(cloudS)} · ${cloudMeta ? cloudMeta.wallet.paws : 0} Pfoten`;
  $c('#choiceLocal').textContent = `Tag ${days(rayaGame.get())} · ${localMeta.wallet.paws} Pfoten`;
  const dlg = $c('#syncChoice');
  return new Promise((res) => {
    const done = (v) => { dlg.close(); res(v); };
    $c('#choiceCloudBtn').onclick = () => done('cloud');
    $c('#choiceLocalBtn').onclick = () => done('local');
    dlg.oncancel = (e) => { e.preventDefault(); };
    dlg.showModal();
  });
}

/* ---------- Oberfläche ---------- */
function authMsg(e) {
  const c = e && e.code;
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return 'Anmeldung abgebrochen.';
  if (c === 'auth/unauthorized-domain') return 'Diese Adresse ist in Firebase noch nicht freigegeben.';
  if (c === 'auth/network-request-failed') return 'Keine Verbindung.';
  return 'Anmeldung fehlgeschlagen' + (c ? ' (' + c + ')' : '') + '.';
}
function render() {
  const btn = $c('#accBtn'); if (!btn) return;
  btn.hidden = !C.enabled;
  btn.textContent = C.user ? (C.busy ? 'Sync …' : 'Konto') : 'Login';
  btn.classList.toggle('warn', !!(C.user && C.error));
  const u = C.user;
  $c('#accOut').hidden = !!u; $c('#accIn').hidden = !u;
  if (u) {
    $c('#accName').textContent = u.displayName || u.email || 'Angemeldet';
    $c('#accMail').textContent = u.email || '';
    $c('#accSync').textContent = C.busy ? 'Wird abgeglichen …' : C.lastSync ? 'Zuletzt abgeglichen: ' + new Date(C.lastSync).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'Noch nicht abgeglichen';
  }
  $c('#accErr').textContent = C.error;
}
function initUI() {
  $c('#accBtn').addEventListener('click', () => { render(); $c('#account').showModal(); });
  $c('#accLogin').addEventListener('click', () => C.signIn());
  $c('#accLogout').addEventListener('click', () => C.signOut());
  $c('#accNow').addEventListener('click', () => C.sync());
  $c('#accClose').addEventListener('click', () => $c('#account').close());
  render();
}

/* ---------- Firebase laden ---------- */
async function firebaseBackend(cfg) {
  const [{ initializeApp }, A, F] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')]);
  const app = initializeApp(cfg), auth = A.getAuth(app), db = F.getFirestore(app);
  A.getRedirectResult(auth).catch((e) => { C.error = authMsg(e); render(); });
  const d = (...p) => F.doc(db, 'users', ...p);
  return {
    onAuth: (cb) => A.onAuthStateChanged(auth, cb),
    async signIn() {
      const p = new A.GoogleAuthProvider();
      try { await A.signInWithPopup(auth, p); } catch (e) {
        if (['auth/popup-blocked', 'auth/operation-not-supported-in-this-environment'].includes(e.code)) await A.signInWithRedirect(auth, p); else throw e;
      }
    },
    signOut: () => A.signOut(auth),
    async getRoot(uid) { const s = await F.getDoc(d(uid)); return s.exists() ? s.data() : null; },
    setRoot: (uid, data) => F.setDoc(d(uid), data),
    async listEntries(uid) { return (await F.getDocs(F.collection(db, 'users', uid, 'entries'))).docs.map((x) => x.data()); },
    putEntry: (uid, e) => F.setDoc(d(uid, 'entries', e.id), e),
    putPhoto: (uid, id, p) => F.setDoc(d(uid, 'photos', id), p),
    async getPhoto(uid, id) { const s = await F.getDoc(d(uid, 'photos', id)); return s.exists() ? s.data() : null; },
    deletePhoto: (uid, id) => F.deleteDoc(d(uid, 'photos', id)),
  };
}

async function start() {
  initUI();
  const cfg = window.RAYA_FIREBASE;
  try {
    if (window.__rayaCloudMock) B = window.__rayaCloudMock;
    else if (cfg && cfg.apiKey) B = await firebaseBackend(cfg);
    else return;
  } catch (e) { console.warn('Firebase nicht erreichbar', e); return; }
  C.enabled = true; C.ready = true; render();
  B.onAuth((u) => {
    C.user = u ? { uid: u.uid, displayName: u.displayName, email: u.email } : null;
    render();
    if (u) { const dlg = $c('#account'); if (dlg.open) dlg.close(); sync(); }
  });
  setInterval(() => { if (C.user && !document.hidden) sync(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (C.user) sync(); });
}
start();
