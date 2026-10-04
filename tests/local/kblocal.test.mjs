/* Suite autonome de kblocal.js (façade de stockage locale).
   Commande : NODE_PATH=<dossier de playwright> node tests/local/kblocal.test.mjs
   Sert le dépôt en http://127.0.0.1 sur un port libre, ouvre tests/local/page.html
   sous Chromium (un contexte de navigateur neuf par groupe de tests), affiche
   PASS / FAIL par test, code de sortie 1 au moindre échec. */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let playwright;
try { playwright = require('playwright'); }
catch (e) {
  const essais = [...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean), '/home/claude/.npm-global/lib/node_modules'];
  for (const d of essais) { try { playwright = createRequire(path.join(d, '/'))('playwright'); break; } catch {} }
  if (!playwright) throw new Error('Playwright introuvable (NODE_PATH ou chemin global)');
}
const { chromium } = playwright;

/* ---------- Serveur statique du dépôt ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };
const requetes = [];                       // toutes les adresses demandées
const serveur = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  requetes.push(url.pathname);
  if (url.pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  const f = path.join(DEPOT, path.normalize(decodeURIComponent(url.pathname)));
  if (!f.startsWith(DEPOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('absent'); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise(r => serveur.listen(0, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:' + serveur.address().port;

/* ---------- Petits outils ---------- */
const erreursConsole = [];
let compteur = 0;
const nomBase = () => 'kb_' + Date.now().toString(36) + '_' + (++compteur);
function assert(c, msg) { if (!c) throw new Error(msg || 'assertion fausse'); }
function eq(a, b, msg) {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error((msg ? msg + ' : ' : '') + 'attendu ' + y + ', obtenu ' + x);
}
const attendre = ms => new Promise(r => setTimeout(r, ms));

const TESTS = [];
function test(groupe, id, nom, contrat, fn) { TESTS.push({ groupe, id, nom, contrat, fn }); }

/* Environnement d'un test : ouvrir une page de test (nouvelle base) dans le contexte du groupe. */
function envDe(ctx) {
  return {
    async open({ db = nomBase(), init = null, garderLS = false } = {}) {
      const page = await ctx.newPage();
      page.on('console', m => { if (m.type() === 'error') erreursConsole.push(m.text()); });
      page.on('pageerror', e => erreursConsole.push('pageerror : ' + e.message));
      page.__db = db;
      page.__init = init;
      if (init) await page.addInitScript(init);
      await page.goto(BASE + '/tests/local/page.html?db=' + db);
      if (!garderLS) await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
      return page;
    },
    async reload(page) { await page.reload(); },
  };
}

/* ============================================================
   GROUPE 1 — Contrat général : use, configure, schéma, un seul global
   ============================================================ */
test('base', 'B1', 'use(db|user|downloads) résolvent ; use() d\'un autre nom rejette', 'KBLocal.use', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const out = {};
    out.db = typeof (await KBLocal.use('db')).collection;
    out.user = typeof (await KBLocal.use('user')).id;
    out.dl = typeof (await KBLocal.use('downloads')).save;
    for (const n of ['storage', 'DB', '', undefined, null, 42]) {
      try { await KBLocal.use(n); out['rej_' + String(n)] = 'RÉSOLU'; } catch (e) { out['rej_' + String(n)] = 'rejet'; }
    }
    return out;
  });
  eq([r.db, r.user, r.dl], ['function', 'function', 'function']);
  for (const k of Object.keys(r).filter(k => k.startsWith('rej_'))) eq(r[k], 'rejet', k);
});
test('base', 'B2', 'initialisation partagée : une seule ouverture, mêmes objets', 'Une seule initialisation partagée', async ({ open }) => {
  const p = await open({ init: () => {
    window.__opens = 0;
    const o = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function () { window.__opens++; return o.apply(this, arguments); };
  } });
  const r = await p.evaluate(async () => {
    const [a, b, c, d] = await Promise.all([KBLocal.use('db'), KBLocal.use('user'), KBLocal.use('db'), KBLocal.use('user')]);
    await KBLocal.meta.get('x'); await KBLocal.use('db');
    return { memeDb: a === c, memeUser: b === d, opens: window.__opens };
  });
  eq(r, { memeDb: true, memeUser: true, opens: 1 });
});
test('base', 'B3', 'configure({dbName}) avant usage ; refusé après le premier usage', 'configure', async ({ open }) => {
  const nom = nomBase();
  const p = await open({ db: nom });
  const r = await p.evaluate(async () => {
    await KBLocal.use('db');
    let apres = 'accepté';
    try { KBLocal.configure({ dbName: 'autre' }); } catch (e) { apres = 'refusé'; }
    let mauvais = 'accepté';
    try { KBLocal.configure({ dbName: 3 }); } catch (e) { mauvais = 'refusé'; }
    const noms = (await indexedDB.databases()).map(d => d.name);
    return { apres, mauvais, noms };
  });
  eq(r.apres, 'refusé'); eq(r.mauvais, 'refusé');
  assert(r.noms.includes(nom) && !r.noms.includes('autre'), 'bases : ' + r.noms);
});
test('base', 'B4', 'nom par défaut « kinball-stats », magasins docs (index parent) et meta', 'Base « kinball-stats », deux magasins', async ({ open }) => {
  const p = await open({ db: 'kinball-stats' });
  const r = await p.evaluate(async () => {
    await KBLocal.use('db');
    return await new Promise((res, rej) => {
      const q = indexedDB.open('kinball-stats');
      q.onsuccess = () => {
        const db = q.result;
        const o = { stores: [...db.objectStoreNames].sort(), version: db.version };
        const tx = db.transaction(['docs']);
        const s = tx.objectStore('docs');
        o.keyPath = s.keyPath; o.index = [...s.indexNames]; o.indexKey = s.index('parent').keyPath;
        db.close(); res(o);
      };
      q.onerror = () => rej(q.error);
    });
  });
  eq(r, { stores: ['docs', 'meta'], version: 1, keyPath: 'path', index: ['parent'], indexKey: 'parent' });
});
test('base', 'B5', 'un seul global : KBLocal (aucune autre variable globale ajoutée)', 'Script classique, un seul global', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(() => window.__clesApres.filter(k => !window.__clesAvant.includes(k) && !['__clesAvant', '__clesApres', 'mkMatch'].includes(k)));
  eq(r, ['KBLocal']);
});
test('base', 'B6', 'réseau : seules la page de test et kblocal.js sont demandées', 'Aucune dépendance, aucun réseau', async ({ open }) => {
  const avant = requetes.length;
  const p = await open();
  await p.evaluate(async () => { const db = await KBLocal.use('db'); await db.doc('a/b').set({ x: 1 }); await KBLocal.use('user'); await KBLocal.storage.status(); });
  const vues = [...new Set(requetes.slice(avant))].sort();
  eq(vues, ['/kblocal.js', '/tests/local/page.html']);
});

/* ============================================================
   GROUPE 2 — db : lecture, écriture, instantanés
   ============================================================ */
test('db', 'D1', 'set puis get : contenu identique ; document absent : exists false, data() undefined', 'set / get', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    const ref = db.collection('teams').doc('t1');
    await ref.set({ id: 't1', nom: 'Équipe é', joueurs: [1, 2, { x: null }] });
    const g = await ref.get(), absent = await db.doc('teams/zzz').get();
    return { id: g.id, exists: g.exists, data: g.data(), aId: absent.id, aExists: absent.exists, aData: absent.data() === undefined };
  });
  eq(r, { id: 't1', exists: true, data: { id: 't1', nom: 'Équipe é', joueurs: [1, 2, { x: null }] }, aId: 'zzz', aExists: false, aData: true });
});
test('db', 'D2', 'collection(chemin).doc(id) et db.doc(cheminComplet) désignent le même document ; set remplace', 'collection().doc / doc()', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    await db.collection('matches/A/items').doc('m1').set({ v: 1, a: 1 });
    await db.doc('matches/A/items/m1').set({ v: 2 });
    return (await db.collection('matches/A/items').doc('m1').get()).data();
  });
  eq(r, { v: 2 });
});
test('db', 'D3', 'delete retire le document ; delete d\'un absent réussit', 'delete', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    const ref = db.doc('teams/t1');
    await ref.set({ a: 1 });
    await ref.delete();
    const apres = (await ref.get()).exists;
    await db.doc('teams/jamais').delete();
    return apres;
  });
  eq(r, false);
});
test('db', 'D4', 'rejet des appels invalides (set non objet, chemin vide, identifiant avec /)', 'Validation', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db'), o = [];
    for (const v of [null, 3, 'x', [1]]) { try { await db.doc('a/b').set(v); o.push('RÉSOLU'); } catch (e) { o.push('rejet'); } }
    for (const f of [() => db.collection(''), () => db.collection('a//b'), () => db.doc('seul'), () => db.collection('a').doc('x/y'), () => db.collection(3)]) {
      try { f(); o.push('RÉSOLU'); } catch (e) { o.push('rejet'); }
    }
    try { await db.doc('a/b').set({ f() {} }); o.push('RÉSOLU'); } catch (e) { o.push('rejet'); }
    const cyc = {}; cyc.moi = cyc;
    try { await db.doc('a/b').set(cyc); o.push('RÉSOLU'); } catch (e) { o.push('rejet'); }
    return o;
  });
  eq(r, Array(11).fill('rejet'));
});
test('db', 'D5', 'première émission : jamais pendant l\'appel ni en micro-tâche, puis dans une tâche ultérieure', 'Première émission asynchrone', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    await db.doc('c/a').set({ n: 1 });
    const out = {};
    for (const [cle, deja] of [['initiale', false], ['miroir_chargé', true]]) {
      const log = [];
      const un = db.collection('c').onSnapshot(s => log.push('snap:' + s.docs.length));
      log.push('après-appel');
      for (let i = 0; i < 30; i++) await Promise.resolve();
      const apresMicro = log.slice();
      await new Promise(r => setTimeout(r, 150));
      out[cle] = { apresMicro, final: log };
      un();
    }
    return out;
  });
  for (const k of ['initiale', 'miroir_chargé']) {
    eq(r[k].apresMicro, ['après-appel'], k + ' (micro-tâches)');
    eq(r[k].final, ['après-appel', 'snap:1'], k + ' (final)');
  }
});
test('db', 'D6', 'une émission exactement après chaque écriture ou suppression validée', 'Émission après écriture', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    const snaps = [];
    db.collection('teams').onSnapshot(s => snaps.push(s.docs.map(d => d.id + '=' + JSON.stringify(d.data()))));
    await new Promise(r => setTimeout(r, 100));
    const base = snaps.length;
    await db.doc('teams/b').set({ v: 1 });
    await db.doc('teams/a').set({ v: 2 });
    await db.doc('teams/b').set({ v: 3 });
    await db.doc('teams/a').delete();
    await new Promise(r => setTimeout(r, 100));
    return { base, apres: snaps.slice(base), total: snaps.length };
  });
  eq(r.base, 1);
  eq(r.apres, [['b={"v":1}'], ['a={"v":2}', 'b={"v":1}'], ['a={"v":2}', 'b={"v":3}'], ['b={"v":3}']]);
});
test('db', 'D7', 'une collection ne voit que ses enfants directs', 'Enfants directs', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    const nb = { matches: [], items: [] };
    db.collection('matches').onSnapshot(s => nb.matches.push(s.docs.map(d => d.id)));
    db.collection('matches/A/items').onSnapshot(s => nb.items.push(s.docs.map(d => d.id)));
    await new Promise(r => setTimeout(r, 100));
    const a = [nb.matches.length, nb.items.length];
    await db.doc('matches/A/items/m1').set({ x: 1 });
    await new Promise(r => setTimeout(r, 50));
    const b = [nb.matches.length, nb.items.length];
    await db.doc('matches/A').set({ owner: 'A' });
    await new Promise(r => setTimeout(r, 50));
    const c = [nb.matches.length, nb.items.length];
    return { a, b, c, matches: nb.matches[nb.matches.length - 1], items: nb.items[nb.items.length - 1] };
  });
  eq(r, { a: [1, 1], b: [1, 2], c: [2, 2], matches: ['A'], items: ['m1'] });
});
test('db', 'D8', 'set / delete ne se résolvent qu\'à la fin de la transaction (événement complete)', 'Résolution à complete', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    let complete = false, resolu = false, resoluAuSucces = null;
    const oTx = IDBDatabase.prototype.transaction, oPut = IDBObjectStore.prototype.put, oDel = IDBObjectStore.prototype.delete;
    IDBDatabase.prototype.transaction = function (a, mode) {
      const tx = oTx.apply(this, arguments);
      if (mode === 'readwrite') tx.addEventListener('complete', () => { complete = true; });
      return tx;
    };
    const guette = function (orig) {
      return function () { const rq = orig.apply(this, arguments); rq.addEventListener('success', () => { resoluAuSucces = resolu; }); return rq; };
    };
    IDBObjectStore.prototype.put = guette(oPut); IDBObjectStore.prototype.delete = guette(oDel);
    const out = {};
    try {
      await db.doc('c/x').set({ a: 1 }).then(() => { resolu = true; out.setComplete = complete; });
      out.setAuSucces = resoluAuSucces;
      complete = false; resolu = false; resoluAuSucces = null;
      await db.doc('c/x').delete().then(() => { resolu = true; out.delComplete = complete; });
      out.delAuSucces = resoluAuSucces;
    } finally { IDBDatabase.prototype.transaction = oTx; IDBObjectStore.prototype.put = oPut; IDBObjectStore.prototype.delete = oDel; }
    return out;
  });
  eq(r, { setComplete: true, setAuSucces: false, delComplete: true, delAuSucces: false });
});
test('db', 'D9', 'copie profonde à l\'écriture : modifier l\'objet après set ne change rien (miroir, get, rechargement)', 'Copie profonde', async ({ open, reload }) => {
  const p = await open();
  const avant = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    let dernier = null;
    db.collection('c').onSnapshot(s => { dernier = s; });
    await new Promise(r => setTimeout(r, 80));
    const o = { id: 'x', liste: [1, { a: 1 }], sous: { n: 1 } };
    await db.doc('c/x').set(o);
    o.id = 'MODIFIÉ'; o.liste[1].a = 99; o.liste.push(3); o.sous.n = 99; o.nouveau = true;
    return { get: (await db.doc('c/x').get()).data(), snap: dernier.docs[0].data() };
  });
  const attendu = { id: 'x', liste: [1, { a: 1 }], sous: { n: 1 } };
  eq(avant.get, attendu, 'get'); eq(avant.snap, attendu, 'instantané');
  await reload(p);
  const apres = await p.evaluate(async () => (await (await KBLocal.use('db')).doc('c/x').get()).data());
  eq(apres, attendu, 'après rechargement');
});
test('db', 'D10', 'objets rendus profondément figés : modifier lève une erreur (instantané, get, premier get depuis la base)', 'Objets figés', async ({ open, reload }) => {
  const p = await open();
  const sonde = () => p.evaluate(async () => {
    'use strict';
    const db = await KBLocal.use('db');
    const profond = o => Object.isFrozen(o) && Object.values(o).every(v => v === null || typeof v !== 'object' || profond(v));
    const essais = {};
    const tente = (cle, d) => {
      let n = 0;
      for (const f of [() => { d.id = 'z'; }, () => { d.liste.push(1); }, () => { d.liste[1].a = 2; }, () => { d.nouveau = 1; }, () => { delete d.id; }]) {
        try { f(); } catch (e) { n++; }
      }
      essais[cle] = { leve: n, fige: profond(d) };
    };
    let snap = null;
    db.collection('c').onSnapshot(s => { snap = s; });
    await new Promise(r => setTimeout(r, 80));
    tente('snap', snap.docs[0].data());
    tente('get', (await db.doc('c/x').get()).data());
    essais.docs = Object.isFrozen(snap.docs) && Object.isFrozen(snap);
    return essais;
  });
  await p.evaluate(async () => { await (await KBLocal.use('db')).doc('c/x').set({ id: 'x', liste: [1, { a: 1 }] }); });
  const a = await sonde();
  eq(a, { snap: { leve: 5, fige: true }, get: { leve: 5, fige: true }, docs: true }, 'depuis le miroir');
  await reload(p);
  const b = await p.evaluate(async () => {
    'use strict';
    const d = (await (await KBLocal.use('db')).doc('c/x').get()).data();   // lecture directe de la base (pas de miroir)
    let n = 0;
    for (const f of [() => { d.id = 'z'; }, () => { d.liste[1].a = 2; }, () => { d.liste.push(1); }]) { try { f(); } catch (e) { n++; } }
    return n;
  });
  eq(b, 3, 'lecture directe');
});
test('db', 'D11', 'miroir : après le chargement initial, aucune relecture de la collection (ni getAll, ni curseur)', 'Miroir en mémoire', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    const cnt = { getAll: 0, cursor: 0, count: 0 };
    const patch = (proto, nom, cle) => { const o = proto[nom]; proto[nom] = function () { cnt[cle]++; return o.apply(this, arguments); }; };
    patch(IDBIndex.prototype, 'getAll', 'getAll'); patch(IDBObjectStore.prototype, 'getAll', 'getAll');
    patch(IDBIndex.prototype, 'openCursor', 'cursor'); patch(IDBObjectStore.prototype, 'openCursor', 'cursor');
    let n = 0;
    db.collection('c').onSnapshot(() => { n++; });
    await new Promise(r => setTimeout(r, 100));
    const initial = Object.assign({}, cnt);
    for (let i = 0; i < 20; i++) await db.doc('c/d' + i).set({ i });
    for (let i = 0; i < 5; i++) await db.doc('c/d' + i).delete();
    await db.doc('c/d10').get();
    return { initial, final: Object.assign({}, cnt), emissions: n };
  });
  eq(r.initial, { getAll: 1, cursor: 0, count: 0 }, 'lecture initiale');
  eq(r.final, r.initial, 'aucune relecture ensuite');
  eq(r.emissions, 26);
});
test('db', 'D12', 'ordre des écritures concurrentes sur un même document : la dernière gagne (miroir et base)', 'Ordre des écritures', async ({ open, reload }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    let snap = null;
    db.collection('c').onSnapshot(s => { snap = s; });
    await new Promise(r => setTimeout(r, 60));
    await Promise.all([1, 2, 3, 4, 5].map(i => db.doc('c/x').set({ v: i })));
    return snap.docs[0].data();
  });
  eq(r, { v: 5 });
  await reload(p);
  eq(await p.evaluate(async () => (await (await KBLocal.use('db')).doc('c/x').get()).data()), { v: 5 });
});
test('db', 'D13', 'désabonnement : plus d\'émission ; un nouvel abonnement repart d\'un miroir à jour', 'Désabonnement', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    const a = [], b = [];
    const un = db.collection('c').onSnapshot(s => a.push(s.docs.length));
    await new Promise(r => setTimeout(r, 60));
    un(); un();
    await db.doc('c/x').set({ v: 1 });
    await new Promise(r => setTimeout(r, 60));
    db.collection('c').onSnapshot(s => b.push(s.docs.length));
    await new Promise(r => setTimeout(r, 60));
    // désabonnement avant la première émission : rien ne doit arriver
    const c = [];
    const un2 = db.collection('d').onSnapshot(s => c.push(1));
    un2();
    await new Promise(r => setTimeout(r, 60));
    return { a, b, c };
  });
  eq(r, { a: [0], b: [1], c: [] });
});
test('db', 'D14', 'deux abonnés sur la même collection reçoivent chacun la première émission puis les écritures', 'Plusieurs abonnés', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    const a = [], b = [];
    db.collection('c').onSnapshot(s => a.push(s.docs.length));
    db.collection('c').onSnapshot(s => b.push(s.docs.length));
    await new Promise(r => setTimeout(r, 80));
    await db.doc('c/x').set({ v: 1 });
    return { a, b };
  });
  eq(r, { a: [0, 1], b: [0, 1] });
});

/* ============================================================
   GROUPE 3 — Échecs
   ============================================================ */
test('echecs', 'E1', 'transaction avortée : promesse rejetée, aucune émission, miroir et base inchangés (set et delete)', 'Échec d\'écriture', async ({ open, reload }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    await db.doc('c/x').set({ v: 'ancien' });
    let n = 0, snap = null;
    db.collection('c').onSnapshot(s => { n++; snap = s; });
    await new Promise(r => setTimeout(r, 80));
    const base = n, out = {};
    const oPut = IDBObjectStore.prototype.put, oDel = IDBObjectStore.prototype.delete;
    const avorte = orig => function () { const rq = orig.apply(this, arguments); this.transaction.abort(); return rq; };
    const lance = () => { throw new DOMException('quota', 'QuotaExceededError'); };
    const essais = [
      ['set_abort', () => { IDBObjectStore.prototype.put = avorte(oPut); }, () => db.doc('c/x').set({ v: 'nouveau' })],
      ['set_nouveau_abort', () => { IDBObjectStore.prototype.put = avorte(oPut); }, () => db.doc('c/neuf').set({ v: 1 })],
      ['set_quota', () => { IDBObjectStore.prototype.put = lance; }, () => db.doc('c/x').set({ v: 'nouveau' })],
      ['delete_abort', () => { IDBObjectStore.prototype.delete = avorte(oDel); }, () => db.doc('c/x').delete()],
      ['delete_quota', () => { IDBObjectStore.prototype.delete = lance; }, () => db.doc('c/x').delete()],
    ];
    for (const [nom, patch, fn] of essais) {
      patch();
      try { await fn(); out[nom] = 'RÉSOLU'; } catch (e) { out[nom] = 'rejet'; }
      IDBObjectStore.prototype.put = oPut; IDBObjectStore.prototype.delete = oDel;
    }
    await new Promise(r => setTimeout(r, 80));
    out.emissions = n - base;
    out.miroir = snap.docs.map(d => d.id + ':' + d.data().v);
    out.get = (await db.doc('c/x').get()).data();
    out.getNeuf = (await db.doc('c/neuf').get()).exists;
    // la façade reste utilisable après l'échec
    await db.doc('c/x').set({ v: 'repris' });
    out.apres = (await db.doc('c/x').get()).data();
    return out;
  });
  eq(r.set_abort, 'rejet'); eq(r.set_nouveau_abort, 'rejet'); eq(r.set_quota, 'rejet');
  eq(r.delete_abort, 'rejet'); eq(r.delete_quota, 'rejet');
  eq(r.emissions, 0, 'aucune émission pendant les échecs');
  eq(r.miroir, ['x:ancien'], 'miroir inchangé');
  eq(r.get, { v: 'ancien' }, 'get inchangé'); eq(r.getNeuf, false);
  eq(r.apres, { v: 'repris' }, 'écriture suivante');
  await reload(p);
  eq(await p.evaluate(async () => (await (await KBLocal.use('db')).doc('c/x').get()).data()), { v: 'repris' });
});
test('echecs', 'E2', 'IndexedDB absent ou refusé : use(db) rejette (et use(user)), downloads reste disponible', 'IndexedDB absent', async ({ open }) => {
  const variantes = {
    absent: () => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); },
    leve: () => { IDBFactory.prototype.open = function () { throw new DOMException('refus', 'SecurityError'); }; },
    erreur_asynchrone: () => {
      IDBFactory.prototype.open = function () {
        const req = {};
        setTimeout(() => { req.error = new DOMException('refus', 'UnknownError'); if (req.onerror) req.onerror({}); }, 5);
        return req;
      };
    },
  };
  for (const [nom, init] of Object.entries(variantes)) {
    const p = await open({ init });
    const r = await p.evaluate(async () => {
      const o = {};
      try { await KBLocal.use('db'); o.db = 'RÉSOLU'; } catch (e) { o.db = 'rejet'; }
      try { await KBLocal.use('user'); o.user = 'RÉSOLU'; } catch (e) { o.user = 'rejet'; }
      try { o.dl = typeof (await KBLocal.use('downloads')).save; } catch (e) { o.dl = 'rejet'; }
      return o;
    });
    eq(r, { db: 'rejet', user: 'rejet', dl: 'function' }, nom);
    await p.close();
  }
});
test('echecs', 'E3', 'lecture initiale en échec : le rappel « erreur » est appelé, aucune émission ; un nouvel abonnement fonctionne ensuite', 'Rappel erreur', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    await db.doc('c/x').set({ v: 1 });
    const out = {};
    const o = IDBIndex.prototype.getAll;
    const variantes = {
      leve: function () { throw new DOMException('boom', 'InvalidStateError'); },
      avorte: function () { const rq = o.apply(this, arguments); this.objectStore.transaction.abort(); return rq; },
    };
    for (const [nom, f] of Object.entries(variantes)) {
      IDBIndex.prototype.getAll = f;
      const ev = { next: 0, err: 0, avecErreur: false };
      db.collection('c').onSnapshot(() => { ev.next++; }, e => { ev.err++; ev.avecErreur = !!e; });
      await new Promise(r => setTimeout(r, 120));
      IDBIndex.prototype.getAll = o;
      out[nom] = ev;
    }
    const apres = [];
    db.collection('c').onSnapshot(s => apres.push(s.docs.length));
    await new Promise(r => setTimeout(r, 100));
    out.apres = apres;
    return out;
  });
  eq(r.leve, { next: 0, err: 1, avecErreur: true }, 'getAll lève');
  eq(r.avorte, { next: 0, err: 1, avecErreur: true }, 'transaction avortée');
  eq(r.apres, [1], 'nouvel abonnement');
});

/* ============================================================
   GROUPE 4 — Identité (user)
   ============================================================ */
const idOk = id => /^u_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
const lireMeta = (page, cle) => page.evaluate(k => new Promise((res, rej) => {
  const q = indexedDB.open(new URLSearchParams(location.search).get('db'));
  q.onsuccess = () => { const db = q.result, r = db.transaction(['meta']).objectStore('meta').get(k); r.onsuccess = () => { db.close(); res(r.result === undefined ? null : r.result); }; };
  q.onerror = () => rej(q.error);
}), cle);
const effacerMeta = (page, cle) => page.evaluate(k => new Promise((res, rej) => {
  const q = indexedDB.open(new URLSearchParams(location.search).get('db'));
  q.onsuccess = () => { const db = q.result, tx = db.transaction(['meta'], 'readwrite'); tx.objectStore('meta').delete(k); tx.oncomplete = () => { db.close(); res(); }; };
  q.onerror = () => rej(q.error);
}), cle);
const poserMeta = (page, cle, val) => page.evaluate(([k, v]) => new Promise((res, rej) => {
  const q = indexedDB.open(new URLSearchParams(location.search).get('db'));
  q.onsuccess = () => { const db = q.result, tx = db.transaction(['meta'], 'readwrite'); tx.objectStore('meta').put(v, k); tx.oncomplete = () => { db.close(); res(); }; };
  q.onerror = () => rej(q.error);
}), [cle, val]);
const lireId = page => page.evaluate(async () => (await KBLocal.use('user')).id());
const lireLS = page => page.evaluate(() => localStorage.getItem('kinball_install_id'));

test('identite', 'I1', 'id() : promesse déjà résolue, format « u_<UUID> », stable ; canEdit et isOwner vrais', 'user.id / canEdit / isOwner', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const u = await KBLocal.use('user');
    const pr = u.id(); let resolu = false; pr.then(() => { resolu = true; });
    await Promise.resolve(); await Promise.resolve();
    const a = await u.id(), b = await u.id();
    return { resolu, a, b, edit: await u.canEdit(), owner: await u.isOwner() };
  });
  assert(r.resolu, 'id() doit être résolue sans attendre d\'entrée-sortie');
  assert(idOk(r.a), 'format : ' + r.a); eq(r.a, r.b);
  eq([r.edit, r.owner], [true, true]);
});
test('identite', 'I2', 'identifiant rangé dans meta ET recopié dans localStorage', 'Double dépôt', async ({ open }) => {
  const p = await open();
  const id = await lireId(p);
  eq(await lireMeta(p, 'installId'), id, 'meta'); eq(await lireLS(p), id, 'localStorage');
});
test('identite', 'I3', 'identité identique après rechargement', 'Identité stable', async ({ open, reload }) => {
  const p = await open();
  const a = await lireId(p);
  await reload(p);
  eq(await lireId(p), a);
  await reload(p);
  eq(await lireId(p), a);
});
test('identite', 'I4', 'seul IndexedDB survit : localStorage réparé', 'Réparation de localStorage', async ({ open, reload }) => {
  const p = await open();
  const a = await lireId(p);
  await p.evaluate(() => localStorage.removeItem('kinball_install_id'));
  await reload(p);
  eq(await lireId(p), a); eq(await lireLS(p), a);
});
test('identite', 'I5', 'seul localStorage survit : meta réparé, même identifiant', 'Réparation de meta', async ({ open, reload }) => {
  const p = await open();
  const a = await lireId(p);
  await effacerMeta(p, 'installId');
  await reload(p);
  eq(await lireId(p), a); eq(await lireMeta(p, 'installId'), a);
});
test('identite', 'I6', 'les deux dépôts diffèrent : IndexedDB gagne, localStorage est corrigé', 'IndexedDB gagne', async ({ open, reload }) => {
  const p = await open();
  const a = await lireId(p);
  await p.evaluate(() => localStorage.setItem('kinball_install_id', 'u_00000000-0000-4000-8000-000000000000'));
  await reload(p);
  eq(await lireId(p), a); eq(await lireLS(p), a);
});
test('identite', 'I7', 'dépôt IndexedDB corrompu (valeur mal formée) : traité comme absent, réparé depuis localStorage', 'Valeur mal formée', async ({ open, reload }) => {
  const p = await open();
  const a = await lireId(p);
  await poserMeta(p, 'installId', 12345);
  await reload(p);
  eq(await lireId(p), a); eq(await lireMeta(p, 'installId'), a);
});
test('identite', 'I8', 'deux onglets qui démarrent ensemble sur une base vide obtiennent le même identifiant', 'Création unique', async ({ open }) => {
  const db = nomBase();
  const p1 = await open({ db }), p2 = await open({ db, garderLS: true });
  await p1.evaluate(() => localStorage.clear());
  const [a, b] = await Promise.all([lireId(p1), lireId(p2)]);
  assert(idOk(a), a); eq(a, b);
  eq(await lireMeta(p1, 'installId'), a);
});
test('identite', 'I9', 'importIdentity puis rechargement : identité importée (id et nom), les deux dépôts à jour', 'importIdentity', async ({ open, reload }) => {
  const p = await open();
  const avant = await lireId(p);
  const cible = { id: 'u_11111111-2222-4333-8444-555555555555', name: 'Marie Tremblay' };
  const r = await p.evaluate(async c => {
    const u = await KBLocal.use('user');
    await u.importIdentity(c);
    return { id: await u.id(), exp: u.exportIdentity(), nom: u.getName() };
  }, cible);
  eq(r, { id: cible.id, exp: cible, nom: cible.name });
  assert(avant !== cible.id);
  await reload(p);
  eq(await lireId(p), cible.id); eq(await lireLS(p), cible.id);
  eq(await p.evaluate(async () => (await KBLocal.use('user')).exportIdentity()), cible);
});
test('identite', 'I10', 'importIdentity refuse un objet mal formé et ne change rien', 'importIdentity mal formé', async ({ open, reload }) => {
  const p = await open();
  const avant = await lireId(p);
  const r = await p.evaluate(async () => {
    const u = await KBLocal.use('user'), o = [];
    const mauvais = [null, undefined, 'u_x', 42, [], {}, { id: 'u_11111111-2222-4333-8444-555555555555' }, { name: 'x' },
      { id: '', name: '' }, { id: 'pas-un-id', name: 'x' }, { id: 'u_11111111-2222-4333-8444-555555555555', name: 7 },
      { id: 'u_court', name: 'x' }, { id: 'u_' + 'a'.repeat(80), name: 'x' }];
    for (const m of mauvais) { try { await u.importIdentity(m); o.push('RÉSOLU'); } catch (e) { o.push('rejet'); } }
    return { o, id: await u.id() };
  });
  eq(r.o, Array(13).fill('rejet')); eq(r.id, avant);
  await reload(p);
  eq(await lireId(p), avant);
});
test('identite', 'I11', 'profiles(ids) : une entrée {name} pour chaque identifiant demandé (soi = nom local, autres = vide)', 'user.profiles', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const u = await KBLocal.use('user'), moi = await u.id();
    await u.setName('  Guillaume ');
    const ps = await u.profiles([moi, 'u_autre-personne-1', 'u_autre-personne-2', moi]);
    const vide = await u.profiles([]);
    return { moi, ps, vide, cles: Object.keys(ps).sort() };
  });
  eq(r.ps[r.moi], { name: 'Guillaume' });
  eq(r.ps['u_autre-personne-1'], { name: '' }); eq(r.ps['u_autre-personne-2'], { name: '' });
  eq(r.cles, [r.moi, 'u_autre-personne-1', 'u_autre-personne-2'].sort()); eq(r.vide, {});
});
test('identite', 'I12', 'getName / setName / exportIdentity ; le nom survit au rechargement ; setName refuse un non-texte', 'Nom d\'affichage', async ({ open, reload }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const u = await KBLocal.use('user');
    const vide = u.getName();
    await u.setName('Caroline');
    let bad = 'RÉSOLU'; try { await u.setName(5); } catch (e) { bad = 'rejet'; }
    return { vide, nom: u.getName(), exp: u.exportIdentity(), bad };
  });
  eq(r.vide, ''); eq(r.nom, 'Caroline'); eq(r.exp.name, 'Caroline'); eq(r.bad, 'rejet');
  assert(idOk(r.exp.id));
  await reload(p);
  eq(await p.evaluate(async () => (await KBLocal.use('user')).getName()), 'Caroline');
});
test('identite', 'I13', 'ordre : « await use(db) puis onSnapshot » en parallèle de « await use(user) puis await id() » : l\'identifiant est connu avant la première émission', 'Ordre identité / première émission', async ({ open, reload }) => {
  const p = await open();
  const motif = () => p.evaluate(async () => {
    let AUTHOR_ID = null, DB = null, premiere = null, idALaPremiere = 'jamais émis';
    // Même forme que les deux blocs asynchrones d'index.html (db d'abord, puis user).
    const a = (async () => {
      DB = await KBLocal.use('db');
      DB.collection('matches').onSnapshot(() => { if (premiere === null) { premiere = true; idALaPremiere = AUTHOR_ID; } });
    })();
    const b = (async () => {
      const USER_CAP = await KBLocal.use('user');
      AUTHOR_ID = await USER_CAP.id();
    })();
    await Promise.all([a, b]);
    await new Promise(r => setTimeout(r, 150));
    return { idALaPremiere, final: AUTHOR_ID };
  });
  // base vide (identité créée pendant ce démarrage), puis démarrages suivants (identité relue)
  for (let i = 0; i < 4; i++) {
    const r = await motif();
    assert(idOk(r.final), 'identité finale : ' + r.final);
    eq(r.idALaPremiere, r.final, 'identifiant connu à la première émission (essai ' + i + ')');
    await reload(p);
  }
  // et depuis des bases neuves, sans l'aide du cache : dix démarrages à froid
  for (let i = 0; i < 10; i++) {
    const q = await open();
    const r = await motif();
    eq(r.idALaPremiere, r.final, 'démarrage à froid ' + i);
    await q.close();
  }
});

/* ============================================================
   GROUPE 5 — downloads, meta, storage
   ============================================================ */
test('divers', 'V1', 'downloads.save : déclenche un téléchargement du bon nom et du bon contenu (Blob, texte, octets)', 'downloads.save', async ({ open }) => {
  const p = await open();
  for (const [nom, fab, attendu] of [
    ['a.csv', "new Blob(['x;y\\n1;2\\n'], { type: 'text/csv' })", 'x;y\n1;2\n'],
    ['b.txt', "'texte é'", 'texte é'],
    ['c.bin', 'new Uint8Array([104, 105])', 'hi'],
  ]) {
    const [dl, res] = await Promise.all([
      p.waitForEvent('download'),
      p.evaluate(async ([n, f]) => { const d = await KBLocal.use('downloads'); return await d.save({ filename: n, data: eval(f) }) === undefined; }, [nom, fab]),
    ]);
    eq(dl.suggestedFilename(), nom);
    const f = await dl.path();
    eq(fs.readFileSync(f, 'utf8'), attendu, nom);
    assert(res, 'la promesse doit se résoudre');
  }
});
test('divers', 'V2', 'downloads.save : l\'adresse d\'objet est libérée ensuite ; le lien est retiré de la page', 'Adresse d\'objet libérée', async ({ open }) => {
  const p = await open();
  const [dl, r] = await Promise.all([
    p.waitForEvent('download'),
    p.evaluate(async () => {
      KBLocal.configure({ revokeDelay: 50 });
      const cree = [], libere = [];
      const oc = URL.createObjectURL, orv = URL.revokeObjectURL;
      URL.createObjectURL = function (b) { const u = oc.call(URL, b); cree.push(u); return u; };
      URL.revokeObjectURL = function (u) { libere.push(u); return orv.call(URL, u); };
      await (await KBLocal.use('downloads')).save({ filename: 'z.txt', data: new Blob(['z']) });
      const liensApres = document.querySelectorAll('a[download]').length;
      const avant = libere.length;
      await new Promise(r => setTimeout(r, 300));
      return { cree: cree.length, avant, libere: libere.length, memeAdresse: cree[0] === libere[0], liensApres };
    }),
  ]);
  eq(r, { cree: 1, avant: 0, libere: 1, memeAdresse: true, liensApres: 0 });
});
test('divers', 'V3', 'downloads.save : arguments invalides rejetés, sans code « declined »', 'downloads erreurs', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const d = await KBLocal.use('downloads'), o = [];
    for (const a of [undefined, null, {}, { filename: 'x' }, { data: 'x' }, { filename: '', data: 'x' }, { filename: 5, data: 'x' }]) {
      try { await d.save(a); o.push('RÉSOLU'); } catch (e) { o.push(e && e.code === 'declined' ? 'declined' : 'rejet'); }
    }
    return o;
  });
  eq(r, Array(7).fill('rejet'));
});
test('divers', 'V4', 'meta.get / set : aller-retour, absent = undefined, valeurs structurées, survit au rechargement ; clé invalide rejetée', 'KBLocal.meta', async ({ open, reload }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const o = {};
    o.absent = await KBLocal.meta.get('rien') === undefined;
    await KBLocal.meta.set('k1', { a: [1, 2], b: 'é' });
    await KBLocal.meta.set('k2', 7);
    await KBLocal.meta.set('k2', 8);
    o.k1 = await KBLocal.meta.get('k1'); o.k2 = await KBLocal.meta.get('k2');
    for (const [f, nom] of [[() => KBLocal.meta.get(3), 'cleGet'], [() => KBLocal.meta.set(3, 1), 'cleSet'], [() => KBLocal.meta.set('x', undefined), 'valeur']]) {
      try { await f(); o[nom] = 'RÉSOLU'; } catch (e) { o[nom] = 'rejet'; }
    }
    return o;
  });
  eq(r, { absent: true, k1: { a: [1, 2], b: 'é' }, k2: 8, cleGet: 'rejet', cleSet: 'rejet', valeur: 'rejet' });
  await reload(p);
  eq(await p.evaluate(async () => [await KBLocal.meta.get('k1'), await KBLocal.meta.get('k2')]), [{ a: [1, 2], b: 'é' }, 8]);
});
test('divers', 'V5', 'storage.status : {persisted, usage, quota} (nombres ou null) ; requestPersist : booléen ; ne lèvent jamais', 'KBLocal.storage', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const s = await KBLocal.storage.status();
    const rp = await KBLocal.storage.requestPersist();
    return { cles: Object.keys(s).sort(), persisted: s.persisted, usage: typeof s.usage, quota: typeof s.quota, rp: typeof rp };
  });
  eq(r.cles, ['persisted', 'quota', 'usage']);
  assert(r.persisted === null || typeof r.persisted === 'boolean', 'persisted');
  assert(['number', 'object'].includes(r.usage) && ['number', 'object'].includes(r.quota), 'usage/quota');
  eq(r.rp, 'boolean');
});
test('divers', 'V6', 'storage : navigateur muet, qui lève ou qui rejette : valeurs null / false, jamais d\'exception', 'storage ne lève jamais', async ({ open }) => {
  const variantes = {
    absent: () => { Object.defineProperty(navigator, 'storage', { value: undefined, configurable: true }); },
    leve: () => { Object.defineProperty(navigator, 'storage', { value: { persisted() { throw new Error('x'); }, estimate() { throw new Error('x'); }, persist() { throw new Error('x'); } }, configurable: true }); },
    rejette: () => { Object.defineProperty(navigator, 'storage', { value: { persisted: () => Promise.reject(new Error('x')), estimate: () => Promise.reject(new Error('x')), persist: () => Promise.reject(new Error('x')) }, configurable: true }); },
    farfelu: () => { Object.defineProperty(navigator, 'storage', { value: { persisted: () => Promise.resolve('oui'), estimate: () => Promise.resolve({ usage: 'beaucoup', quota: NaN }), persist: () => Promise.resolve('peut-être') }, configurable: true }); },
  };
  for (const [nom, init] of Object.entries(variantes)) {
    const p = await open({ init });
    const r = await p.evaluate(async () => ({ s: await KBLocal.storage.status(), rp: await KBLocal.storage.requestPersist() }));
    eq(r, { s: { persisted: null, usage: null, quota: null }, rp: false }, nom);
    await p.close();
  }
  const p = await open({ init: () => { Object.defineProperty(navigator, 'storage', { value: { persisted: () => Promise.resolve(true), estimate: () => Promise.resolve({ usage: 12, quota: 3400 }), persist: () => Promise.resolve(true) }, configurable: true }); } });
  eq(await p.evaluate(async () => ({ s: await KBLocal.storage.status(), rp: await KBLocal.storage.requestPersist() })), { s: { persisted: true, usage: 12, quota: 3400 }, rp: true }, 'nominal');
});

/* ============================================================
   GROUPE 6 — Persistance et performance
   ============================================================ */
test('perf', 'P1', 'écrire, recharger la page, relire : équipe, fiche d\'auteur et match d\'environ 300 Ko identiques (get et instantanés)', 'Persistance', async ({ open, reload }) => {
  const p = await open();
  const taille = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    const m = mkMatch('m_1', 300000);
    await db.collection('teams').doc('t_1').set({ id: 't_1', nom: 'Les Éclairs', joueurs: [{ n: 1, nom: 'Éli' }, { n: 2, nom: 'Zoé' }] });
    await db.doc('matches/u_test-auteur-0001').set({ owner: 'u_test-auteur-0001', updatedAt: 1700000000000 });
    await db.collection('matches/u_test-auteur-0001/items').doc('m_1').set(m);
    return JSON.stringify(m).length;
  });
  assert(taille > 280000 && taille < 340000, 'taille du match : ' + taille);
  await reload(p);
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    const att = JSON.stringify(mkMatch('m_1', 300000));
    const snap = col => new Promise(res => db.collection(col).onSnapshot(s => res(s.docs.map(d => ({ id: d.id, data: d.data() })))));
    const items = await snap('matches/u_test-auteur-0001/items');
    return {
      matchGet: JSON.stringify((await db.doc('matches/u_test-auteur-0001/items/m_1').get()).data()) === att,
      matchSnap: items.length === 1 && JSON.stringify(items[0].data) === att,
      equipe: (await db.doc('teams/t_1').get()).data(),
      fiche: (await db.doc('matches/u_test-auteur-0001').get()).data(),
      equipesSnap: (await snap('teams')).map(d => d.id),
      auteursSnap: (await snap('matches')).map(d => d.id),
    };
  });
  eq(r, { matchGet: true, matchSnap: true, equipe: { id: 't_1', nom: 'Les Éclairs', joueurs: [{ n: 1, nom: 'Éli' }, { n: 2, nom: 'Zoé' }] },
          fiche: { owner: 'u_test-auteur-0001', updatedAt: 1700000000000 }, equipesSnap: ['t_1'], auteursSnap: ['u_test-auteur-0001'] });
});
test('perf', 'P2', '300 écritures successives d\'un document de ~300 Ko dans une collection de 200 documents : médiane sous 30 ms, sans relecture complète', 'Performance et miroir', async ({ open }) => {
  const p = await open();
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    const col = db.collection('perf/items');
    await Promise.all(Array.from({ length: 199 }, (_, i) => col.doc('p' + String(i).padStart(3, '0')).set({ id: i, texte: 'x'.repeat(2000), liste: [1, 2, 3] })));
    const gros = mkMatch('gros', 300000);
    await col.doc('gros').set(gros);
    let emissions = 0, taille = 0;
    col.onSnapshot(s => { emissions++; taille = s.docs.length; });
    await new Promise(r => setTimeout(r, 300));
    const cnt = { lectures: 0 };
    for (const [proto, nom] of [[IDBIndex.prototype, 'getAll'], [IDBObjectStore.prototype, 'getAll'], [IDBIndex.prototype, 'openCursor'], [IDBObjectStore.prototype, 'openCursor'], [IDBIndex.prototype, 'getAllKeys'], [IDBObjectStore.prototype, 'getAllKeys']]) {
      const o = proto[nom]; proto[nom] = function () { cnt.lectures++; return o.apply(this, arguments); };
    }
    const avant = emissions, ref = col.doc('gros'), durees = [];
    for (let i = 0; i < 300; i++) {
      gros.history[0].n = 10000 + i;
      const t0 = performance.now();
      await ref.set(gros);
      durees.push(performance.now() - t0);
    }
    await new Promise(r => setTimeout(r, 100));
    durees.sort((a, b) => a - b);
    const lu = (await ref.get()).data();
    return { mediane: durees[150], p95: durees[285], max: durees[299], min: durees[0], emissions: emissions - avant, taille, lectures: cnt.lectures,
             dernier: lu.history[0].n, octets: JSON.stringify(gros).length };
  });
  console.log('      mesure P2 : médiane ' + r.mediane.toFixed(1) + ' ms, p95 ' + r.p95.toFixed(1) + ' ms, min ' + r.min.toFixed(1) + ' ms, max ' + r.max.toFixed(1) + ' ms (' + r.octets + ' octets, ' + r.taille + ' documents)');
  eq(r.taille, 200); eq(r.emissions, 300, 'une émission par écriture'); eq(r.lectures, 0, 'lectures de collection pendant les écritures');
  eq(r.dernier, 10299, 'dernière valeur relue');
  assert(r.mediane < 30, 'médiane ' + r.mediane.toFixed(1) + ' ms (attendu < 30)');
});

/* ============================================================
   GROUPE 7 — Contrôles du fichier source
   ============================================================ */
test('source', 'S1', 'kblocal.js : ni « deleteDatabase » ni « .clear( »', 'Aucune opération destructive', async () => {
  const src = fs.readFileSync(path.join(DEPOT, 'kblocal.js'), 'utf8');
  for (const interdit of ['deleteDatabase', '.clear(']) assert(!src.includes(interdit), 'trouvé : ' + interdit);
});
test('source', 'S2', 'kblocal.js : aucun appel réseau ni module ; aucune syntaxe ou API au-delà de Safari 15', 'Pas de réseau, syntaxe Safari 15', async () => {
  const src = fs.readFileSync(path.join(DEPOT, 'kblocal.js'), 'utf8');
  const sansCommentaires = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /\bimport\s*[({]/, /\bexport\s/, /structuredClone/, /\.at\(/, /Object\.hasOwn/, /\?\./, /\?\?/, /\bawait\b/, /\basync\b/, /#[a-zA-Z_]\w*\s*[=;(]/, /\bstatic\s+\w+\s*=/]) {
    assert(!re.test(sansCommentaires), 'motif interdit : ' + re);
  }
});
test('source', 'S3', 'kblocal.js : syntaxe valide (script classique, node --check)', 'Script classique', async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, ['--check', path.join(DEPOT, 'kblocal.js')]);
});
/* Dernier : aucune erreur console pendant toute la suite. */
test('zz', 'Z1', 'aucune erreur console ni exception de page pendant toute la suite', 'Aucune erreur console', async () => {
  eq(erreursConsole, []);
});

/* ---------- Exécution ---------- */
const filtre = process.env.KBLOCAL_ONLY ? process.env.KBLOCAL_ONLY.split(',') : null;
const navigateur = await chromium.launch();
let nPass = 0, nFail = 0;
const groupes = [...new Set(TESTS.map(t => t.groupe))];
const t0 = Date.now();
for (const g of groupes) {
  const ctx = await navigateur.newContext({ acceptDownloads: true });
  const env = envDe(ctx);
  for (const t of TESTS.filter(t => t.groupe === g)) {
    if (filtre && !filtre.includes(t.id) && t.id !== 'Z1') continue;
    const debut = Date.now();
    try {
      await Promise.race([t.fn(env), new Promise((_, rej) => setTimeout(() => rej(new Error('délai dépassé (60 s)')), 60000))]);
      nPass++; console.log('PASS  ' + t.id.padEnd(4) + t.nom + '  (' + (Date.now() - debut) + ' ms)');
    } catch (e) {
      nFail++; console.log('FAIL  ' + t.id.padEnd(4) + t.nom + '\n        ' + String(e.message || e).split('\n').join('\n        '));
    }
  }
  await ctx.close();
}
await navigateur.close();
serveur.close();
console.log('\n' + (nFail ? 'ÉCHEC' : 'OK') + ' — ' + nPass + ' PASS, ' + nFail + ' FAIL en ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
process.exit(nFail ? 1 : 0);
