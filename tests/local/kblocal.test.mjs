/* Suite autonome de kblocal.js (façade de stockage locale).
   Commande : NODE_PATH=<dossier de playwright> node tests/local/kblocal.test.mjs
   Sert le dépôt en http://127.0.0.1 sur un port libre, ouvre tests/local/page.html
   sous Chromium (un contexte de navigateur neuf par groupe de tests), affiche
   PASS / FAIL par test, code de sortie 1 au moindre échec. */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let playwright;
try { playwright = require('playwright'); }
catch (e) {
  const essais = [...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean), path.join(os.homedir(), '.npm-global', 'lib', 'node_modules')];
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

/* ---- C27 · R2 : connexion IndexedDB morte, rouverte une fois, opération rejouée ---- */
const ESPION = () => {
  window.__ouvertures = 0; window.__dbs = [];
  const o = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function () { window.__ouvertures++; return o.apply(this, arguments); };
  const t = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function () { if (!window.__dbs.includes(this)) window.__dbs.push(this); return t.apply(this, arguments); };
};
test('echecs', 'E4', 'connexion fermée sans prévenir (db.close() : le bogue iOS) : l\'écriture suivante rouvre une fois, réussit, une seule émission ; les écritures d\'après aussi', 'R2 · connexion fermée', async ({ open, reload }) => {
  const p = await open({ init: ESPION });
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    await db.doc('c/a').set({ v: 1 });
    let n = 0; db.collection('c').onSnapshot(() => { n++; });
    await new Promise(r => setTimeout(r, 80));
    const base = n, out = { ouv0: window.__ouvertures };
    window.__dbs[0].close();                                   // la connexion meurt, aucun événement
    await db.doc('c/b').set({ v: 2 });                         // doit réussir (réouverture + rejeu)
    await new Promise(r => setTimeout(r, 60));
    out.emissions = n - base; out.ouv1 = window.__ouvertures;
    await db.doc('c/c').set({ v: 3 }); await db.doc('c/a').delete();
    out.ouv2 = window.__ouvertures;
    out.get = (await db.doc('c/b').get()).data();
    out.metaOk = (await KBLocal.meta.set('k', 7), await KBLocal.meta.get('k'));
    return out;
  });
  eq(r.emissions, 1, 'une seule émission pour l\'écriture rejouée');
  eq([r.ouv0, r.ouv1, r.ouv2], [1, 2, 2], 'une seule réouverture');
  eq(r.get, { v: 2 }); eq(r.metaOk, 7);
  await reload(p);
  eq(await p.evaluate(async () => { const s = await new Promise(res => (async () => { (await KBLocal.use('db')).collection('c').onSnapshot(x => res(x.docs.map(d => d.id))); })()); return s; }), ['b', 'c'], 'écritures présentes après rechargement');
});
test('echecs', 'E5', 'événements « close » et « versionchange » : la connexion est oubliée, l\'opération suivante rouvre, aucun échec', 'R2 · close / versionchange', async ({ open }) => {
  const p = await open({ init: ESPION });
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    await db.doc('c/a').set({ v: 1 });
    const out = {};
    window.__dbs[0].dispatchEvent(new Event('close'));
    await db.doc('c/b').set({ v: 2 }); out.apresClose = window.__ouvertures;
    window.__dbs[window.__dbs.length - 1].dispatchEvent(new IDBVersionChangeEvent('versionchange', { oldVersion: 1, newVersion: 2 }));
    await db.doc('c/c').set({ v: 3 }); out.apresVersion = window.__ouvertures;
    out.docs = (await Promise.all(['a', 'b', 'c'].map(i => db.doc('c/' + i).get()))).map(d => d.exists);
    return out;
  });
  eq([r.apresClose, r.apresVersion], [2, 3], 'une réouverture par événement');
  eq(r.docs, [true, true, true]);
});
test('echecs', 'E6', 'transaction refusée (InvalidStateError, TransactionInactiveError) : rejouée une fois ; deux refus de suite : rejet, puis la prochaine écriture réussit sans recharger', 'R2 · transaction refusée', async ({ open }) => {
  const p = await open({ init: ESPION });
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    await db.doc('c/a').set({ v: 1 });
    const out = {}, t0 = IDBDatabase.prototype.transaction;
    const refuse = (nom, fois) => { let n = fois; IDBDatabase.prototype.transaction = function () { if (n-- > 0) throw new DOMException('refus simulé', nom); return t0.apply(this, arguments); }; };
    const rendre = () => { IDBDatabase.prototype.transaction = t0; };
    for (const nom of ['InvalidStateError', 'TransactionInactiveError']) {
      refuse(nom, 1);
      try { await db.doc('c/' + nom).set({ v: nom }); out[nom] = 'ok'; } catch (e) { out[nom] = 'rejet'; }
      rendre();
    }
    out.ouvertures = window.__ouvertures;
    refuse('InvalidStateError', 2);
    try { await db.doc('c/deux').set({ v: 'x' }); out.deux = 'RÉSOLU'; } catch (e) { out.deux = 'rejet ' + e.name; }
    rendre();
    await db.doc('c/apres').set({ v: 'repris' });
    out.apres = (await db.doc('c/apres').get()).data();
    out.deuxAbsent = !(await db.doc('c/deux').get()).exists;
    refuse('TransactionInactiveError', 1);
    out.lecture = (await db.doc('c/a').get()).data();        // le miroir ne couvre pas c/a (aucun abonné) : vraie lecture rejouée
    rendre();
    refuse('InvalidStateError', 1);
    await KBLocal.meta.set('m', 1); out.meta = await KBLocal.meta.get('m');
    rendre();
    return out;
  });
  eq([r.InvalidStateError, r.TransactionInactiveError], ['ok', 'ok'], 'un refus : rejoué');
  eq(r.deux, 'rejet InvalidStateError', 'deux refus de suite : rejet');
  eq(r.apres, { v: 'repris' }, 'écriture suivante');
  eq(r.deuxAbsent, true); eq(r.lecture, { v: 1 }, 'lecture rejouée'); eq(r.meta, 1, 'meta rejoué');
});
test('echecs', 'E7', 'écriture en cours quand la connexion se ferme (événement close puis avortement) : rejouée sur une connexion neuve, une seule émission', 'R2 · écriture en cours', async ({ open }) => {
  const p = await open({ init: ESPION });
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    await db.doc('c/a').set({ v: 1 });
    let n = 0; db.collection('c').onSnapshot(() => { n++; });
    await new Promise(r => setTimeout(r, 80));
    const base = n, put = IDBObjectStore.prototype.put;
    let une = true;
    IDBObjectStore.prototype.put = function () {
      const rq = put.apply(this, arguments);
      if (une) { une = false; this.transaction.db.dispatchEvent(new Event('close')); this.transaction.abort(); }
      return rq;
    };
    let res; try { await db.doc('c/b').set({ v: 2 }); res = 'ok'; } catch (e) { res = 'rejet'; }
    IDBObjectStore.prototype.put = put;
    await new Promise(r => setTimeout(r, 60));
    return { res, emissions: n - base, ouvertures: window.__ouvertures, b: (await db.doc('c/b').get()).data() };
  });
  eq(r, { res: 'ok', emissions: 1, ouvertures: 2, b: { v: 2 } });
});
test('echecs', 'E8', 'lecture initiale refusée une fois (InvalidStateError) : rejouée, l\'abonnement livre ses documents ; l\'échec persistant appelle toujours le rappel « erreur », et un abonnement ultérieur marche', 'R2 · lecture initiale', async ({ open }) => {
  const p = await open({ init: ESPION });
  const r = await p.evaluate(async () => {
    const db = await KBLocal.use('db');
    await db.doc('c/x').set({ v: 1 });
    const out = {}, o = IDBIndex.prototype.getAll;
    let fois = 1;
    IDBIndex.prototype.getAll = function () { if (fois-- > 0) throw new DOMException('refus', 'InvalidStateError'); return o.apply(this, arguments); };
    const ev = { next: [], err: 0 };
    db.collection('c').onSnapshot(s => ev.next.push(s.docs.length), () => { ev.err++; });
    await new Promise(r => setTimeout(r, 200));
    out.unRefus = ev; out.ouvertures = window.__ouvertures;
    IDBIndex.prototype.getAll = function () { throw new DOMException('refus', 'InvalidStateError'); };
    const ev2 = { next: 0, err: 0 };
    db.collection('d').onSnapshot(() => { ev2.next++; }, () => { ev2.err++; });
    await new Promise(r => setTimeout(r, 200));
    out.persistant = ev2;
    IDBIndex.prototype.getAll = o;
    const apres = []; db.collection('d').onSnapshot(s => apres.push(s.docs.length));
    await new Promise(r => setTimeout(r, 150));
    out.apres = apres;
    return out;
  });
  eq(r.unRefus, { next: [1], err: 0 }, 'un refus : rejoué');
  eq(r.persistant, { next: 0, err: 1 }, 'échec persistant : erreur rendue');
  eq(r.apres, [0], 'abonnement ultérieur');
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
/* ============================================================
   GROUPE 6 — M05 : feuille de partage (doublures de navigator.share / canShare)
   Groupe « partage » : contexte tactile (isMobile + hasTouch) ; groupe « partage-ordi » : sans tactile.
   ============================================================ */
const DOUBLURE = () => {
  window.__partages = []; window.__evts = []; window.__mode = 'ok'; window.__canShare = true;
  window.addEventListener('kb:fichier', e => window.__evts.push(e.detail));
  navigator.canShare = () => window.__canShare;
  navigator.share = function (d) {
    window.__partages.push({ cles: Object.keys(d), nb: (d.files || []).length, nom: d.files[0].name, type: d.files[0].type, taille: d.files[0].size });
    const m = Array.isArray(window.__mode) ? (window.__mode.length > 1 ? window.__mode.shift() : window.__mode[0]) : window.__mode;
    if (m === 'ok') return Promise.resolve();
    const e = new Error('x'); e.name = m; return Promise.reject(e);
  };
};
const ouvrirPartage = (env) => env.open({ init: DOUBLURE });
const sauver = (p, nom, contenu = 'a;b\n1;2\n') => p.evaluate(async ([n, c]) => {
  const d = await KBLocal.use('downloads');
  try { await d.save({ filename: n, data: new Blob([c]) }); return 'résolu'; } catch (e) { return e && e.code === 'declined' ? 'declined' : 'rejet'; }
}, [nom, contenu]);
const bilan = (p) => p.evaluate(() => ({ partages: window.__partages, evts: window.__evts }));

test('partage', 'PT1', 'partage : un File par appel, nom nettoyé et type déduit de l\'extension, sans title ni text', 'M05 A.1-A.3', async (env) => {
  const p = await ouvrirPartage(env);
  const cas = [
    ['A/B : finale ?.xlsx', 'A_B _ finale _.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['  ..match.csv ', 'match.csv', 'text/csv'],
    ['a\\b*c"d<e>f|g\u0001h.json', 'a_b_c_d_e_f_g_h.json', 'application/json'],
    ['', null, null],
    ['???', '___', 'application/octet-stream'],
    ['x'.repeat(300) + '.csv', 'x'.repeat(116) + '.csv', 'text/csv'],
    ['....', 'kinball', 'application/octet-stream'],
  ];
  for (const [entree, nom, type] of cas) {
    if (entree === '') { eq(await sauver(p, entree), 'rejet', 'nom vide rejeté'); continue; }
    eq(await sauver(p, entree), 'résolu', entree);
    const b = await bilan(p);
    const dernier = b.partages[b.partages.length - 1];
    eq(dernier.nom, nom, 'nom de ' + JSON.stringify(entree));
    eq(dernier.type, type, 'type de ' + JSON.stringify(entree));
    eq(dernier.cles, ['files']);
    eq(dernier.nb, 1);
  }
});
test('partage', 'PT2', 'partage accepté : une seule fois, événement kb:fichier {partage}, aucun téléchargement', 'M05 A.3, A.6', async (env) => {
  const p = await ouvrirPartage(env);
  let dl = 0; p.on('download', () => dl++);
  eq(await sauver(p, 'm.json', '{"a":1}'), 'résolu');
  await attendre(300);
  const b = await bilan(p);
  eq(b.partages.length, 1); eq(b.partages[0].taille, 7);
  eq(b.evts, [{ filename: 'm.json', moyen: 'partage' }]);
  eq(dl, 0, 'téléchargements');
});
test('partage', 'PT3', 'AbortError : rejet {code:\'declined\'}, aucun événement, aucun téléchargement', 'M05 A.3', async (env) => {
  const p = await ouvrirPartage(env);
  let dl = 0; p.on('download', () => dl++);
  await p.evaluate(() => { window.__mode = 'AbortError'; });
  eq(await sauver(p, 'm.csv'), 'declined');
  await attendre(300);
  const b = await bilan(p);
  eq(b.evts, []); eq(b.partages.length, 1); eq(dl, 0);
});
test('partage', 'PT4', 'NotAllowedError sans fonction de second geste : lien de téléchargement', 'M05 A.5', async (env) => {
  const p = await ouvrirPartage(env);
  await p.evaluate(() => { window.__mode = 'NotAllowedError'; });
  const [dl, r] = await Promise.all([p.waitForEvent('download'), sauver(p, 'n.csv')]);
  eq(r, 'résolu'); eq(dl.suggestedFilename(), 'n.csv');
  eq((await bilan(p)).evts, [{ filename: 'n.csv', moyen: 'telechargement' }]);
});
test('partage', 'PT5', 'second geste : surSecondGeste({filename, relancer}) ; relancer() refait le partage avec le même fichier', 'M05 A.4', async (env) => {
  const p = await ouvrirPartage(env);
  const r = await p.evaluate(async () => {
    window.__mode = ['NotAllowedError', 'ok'];
    let recu = null, fin = null;
    KBLocal.downloads.surSecondGeste(ctx => { recu = ctx; return new Promise((res, rej) => { fin = { res, rej }; }); });
    const d = await KBLocal.use('downloads');
    let settled = false;
    const sv = d.save({ filename: 'G:1.csv', data: new Blob(['x']) }).then(() => { settled = true; return 'résolu'; }, e => { settled = true; return e.code || 'rejet'; });
    await new Promise(r => setTimeout(r, 200));
    const avant = { settled, cles: Object.keys(recu).sort(), nom: recu.filename, partages: window.__partages.length, evts: window.__evts.length };
    const issue = await recu.relancer();
    const encore = recu.relancer() === recu.relancer();   // idempotent
    fin.res();
    return { avant, issue, encore, fin: await sv, partages: window.__partages.map(x => x.nom), evts: window.__evts };
  });
  eq(r.avant, { settled: false, cles: ['filename', 'relancer'], nom: 'G_1.csv', partages: 1, evts: 0 });
  eq(r.issue, 'partage'); eq(r.encore, true); eq(r.fin, 'résolu');
  eq(r.partages, ['G_1.csv', 'G_1.csv']);
  eq(r.evts, [{ filename: 'G_1.csv', moyen: 'partage' }]);
});
test('partage', 'PT6', 'second geste : second NotAllowedError -> téléchargement ; AbortError au second essai -> declined', 'M05 A.4', async (env) => {
  const p = await ouvrirPartage(env);
  await p.evaluate(() => { KBLocal.downloads.surSecondGeste(ctx => ctx.relancer()); });
  await p.evaluate(() => { window.__mode = ['NotAllowedError']; });
  const [dl, r] = await Promise.all([p.waitForEvent('download'), sauver(p, 'u.csv')]);
  eq(r, 'résolu'); eq(dl.suggestedFilename(), 'u.csv');
  eq((await bilan(p)).evts, [{ filename: 'u.csv', moyen: 'telechargement' }]);
  await p.evaluate(() => { window.__mode = ['NotAllowedError', 'AbortError']; window.__evts.length = 0; });
  eq(await sauver(p, 'v.csv'), 'declined');
  eq((await bilan(p)).evts, []);
});
test('partage', 'PT7', 'second geste : la fonction du site rejette {declined} -> declined ; rejette autre chose ou lève -> téléchargement', 'M05 A.4', async (env) => {
  const p = await ouvrirPartage(env);
  await p.evaluate(() => { window.__mode = 'NotAllowedError'; KBLocal.downloads.surSecondGeste(() => Promise.reject(Object.assign(new Error('non'), { code: 'declined' }))); });
  eq(await sauver(p, 'w.csv'), 'declined');
  await p.evaluate(() => KBLocal.downloads.surSecondGeste(() => Promise.reject(new Error('panne'))));
  let [dl, r] = await Promise.all([p.waitForEvent('download'), sauver(p, 'x.csv')]);
  eq(r, 'résolu'); eq(dl.suggestedFilename(), 'x.csv');
  await p.evaluate(() => KBLocal.downloads.surSecondGeste(() => { throw new Error('lève'); }));
  [dl, r] = await Promise.all([p.waitForEvent('download'), sauver(p, 'y.csv')]);
  eq(r, 'résolu'); eq(dl.suggestedFilename(), 'y.csv');
});
test('partage', 'PT8', 'canShare faux, ou autre erreur de share : lien de téléchargement, kb:fichier {telechargement}', 'M05 A.3, A.5', async (env) => {
  const p = await ouvrirPartage(env);
  await p.evaluate(() => { window.__canShare = false; });
  let [dl, r] = await Promise.all([p.waitForEvent('download'), sauver(p, 'c1.csv')]);
  eq(r, 'résolu'); eq(dl.suggestedFilename(), 'c1.csv');
  eq((await bilan(p)).partages.length, 0, 'share jamais appelé si canShare est faux');
  await p.evaluate(() => { window.__canShare = true; window.__mode = 'DataError'; });
  [dl, r] = await Promise.all([p.waitForEvent('download'), sauver(p, 'c2.csv')]);
  eq(r, 'résolu'); eq(dl.suggestedFilename(), 'c2.csv');
  eq((await bilan(p)).evts, [{ filename: 'c1.csv', moyen: 'telechargement' }, { filename: 'c2.csv', moyen: 'telechargement' }]);
});
test('partage-ordi', 'PT9', 'appareil sans tactile : téléchargement, share jamais appelé, même avec une doublure qui accepte', 'M05 A.3', async (env) => {
  const p = await ouvrirPartage(env);
  const [dl, r] = await Promise.all([p.waitForEvent('download'), sauver(p, 'o.csv')]);
  eq(r, 'résolu'); eq(dl.suggestedFilename(), 'o.csv');
  const b = await bilan(p);
  eq(b.partages.length, 0); eq(b.evts, [{ filename: 'o.csv', moyen: 'telechargement' }]);
});
test('partage', 'PT10', 'adresse d\'objet libérée après un téléchargement de repli ; KBLocal.downloads exposé', 'M05 A.5', async (env) => {
  const p = await ouvrirPartage(env);
  const r = await p.evaluate(async () => {
    window.__canShare = false; KBLocal.configure({ revokeDelay: 50 });
    const cree = [], libere = [];
    const oc = URL.createObjectURL, orv = URL.revokeObjectURL;
    URL.createObjectURL = function (b) { const u = oc.call(URL, b); cree.push(u); return u; };
    URL.revokeObjectURL = function (u) { libere.push(u); return orv.call(URL, u); };
    await (await KBLocal.use('downloads')).save({ filename: 'l.txt', data: new Blob(['z']) });
    await new Promise(r => setTimeout(r, 300));
    return { cree: cree.length, libere: libere.length, meme: KBLocal.downloads === (await KBLocal.use('downloads')) };
  });
  eq(r, { cree: 1, libere: 1, meme: true });
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
  const ctx = await navigateur.newContext(g === 'partage' ? { acceptDownloads: true, isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } } : { acceptDownloads: true });
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
