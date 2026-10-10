/* M04 — Service worker, mise à jour sur accord, version, incitation à installer.
   Critères 1 à 9 et 11 du brief M04 (le critère 10, « git diff HEAD -- index.html
   kblocal.js vide », se vérifie à la main au moment du commit).
   Mécanique du service worker : gabarit tablette seul. Cartes (installation, mise à
   jour) et file:// : les deux gabarits. Pages servies en http://127.0.0.1 par le
   serveur du banc ; la mise à jour joue sur une COPIE du site (jamais le dépôt). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { launch, assert, eq, rng, DEPOT, SORTIE } from '../lib.mjs';
import { Model, pickAction, play } from '../model.mjs';
import { serveur } from '../serveur.mjs';

export const gabarits = ['tablette', 'telephone'];

const CHECK = path.join(DEPOT, 'outils', 'check-release.mjs');
const enregistre = (p) => p.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok', null, { timeout: 8000, polling: 20 });
const attendreBase = (p) => p.waitForFunction(() => typeof DB !== 'undefined' && !!DB && typeof AUTHOR_ID !== 'undefined' && !!AUTHOR_ID, null, { timeout: 8000, polling: 20 });
const attendre = (ms) => new Promise(r => setTimeout(r, ms));

/* Copie du site (sans .git, tests, sim) : on y joue les versions v1 et v2. */
function copierSite() {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'm04_site_'));
  fs.cpSync(DEPOT, dest, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules|tests|sim)([\\/]|$)/.test(src.slice(DEPOT.length)) });
  return dest;
}
/* Fabrique la v2 dans la copie : un fichier touché (index.html, repérable par une balise
   meta) puis check-release --ecrire --racine <copie>. Rend la nouvelle version. */
function fabriquerV2(copie) {
  const f = path.join(copie, 'index.html');
  fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('</head>', '<meta name="kb-test" content="v2"></head>'));
  const r = spawnSync(process.execPath, [CHECK, '--ecrire', '--racine', copie], { encoding: 'utf8' });
  assert(r.status === 0, 'check-release --ecrire sur la copie : ' + r.stdout + r.stderr);
  return fs.readFileSync(path.join(copie, 'kbsite.js'), 'utf8').match(/var VERSION_SITE = '([^']*)'/)[1];
}
const versionPage = (p) => p.evaluate(() => KBSite.version.site);
const marquePage = (p) => p.evaluate(() => { const m = document.querySelector('meta[name="kb-test"]'); return m ? m.content : null; });
const nbRequetes = (srv, chemin) => srv.requetes.filter(r => r === chemin).length;
const noms = (p) => p.evaluate(() => caches.keys());
const swPret = (p) => p.evaluate(() => navigator.serviceWorker.ready.then(r => !!r.active));
/* Rechargement jusqu'à ce que la page soit contrôlée par le service worker. */
async function controlee(p) {
  await swPret(p);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined' && typeof KBSite !== 'undefined');
  await p.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 });
  await attendreBase(p);
}
function precacheDuDepot() {
  const src = fs.readFileSync(path.join(DEPOT, 'sw.js'), 'utf8');
  const m = src.match(/\/\* PRECACHE:DEBUT \*\/([\s\S]*?)\/\* PRECACHE:FIN \*\//)[1];
  return JSON.parse(m.slice(m.indexOf('['), m.lastIndexOf(']') + 1));
}
async function jouer(app, m, n, graine) {
  const r = rng(graine);
  let k = 0;
  while ((await app.ev(() => S.history.length)) < n && k++ < 120) {
    if (m.awaitingDuel) break;
    await play(app, m, pickAction(m, r), { manualDuel: true });
  }
}
const visible = (p, sel) => p.evaluate((s) => { const e = document.querySelector(s); return !!e && !!(e.offsetWidth || e.offsetHeight) && getComputedStyle(e).visibility !== 'hidden'; }, sel);
/* Simule l'iPad / iPhone (navigator.standalone défini) avant le prochain chargement. */
const simulerIOS = (p, valeur) => p.addInitScript((v) => { try { Object.defineProperty(navigator, 'standalone', { value: v, configurable: true }); } catch (e) {} }, valeur);

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] M04`;
  const tablette = gabarit === 'tablette';
  const dossier = path.join(SORTIE, 'captures', 'M04');
  fs.mkdirSync(dossier, { recursive: true });

  /* ---------- 1 + 2 : premier chargement, hors-ligne ---------- */
  if (tablette) {
    const copie = copierSite();
    const srv = await serveur(copie);
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const app = await launch(gabarit, { url });
    const p = app.page;
    let charges = 0;
    /* R4 : launch() rend la main à « domcontentloaded » ; l'événement load du PREMIER chargement peut arriver après
       (sous charge, polices et xlsx tardent) et était alors compté comme un rechargement. On l'attend avant de compter.
       Le témoin window.__temoin prouve toujours, indépendamment, qu'aucun rechargement n'a eu lieu. */
    await p.waitForLoadState('load');
    p.on('load', () => charges++);
    try {
      await check(`${P}·1 premier chargement : service worker actif, cache = liste de précache, aucun rechargement`, async () => {
        await p.evaluate(() => { window.__temoin = 'la'; });
        assert(await swPret(p), 'service worker actif');
        await attendre(800);
        eq(await p.evaluate(() => window.__temoin), 'la', 'témoin (la page n’a pas été rechargée)');
        eq(charges, 0, 'événements load depuis la pose du témoin');
        const v = await versionPage(p);
        const cles = await noms(p);
        eq(cles, ['kinball-' + v], 'noms de caches');
        const urls = await p.evaluate(async (n) => (await (await caches.open(n)).keys()).map(r => new URL(r.url).pathname).sort(), 'kinball-' + v);
        const attendu = precacheDuDepot().map(u => u === './' ? '/' : '/' + u.replace(/^\.\//, '')).sort();
        eq(urls, attendu, 'contenu du cache = liste de précache');
        assert(!(await p.evaluate(() => !!navigator.serviceWorker.controller)), 'la première visite n’est pas prise en main en cours de route');
        assert(app.errors.length === 0, app.errors.join(' | '));
      });

      await check(`${P}·2 hors-ligne : rechargement, 7 graisses, XLSX, match de 20 actions enregistré (2 rechargements), export XLSX, % de victoire en Worker`, async () => {
        await controlee(p);
        await p.context().setOffline(true);
        await p.reload({ waitUntil: 'domcontentloaded' });
        await p.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
        await attendreBase(p);
        assert(await visible(p, '#home'), 'accueil affiché hors-ligne');
        eq(await p.evaluate(() => typeof XLSX), 'object', 'XLSX présent');
        const graisses = await p.evaluate(async () => {
          const specs = ['400 16px Inter', '500 16px Inter', '600 16px Inter', '700 16px Inter', '600 16px "Barlow Condensed"', '700 16px "Barlow Condensed"', '800 16px "Barlow Condensed"'];
          const sortie = [];
          for (const s of specs) { const fs_ = await document.fonts.load(s); sortie.push(fs_.length > 0 && fs_.every(f => f.status === 'loaded')); }
          return sortie;
        });
        eq(graisses, [true, true, true, true, true, true, true], '7 graisses chargées');
        /* match complet hors-ligne */
        await app.startMatch({ format: '9_11', name: 'hors_ligne' });
        await p.evaluate(() => { WP.minK = 1; });
        await app.initialPossession('Bleu');
        const m = new Model('9_11'); m.initial('Bleu');
        await jouer(app, m, 20, 77);
        const n = await p.evaluate(() => S.history.length);
        assert(n >= 20, 'actions jouées : ' + n);
        await p.waitForFunction(() => WP.stats.sent > 0 && WP.result, null, { timeout: 15000 });
        const wp = await p.evaluate(() => ({ mode: WP.mode, fb: WP.stats.fallbacks, w: !!WP.worker }));
        eq(wp.mode, 'worker', 'mode du % de victoire'); eq(wp.fb, 0, 'replis'); assert(wp.w, 'Worker présent');
        await p.evaluate(() => finishMatchNow());
        await enregistre(p);
        const id = await p.evaluate(() => S.id);
        await p.evaluate(() => closeSheet());
        /* export XLSX relu */
        const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 10000 }), p.evaluate(() => exportXLSX())]);
        const fich = path.join(os.tmpdir(), 'm04_export_' + Date.now() + '.xlsx');
        await dl.saveAs(fich);
        const b64 = fs.readFileSync(fich).toString('base64'); fs.unlinkSync(fich);
        const classeur = await p.evaluate((b) => { const wb = XLSX.read(b, { type: 'base64' }); return { feuilles: wb.SheetNames, lignes: XLSX.utils.sheet_to_json(wb.Sheets['Actions'], { header: 1 }).length }; }, b64);
        assert(classeur.feuilles.includes('Actions') && classeur.feuilles.includes('Match'), 'feuilles : ' + classeur.feuilles.join(','));
        assert(classeur.lignes > n, 'lignes de la feuille Actions : ' + classeur.lignes);
        /* deux rechargements hors-ligne : le match est là */
        for (const k of [1, 2]) {
          await p.reload({ waitUntil: 'domcontentloaded' });
          await p.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
          await attendreBase(p);
          await p.waitForFunction((i) => MATCHES_DB.some(x => x.id === i), id, { timeout: 8000 });
          const r = await p.evaluate((i) => { const x = MATCHES_DB.find(y => y.id === i); return { h: x.history.length, st: x.status }; }, id);
          eq(r.h, n, 'actions après le rechargement ' + k); eq(r.st, 'completed', 'statut après le rechargement ' + k);
        }
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    } finally { await app.close(); srv.close(); fs.rmSync(copie, { recursive: true, force: true }); }
  }

  /* ---------- 3 + 4 : mise à jour sur accord ---------- */
  if (tablette) {
    const copie = copierSite();
    const srv = await serveur(copie);
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const app = await launch(gabarit, { url });
    const p = app.page;
    let charges = 0;
    let v1 = null, v2 = null, hist1 = null;
    try {
      await check(`${P}·3a v2 reçue pendant un match : rien ne part tant qu’on est sur l’écran de match ; carte à l’accueil ; v1 reste en service`, async () => {
        await controlee(p);
        v1 = await versionPage(p);
        await app.startMatch({ format: '9_11', name: 'maj_match' });
        await app.initialPossession('Bleu');
        const m = new Model('9_11'); m.initial('Bleu');
        await jouer(app, m, 6, 3);
        await enregistre(p);
        await p.evaluate(() => { window.__temoin = 'la'; });
        p.on('load', () => charges++);
        v2 = fabriquerV2(copie);
        assert(v2 !== v1, 'v2 ≠ v1 : ' + v1 + ' / ' + v2);
        const n0 = nbRequetes(srv, '/sw.js');
        const res = await p.evaluate(() => KBSite.verifierMiseAJour({ forcer: true }));
        eq(res, false, 'verifierMiseAJour depuis l’écran de match');
        await attendre(900);
        eq(nbRequetes(srv, '/sw.js'), n0, 'requêtes vers sw.js pendant le match');
        assert(!(await visible(p, '#kbCarteMaj')), 'aucune carte pendant le match');
        /* retour à l'accueil : la recherche reportée part */
        await p.evaluate(() => navHome());
        await p.waitForFunction(() => document.getElementById('kbCarteMaj') && document.getElementById('kbCarteMaj').offsetHeight > 0, null, { timeout: 10000 });
        assert(nbRequetes(srv, '/sw.js') > n0, 'la recherche est partie à l’accueil');
        eq(await versionPage(p), v1, 'version affichée = v1');
        eq(await p.evaluate(() => window.__temoin), 'la', 'aucun rechargement');
        eq(charges, 0, 'événements load');
        assert((await noms(p)).includes('kinball-' + v2) && (await noms(p)).includes('kinball-' + v1), 'caches v1 et v2 : ' + (await noms(p)).join(','));
        await app.shot(path.join(dossier, `accueil-maj-${gabarit}-mecanique.png`));
        /* rechargement manuel sans accord : toujours v1, cohérente */
        await p.reload({ waitUntil: 'domcontentloaded' });
        await p.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined' && typeof KBSite !== 'undefined');
        await attendreBase(p);
        eq(await versionPage(p), v1, 'version après rechargement manuel');
        eq(await marquePage(p), null, 'index.html toujours de la v1');
        await p.waitForFunction(() => document.getElementById('kbCarteMaj') && document.getElementById('kbCarteMaj').offsetHeight > 0, null, { timeout: 10000 });
        assert(app.errors.length === 0, app.errors.join(' | '));
      });

      await check(`${P}·4 enregistrement en cours (hasUnsavedWork vrai) : « METTRE À JOUR » n’active rien`, async () => {
        await p.locator('#resumeCard').click();
        await p.waitForFunction(() => !!S.id && isVisible('match'));
        await p.evaluate(() => {
          const c0 = DB.collection.bind(DB), d0 = DB.doc.bind(DB);
          window.__orig = { c0, d0 };
          const rejet = ref => { ref.set = () => Promise.reject(new Error('échec simulé')); return ref; };
          DB.collection = (path_) => { const c = c0(path_); const dd = c.doc.bind(c); c.doc = (id) => rejet(dd(id)); return c; };
          DB.doc = (path_) => rejet(d0(path_));
        });
        await p.evaluate(() => save());   // écriture en échec : un enregistrement reste en attente
        await p.waitForFunction(() => dbSyncState === 'error', null, { timeout: 8000 });
        assert(await p.evaluate(() => hasUnsavedWork()), 'hasUnsavedWork vrai');
        await p.evaluate(() => { window.__temoin = 'la2'; });
        await p.evaluate(() => navHome());
        await p.waitForFunction(() => document.getElementById('kbCarteMaj') && document.getElementById('kbCarteMaj').offsetHeight > 0, null, { timeout: 10000 });
        const nCharges = charges;
        await p.locator('#kbMajBtn').click();
        const msg = await p.locator('#kbMajMsg').innerText();
        assert(/Enregistrement en cours/.test(msg), 'message : ' + msg);
        await attendre(1200);
        eq(await p.evaluate(() => window.__temoin), 'la2', 'aucun rechargement');
        eq(charges, nCharges, 'événements load');
        eq(await versionPage(p), v1, 'toujours la v1');
        assert(await p.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !!r.waiting)), 'la v2 reste en attente');
        /* la façade revient : réessai, tout est écrit */
        await p.evaluate(() => { DB.collection = window.__orig.c0; DB.doc = window.__orig.d0; retryNow(); });
        await enregistre(p);
        hist1 = await p.evaluate(() => JSON.parse(JSON.stringify(MATCHES_DB.find(x => x.id === findResumableMatch().id).history)));
        assert(app.errors.filter(e => !/échec simulé/.test(e)).length === 0, app.errors.join(' | '));
      });

      await check(`${P}·3b appui sur « METTRE À JOUR » : un seul rechargement, v2 affichée, cache v1 supprimé, match reprenable`, async () => {
        await p.waitForFunction(() => document.getElementById('kbCarteMaj') && document.getElementById('kbCarteMaj').offsetHeight > 0);
        const avantCharges = charges;
        await p.locator('#kbMajBtn').click();
        await p.waitForFunction((v) => typeof KBSite !== 'undefined' && KBSite.version.site === v, v2, { timeout: 15000 });
        await p.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
        await attendreBase(p);
        await attendre(1500);
        eq(charges - avantCharges, 1, 'rechargements depuis l’appui');
        eq(await marquePage(p), 'v2', 'index.html de la v2');
        await p.waitForFunction((n) => caches.keys().then(k => k.length === 1 && k[0] === n), 'kinball-' + v2, { timeout: 8000 });
        eq(await noms(p), ['kinball-' + v2], 'caches après la mise à jour');
        assert(!(await visible(p, '#kbCarteMaj')), 'carte retirée');
        await p.waitForFunction(() => document.getElementById('resumeCard').style.display === 'flex', null, { timeout: 8000 });
        await p.locator('#resumeCard').click();
        await p.waitForFunction(() => !!S.id && isVisible('match'));
        eq(await p.evaluate(() => JSON.parse(JSON.stringify(S.history))), hist1, 'history identique après la reprise');
        await p.evaluate(() => navHome()); await p.evaluate(() => navTo('backup'));
        await p.waitForFunction(() => /Version/.test(document.getElementById('kbSauvegarde').textContent));
        await app.shot(path.join(dossier, `sauvegarde-version-${gabarit}.png`));
        assert(app.errors.filter(e => !/échec simulé/.test(e)).length === 0, app.errors.join(' | '));
      });
    } finally { await app.close(); srv.close(); fs.rmSync(copie, { recursive: true, force: true }); }
  }

  /* ---------- 5 : au plus une recherche par heure ---------- */
  if (tablette) {
    const copie = copierSite();
    const srv = await serveur(copie);
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const app = await launch(gabarit, { url });
    const p = app.page;
    try {
      await check(`${P}·5 deux retours au premier plan en moins d’une heure : une seule recherche (puis une de plus après une heure)`, async () => {
        await p.addInitScript(() => {
          window.__maj = 0; window.__decalage = 0;
          const u0 = ServiceWorkerRegistration.prototype.update;
          ServiceWorkerRegistration.prototype.update = function () { window.__maj++; return u0.apply(this, arguments); };
          const dn = Date.now.bind(Date); Date.now = () => dn() + window.__decalage;
        });
        await p.reload({ waitUntil: 'domcontentloaded' });
        await p.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined' && typeof KBSite !== 'undefined');
        await p.waitForFunction(() => window.__maj >= 1, null, { timeout: 8000 });   // la recherche du lancement
        await attendre(300);
        const n0 = await p.evaluate(() => window.__maj);
        await p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); document.dispatchEvent(new Event('visibilitychange')); });
        await attendre(300);
        eq(await p.evaluate(() => window.__maj), n0, 'recherches après deux retours rapprochés');
        await p.evaluate(() => { window.__decalage = 61 * 60 * 1000; });
        await p.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); document.dispatchEvent(new Event('visibilitychange')); });
        await attendre(300);
        eq(await p.evaluate(() => window.__maj), n0 + 1, 'recherches après une heure (deux retours)');
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    } finally { await app.close(); srv.close(); fs.rmSync(copie, { recursive: true, force: true }); }
  }

  /* ---------- 6 : file:// (le banc) ---------- */
  {
    const app = await launch(gabarit);
    const p = app.page;
    try {
      await check(`${P}·6 file:// : aucune tentative d’enregistrement, aucune carte, aucune erreur ; ligne de version présente`, async () => {
        await attendreBase(p);
        eq(await p.evaluate(() => KBSite.peutEnregistrer), false, 'KBSite.peutEnregistrer');
        eq(await p.evaluate(() => ('serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations().then(r => r.length, () => 0) : 0)), 0, 'enregistrements');
        await attendre(500);
        assert(!(await p.evaluate(() => !!document.getElementById('kbCarteInstall') || !!document.getElementById('kbCarteMaj'))), 'aucune carte');
        /* M06 : sur base vide, la carte de premier lancement peut occuper la zone ; aucune autre carte */
        eq(await p.evaluate(() => [...document.getElementById('kbAccueil').children].map(c => c.id).filter(i => i !== 'kbCarteLancement')), [], 'zone de cartes sans carte de mise à jour ni d’installation');
        await p.evaluate(() => navTo('backup'));
        const t = await p.evaluate(() => document.getElementById('kbSauvegarde').textContent);
        assert(/^Version \d{4}-\d{2}-\d{2}\.\d+ · app amont [0-9a-f]{8}$/.test(t), 'ligne de version : « ' + t + ' »');
        assert(await visible(p, '#kbSauvegarde'), 'ligne de version visible');
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    } finally { await app.close(); }
  }

  /* ---------- 7 + 11 : carte d'installation et cartes à l'écran (les deux gabarits) ---------- */
  {
    const copie = copierSite();
    const srv = await serveur(copie);
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const app = await launch(gabarit, { url });
    const p = app.page;
    const recharger = async () => {
      await p.reload({ waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined' && typeof KBSite !== 'undefined');
      await attendreBase(p);
    };
    try {
      await check(`${P}·7 carte d’installation : http non installé (rien sans événement, bouton avec événement), texte iOS, absente en mode installé`, async () => {
        await attendreBase(p);
        await attendre(500);
        assert(!(await visible(p, '#kbCarteInstall')), 'pas de carte sans événement ni iOS');
        /* événement beforeinstallprompt simulé */
        await p.evaluate(() => { const e = new Event('beforeinstallprompt', { cancelable: true }); e.prompt = () => { window.__prompted = 1; }; window.dispatchEvent(e); });
        await p.waitForFunction(() => { const c = document.getElementById('kbCarteInstall'); return c && c.offsetHeight > 0; }, null, { timeout: 5000 });
        assert(await visible(p, '#kbInstallBtn'), 'bouton INSTALLER');
        assert(/séparées : installez d’abord, saisissez ensuite/.test(await p.locator('#kbCarteInstall').innerText()), 'phrase des données séparées');
        await p.locator('#kbInstallBtn').click();
        eq(await p.evaluate(() => window.__prompted), 1, 'prompt() appelé');
        assert(!(await visible(p, '#kbCarteInstall')), 'carte retirée après l’appui');
        /* iOS simulé : texte « Partager → Sur l'écran d'accueil » */
        await simulerIOS(p, false);
        await recharger();
        await p.waitForFunction(() => { const c = document.getElementById('kbCarteInstall'); return c && c.offsetHeight > 0; }, null, { timeout: 5000 });
        const t = await p.locator('#kbCarteInstall').innerText();
        assert(/Partager → Sur l’écran d’accueil/.test(t), 'texte iOS : ' + t);
        assert(/séparées/.test(t), 'phrase des données séparées (iOS)');
        assert(!(await visible(p, '#kbInstallBtn')), 'pas de bouton sur iOS');
        await app.shot(path.join(dossier, `accueil-installation-${gabarit}.png`));
        /* jamais sur l'écran de match */
        await app.startMatch({ format: '9_11', name: 'install_' + gabarit });
        assert(!(await visible(p, '#kbCarteInstall')) && !(await visible(p, '#kbAccueil')), 'carte invisible sur l’écran de match');
        await p.evaluate(() => navHome());
        await p.waitForFunction(() => { const c = document.getElementById('kbCarteInstall'); return c && c.offsetHeight > 0; });
        /* refermée : le reste après rechargement */
        await p.locator('#kbInstallFermer').click();
        assert(!(await visible(p, '#kbCarteInstall')), 'carte refermée');
        await p.waitForFunction(() => KBLocal.meta.get('site.installRefusee').then(v => v === true));
        await recharger();
        await attendre(700);
        assert(!(await visible(p, '#kbCarteInstall')), 'carte toujours fermée après rechargement');
        assert(app.errors.length === 0, app.errors.join(' | '));
      });

      await check(`${P}·7b mode installé simulé (navigator.standalone vrai) : aucune carte d’installation`, async () => {
        const ctx2 = await p.context().browser().newContext({ viewport: p.viewportSize(), hasTouch: !tablette, isMobile: !tablette });
        const q = await ctx2.newPage();
        const erreurs = [];
        q.on('pageerror', e => erreurs.push(String(e)));
        await simulerIOS(q, true);
        await q.goto(url, { waitUntil: 'domcontentloaded' });
        await q.waitForFunction(() => typeof KBSite !== 'undefined' && typeof S !== 'undefined');
        await attendre(900);
        assert(!(await visible(q, '#kbCarteInstall')), 'pas de carte en mode installé');
        await ctx2.close();
        eq(erreurs, [], 'erreurs de page');
      });

      await check(`${P}·11 cartes à l’écran : mise à jour + installation, rien ne déborde, « Nouveau match » visible sans défilement`, async () => {
        /* nouveau contexte propre (la carte d'installation a été refermée plus haut) */
        const ctx2 = await p.context().browser().newContext(gabarit === 'telephone' ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1180, height: 820 } });
        const q = await ctx2.newPage();
        const erreurs = [];
        q.on('console', m => { if (m.type() === 'error' && !/net::ERR_|Failed to load resource/.test(m.text())) erreurs.push(m.text()); });
        q.on('pageerror', e => erreurs.push(String(e)));
        await simulerIOS(q, false);
        await q.goto(url, { waitUntil: 'domcontentloaded' });
        await q.waitForFunction(() => typeof KBSite !== 'undefined' && typeof S !== 'undefined');
        if (gabarit === 'telephone') await q.waitForFunction(() => document.documentElement.classList.contains('phone'));
        await controlee(q);
        fabriquerV2(copie);
        await q.evaluate(() => KBSite.verifierMiseAJour({ forcer: true }));
        await q.waitForFunction(() => { const c = document.getElementById('kbCarteMaj'); return c && c.offsetHeight > 0; }, null, { timeout: 12000 });
        await q.waitForFunction(() => { const c = document.getElementById('kbCarteInstall'); return c && c.offsetHeight > 0; }, null, { timeout: 5000 });
        /* ordre : mise à jour avant installation */
        eq(await q.evaluate(() => [...document.getElementById('kbAccueil').children].map(c => c.id).filter(i => i !== 'kbCarteLancement')), ['kbCarteMaj', 'kbCarteInstall'], 'ordre des cartes (hors carte de premier lancement M06)');
        await q.screenshot({ path: path.join(dossier, `accueil-cartes-${gabarit}.png`) });
        const mesure = await q.evaluate(() => {
          const b = document.querySelector('.home-hero').getBoundingClientRect();
          const wrap = document.getElementById('kbAccueil').getBoundingClientRect();
          return { bas: b.bottom, haut: b.top, h: window.innerHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, droite: wrap.right, gauche: wrap.left };
        });
        assert(mesure.sw <= mesure.cw, 'défilement horizontal : ' + mesure.sw + ' > ' + mesure.cw);
        assert(mesure.gauche >= 0 && mesure.droite <= mesure.cw, 'cartes dans l’écran');
        assert(mesure.bas <= mesure.h, '« Nouveau match » visible sans défilement : bas ' + Math.round(mesure.bas) + ' pour une fenêtre de ' + mesure.h);
        /* carte de mise à jour seule (installation refermée) : capture */
        await q.locator('#kbInstallFermer').click();
        await q.screenshot({ path: path.join(dossier, `accueil-maj-${gabarit}.png`) });
        eq(erreurs, [], 'erreurs console');
        await ctx2.close();
      });
    } finally { await app.close(); srv.close(); fs.rmSync(copie, { recursive: true, force: true }); }
  }

  /* ---------- 8 : outils/check-release.mjs ; 9 : sw.js ---------- */
  if (tablette) {
    const lancer = (racine, ...opts) => spawnSync(process.execPath, [CHECK, '--racine', racine, ...opts], { encoding: 'utf8' });
    await check(`${P}·8 check-release : passe sur le dépôt ; échoue (code 1) sur fichier modifié, fichier oublié, entrée inexistante ; --ecrire deux fois : la seconde n’écrit rien`, async () => {
      const dep = spawnSync(process.execPath, [CHECK], { encoding: 'utf8' });
      eq(dep.status, 0, 'dépôt : ' + dep.stdout + dep.stderr);
      /* fichier du précache modifié sans --ecrire */
      let c = copierSite();
      try {
        fs.appendFileSync(path.join(c, 'kblocal.js'), '\n/* touché */\n');
        let r = lancer(c);
        eq(r.status, 1, 'fichier modifié : code'); assert(/empreinte/.test(r.stderr), r.stderr);
        /* --ecrire : nouvelle version, puis rien */
        const avant = fs.readFileSync(path.join(c, 'sw.js'), 'utf8');
        r = lancer(c, '--ecrire');
        eq(r.status, 0, '--ecrire : ' + r.stdout + r.stderr);
        const apres = fs.readFileSync(path.join(c, 'sw.js'), 'utf8');
        assert(apres !== avant, 'sw.js doit changer');
        const kb1 = fs.readFileSync(path.join(c, 'kbsite.js'), 'utf8');
        r = lancer(c, '--ecrire');
        eq(r.status, 0, 'seconde écriture : ' + r.stdout + r.stderr);
        assert(/Rien n.a changé/.test(r.stdout), 'message : ' + r.stdout);
        eq(fs.readFileSync(path.join(c, 'sw.js'), 'utf8'), apres, 'sw.js inchangé à la seconde écriture');
        eq(fs.readFileSync(path.join(c, 'kbsite.js'), 'utf8'), kb1, 'kbsite.js inchangé à la seconde écriture');
        eq(lancer(c).status, 0, 'passe après écriture');
      } finally { fs.rmSync(c, { recursive: true, force: true }); }
      /* fichier du site absent de la liste */
      c = copierSite();
      try {
        fs.writeFileSync(path.join(c, 'extra.js'), '// nouveau');
        const r = lancer(c);
        eq(r.status, 1, 'fichier oublié : code'); assert(/oublié : extra\.js/.test(r.stderr), r.stderr);
        const r2 = lancer(c, '--ecrire'); eq(r2.status, 1, '--ecrire refuse une liste incomplète');
      } finally { fs.rmSync(c, { recursive: true, force: true }); }
      /* entrée inexistante */
      c = copierSite();
      try {
        const f = path.join(c, 'sw.js');
        fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace('"./",', '"./",\n  "n-existe-pas.js",'));
        const r = lancer(c);
        eq(r.status, 1, 'entrée inexistante : code'); assert(/inexistante : n-existe-pas\.js/.test(r.stderr), r.stderr);
      } finally { fs.rmSync(c, { recursive: true, force: true }); }
    });

    await check(`${P}·9 sw.js : un seul skipWaiting (gestionnaire de message), ni caches.match( global, ni clients.claim ; précache sans tests / amont / outils / sim / collecte / licences`, async () => {
      const src = fs.readFileSync(path.join(DEPOT, 'sw.js'), 'utf8');
      eq((src.match(/skipWaiting/g) || []).length, 1, 'occurrences de skipWaiting');
      assert(/addEventListener\('message'[\s\S]{0,200}skipWaiting/.test(src), 'skipWaiting dans le gestionnaire de message');
      assert(!/caches\.match\(/.test(src), 'caches.match( global');
      assert(!/clients\.claim/.test(src), 'clients.claim');
      for (const u of precacheDuDepot()) assert(!/^(\.\/)?(tests|amont|outils|sim|collecte)\//.test(u) && !/LICENCE|EMPREINTES|\.txt$|\.md$/i.test(u), 'entrée interdite : ' + u);
    });
  }
}
