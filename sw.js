/* sw.js — service worker de Kin-Ball Stats (portée : la racine du site).
   Rôle : le site se recharge et se joue entièrement hors-ligne. Une nouvelle version
   s'installe en silence mais ne s'active JAMAIS toute seule : seule la page, sur accord
   de la personne et depuis l'accueil, envoie {type:'ACTIVER'}.
   VERSION et EMPREINTE sont écrites par outils/check-release.mjs --ecrire. */
const VERSION = '2026-10-05.1';
const EMPREINTE = 'f099f3df15d15bb36915a73eaaf1f2c32c11d2a35bb1bce47d29d9e1747f44a0';
const NOM_CACHE = 'kinball-' + VERSION;

/* Liste de précache EXPLICITE (tableau lisible par JSON.parse ; outils/check-release.mjs la lit). */
/* PRECACHE:DEBUT */
const PRECACHE = [
  "./",
  "index.html",
  "kblocal.js",
  "kbsite.js",
  "kbcollect.js",
  "config.js",
  "confidentialite.html",
  "manifest.webmanifest",
  "fonts/barlow-condensed-latin-600-normal.woff2",
  "fonts/barlow-condensed-latin-700-normal.woff2",
  "fonts/barlow-condensed-latin-800-normal.woff2",
  "fonts/inter-latin-400-normal.woff2",
  "fonts/inter-latin-500-normal.woff2",
  "fonts/inter-latin-600-normal.woff2",
  "fonts/inter-latin-700-normal.woff2",
  "vendor/xlsx.full.min.js",
  "icons/apple-touch-icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512-maskable.png",
  "icons/icon-512.png"
];
/* PRECACHE:FIN */

/* Installation : tout ou rien dans SON cache ; un échec = installation ratée, l'ancienne
   version reste en service. Pas d'activation immédiate ici. */
self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(NOM_CACHE).then(function (cache) {
    return Promise.all(PRECACHE.map(function (url) {
      return fetch(new Request(url, { cache: 'reload' })).then(function (rep) {
        if (!rep.ok) throw new Error('précache : ' + url + ' → ' + rep.status);
        return cache.put(url, rep);
      });
    }));
  }));
});

/* Activation de la nouvelle version : seulement sur ordre de la page. */
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'ACTIVER') self.skipWaiting();
});

/* Activation : on supprime les anciens caches « kinball-… », rien d'autre. */
self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (noms) {
    return Promise.all(noms.filter(function (n) { return n.indexOf('kinball-') === 0 && n !== NOM_CACHE; })
      .map(function (n) { return caches.delete(n); }));
  }));
});

/* Requêtes : GET de même origine seulement, dans SON cache seulement (une page de la
   version 1 ne reçoit jamais un fichier de la version 2). Hors précache : réseau, sans mise en cache. */
self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.open(NOM_CACHE).then(function (cache) {
    const racine = new URL('./', self.registration.scope);
    const cible = (req.mode === 'navigate' && url.pathname === racine.pathname) ? new Request(new URL('index.html', self.registration.scope)) : req;
    return cache.match(cible, { ignoreSearch: true }).then(function (rep) {
      return rep || fetch(req);
    });
  }));
});
