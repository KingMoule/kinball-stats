#!/usr/bin/env node
/* faux-serveur.mjs — faux serveur de collecte LOCAL, au même contrat que le script Apps Script.
   Il exécute Logique.gs et Code.gs eux-mêmes (via faux-google.mjs) avec un état en mémoire :
   mêmes décisions, mêmes réponses. Sert aux tests de l'app ; n'est pas servi par le site.

   En ligne de commande :  node collecte/faux-serveur.mjs [--port N] [--panne[=500|refus]] [--lent[=ms]] [--redirection]
   En module :             const s = await demarrer({redirection:true}); s.url ; s.recus() ; s.posts ; await s.arreter()

   --panne=500    répond 500 à tout (défaut)      --panne=refus  coupe la connexion sans répondre
   --lent=3000    attend ce délai (ms) avant de répondre
   --redirection  comme Apps Script : le POST est traité à l'adresse /exec, qui répond 302 vers une
                  seconde adresse (/echo/N) où la réponse se lit en GET.
   Adresses de contrôle : GET /__recus (JSON de ce qui a été reçu). */
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { creerMonde } from './faux-google.mjs';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export async function demarrer(opts = {}) {
  const monde = creerMonde({ maintenant: opts.maintenant });
  monde.installer();
  const posts = [];                    // tout POST arrivé : {corps, reponse}
  const echos = new Map();             // --redirection : réponses à relire en GET
  let compteEcho = 0;
  const panne = opts.panne === true ? '500' : (opts.panne || false);
  const lent = opts.lent === true ? 3000 : (opts.lent || 0);

  const recus = () => ({
    versions: monde.lignes('versions'),
    retraits: monde.lignes('retraits'),
    fichiers: monde.etat.fichiers.map(f => ({ nom: f.nom, contenu: f.contenu }))
  });

  const serveur = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const repondre = () => {
      if (panne === 'refus') { req.socket.destroy(); return; }
      if (panne) { res.writeHead(500, { ...CORS, 'content-type': 'text/plain' }); res.end('panne simulée'); return; }
      if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
      if (req.method === 'GET' && url.pathname === '/__recus') { res.writeHead(200, { ...CORS, 'content-type': 'application/json' }); res.end(JSON.stringify(recus())); return; }
      if (req.method === 'GET' && url.pathname.startsWith('/echo/')) {
        const corps = echos.get(url.pathname);
        if (!corps) { res.writeHead(404, CORS); res.end(); return; }
        res.writeHead(200, { ...CORS, 'content-type': 'application/json; charset=utf-8' }); res.end(corps); return;
      }
      if (req.method === 'GET') { res.writeHead(200, { ...CORS, 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(monde.doGet())); return; }
      if (req.method === 'POST') {
        const morceaux = []; let n = 0, trop = false;
        req.on('data', (c) => { n += c.length; if (n > 3 * 1024 * 1024) { trop = true; return; } morceaux.push(c); });
        req.on('end', () => {
          const corps = trop ? 'x'.repeat(2 * 1024 * 1024 + 1) : Buffer.concat(morceaux).toString('utf8');
          const reponse = monde.envoyer(corps);
          posts.push({ corps, reponse });
          const texte = JSON.stringify(reponse);
          if (opts.redirection) {
            const chemin = '/echo/' + (++compteEcho);
            echos.set(chemin, texte);
            res.writeHead(302, { ...CORS, Location: 'http://127.0.0.1:' + serveur.address().port + chemin });
            res.end(); return;
          }
          res.writeHead(200, { ...CORS, 'content-type': 'application/json; charset=utf-8' });
          res.end(texte);
        });
        return;
      }
      res.writeHead(405, CORS); res.end();
    };
    if (lent) setTimeout(repondre, lent); else repondre();
  });
  await new Promise((r) => serveur.listen(opts.port || 0, '127.0.0.1', r));
  const port = serveur.address().port;
  return {
    url: 'http://127.0.0.1:' + port + '/exec', port, monde, posts, recus,
    arreter: () => new Promise((r) => { serveur.closeAllConnections?.(); serveur.close(() => r()); })
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const a = process.argv.slice(2);
  const val = (nom) => { const x = a.find(t => t === nom || t.startsWith(nom + '=')); return x === undefined ? undefined : (x.includes('=') ? x.split('=')[1] : true); };
  const port = a.includes('--port') ? Number(a[a.indexOf('--port') + 1]) : 0;
  const s = await demarrer({ port, panne: val('--panne'), lent: val('--lent') === true ? true : Number(val('--lent')) || 0, redirection: a.includes('--redirection') });
  console.log('Faux serveur de collecte : ' + s.url);
}
