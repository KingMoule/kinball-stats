/* Petit serveur http local pour les scénarios qui ont besoin d'une vraie origine
   (http://127.0.0.1:<port>) : Worker du % de victoire (M03), service worker (M04).
   serveur(racine = dépôt, { cache }) : sert `racine` ; `cache` = en-tête Cache-Control
   (défaut 'public, max-age=600', comme GitHub Pages). Chaque chemin demandé est
   consigné dans srv.requetes (tableau de chaînes, ex. '/sw.js'). */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { DEPOT } from './lib.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };

export function serveur(racine = DEPOT, { cache = 'public, max-age=600' } = {}) {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    srv.requetes.push(u);
    const f = path.join(racine, u === '/' ? 'index.html' : u);
    if (!f.startsWith(racine) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': cache });
    fs.createReadStream(f).pipe(res);
  });
  srv.requetes = [];
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}
