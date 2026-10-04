/* M08 — Collecte facultative côté app : consentement, boîte d'envoi, page de confidentialité.
   Contre le FAUX serveur du dépôt (collecte/faux-serveur.mjs, mêmes .gs que le vrai), jamais contre un
   vrai service. Le site est servi en http://127.0.0.1:<port>/ par un petit serveur du test :
   config.js y est remplaçable à la volée (sans toucher au dépôt) et sw.js y est absent (pas de service
   worker : config.js vient toujours du serveur). La panne, la réponse illisible et le refus se jouent par
   page.route sur l'adresse de collecte. Le critère « hors-ligne » (service worker) passe par une COPIE du
   site servie par tests/serveur.mjs.
   Noms de joueurs « sentinelles » (ZZ-Élodie-…) : aucun ne doit exister dans ce que le serveur reçoit. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { launch, assert, eq, DEPOT, SORTIE } from '../lib.mjs';
import { demarrer } from '../../collecte/faux-serveur.mjs';
import { serveur } from '../serveur.mjs';

const require = createRequire(import.meta.url);
const Logique = require(path.join(DEPOT, 'collecte', 'Logique.gs'));   // contrôle d'enveloppe du vrai serveur (réutilisé tel quel)

export const gabarits = ['tablette', 'telephone'];

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const attendre = (ms) => new Promise(r => setTimeout(r, ms));
const enregistre = (p) => p.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok', null, { timeout: 8000, polling: 20 });
const attendreBase = (p) => p.waitForFunction(() => typeof DB !== 'undefined' && !!DB && typeof AUTHOR_ID !== 'undefined' && !!AUTHOR_ID && typeof KBSite !== 'undefined', null, { timeout: 8000, polling: 20 });
const sha = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

/* Site servi depuis le dépôt ; config.js remplacé par cfg.valeur (objet) tant qu'il n'est pas null ; pas de sw.js. */
function servirSite(cfg) {
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    srv.requetes.push(u);
    if (u === '/sw.js') { res.writeHead(404); res.end(); return; }
    if (u === '/config.js' && cfg.valeur) {
      res.writeHead(200, { 'content-type': TYPES['.js'], 'cache-control': 'no-store' });
      res.end('window.KB_CONFIG = ' + JSON.stringify(cfg.valeur) + ';');
      return;
    }
    const f = path.join(DEPOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(DEPOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  srv.requetes = [];
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r(srv)));
}
const fermer = (srv) => new Promise(r => { srv.closeAllConnections?.(); srv.close(() => r()); });
const origine = (srv) => 'http://127.0.0.1:' + srv.address().port;

async function lancerSur(gabarit, srv, chemin = '/') {
  const app = await launch(gabarit, { url: origine(srv) + chemin });
  await attendreBase(app.page);
  return app;
}
async function recharger(p) {
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
  await attendreBase(p);
}
/* Espion : toutes les requêtes hors de l'origine du site, et les appels à crypto.subtle.digest. */
function espionner(app, srv) {
  const sortantes = [];
  app.page.on('request', (r) => {
    const u = r.url();
    if (/^(data|blob|about):/.test(u)) return;
    if (!u.startsWith(origine(srv) + '/') ) sortantes.push({ methode: r.method(), url: u, type: r.headers()['content-type'] || '', cookie: r.headers()['cookie'] || '' });
  });
  return sortantes;
}
const compteurDigest = (p) => p.addInitScript(() => {
  window.__digests = 0;
  const sub = window.crypto && window.crypto.subtle;
  if (!sub) return;
  const o = sub.digest.bind(sub);
  sub.digest = (...a) => { window.__digests++; return o(...a); };
});
/* Base locale (matchs, corbeille, équipes) triée par identifiant : comparable d'une session à l'autre. */
const baseLocale = (p) => p.evaluate(() => { const t = (a) => a.slice().sort((x, y) => (x.id < y.id ? -1 : 1)); return JSON.stringify([t(MATCHES_DB), t(DELETED_MATCHES), t(TEAMS_DB)]); });
const etat = (p) => p.evaluate(() => (window.KBSite && KBSite.collecte) ? KBSite.collecte.etat() : null);
const ligneEtat = (p) => p.evaluate(() => { const e = document.getElementById('kbCollecteEtat'); return e ? e.textContent : null; });
const attendreEtat = (p, re, ms = 10000) => p.waitForFunction((r) => new RegExp(r).test((document.getElementById('kbCollecteEtat') || {}).textContent || ''), re.source, { timeout: ms, polling: 40 });
/* Collecte prête, première lecture faite, plus de cycle en cours. */
async function repos(p) {
  await p.waitForFunction(() => window.KBSite && KBSite.collecte, null, { timeout: 8000, polling: 30 });
  await p.evaluate(() => KBSite.collecte.pret);
  await p.waitForFunction(() => { const e = KBSite.collecte.etat(); return e.accord ? (e.lu && !e.enCours) : true; }, null, { timeout: 10000, polling: 30 });
  await attendre(350);
  await p.waitForFunction(() => !KBSite.collecte.etat().enCours, null, { timeout: 10000, polling: 30 });
}
const versions = (s) => s.recus().versions.filter(r => r[1] === 'version');
const suppressions = (s) => s.recus().versions.filter(r => r[1] === 'suppression');
const retraits = (s) => s.recus().retraits.filter(r => typeof r[1] === 'string' && r[1].indexOf('u_') === 0);
async function allerAccueil(p) { await p.evaluate(() => { closeSheet(); navHome(); }); }
const allerRetour = async (p) => { await p.evaluate(() => navTo('backup')); await attendre(80); await p.evaluate(() => navHome()); };

/* Un match terminé par l'interface, avec noms de joueurs sentinelles, un lancer attribué et un changement. */
async function matchTermine(app, nom, k) {
  const p = app.page;
  await app.startMatch({ format: '9_11', name: nom, withRosters: true });
  await p.evaluate((k) => {
    TEAMS.forEach(t => { S.rosters[t] = [1, 2, 3, 4, 5].map(i => ({ id: t + '_p' + i, name: 'ZZ-Élodie-' + k + '-' + t + i })); });
  }, k);
  await app.initialPossession('Bleu');
  await app.lancer({ from: [.2, .3], to: [.7, .6], target: 'Gris', caught: false, player: 'Bleu_p1' });
  await p.evaluate(() => { openLineupSheet('Bleu'); pickSubOut('Bleu_p2'); pickSubIn('Bleu_p5'); closeLineupSheet(); });
  await app.settle();
  await p.evaluate(() => finishMatchNow());
  await enregistre(p);
  const id = await p.evaluate(() => S.id);
  await allerAccueil(p);
  return id;
}
/* Un match laissé EN COURS (quitté sans le terminer). */
async function matchEnCours(app, nom, k) {
  const p = app.page;
  await app.startMatch({ format: '9_11', name: nom, withRosters: true });
  await p.evaluate((k) => { TEAMS.forEach(t => { S.rosters[t] = [1, 2, 3, 4, 5].map(i => ({ id: t + '_p' + i, name: 'ZZ-Élodie-' + k + '-' + t + i })); }); }, k);
  await app.initialPossession('Bleu');
  await app.lancer({ from: [.2, .3], to: [.7, .6], target: 'Gris', caught: false, player: 'Bleu_p1' });
  await enregistre(p);
  const id = await p.evaluate(() => S.id);
  await p.evaluate(() => { S = freshState(); navHome(); });
  return id;
}
/* Copie d'un match de la base sous un nouvel identifiant. `retouche(copie)` peut la modifier. */
const cloner = (p, modele, extra, retouche) => p.evaluate(async ([id, ex, code]) => {
  const m = JSON.parse(JSON.stringify(getMatchRecord(id) || DELETED_MATCHES.find(x => x.id === id)));
  const copie = Object.assign(m, { id: uid('match'), createdAt: Date.now(), updatedAt: Date.now() }, ex);
  if (code) (new Function('copie', code))(copie);
  await writeMatchDoc(copie);
  return copie.id;
}, [modele, extra || {}, retouche || null]);

/* Parcours d'un objet : clés *_name(s) non vides (hors team_name) et noms sous rosters. */
function violationsNoms(v, roster = false, chemin = '') {
  const out = [];
  if (Array.isArray(v)) { v.forEach((x, i) => { if (roster && typeof x === 'string' && x !== '') out.push(chemin + '[' + i + ']=' + x); else out.push(...violationsNoms(x, roster, chemin + '[' + i + ']')); }); return out; }
  if (v && typeof v === 'object') {
    for (const k of Object.keys(v)) {
      if (k !== 'team_name' && /_names?$/.test(k) && v[k] !== '' && v[k] != null) out.push(chemin + '.' + k);
      if (roster && k === 'name' && v[k] !== '') out.push(chemin + '.name');
      out.push(...violationsNoms(v[k], roster || k === 'rosters', chemin + '.' + k));
    }
  }
  return out;
}

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] M08`;
  const dossier = path.join(SORTIE, 'captures', 'M08');
  fs.mkdirSync(dossier, { recursive: true });
  const cfg = { valeur: null };
  const site = await servirSite(cfg);
  const faux = await demarrer({});
  const fauxRedir = await demarrer({ redirection: true });
  const contact = 'contact-test@example.invalid';
  const CFG = { collecteUrl: faux.url, contact };
  const jetables = [];
  try {
    /* ============ A : sans configuration (celle du dépôt) ============ */
    {
      const A = await lancerSur(gabarit, site);
      const sortantes = espionner(A, site);
      try {
        await check(`${P}·1 config.js du dépôt (adresse et contact vides) : aucune carte, aucune collecte, 0 requête hors de l'origine sur une session complète`, async () => {
          const src = fs.readFileSync(path.join(DEPOT, 'config.js'), 'utf8');
          assert(/collecteUrl:\s*''/.test(src) && /contact:\s*''/.test(src), 'config.js du dépôt : valeurs vides');
          await A.page.waitForFunction(() => window.KB_CONFIG !== undefined, null, { timeout: 5000 });
          await matchTermine(A, 'a_session', 1);
          await A.page.evaluate(() => navTo('backup'));
          await attendre(400);
          eq(await A.page.evaluate(() => !!document.getElementById('kbCollecte')), false, 'aucune carte');
          eq(await A.page.evaluate(() => typeof KBSite.collecte), 'undefined', 'aucun module de collecte');
          eq(await A.page.evaluate(() => KBSite.collecteConfig), null, 'configuration vide');
          await recharger(A.page);
          await attendre(500);
          assert(!site.requetes.includes('/kbcollect.js'), 'kbcollect.js jamais demandé : ' + site.requetes.join(' '));
          eq(sortantes, [], 'requêtes hors origine');
          assert(!A.errors.some(e => /pageerror/.test(e)), A.errors.join(' | '));
        });
        await check(`${P}·1b configuration incomplète ou invalide : toujours rien (URL seule, contact seul, http hors machine locale, claude.ai)`, async () => {
          for (const v of [{ collecteUrl: faux.url, contact: '' }, { collecteUrl: '', contact }, { collecteUrl: 'http://exemple.invalid/exec', contact }, { collecteUrl: '   ', contact: '  ' }, { collecteUrl: 5, contact: 7 }]) {
            cfg.valeur = v;
            await recharger(A.page);
            await attendre(300);
            eq(await A.page.evaluate(() => !!document.getElementById('kbCollecte') || typeof KBSite.collecte !== 'undefined'), false, JSON.stringify(v));
          }
          cfg.valeur = CFG;
          await A.page.addInitScript(() => { window.claude = { use: () => Promise.reject(new Error('absent')) }; });
          await A.page.reload({ waitUntil: 'domcontentloaded' });
          await A.page.waitForFunction(() => typeof KBSite !== 'undefined' && typeof KBSite.version === 'object', null, { timeout: 8000 });
          await attendre(400);
          eq(await A.page.evaluate(() => KBSite.collecteConfig), null, 'sous claude.ai : jamais');
          eq(sortantes, [], 'requêtes hors origine');
        });
        await check(`${P}·13a confidentialite.html : contact vide = « contact non renseigné » avec repli (responsable du site, issue GitHub), page lisible et mise en page`, async () => {
          cfg.valeur = null;
          const p = A.page;
          await p.goto(origine(site) + '/confidentialite.html', { waitUntil: 'load' });
          await p.waitForFunction(() => document.getElementById('contact') && document.getElementById('contact').textContent !== '');
          const txt = await p.evaluate(() => document.body.innerText);
          assert(txt.includes('contact non renseigné') && /issue/.test(txt), 'contact non renseigné et repli');
          assert(/noms des joueurs/.test(txt) && /30 jours/.test(txt) && /désactivé/.test(txt), 'contenu');
          assert(/Inter/.test(await p.evaluate(() => getComputedStyle(document.body).fontFamily)), 'police');
          eq(await p.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(11, 18, 32)', 'fond de l\'app');
          eq(await p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'pas de défilement horizontal');
          await p.screenshot({ path: path.join(dossier, `confidentialite-${gabarit}.png`), fullPage: true });
          eq(sortantes, [], 'requêtes hors origine');
        });
      } finally { await A.close(); }
    }

    /* ============ B : adresse et contact configurés ============ */
    cfg.valeur = CFG;
    const B = await lancerSur(gabarit, site);
    await compteurDigest(B.page);                 // compte les calculs d'empreinte à partir du prochain chargement
    const p = B.page;
    const sortantes = espionner(B, site);
    /* page.route : mode de la collecte (normal | panne | illisible | refus) et décompte des requêtes qui lui parviennent */
    const mode = { v: 'normal', n: 0, bodies: [] };
    await p.route((u) => u.href.indexOf(faux.url) === 0, async (route) => {
      mode.n++;
      mode.bodies.push(route.request().postData());
      if (mode.v === 'panne') return route.fulfill({ status: 500, contentType: 'text/plain', headers: { 'access-control-allow-origin': '*' }, body: 'panne' });
      if (mode.v === 'illisible') return route.fulfill({ status: 200, contentType: 'text/html', headers: { 'access-control-allow-origin': '*' }, body: '<html>pas du json</html>' });
      if (mode.v === 'refus') return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ok: false, statut: 'refuse', raison: 'noms' }) });
      return route.continue();
    });
    let id1, id2, id3, id4, id5, id7, id10, avantLocal = null, idEquipeJoueur = 'ZZ-Equipe-Joueur';
    try {
      await recharger(p);

      await check(`${P}·2 adresse et contact configurés, accord non donné : carte visible, interrupteur éteint, 0 requête après 3 matchs terminés et un rechargement`, async () => {
        await repos(p);
        await p.evaluate(() => navTo('backup'));
        eq(await p.evaluate(() => !!document.getElementById('kbCollecte')), true, 'carte présente');
        eq(await p.evaluate(() => document.getElementById('kbCollecteInterrupteur').getAttribute('aria-checked')), 'false', 'interrupteur éteint');
        assert(/désactivé/.test(await ligneEtat(p)), 'ligne d\'état : ' + await ligneEtat(p));
        assert(await p.evaluate(() => /confidentialite\.html$/.test(document.getElementById('kbCollecteLien').href)), 'lien vers la page de confidentialité');
        await p.evaluate(() => document.getElementById('kbCollecte').scrollIntoView({ block: 'center' }));
        await attendre(150);
        await p.screenshot({ path: path.join(dossier, `carte-eteinte-${gabarit}.png`) });
        await allerAccueil(p);
        id1 = await matchTermine(B, 'm1_' + gabarit, 1);
        id2 = await matchTermine(B, 'm2_' + gabarit, 2);
        /* m3 : copie de m1 avec ce que l'interface ne produit pas toujours (alignement, nom brut dans un effectif, autre clé *_name) */
        id3 = await cloner(p, id1, { matchName: 'm3_' + gabarit }, `
          copie.history.push({type:'alignement', before:{}, details:{team:'Bleu', lineup_ids:'Bleu_p1|Bleu_p2', lineup_names:'ZZ-Élodie-9-a|ZZ-Élodie-9-b', defender_player_name:'ZZ-Élodie-9-c'}});
          copie.rosters.Gris.push('ZZ-Élodie-9-brut');`);
        /* ne doivent JAMAIS partir : m4 (corbeille, jamais partagé), m5 (en cours), m7 (autre identité) ; et une équipe enregistrée */
        id4 = await cloner(p, id1, { matchName: 'm4_corbeille_' + gabarit });
        id7 = await cloner(p, id1, { matchName: 'm7_autre_' + gabarit, authorId: 'u_00000000-aaaa-bbbb-cccc-000000000001' });
        await p.waitForFunction((n) => MATCHES_DB.length >= n, 5, { timeout: 8000 });
        await p.evaluate((i) => dbTrashMatch(i), id4);
        await p.waitForFunction((i) => DELETED_MATCHES.some(x => x.id === i), id4);
        id5 = await matchEnCours(B, 'm5_encours_' + gabarit, 5);
        await p.evaluate((n) => dbSetTeam({ id: uid('team'), name: 'Équipe-' + n, players: [{ id: uid('p'), name: n }], createdAt: Date.now(), updatedAt: Date.now() }), idEquipeJoueur);
        await enregistre(p);
        await attendre(300);
        avantLocal = await baseLocale(p);
        assert(avantLocal.includes('ZZ-Élodie-1-Bleu1'), 'les sentinelles sont bien dans la base locale');
        await recharger(p);
        await repos(p);
        await allerRetour(p);
        await attendre(1200);
        eq(faux.posts.length, 0, 'POST reçus par le serveur');
        eq(mode.n, 0, 'requêtes vers l\'adresse de collecte');
        eq(sortantes.length, 0, 'requêtes hors origine : ' + JSON.stringify(sortantes));
        eq((await etat(p)).accord, false, 'accord');
      });

      await check(`${P}·3 accord donné : chaque match terminé de l'appareil arrive une fois (3 versions), relancer l'app trois fois n'ajoute rien`, async () => {
        await p.evaluate(() => navTo('backup'));
        await p.locator('#kbCollecteInterrupteur').click();
        await attendreEtat(p, /3 partagés, 0 en attente/);
        eq(versions(faux).length, 3, 'versions au serveur');
        eq(faux.posts.length, 3, 'POST');
        eq(new Set(versions(faux).map(r => r[3])).size, 3, 'trois matchs différents');
        eq(new Set(versions(faux).map(r => r[3])).has(id1) && new Set(versions(faux).map(r => r[3])).has(id2) && new Set(versions(faux).map(r => r[3])).has(id3), true, 'les trois bons matchs');
        await p.evaluate(() => document.getElementById('kbCollecte').scrollIntoView({ block: 'center' }));
        await attendre(150);
        await p.screenshot({ path: path.join(dossier, `carte-allumee-${gabarit}.png`) });
        for (let i = 0; i < 3; i++) {
          await recharger(p);
          await repos(p);
          await allerRetour(p);
          await attendre(300);
        }
        eq(versions(faux).length, 3, 'toujours 3 versions');
        eq(faux.posts.length, 3, 'aucun POST de plus');
        eq((await etat(p)).compte, { partages: 3, attente: 0, refuses: 0 }, 'compte local');
      });

      await check(`${P}·6 ne partent pas : match en cours, match à la corbeille jamais partagé, match d'une autre identité, équipes`, async () => {
        const ids = versions(faux).map(r => r[3]);
        for (const [nom, id] of [['en cours', id5], ['corbeille', id4], ['autre identité', id7]]) assert(!ids.includes(id), nom + ' est parti');
        const tout = JSON.stringify(faux.recus()) + faux.posts.map(x => x.corps).join('\n');
        assert(!tout.includes(idEquipeJoueur) && !tout.includes('Équipe-' + idEquipeJoueur), 'équipe enregistrée');
        assert(!tout.includes('m5_encours') && !tout.includes('m4_corbeille') && !tout.includes('m7_autre'), 'noms des matchs exclus');
        eq(suppressions(faux).length, 0, 'aucune marque de suppression (le match à la corbeille n\'a jamais été partagé)');
      });

      await check(`${P}·4 rien de nominatif sur le réseau : aucune sentinelle, aucun « name » sous rosters, aucune clé *_name(s) (sauf team_name) ; identifiants présents ; enveloppe valide au sens de Logique.gs ; empreinte notée = empreinte recalculée`, async () => {
        const bruts = faux.posts.map(x => x.corps);
        const tout = JSON.stringify(faux.recus()) + '\n' + bruts.join('\n') + '\n' + mode.bodies.join('\n');
        assert(!/ZZ-/.test(tout), 'sentinelle trouvée');
        assert(!tout.includes('Élodie'), 'prénom sentinelle trouvé');
        const noteLocal = await p.evaluate(() => KBLocal.meta.get('site.collecte.file'));
        const fichiers = faux.recus().fichiers;
        eq(fichiers.length, 3, 'fichiers côté serveur');
        let ids = 0, details = 0;
        for (const corps of bruts) {
          const env = JSON.parse(corps);
          eq(Object.keys(env).sort(), ['appVersion', 'consent', 'installId', 'match', 'schema', 'sentAt'], 'six champs exactement');
          const a = Logique.analyserEnvoi(corps);
          assert(a.ok === true && a.sorte === 'version', 'enveloppe invalide au sens de Logique.gs : ' + JSON.stringify(a.raison));
          assert(typeof env.appVersion === 'string' && env.appVersion.length && env.installId.indexOf('u_') === 0, 'version et identifiant');
          eq(violationsNoms(env.match), [], 'noms dans ' + env.match.id);
          const emp = sha(JSON.stringify(env.match));
          eq(emp, a.empreinte, 'empreinte du serveur');
          eq(noteLocal[env.match.id].empreinte, emp, 'empreinte notée par l\'app pour ' + env.match.id);
          assert(JSON.stringify(env.match).includes('"Bleu_p1"'), 'identifiants de joueurs conservés');
          if (JSON.stringify(env.match.history).includes('player_out_id') && JSON.stringify(env.match.history).includes('attacker_player_id')) details++;
          ids += Object.values(env.match.rosters).reduce((n, r) => n + r.length, 0);
        }
        assert(details >= 2, 'des détails (lancer attribué, changement) sont bien partis : ' + details);
        assert(ids > 10, 'les effectifs (identifiants) sont là');
        for (const f of fichiers) { eq(violationsNoms(JSON.parse(f.contenu)), [], 'noms dans le fichier ' + f.nom); }
        /* l'enveloppe de m3 (alignement, effectif brut) a été épurée */
        const m3 = JSON.parse(bruts.find(c => JSON.parse(c).match.id === id3)).match;
        assert(m3.history.some(e => e.type === 'alignement' && e.details.lineup_ids === 'Bleu_p1|Bleu_p2' && e.details.lineup_names === '' && e.details.defender_player_name === ''), 'alignement épuré');
        assert(m3.rosters.Gris.includes(''), 'nom brut vidé');
        const premier = JSON.parse(bruts[0]);
        fs.writeFileSync(path.join(dossier, `exemple-version-${gabarit}.json`), JSON.stringify(Object.assign({}, premier, { match: Object.assign({}, premier.match, { history: premier.match.history.slice(0, 2) }) }), null, 1));
        /* en-têtes : une seule destination, texte brut, sans cookie */
        assert(sortantes.length > 0 && sortantes.every(r => r.url.indexOf(faux.url) === 0), 'une seule destination : ' + JSON.stringify(sortantes.map(r => r.url)));
        assert(sortantes.filter(r => r.methode === 'POST').every(r => /^text\/plain/.test(r.type) && r.cookie === ''), 'POST text/plain sans cookie');
      });

      await check(`${P}·5 la base locale est inchangée par l'envoi (les noms de joueurs y sont toujours)`, async () => {
        const apres = await baseLocale(p);
        eq(apres === avantLocal, true, 'base locale identique avant / après envoi');
        assert(apres.includes('ZZ-Élodie-1-Bleu1') && apres.includes('ZZ-Élodie-2-Gris3'), 'sentinelles toujours présentes');
      });

      await check(`${P}·idempotence : boîte d'envoi vidée à la main puis rechargement = tout est renvoyé, le serveur répond déjà reçu, toujours 3 lignes`, async () => {
        const avant = faux.posts.length;
        await p.evaluate(() => KBLocal.meta.set('site.collecte.file', {}));
        await recharger(p);
        await repos(p);
        await attendreEtat(p, /3 partagés, 0 en attente/);
        eq(faux.posts.length, avant + 3, 'trois renvois');
        eq(versions(faux).length, 3, 'le serveur garde une ligne par version');
        assert(faux.posts.slice(avant).every(x => x.reponse.statut === 'deja_recu'), 'réponses « déjà reçu »');
      });

      await check(`${P}·7 pendant un match (écran « match ») avec un match terminé en attente : 0 requête et 0 calcul d'empreinte ; il part au retour à l'accueil`, async () => {
        mode.v = 'panne';
        const id6 = await matchTermine(B, 'm6_' + gabarit, 6);       // l'envoi à l'accueil échoue : en attente
        await attendreEtat(p, /3 partagés, 1 en attente/);
        await B.startMatch({ format: '9_11', name: 'm8_encours_' + gabarit, withRosters: true });   // (le serveur est toujours en panne : l'envoi de m6 échoue encore)
        await B.initialPossession('Bleu');
        eq(await p.evaluate(() => document.documentElement.dataset.screen), 'match', 'écran de match');
        await p.waitForFunction(() => !KBSite.collecte.etat().enCours, null, { timeout: 8000, polling: 30 });
        mode.v = 'normal';                                   // serveur revenu, mais on est en match
        const n0 = mode.n, d0 = await p.evaluate(() => window.__digests), s0 = faux.posts.length;
        await B.lancer({ from: [.2, .3], to: [.7, .6], target: 'Gris', caught: false, player: 'Bleu_p1' });
        await enregistre(p);
        await p.evaluate(() => { window.dispatchEvent(new Event('online')); KBSite.collecte.cycle('lancement'); KBSite.collecte.cycle('accueil'); });
        await attendre(1500);
        eq(mode.n, n0, 'requêtes pendant le match');
        eq(await p.evaluate(() => window.__digests), d0, 'calculs d\'empreinte pendant le match');
        eq(faux.posts.length, s0, 'POST pendant le match');
        await p.evaluate(() => { S = freshState(); navHome(); });
        await attendreEtat(p, /4 partagés, 0 en attente/);
        eq(versions(faux).length, 4, 'm6 est arrivé au retour à l\'accueil');
        assert(versions(faux).some(r => r[3] === id6), 'c\'est m6');
      });

      await check(`${P}·8 panne : le match reste « en attente » (aussi après rechargement) ; serveur revenu + événement « online » = partagé ; réponse illisible = en attente`, async () => {
        mode.v = 'panne';
        const id9 = await matchTermine(B, 'm9_' + gabarit, 9);
        await attendreEtat(p, /4 partagés, 1 en attente/);
        const e1 = (await etat(p)).file[id9];
        eq([e1.etat, e1.essais >= 1], ['attente', true], 'entrée en attente, essai noté');
        eq(await p.evaluate(() => dbSyncState), 'ok', 'le badge de synchronisation n\'est pas touché');
        await recharger(p); await repos(p);
        eq((await etat(p)).file[id9].etat, 'attente', 'toujours en attente après rechargement');
        await attendreEtat(p, /4 partagés, 1 en attente/);
        const avant = versions(faux).length;
        mode.v = 'illisible';
        await p.evaluate(() => window.dispatchEvent(new Event('online')));
        await attendre(800); await repos(p);
        eq((await etat(p)).file[id9].etat, 'attente', 'réponse illisible : pas « partagé »');
        eq(versions(faux).length, avant, 'rien de reçu');
        mode.v = 'normal';
        await p.evaluate(() => window.dispatchEvent(new Event('online')));
        await attendreEtat(p, /5 partagés, 0 en attente/);
        eq(versions(faux).length, avant + 1, 'reçu après le retour');
      });

      await check(`${P}·9 refus définitif (noms) : « 1 refusé », plus aucun essai pour cette version`, async () => {
        mode.v = 'refus';
        id10 = await matchTermine(B, 'm10_' + gabarit, 10);
        await attendreEtat(p, /5 partagés, 0 en attente, 1 refusé/);
        const e = (await etat(p)).file[id10];
        eq([e.etat, e.raison], ['refuse', 'noms'], 'état gardé avec sa raison');
        const n = mode.n;
        mode.v = 'normal';
        await p.evaluate(() => { window.dispatchEvent(new Event('online')); KBSite.collecte.cycle('lancement'); });
        await allerRetour(p);
        await recharger(p); await repos(p);
        await attendre(500);
        eq(mode.n, n, 'plus aucune requête');
        await attendreEtat(p, /5 partagés, 0 en attente, 1 refusé/);
      });

      await check(`${P}·10 match partagé puis mis à la corbeille : une seule marque de suppression, minimale`, async () => {
        await p.evaluate((i) => dbTrashMatch(i), id2);
        await p.waitForFunction((i) => DELETED_MATCHES.some(x => x.id === i), id2);
        await allerRetour(p);
        const t0 = Date.now();
        while (suppressions(faux).length < 1 && Date.now() - t0 < 8000) await attendre(100);
        eq(suppressions(faux).length, 1, 'une marque');
        const corps = faux.posts.map(x => JSON.parse(x.corps)).filter(e => e.match && e.match.deleted);
        eq(corps.length, 1, 'un seul POST de suppression');
        eq(Object.keys(corps[0].match).sort(), ['deleted', 'deletedAt', 'id'], 'marque minimale');
        eq(corps[0].match.id, id2, 'bon match');
        await recharger(p); await repos(p); await allerRetour(p); await attendre(500);
        eq(suppressions(faux).length, 1, 'toujours une seule');
        eq(faux.posts.map(x => JSON.parse(x.corps)).filter(e => e.match && e.match.deleted).length, 1, 'un seul POST de suppression après rechargement');
        fs.writeFileSync(path.join(dossier, `exemple-suppression-${gabarit}.json`), JSON.stringify(corps[0], null, 1));
      });

      await check(`${P}·12 sauvegarde exportée d'un appareil qui a donné son accord, importée sur un appareil vide : l'accord n'est PAS repris`, async () => {
        await p.evaluate(() => navTo('backup'));
        const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.locator('[onclick="exportFullBackup()"]').click()]);
        const f = path.join(os.tmpdir(), 'm08_' + process.pid + '_' + Date.now() + '_sauv.json');
        await dl.saveAs(f); jetables.push(f);
        const brut = fs.readFileSync(f, 'utf8');
        assert(!/collecte|accorde/i.test(brut), 'la sauvegarde ne porte aucun état de collecte');
        const C = await lancerSur(gabarit, site);
        const posts0 = faux.posts.length, n0 = mode.n;
        try {
          await repos(C.page);
          eq((await etat(C.page)).accord, false, 'appareil vide : accord éteint');
          await C.page.evaluate(() => navTo('backup'));
          await C.page.setInputFiles('#importFileInput', f);
          await C.page.waitForFunction(() => /Import terminé/.test(document.getElementById('backupStatus').textContent), null, { timeout: 12000, polling: 40 });
          await attendre(800);
          await recharger(C.page); await repos(C.page);
          await C.page.evaluate(() => navTo('backup'));
          eq(await C.page.evaluate(() => document.getElementById('kbCollecteInterrupteur').getAttribute('aria-checked')), 'false', 'interrupteur éteint après import');
          const e = await etat(C.page);
          eq([e.accord, e.id === (await p.evaluate(() => AUTHOR_ID))], [false, true], 'identité reprise mais accord non repris');
          await attendre(800);
          eq(faux.posts.length, posts0, 'aucun envoi de l\'appareil importé');
        } finally { await C.close(); }
        eq(mode.n, n0, 'aucune requête de plus');
      });

      await check(`${P}·11 retrait : interrupteur éteint = 0 requête ensuite et boîte d'envoi vidée ; « Demander l'effacement » = une requête de sorte retrait et un message avec le contact ; accord rendu = repart de zéro`, async () => {
        await p.evaluate(() => navTo('backup'));
        await p.locator('#kbCollecteInterrupteur').click();
        await p.waitForFunction(() => document.getElementById('kbCollecteInterrupteur').getAttribute('aria-checked') === 'false');
        await attendre(300);
        /* le retrait propose aussi l'effacement (des matchs avaient été partagés) ; « seulement arrêter » n'envoie rien */
        await p.waitForFunction(() => !!document.getElementById('kbEffacementConfirme') && document.getElementById('sheet').classList.contains('open'), null, { timeout: 4000 });
        const nRetrait = mode.n;
        await p.locator('#kbEffacementNon').click();
        await attendre(300);
        eq(mode.n, nRetrait, 'seulement arrêter : 0 requête');
        const e = await etat(p);
        eq([e.accord, Object.keys(e.file).length], [false, 0], 'accord retiré, file vide');
        eq(await p.evaluate(() => KBLocal.meta.get('site.collecte.file')), {}, 'file vide aussi dans le rangement');
        const a = await p.evaluate(() => KBLocal.meta.get('site.collecte.accord'));
        eq(a.accorde, false, 'accord rangé éteint');
        const n0 = mode.n;
        await allerAccueil(p);
        const idApres = await matchTermine(B, 'm11_apres_retrait_' + gabarit, 11);
        await recharger(p); await repos(p); await allerRetour(p);
        await attendre(1000);
        eq(mode.n, n0, '0 requête après le retrait');
        eq(retraits(faux).length, 0, 'pas encore de demande d\'effacement');
        /* demande d'effacement */
        await p.evaluate(() => navTo('backup'));
        await p.locator('#kbCollecteEffacer').click();
        await p.waitForFunction(() => !!document.getElementById('kbEffacementConfirme') && document.getElementById('sheet').classList.contains('open'));
        await attendre(300);
        await p.screenshot({ path: path.join(dossier, `confirmation-effacement-${gabarit}.png`) });
        eq(mode.n, n0, 'rien n\'est envoyé avant la confirmation');
        await p.locator('#kbEffacementOui').click();
        await p.waitForFunction((c) => (document.getElementById('kbCollecteMsg').textContent || '').includes(c), contact, { timeout: 8000 });
        eq(mode.n, n0 + 1, 'une seule requête');
        const demande = JSON.parse(mode.bodies[mode.bodies.length - 1]);
        eq([demande.consent, demande.match, demande.schema], [false, null, 1], 'sorte retrait');
        eq(Logique.analyserEnvoi(mode.bodies[mode.bodies.length - 1]).sorte, 'retrait', 'valide au sens de Logique.gs');
        eq(retraits(faux).length, 1, 'une ligne dans « retraits »');
        eq(retraits(faux)[0][1], await p.evaluate(() => AUTHOR_ID), 'pour cet appareil');
        assert(/30 jours/.test(await p.evaluate(() => document.getElementById('kbCollecteMsg').textContent)), 'délai annoncé');
        await p.evaluate(() => document.getElementById('kbCollecte').scrollIntoView({ block: 'center' }));
        await attendre(150);
        await p.screenshot({ path: path.join(dossier, `apres-effacement-${gabarit}.png`) });
        fs.writeFileSync(path.join(dossier, `exemple-retrait-${gabarit}.json`), JSON.stringify(demande, null, 1));
        /* accord rendu : tout est de nouveau « à envoyer », le serveur répond déjà reçu pour l'ancien et reçu pour le nouveau */
        const v0 = versions(faux).length;
        await p.locator('#kbCollecteInterrupteur').click();
        await p.waitForFunction(() => { const c = KBSite.collecte.etat().compte; return c.partages >= 6 && c.attente === 0; }, null, { timeout: 12000, polling: 50 });
        const n = (await etat(p)).compte;
        eq(n, { partages: 6, attente: 0, refuses: 0 }, 'tout est de nouveau proposé, plus de refus (le faux serveur accepte m10)');
        eq(versions(faux).length, v0 + 2, 'au serveur : seuls m10 (jamais reçu) et le match d\'après le retrait s\'ajoutent');
        assert(versions(faux).some(r => r[3] === idApres) && versions(faux).some(r => r[3] === id10), 'les deux sont là');
      });
    } finally { await B.close(); }

    /* ============ C : redirection (comme Apps Script : POST puis 302 lu en GET) ============ */
    await check(`${P}·8b redirection 302 : la réponse est lue après la redirection, le match est « partagé »`, async () => {
      cfg.valeur = { collecteUrl: fauxRedir.url, contact };
      const R = await lancerSur(gabarit, site);
      try {
        const pr = R.page;
        await repos(pr);
        await pr.evaluate(() => navTo('backup'));
        await pr.locator('#kbCollecteInterrupteur').click();
        await attendreEtat(pr, /0 partagé, 0 en attente/);
        await matchTermine(R, 'r1_' + gabarit, 21);
        await attendreEtat(pr, /1 partagé, 0 en attente/);
        eq(fauxRedir.recus().versions.filter(r => r[1] === 'version').length, 1, 'arrivé');
        eq(fauxRedir.posts[0].reponse.statut, 'recu', 'réponse du serveur');
      } finally { await R.close(); }
    });

    /* ============ D : hors-ligne (service worker) : confidentialite.html et config.js ============ */
    await check(`${P}·13b hors-ligne : confidentialite.html s'affiche avec sa mise en page (et non index.html), config.js est servi ; le contact configuré y figure`, async () => {
      const copie = fs.mkdtempSync(path.join(os.tmpdir(), 'm08_site_'));
      jetables.push(copie);
      fs.cpSync(DEPOT, copie, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules|tests|sim|collecte)([\\/]|$)/.test(src.slice(DEPOT.length)) });
      fs.writeFileSync(path.join(copie, 'config.js'), "window.KB_CONFIG = { collecteUrl: 'http://127.0.0.1:9/exec', contact: '" + contact + "' };\n");
      const s2 = await serveur(copie);
      const D = await launch(gabarit, { url: 'http://127.0.0.1:' + s2.address().port + '/' });
      try {
        const pd = D.page;
        await pd.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active));
        await pd.reload({ waitUntil: 'domcontentloaded' });
        await pd.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 });
        await pd.context().setOffline(true);
        await pd.goto('http://127.0.0.1:' + s2.address().port + '/confidentialite.html', { waitUntil: 'load' });
        eq(await pd.title(), 'Confidentialité · Kin-Ball Stats', 'la page de confidentialité, pas l\'app');
        await pd.waitForFunction(() => (document.getElementById('contact') || {}).textContent !== '');
        assert((await pd.evaluate(() => document.getElementById('contact').textContent)) === contact, 'contact de config.js affiché');
        eq(await pd.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(11, 18, 32)', 'mise en page');
        await pd.evaluate(() => document.fonts.ready);
        eq(await pd.evaluate(() => [...document.fonts].some(f => /Inter/.test(f.family) && f.status === 'loaded')), true, 'police Inter chargée hors-ligne');
        const cfgTxt = await pd.evaluate(() => fetch('config.js').then(r => r.text()));
        assert(cfgTxt.includes('KB_CONFIG'), 'config.js servi hors-ligne');
        await pd.screenshot({ path: path.join(dossier, `confidentialite-hors-ligne-${gabarit}.png`), fullPage: true });
        await pd.context().setOffline(false);
      } finally { await D.close(); await fermer(s2); }
    });
  } finally {
    await fermer(site); await faux.arreter(); await fauxRedir.arreter();
    for (const f of jetables) { try { fs.rmSync(f, { recursive: true, force: true }); } catch {} }
  }
}
