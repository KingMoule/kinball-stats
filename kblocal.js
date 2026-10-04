/* ==========================================================
   kblocal.js — façade de stockage locale « KBLocal »
   ----------------------------------------------------------
   Imite, sur IndexedDB, les trois capacités que l'app obtient de claude.ai
   par window.claude.use(...) : « db », « user » et « downloads ». Seule la
   surface réellement appelée par l'app est fournie :
     db        collection(chemin).onSnapshot / .doc(id), doc(cheminComplet),
               et sur une référence : set, delete, get
     user      id, canEdit, isOwner, profiles (+ getName, setName,
               exportIdentity, importIdentity)
     downloads save({filename, data})

   Script classique, un seul global (KBLocal), aucune dépendance, aucun
   réseau. Syntaxe volontairement prudente (Safari 15) : pas de champs de
   classe, pas de structuredClone, pas de .at(), pas de Object.hasOwn.

   Principes :
   - Intégrité avant performance : aucune opération destructive (jamais de
     suppression de base ni de vidage de magasin), mise à niveau du schéma
     additive seulement.
   - Un document = un enregistrement {path, parent, data} dans le magasin
     « docs » (clé = chemin complet, index « parent » = collection
     parente). Les chemins sont acceptés tels quels.
   - Miroir en mémoire par collection ABONNÉE : lu une seule fois à
     l'abonnement, puis tenu à jour par les écritures validées (jamais de
     relecture complète de la collection à chaque écriture).
   - Les objets rendus (instantanés, get) sont profondément figés, comme
     sous claude.ai ; l'écriture copie en profondeur au moment de l'appel.
   ========================================================== */
(function (global) {
  'use strict';

  var SCHEMA_VERSION = 1;
  var STORE_DOCS = 'docs';
  var STORE_META = 'meta';
  var LS_INSTALL_ID = 'kinball_install_id';
  var ID_RE = /^u_[0-9A-Za-z-]{8,64}$/;

  var config = { dbName: 'kinball-stats', revokeDelay: 30000 };
  var used = false;

  /* ---------- Copie profonde figée / gel profond ---------- */
  function setOwn(o, k, v) {
    if (k === '__proto__') Object.defineProperty(o, k, { value: v, enumerable: true, writable: true, configurable: true });
    else o[k] = v;
  }
  /* Copie d'un objet « pur » (objets simples, tableaux, primitives, Date) et
     la fige d'un seul passage. Refuse fonctions, symboles et instances de
     classes : IndexedDB ne saurait pas les ranger fidèlement. */
  function copyFreeze(v) {
    var t = typeof v;
    if (v === null || (t !== 'object' && t !== 'function')) {
      if (t === 'symbol') throw new TypeError('Valeur non stockable (symbole)');
      return v;
    }
    if (t === 'function') throw new TypeError('Valeur non stockable (fonction)');
    var i, n;
    if (Array.isArray(v)) {
      n = v.length;
      var a = new Array(n);
      for (i = 0; i < n; i++) a[i] = copyFreeze(v[i]);
      return Object.freeze(a);
    }
    if (v instanceof Date) return new Date(v.getTime());
    var p = Object.getPrototypeOf(v);
    if (p !== Object.prototype && p !== null) throw new TypeError('Valeur non stockable (objet non simple)');
    var keys = Object.keys(v), o = {};
    for (i = 0; i < keys.length; i++) setOwn(o, keys[i], copyFreeze(v[keys[i]]));
    return Object.freeze(o);
  }
  function deepFreeze(v) {
    if (v && typeof v === 'object' && !Object.isFrozen(v)) {
      var keys = Object.keys(v);
      for (var i = 0; i < keys.length; i++) deepFreeze(v[keys[i]]);
      Object.freeze(v);
    }
    return v;
  }

  /* ---------- Chemins ---------- */
  function checkSegments(path, minSegments) {
    if (typeof path !== 'string') throw new TypeError('Chemin invalide');
    var parts = path.split('/');
    if (parts.length < minSegments) throw new TypeError('Chemin invalide : ' + path);
    for (var i = 0; i < parts.length; i++) if (!parts[i]) throw new TypeError('Chemin invalide : ' + path);
    return parts;
  }
  function splitDoc(path) {
    checkSegments(path, 2);
    var i = path.lastIndexOf('/');
    return { parent: path.slice(0, i), id: path.slice(i + 1) };
  }

  /* ---------- Ouverture de la base ---------- */
  var dbOpenPromise = null;
  function openDb() {
    if (dbOpenPromise) return dbOpenPromise;
    used = true;
    var p = new Promise(function (resolve, reject) {
      var idb = null;
      try { idb = global.indexedDB; } catch (e) { idb = null; }
      if (!idb) { reject(new Error('IndexedDB indisponible')); return; }
      var req;
      try { req = idb.open(config.dbName, SCHEMA_VERSION); }
      catch (e) { reject(e); return; }
      /* Mise à niveau ADDITIVE seulement : on crée ce qui manque, on ne
         touche jamais à ce qui existe. */
      req.onupgradeneeded = function () {
        var db = req.result, tx = req.transaction, s;
        if (!db.objectStoreNames.contains(STORE_DOCS)) {
          s = db.createObjectStore(STORE_DOCS, { keyPath: 'path' });
        } else { s = tx.objectStore(STORE_DOCS); }
        if (!s.indexNames.contains('parent')) s.createIndex('parent', 'parent', { unique: false });
        if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
      };
      req.onsuccess = function () {
        var db = req.result;
        function oublier() { if (dbOpenPromise === p) dbOpenPromise = null; }
        db.onversionchange = function () { try { db.close(); } catch (e) {} oublier(); };
        db.onclose = oublier;
        resolve(db);
      };
      req.onerror = function () { reject(req.error || new Error('Ouverture d’IndexedDB refusée')); };
      req.onblocked = function () { /* une autre connexion retient la mise à niveau : on attend */ };
    });
    dbOpenPromise = p;
    p.catch(function () { if (dbOpenPromise === p) dbOpenPromise = null; });
    return p;
  }

  /* ---------- Miroirs par collection abonnée ---------- */
  var mirrors = Object.create(null);

  function makeDoc(id, data) {
    return Object.freeze({ id: id, exists: true, data: function () { return data; } });
  }
  function absentDoc(id) {
    return Object.freeze({ id: id, exists: false, data: function () { return undefined; } });
  }
  /* Recherche dichotomique dans le tableau trié par identifiant. */
  function locate(arr, id) {
    var lo = 0, hi = arr.length;
    while (lo < hi) {
      var mid = (lo + hi) >> 1;
      if (arr[mid].id < id) lo = mid + 1; else hi = mid;
    }
    return { index: lo, found: lo < arr.length && arr[lo].id === id };
  }
  function makeSnapshot(m) {
    var docs = Object.freeze(m.arr.slice());
    return Object.freeze({ docs: docs, size: docs.length, empty: docs.length === 0 });
  }
  function callSafe(fn, arg) {
    try { fn(arg); } catch (e) { console.error('Rappel d’abonnement en erreur', e); }
  }
  function emit(m) {
    var snap = null, ls = m.listeners.slice();
    for (var i = 0; i < ls.length; i++) {
      var l = ls[i];
      if (l.active && l.delivered) {
        if (!snap) snap = makeSnapshot(m);
        callSafe(l.next, snap);
      }
    }
  }
  function killMirror(m) {
    m.dead = true;
    if (mirrors[m.path] === m) delete mirrors[m.path];
  }
  /* La PREMIÈRE émission d'un abonnement arrive toujours dans une tâche
     ultérieure (setTimeout) : jamais pendant l'appel, jamais en micro-tâche. */
  function scheduleFirst(m, l) {
    setTimeout(function () {
      if (!l.active || m.dead) return;
      l.delivered = true;
      callSafe(l.next, makeSnapshot(m));
    }, 0);
  }
  function loadFailed(m, err) {
    var ls = m.listeners.slice();
    killMirror(m);
    setTimeout(function () {
      for (var i = 0; i < ls.length; i++) {
        if (ls[i].active && typeof ls[i].error === 'function') callSafe(ls[i].error, err);
      }
    }, 0);
  }
  function startLoad(m) {
    m.loading = true;
    openDb().then(function (db) {
      if (m.dead) return;
      var tx = db.transaction([STORE_DOCS], 'readonly');
      var req = tx.objectStore(STORE_DOCS).index('parent').getAll(IDBKeyRange.only(m.path));
      var fini = false;
      tx.oncomplete = function () {
        if (fini || m.dead) return;
        fini = true;
        var recs = req.result || [];
        recs.sort(function (a, b) { return a.path < b.path ? -1 : (a.path > b.path ? 1 : 0); });
        for (var i = 0; i < recs.length; i++) {
          var id = recs[i].path.slice(recs[i].parent.length + 1);
          m.arr.push(makeDoc(id, deepFreeze(recs[i].data)));
        }
        m.loaded = true; m.loading = false;
        var ls = m.listeners.slice();
        for (var j = 0; j < ls.length; j++) if (ls[j].active && !ls[j].delivered) scheduleFirst(m, ls[j]);
      };
      tx.onabort = function () { if (fini) return; fini = true; loadFailed(m, tx.error || new Error('Lecture avortée')); };
    }).catch(function (e) { loadFailed(m, e); });
  }
  function subscribe(path, next, error) {
    if (typeof next !== 'function') throw new TypeError('onSnapshot : rappel attendu');
    var m = mirrors[path];
    if (!m) m = mirrors[path] = { path: path, arr: [], loaded: false, loading: false, dead: false, listeners: [] };
    var l = { next: next, error: error, active: true, delivered: false };
    m.listeners.push(l);
    if (m.loaded) scheduleFirst(m, l);
    else if (!m.loading) startLoad(m);
    return function () {
      if (!l.active) return;
      l.active = false;
      var i = m.listeners.indexOf(l);
      if (i >= 0) m.listeners.splice(i, 1);
      if (!m.listeners.length) killMirror(m);
    };
  }
  /* Une écriture VALIDÉE (transaction terminée) met le miroir à jour, puis
     émet. Si le miroir n'est pas encore chargé, l'écriture est forcément
     antérieure à sa lecture (les transactions se suivent dans l'ordre de
     création) : la première émission la contient déjà. */
  function applyWrite(parent, id, doc) {
    var m = mirrors[parent];
    if (!m || !m.loaded || m.dead) return;
    var pos = locate(m.arr, id);
    if (doc) {
      if (pos.found) m.arr[pos.index] = doc; else m.arr.splice(pos.index, 0, doc);
    } else if (pos.found) {
      m.arr.splice(pos.index, 1);
    }
    emit(m);
  }

  /* ---------- Écriture / lecture de documents ---------- */
  function writeDoc(path, parts, frozenData, isDelete) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = null, done = false;
        function fail(e) { if (done) return; done = true; reject(e || new Error('Transaction avortée')); }
        try {
          tx = db.transaction([STORE_DOCS], 'readwrite');
          tx.oncomplete = function () {
            if (done) return;
            done = true;
            try { applyWrite(parts.parent, parts.id, isDelete ? null : makeDoc(parts.id, frozenData)); }
            catch (e) { console.error('Mise à jour du miroir en échec', e); }
            resolve();
          };
          tx.onabort = function () { fail(tx.error); };
          var st = tx.objectStore(STORE_DOCS);
          if (isDelete) st.delete(path);
          else st.put({ path: path, parent: parts.parent, data: frozenData });
        } catch (e) {
          try { if (tx) tx.abort(); } catch (e2) {}
          fail(e);
        }
      });
    });
  }
  function readDoc(path, parts) {
    var m = mirrors[parts.parent];
    if (m && m.loaded && !m.dead) {
      var pos = locate(m.arr, parts.id);
      return Promise.resolve(pos.found ? m.arr[pos.index] : absentDoc(parts.id));
    }
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction([STORE_DOCS], 'readonly');
        var req = tx.objectStore(STORE_DOCS).get(path);
        tx.oncomplete = function () {
          resolve(req.result ? makeDoc(parts.id, deepFreeze(req.result.data)) : absentDoc(parts.id));
        };
        tx.onabort = function () { reject(tx.error || new Error('Lecture avortée')); };
      });
    });
  }
  function makeRef(path) {
    var parts = splitDoc(path);
    return {
      id: parts.id,
      path: path,
      set: function (obj) {
        if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
          return Promise.reject(new TypeError('set : un objet est attendu'));
        }
        var copie;
        try { copie = copyFreeze(obj); }   // copie AU MOMENT de l'appel
        catch (e) { return Promise.reject(e instanceof RangeError ? new TypeError('Objet trop profond ou circulaire') : e); }
        return writeDoc(path, parts, copie, false);
      },
      delete: function () { return writeDoc(path, parts, null, true); },
      get: function () { return readDoc(path, parts); }
    };
  }
  function makeCollection(path) {
    checkSegments(path, 1);
    return {
      path: path,
      onSnapshot: function (next, error) { return subscribe(path, next, error); },
      doc: function (id) {
        if (typeof id !== 'string' || !id || id.indexOf('/') >= 0) throw new TypeError('Identifiant de document invalide');
        return makeRef(path + '/' + id);
      }
    };
  }
  var dbApi = {
    collection: function (path) { return makeCollection(path); },
    doc: function (path) { return makeRef(path); }
  };

  /* ---------- Magasin « meta » ---------- */
  function metaTx(mode, fn) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = null, out;
        try {
          tx = db.transaction([STORE_META], mode);
          tx.oncomplete = function () { resolve(out && out.value); };
          tx.onabort = function () { reject(tx.error || new Error('Transaction avortée')); };
          out = fn(tx.objectStore(STORE_META), tx);
        } catch (e) {
          try { if (tx) tx.abort(); } catch (e2) {}
          reject(e);
        }
      });
    });
  }
  var meta = {
    get: function (key) {
      if (typeof key !== 'string') return Promise.reject(new TypeError('meta.get : clé texte attendue'));
      var req;
      return metaTx('readonly', function (st) {
        req = st.get(key);
        return { get value() { return req.result; } };
      });
    },
    set: function (key, value) {
      if (typeof key !== 'string') return Promise.reject(new TypeError('meta.set : clé texte attendue'));
      if (value === undefined) return Promise.reject(new TypeError('meta.set : valeur indéfinie'));
      return metaTx('readwrite', function (st) { st.put(value, key); return null; });
    }
  };

  /* ---------- Identité locale ---------- */
  var identity = null;               // {id, name}
  var idPromise = null;              // promesse déjà résolue de l'identifiant
  var initPromise = null;

  function lsRead() { try { return global.localStorage.getItem(LS_INSTALL_ID); } catch (e) { return null; } }
  function lsWrite(id) { try { if (global.localStorage.getItem(LS_INSTALL_ID) !== id) global.localStorage.setItem(LS_INSTALL_ID, id); } catch (e) {} }
  function isValidId(v) { return typeof v === 'string' && ID_RE.test(v); }
  function newId() {
    var c = global.crypto;
    if (c && typeof c.randomUUID === 'function') return 'u_' + c.randomUUID();
    if (c && typeof c.getRandomValues === 'function') {
      var b = new Uint8Array(16);
      c.getRandomValues(b);
      b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
      var h = [];
      for (var i = 0; i < 16; i++) h.push((b[i] < 16 ? '0' : '') + b[i].toString(16));
      var s = h.join('');
      return 'u_' + s.slice(0, 8) + '-' + s.slice(8, 12) + '-' + s.slice(12, 16) + '-' + s.slice(16, 20) + '-' + s.slice(20);
    }
    throw new Error('Aucune source aléatoire disponible');
  }
  function setIdentity(id, name) {
    identity = { id: id, name: name };
    idPromise = Promise.resolve(id);
  }
  /* Lecture et réparation dans UNE transaction en écriture : deux onglets
     qui démarrent ensemble sur une base vide ne peuvent pas créer deux
     identifiants (les transactions se suivent). IndexedDB gagne si les deux
     dépôts diffèrent. */
  function readIdentity() {
    var lsId = lsRead();
    var res = {};
    return metaTx('readwrite', function (st) {
      var rId = st.get('installId'), rName = st.get('displayName');
      rId.onsuccess = function () {
        var cur = rId.result;
        if (isValidId(cur)) res.id = cur;
        else {
          res.id = isValidId(lsId) ? lsId : newId();
          st.put(res.id, 'installId');
        }
      };
      rName.onsuccess = function () { res.name = typeof rName.result === 'string' ? rName.result : ''; };
      return { get value() { return res; } };
    }).then(function (r) {
      setIdentity(r.id, r.name || '');
      lsWrite(r.id);
    });
  }
  function init() {
    if (initPromise) return initPromise;
    var p = openDb().then(readIdentity);
    initPromise = p;
    p.catch(function () { if (initPromise === p) initPromise = null; });
    return p;
  }
  var userApi = {
    id: function () { return idPromise; },
    canEdit: function () { return Promise.resolve(true); },
    isOwner: function () { return Promise.resolve(true); },
    profiles: function (ids) {
      var list = Array.isArray(ids) ? ids : (ids == null ? [] : [ids]);
      var out = {};
      for (var i = 0; i < list.length; i++) {
        var k = String(list[i]);
        out[k] = { name: (identity && k === identity.id) ? identity.name : '' };
      }
      return Promise.resolve(out);
    },
    getName: function () { return identity.name; },
    setName: function (nom) {
      if (typeof nom !== 'string') return Promise.reject(new TypeError('setName : texte attendu'));
      var n = nom.trim();
      return meta.set('displayName', n).then(function () { identity.name = n; });
    },
    exportIdentity: function () { return { id: identity.id, name: identity.name }; },
    importIdentity: function (obj) {
      if (!obj || typeof obj !== 'object' || !isValidId(obj.id) || typeof obj.name !== 'string' || obj.name.length > 200) {
        return Promise.reject(new TypeError('importIdentity : identité mal formée'));
      }
      var id = obj.id, name = obj.name.trim();
      return metaTx('readwrite', function (st) {
        st.put(id, 'installId'); st.put(name, 'displayName'); return null;
      }).then(function () {
        setIdentity(id, name);
        lsWrite(id);
        return { id: id, name: name };
      });
    }
  };

  /* ---------- Téléchargements ---------- */
  var downloadsApi = {
    save: function (opts) {
      return new Promise(function (resolve, reject) {
        var url = null;
        try {
          if (!opts || typeof opts.filename !== 'string' || !opts.filename) throw new TypeError('save : filename attendu');
          if (opts.data === undefined || opts.data === null) throw new TypeError('save : data attendu');
          var blob = (typeof Blob !== 'undefined' && opts.data instanceof Blob) ? opts.data : new Blob([opts.data]);
          url = global.URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url; a.download = opts.filename; a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          a.remove();
          var u = url;
          setTimeout(function () { try { global.URL.revokeObjectURL(u); } catch (e) {} }, config.revokeDelay);
          resolve();
        } catch (e) {
          if (url) { try { global.URL.revokeObjectURL(url); } catch (e2) {} }
          /* Jamais de code « declined » : avec un lien de téléchargement
             classique, l'annulation par la personne n'est jamais certaine. */
          reject(e);
        }
      });
    }
  };

  /* ---------- Persistance du stockage ---------- */
  function num(v) { return (typeof v === 'number' && isFinite(v)) ? v : null; }
  var storage = {
    status: function () {
      var out = { persisted: null, usage: null, quota: null };
      var sm = null;
      try { sm = global.navigator && global.navigator.storage; } catch (e) { sm = null; }
      if (!sm) return Promise.resolve(out);
      var p1 = new Promise(function (r) {
        try { Promise.resolve(sm.persisted()).then(function (v) { if (typeof v === 'boolean') out.persisted = v; r(); }, function () { r(); }); }
        catch (e) { r(); }
      });
      var p2 = new Promise(function (r) {
        try {
          Promise.resolve(sm.estimate()).then(function (v) {
            if (v) { out.usage = num(v.usage); out.quota = num(v.quota); }
            r();
          }, function () { r(); });
        } catch (e) { r(); }
      });
      return Promise.all([p1, p2]).then(function () { return out; });
    },
    requestPersist: function () {
      return new Promise(function (r) {
        try {
          var sm = global.navigator && global.navigator.storage;
          if (!sm || typeof sm.persist !== 'function') { r(false); return; }
          Promise.resolve(sm.persist()).then(function (v) { r(v === true); }, function () { r(false); });
        } catch (e) { r(false); }
      });
    }
  };

  /* ---------- Point d'entrée ---------- */
  global.KBLocal = {
    use: function (name) {
      if (name === 'db') return init().then(function () { return dbApi; });
      if (name === 'user') return init().then(function () { return userApi; });
      if (name === 'downloads') return Promise.resolve(downloadsApi);
      return Promise.reject(new Error('Capacité inconnue : ' + String(name)));
    },
    configure: function (opts) {
      if (!opts || typeof opts !== 'object') throw new TypeError('configure : objet attendu');
      if (opts.dbName !== undefined) {
        if (used) throw new Error('configure({dbName}) doit précéder le premier usage');
        if (typeof opts.dbName !== 'string' || !opts.dbName) throw new TypeError('dbName invalide');
        config.dbName = opts.dbName;
      }
      if (opts.revokeDelay !== undefined) {
        if (typeof opts.revokeDelay !== 'number' || !(opts.revokeDelay >= 0)) throw new TypeError('revokeDelay invalide');
        config.revokeDelay = opts.revokeDelay;
      }
    },
    meta: meta,
    storage: storage
  };
})(typeof self !== 'undefined' ? self : this);
