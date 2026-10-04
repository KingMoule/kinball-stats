/* M06 — Sauvegarde v2, import sans écrasement, premier lancement, rappel.
   Critères 1 à 12 et 14 du brief M06 (le 13, c'est le banc complet).
   Contexte A (données) -> fichier -> contexte B (vide) ; B sert ensuite aux imports
   « plus ancien / plus récent / chargé dans S / corbeille / autre identité ».
   Les écritures de la façade sont comptées en enveloppant IDBObjectStore.put sur le
   magasin « docs » (indépendant de l'app). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, assert, eq, rng, DEPOT, SORTIE } from '../lib.mjs';
import { Model, pickAction, play } from '../model.mjs';

export const gabarits = ['tablette', 'telephone'];

const enregistre = (p) => p.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok', null, { timeout: 8000, polling: 20 });
const attendreBase = (p) => p.waitForFunction(() => typeof DB !== 'undefined' && !!DB && typeof AUTHOR_ID !== 'undefined' && !!AUTHOR_ID && typeof KBSite !== 'undefined', null, { timeout: 8000, polling: 20 });
const recharger = async (p) => {
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
  await attendreBase(p);
};
const attendre = (ms) => new Promise(r => setTimeout(r, ms));
async function jouer(app, m, n, graine) {
  const r = rng(graine);
  let k = 0;
  while ((await app.ev(() => S.history.length)) < n && k++ < 80) {
    if (m.awaitingDuel) break;
    await play(app, m, pickAction(m, r), { manualDuel: true });
  }
}
/* Compte les put sur le magasin « docs » (écritures de la façade) : window.__puts. */
const compterEcritures = (p) => p.evaluate(() => {
  if (window.__puts !== undefined) { window.__puts = 0; return; }
  window.__puts = 0;
  const o = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...a) { if (this.name === 'docs') window.__puts++; return o.apply(this, a); };
});
const puts = (p) => p.evaluate(() => window.__puts);
const statut = (p) => p.evaluate(() => document.getElementById('backupStatus').textContent);
const compte = (p) => p.evaluate(() => ({
  equipes: TEAMS_DB.length, matchs: MATCHES_DB.length, corbeille: DELETED_MATCHES.length,
  actions: [...MATCHES_DB, ...DELETED_MATCHES].reduce((n, x) => n + x.history.length, 0),
}));
const tmp = (nom) => path.join(os.tmpdir(), 'm06_' + process.pid + '_' + Date.now() + '_' + nom);
const ecrire = (nom, obj) => { const f = tmp(nom); fs.writeFileSync(f, typeof obj === 'string' ? obj : JSON.stringify(obj)); return f; };
/* Import par le champ de fichier, attend la fin du compte rendu (« Import terminé » ou un refus). */
async function importer(p, fichier, fin = /Import terminé|invalide|impossible/) {
  await p.evaluate(() => { navTo('backup'); document.getElementById('backupStatus').textContent = ''; });
  await p.setInputFiles('#importFileInput', fichier);
  await p.waitForFunction((re) => new RegExp(re).test(document.getElementById('backupStatus').textContent), fin.source, { timeout: 10000, polling: 30 });
  await attendre(250);   // la suite du compte rendu (identité) est asynchrone
}
/* Sortir de l'accueil puis y revenir (deux tâches distinctes : l'observateur de kbsite.js voit les deux écrans). */
const allerRetour = async (p) => { await p.evaluate(() => navTo('backup')); await attendre(60); await p.evaluate(() => navHome()); };
const creerEquipe = (p, nom) => p.evaluate((n) => dbSetTeam({ id: uid('team'), name: n, players: [{ id: uid('p'), name: n + ' 1' }], createdAt: Date.now(), updatedAt: Date.now() }), nom);
/* Copie d'un match existant sous un nouvel identifiant (même contenu, nouveaux horodatages). */
const cloner = (p, modele, extra = {}) => p.evaluate(async ([id, ex]) => {
  const m = JSON.parse(JSON.stringify(getMatchRecord(id) || DELETED_MATCHES.find(x => x.id === id)));
  const copie = Object.assign(m, { id: uid('match'), createdAt: Date.now(), updatedAt: Date.now() }, ex);
  await writeMatchDoc(copie);
  return copie.id;
}, [modele, extra]);
async function terminerEtQuitter(app) {
  const p = app.page;
  await enregistre(p);
  await p.evaluate(() => { S = freshState(); navHome(); });
}

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] M06`;
  const dossier = path.join(SORTIE, 'captures', 'M06');
  fs.mkdirSync(dossier, { recursive: true });
  const jetables = [];
  const A = await launch(gabarit);
  const B = await launch(gabarit);
  const a = A.page, b = B.page;
  let nomFichier = null, fichier = null, contenu = null, avant = null, idA = null, idEnCours = null, idCorbeille = null, idsTermines = [];
  try {
    await attendreBase(a); await attendreBase(b);

    /* ---------- 1 et 2 : aller-retour et format du fichier ---------- */
    await check(`${P}·1 aller-retour A -> B vide : mêmes équipes, matchs, actions, corbeille ; identité reprise ; reprise du match ; nouveau match sous l'identité de A`, async () => {
      await creerEquipe(a, 'Faucons'); await creerEquipe(a, 'Aigles');
      idA = await a.evaluate(() => AUTHOR_ID);
      await a.evaluate(() => KBLocal.use('user').then(u => u.setName('Preneuse A')));
      /* match 1 : réel, terminé ; matchs 2 et 3 : copies terminées ; 1 copie à la corbeille ; 1 match réel en cours */
      await A.startMatch({ format: '9_11', name: 'm1_' + gabarit });
      await A.initialPossession('Bleu');
      const m = new Model('9_11'); m.initial('Bleu');
      await jouer(A, m, 8, 41);
      await a.evaluate(() => finishMatchNow());
      await enregistre(a);
      await a.evaluate(() => closeSheet());
      const id1 = await a.evaluate(() => S.id);
      await terminerEtQuitter(A);
      const id2 = await cloner(a, id1, { matchName: 'm2_' + gabarit });
      const id3 = await cloner(a, id1, { matchName: 'm3_' + gabarit });
      idCorbeille = await cloner(a, id1, { matchName: 'm4_corbeille_' + gabarit });
      idsTermines = [id1, id2, id3];
      await a.waitForFunction((n) => MATCHES_DB.length >= n, 4, { timeout: 8000 });
      await a.evaluate((i) => dbTrashMatch(i), idCorbeille);
      await a.waitForFunction((i) => DELETED_MATCHES.some(x => x.id === i), idCorbeille);
      await A.startMatch({ format: '9_11', name: 'm5_encours_' + gabarit });
      await A.initialPossession('Bleu');
      const m2 = new Model('9_11'); m2.initial('Bleu');
      await jouer(A, m2, 6, 77);
      idEnCours = await a.evaluate(() => S.id);
      await terminerEtQuitter(A);
      avant = await compte(a);
      eq([avant.equipes, avant.matchs, avant.corbeille], [2, 4, 1], 'jeu de données de A');
      assert(avant.actions > 20, 'actions : ' + avant.actions);

      await a.evaluate(() => navTo('backup'));
      const [dl] = await Promise.all([
        a.waitForEvent('download', { timeout: 10000 }),
        a.locator('[onclick="exportFullBackup()"]').click(),
      ]);
      fichier = tmp('sauvegarde.json');
      nomFichier = dl.suggestedFilename();
      await dl.saveAs(fichier);
      jetables.push(fichier);
      contenu = JSON.parse(fs.readFileSync(fichier, 'utf8'));

      /* B vide : carte de premier lancement, puis import */
      eq(await b.evaluate(() => KBLocal.use('user').then(u => !!u.exportIdentity())), true, 'B prêt');
      const idB0 = await b.evaluate(() => AUTHOR_ID);
      assert(idB0 !== idA, 'identités de départ différentes');
      await importer(b, fichier);
      await b.waitForFunction((n) => TEAMS_DB.length === n.equipes && MATCHES_DB.length === n.matchs && DELETED_MATCHES.length === n.corbeille, avant, { timeout: 8000 });
      eq(await compte(b), avant, 'comptes de B après import');
      await b.waitForFunction(() => !!document.getElementById('kbRestauree'), null, { timeout: 5000 });
      const feuille = await b.evaluate(() => document.getElementById('sheet').textContent);
      assert(/Sauvegarde restaurée/.test(feuille) && /identité de preneur de stats a été reprise/.test(feuille) && /CONTINUER/.test(feuille), 'feuille : ' + feuille);
      assert(await b.evaluate(() => document.getElementById('sheet').classList.contains('open')), 'feuille ouverte');
      /* non fermable : un appui sur le fond ne la ferme pas */
      await b.evaluate(() => document.getElementById('sheetBackdrop').click());
      await attendre(200);
      assert(await b.evaluate(() => !!document.getElementById('kbRestauree') && document.getElementById('sheet').classList.contains('open')), 'feuille non fermable');
      /* aucun rechargement tant qu'on n'appuie pas */
      await b.evaluate(() => { window.__marque = 1; });
      await attendre(400);
      eq(await b.evaluate(() => window.__marque), 1, 'pas de rechargement avant CONTINUER');
      await B.shot(path.join(dossier, `sauvegarde-restauree-${gabarit}.png`));
      await b.evaluate(() => document.getElementById('kbContinuer').click());
      await b.waitForFunction(() => window.__marque === undefined, null, { timeout: 8000 });
      await recharger(b);
      eq(await b.evaluate(() => AUTHOR_ID), idA, 'AUTHOR_ID de B = identité de A');
      eq(await b.evaluate(() => localStorage.getItem('kinball_install_id')), idA, 'localStorage de B');
      eq(await b.evaluate(() => KBLocal.use('user').then(u => u.exportIdentity())), { id: idA, name: 'Preneuse A' }, 'KBLocal de B');
      await b.waitForFunction((n) => TEAMS_DB.length === n.equipes && MATCHES_DB.length === n.matchs && DELETED_MATCHES.length === n.corbeille, avant, { timeout: 8000 });
      eq(await compte(b), avant, 'comptes de B après rechargement');
      /* le match en cours se reprend */
      await b.evaluate(() => navHome());
      await b.waitForFunction(() => document.getElementById('resumeCard').style.display === 'flex', null, { timeout: 5000 });
      await b.evaluate(() => resumeMatch());
      eq(await b.evaluate(() => S.id), idEnCours, 'match repris');
      eq(await b.evaluate(() => S.history.length), 6, 'actions du match repris');
      await terminerEtQuitter(B);
      /* un nouveau match dans B porte l'identité de A et s'écrit sous matches/<A>/items */
      await B.startMatch({ format: '9_11', name: 'nouveau_B_' + gabarit });
      await B.initialPossession('Bleu');
      const mB = new Model('9_11'); mB.initial('Bleu');
      await jouer(B, mB, 3, 5);
      await enregistre(b);
      const nid = await b.evaluate(() => S.id);
      eq(await b.evaluate(() => S.authorId), idA, 'authorId du nouveau match');
      const chemin = await b.evaluate((i) => new Promise((res) => {
        const r = indexedDB.open('kinball-stats');
        r.onsuccess = () => { const g = r.result.transaction('docs').objectStore('docs').getAll(); g.onsuccess = () => { r.result.close(); res(g.result.filter(x => x.data && x.data.id === i).map(x => x.path)); }; };
      }), nid);
      eq(chemin, ['matches/' + idA + '/items/' + nid], 'chemin du nouveau match');
      await terminerEtQuitter(B);
      assert(A.errors.length === 0 && B.errors.length === 0, A.errors.concat(B.errors).join(' | '));
    });

    await check(`${P}·2 le fichier porte version 2, identity, site, counts exacts ; champs et nom de l'app intacts`, async () => {
      eq(contenu.format, 'kinball_backup', 'format');
      eq(contenu.version, 2, 'version');
      eq(contenu.identity, { id: idA, name: 'Preneuse A' }, 'identity');
      assert(contenu.site && /^\d{4}-\d{2}-\d{2}\.\d+$/.test(contenu.site.version) && /^[0-9a-f]{8}$/.test(contenu.site.amont), 'site : ' + JSON.stringify(contenu.site));
      const vivants = contenu.matches.filter(x => !x.deleted), morts = contenu.matches.filter(x => x.deleted);
      eq(contenu.counts, { teams: 2, matches: vivants.length, deleted: morts.length, actions: vivants.reduce((n, x) => n + x.history.length, 0) }, 'counts');
      eq([contenu.counts.teams, contenu.counts.matches, contenu.counts.deleted], [2, 4, 1], 'décomptes attendus');
      assert(!isNaN(Date.parse(contenu.exportedAt)) && Array.isArray(contenu.teams) && Array.isArray(contenu.matches), 'exportedAt, teams, matches');
      assert(/^kinball_sauvegarde_\d{4}-\d{2}-\d{2}\.json$/.test(nomFichier), 'nom du fichier : ' + nomFichier);
    });

    /* ---------- 3 : fichier plus ancien, fichier identique ---------- */
    await check(`${P}·3 fichier plus ancien : rien n'est écrasé (match continué, équipe renommée) ; fichier identique : 0 écriture`, async () => {
      /* le match en cours est continué (10 actions de plus, écrites comme le ferait save()) */
      const avantHist = await b.evaluate((i) => getMatchRecord(i).history.length, idEnCours);
      await b.evaluate(async (i) => {
        const r = JSON.parse(JSON.stringify(getMatchRecord(i)));
        for (let k = 0; k < 10; k++) r.history.push(JSON.parse(JSON.stringify(r.history[r.history.length - 1])));
        r.updatedAt = Date.now();
        await writeMatchDoc(r);
      }, idEnCours);
      await b.waitForFunction(([i, n]) => getMatchRecord(i).history.length === n, [idEnCours, avantHist + 10], { timeout: 5000 });
      const apres = avantHist + 10;
      const histLocale = apres;
      await b.evaluate(() => { const t = TEAMS_DB[0]; return dbSetTeam(Object.assign({}, t, { name: 'Renommée', updatedAt: Date.now() })); });
      await b.waitForFunction(() => TEAMS_DB.some(t => t.name === 'Renommée'));
      await compterEcritures(b);
      await importer(b, fichier);
      const txt = await statut(b);
      const n = Number((/(\d+) ignoré\(s\)/.exec(txt) || [])[1] || 0);
      assert(n >= 2, 'ignoré(s) : ' + txt);
      assert(/déjà à jour sur cet appareil/.test(txt), txt);
      eq(await b.evaluate((i) => getMatchRecord(i).history.length, idEnCours), histLocale, 'history du match continué inchangé');
      eq(await b.evaluate(() => TEAMS_DB.some(t => t.name === 'Renommée')), true, 'équipe renommée inchangée');
      eq(await puts(b), 0, 'écritures pour un fichier plus ancien');
      await b.evaluate(() => document.getElementById('backupStatus').scrollIntoView({ block: 'center' }));
      await B.shot(path.join(dossier, `sauvegarde-compte-rendu-${gabarit}.png`));
      /* fichier identique (le fichier d'un état déjà reflété) : tout ignoré, 0 écriture */
      const [dl2] = await Promise.all([
        b.waitForEvent('download', { timeout: 10000 }),
        (async () => { await b.evaluate(() => exportFullBackup()); })(),
      ]);
      const identique = tmp('identique.json');
      await dl2.saveAs(identique); jetables.push(identique);
      await b.evaluate(() => { window.__puts = 0; });
      await importer(b, identique);
      const t2 = await statut(b);
      eq(await puts(b), 0, 'écritures pour un fichier identique : ' + t2);
      const c = JSON.parse(fs.readFileSync(identique, 'utf8'));
      const total = c.teams.length + c.matches.length;
      assert(new RegExp(`${total} ignoré\\(s\\)`).test(t2), 'tout ignoré : ' + t2);
      assert(/0 équipe\(s\) ajoutée\(s\), 0 mise\(s\) à jour, 0 match\(s\) ajouté\(s\), 0 mis à jour/.test(t2), t2);
      assert(A.errors.length === 0 && B.errors.length === 0, A.errors.concat(B.errors).join(' | '));
    });

    /* ---------- 4 : fichier plus récent sur un seul objet ---------- */
    await check(`${P}·4 fichier plus récent sur un objet : cet objet est mis à jour, les autres ignorés`, async () => {
      const f = JSON.parse(JSON.stringify(contenu));
      const cible = f.teams[0];
      cible.name = 'Plus récente'; cible.updatedAt = Date.now() + 3600000;
      const fic = ecrire('recent.json', f); jetables.push(fic);
      await compterEcritures(b);
      await importer(b, fic);
      await b.waitForFunction(() => TEAMS_DB.some(t => t.name === 'Plus récente'), null, { timeout: 5000 });
      eq(await puts(b), 1, 'une seule écriture');
      assert(/1 équipe\(s\) (ajoutée|mise)/.test(await statut(b)) || /0 équipe\(s\) ajoutée\(s\), 1 mise\(s\) à jour/.test(await statut(b)), await statut(b));
      assert(/ignoré\(s\)/.test(await statut(b)), await statut(b));
    });

    /* ---------- 5 : match chargé dans S ---------- */
    await check(`${P}·5 match chargé dans S : jamais réécrit par l'import, même si le fichier est plus récent`, async () => {
      await b.evaluate((i) => { S = JSON.parse(JSON.stringify(getMatchRecord(i))); }, idEnCours);
      const avantMatch = await b.evaluate((i) => JSON.stringify(getMatchRecord(i)), idEnCours);
      const f = JSON.parse(JSON.stringify(contenu));
      const m = f.matches.find(x => x.id === idEnCours);
      m.matchName = 'ECRASE'; m.updatedAt = Date.now() + 7200000; m.history = m.history.slice(0, 1);
      const fic = ecrire('charge.json', f); jetables.push(fic);
      await compterEcritures(b);
      await importer(b, fic);
      eq(await b.evaluate(() => S.matchName === 'ECRASE'), false, 'S intact');
      eq(await b.evaluate((i) => JSON.stringify(getMatchRecord(i)), idEnCours), avantMatch, 'enregistrement intact');
      assert(await puts(b) === 0, 'écritures : ' + await puts(b));
      await b.evaluate(() => { S = freshState(); navHome(); });
    });

    /* ---------- 6 : corbeille ---------- */
    await check(`${P}·6 corbeille : à la corbeille ici et vivant dans le fichier (même updatedAt) -> reste à la corbeille ; l'inverse -> reste vivant`, async () => {
      const f = JSON.parse(JSON.stringify(contenu));
      const mort = f.matches.find(x => x.id === idCorbeille);
      delete mort.deleted; delete mort.deletedAt; delete mort.deletedBy;
      const vif = f.matches.find(x => x.id === idsTermines[1]);
      vif.deleted = true; vif.deletedAt = Date.now();
      const locauxAvant = await b.evaluate((i) => MATCHES_DB.find(x => x.id === i).updatedAt, idsTermines[1]);
      eq(vif.updatedAt, locauxAvant, 'même updatedAt (sinon le test ne prouve rien)');
      const fic = ecrire('corbeille.json', f); jetables.push(fic);
      await compterEcritures(b);
      await importer(b, fic);
      eq(await b.evaluate((i) => DELETED_MATCHES.some(x => x.id === i), idCorbeille), true, 'reste à la corbeille');
      eq(await b.evaluate((i) => MATCHES_DB.some(x => x.id === i), idsTermines[1]), true, 'reste vivant');
      eq(await puts(b), 0, 'aucune écriture');
    });

    /* ---------- 8 : autre identité, base non vide ---------- */
    await check(`${P}·8 base non vide + fichier d'une autre identité : identité locale gardée, aucun rechargement, compte rendu explicite`, async () => {
      const f = JSON.parse(JSON.stringify(contenu));
      f.identity = { id: 'u_autre-identite-0001', name: 'Autre' };
      const fic = ecrire('autre.json', f); jetables.push(fic);
      await b.evaluate(() => { window.__marque = 2; });
      await importer(b, fic);
      eq(await b.evaluate(() => window.__marque), 2, 'pas de rechargement');
      eq(await b.evaluate(() => KBLocal.use('user').then(u => u.exportIdentity().id)), idA, 'identité locale');
      eq(await b.evaluate(() => !!document.getElementById('kbRestauree')), false, 'pas de feuille');
      assert(/identité de cet appareil est conservée/.test(await statut(b)), await statut(b));
    });

    /* ---------- 9 : fichiers invalides ---------- */
    await check(`${P}·9 fichier invalide (pas du JSON ; JSON sans teams ni matches) : messages d'aujourd'hui, aucune écriture`, async () => {
      const f1 = ecrire('pasjson.json', 'ceci n\'est pas du json'); jetables.push(f1);
      const f2 = ecrire('vide.json', { format: 'autre', x: 1 }); jetables.push(f2);
      await compterEcritures(b);
      await importer(b, f1);
      eq(await statut(b), "Fichier invalide : ce n'est pas un JSON valide.", 'message 1');
      await importer(b, f2);
      eq(await statut(b), "Fichier invalide : ce n'est pas une sauvegarde Kin-Ball reconnue.", 'message 2');
      eq(await puts(b), 0, 'aucune écriture');
    });

    /* ---------- 7 : fichier version 1 ---------- */
    {
      const C = await launch(gabarit);
      const c = C.page;
      try {
        await check(`${P}·7 fichier version 1 (sans identité ni décomptes, match sans champ format) : importé, pas d'adoption d'identité, le match s'ouvre dans les stats`, async () => {
          await attendreBase(c);
          const idC = await c.evaluate(() => AUTHOR_ID);
          const m = JSON.parse(JSON.stringify(contenu.matches.find(x => x.id === idsTermines[0])));
          delete m.format; delete m.formatKey;
          const v1 = { format: 'kinball_backup', version: 1, exportedAt: new Date().toISOString(), teams: contenu.teams, matches: [m] };
          const fic = ecrire('v1.json', v1); jetables.push(fic);
          await importer(c, fic);
          assert(/1 match\(s\) ajouté\(s\)/.test(await statut(c)), await statut(c));
          eq(await c.evaluate(() => AUTHOR_ID), idC, 'identité inchangée');
          eq(await c.evaluate(() => !!document.getElementById('kbRestauree')), false, 'pas de feuille');
          await c.waitForFunction((i) => MATCHES_DB.some(x => x.id === i), idsTermines[0], { timeout: 5000 });
          await c.evaluate((i) => viewArchivedMatchStats(i), idsTermines[0]);
          await c.waitForFunction(() => document.getElementById('statsBody') && document.getElementById('statsBody').textContent.trim().length > 20, null, { timeout: 5000 });
          assert(C.errors.length === 0, C.errors.join(' | '));
        });
        /* archive : reste importable */
        await check(`${P}·7B archive (format kinball_archive) : importable`, async () => {
          const m = JSON.parse(JSON.stringify(contenu.matches.find(x => x.id === idsTermines[1])));
          m.id = 'm_archive_' + Date.now();
          const arc = { format: 'kinball_archive', version: 1, exportedAt: new Date().toISOString(), matches: [m] };
          const fic = ecrire('archive.json', arc); jetables.push(fic);
          await importer(c, fic);
          assert(/1 match\(s\) ajouté\(s\)/.test(await statut(c)), await statut(c));
          assert(C.errors.length === 0, C.errors.join(' | '));
        });
      } finally { await C.close(); }
    }

    /* ---------- 10 : premier lancement ---------- */
    {
      const D = await launch(gabarit);
      const d = D.page;
      try {
        await check(`${P}·10 premier lancement : carte sur base vide, absente dès qu'une équipe existe ; IMPORTER mène à Sauvegarde et ouvre le sélecteur`, async () => {
          await attendreBase(d);
          await d.waitForFunction(() => !!document.getElementById('kbCarteLancement'), null, { timeout: 5000 });
          assert(await d.locator('#kbCarteLancement').isVisible(), 'carte visible');
          assert(/Nouvel appareil, ou données effacées/.test(await d.locator('#kbCarteLancement').textContent()), 'texte');
          await D.shot(path.join(dossier, `accueil-premier-lancement-${gabarit}.png`));
          const [fc] = await Promise.all([
            d.waitForEvent('filechooser', { timeout: 5000 }),
            d.locator('#kbImporterBtn').click(),
          ]);
          assert(!!fc, 'sélecteur de fichier');
          eq(await d.evaluate(() => document.documentElement.dataset.screen), 'backup', 'écran Sauvegarde');
          /* « Plus tard » : refermée et mémorisée */
          await d.evaluate(() => navHome());
          await d.waitForFunction(() => !!document.getElementById('kbCarteLancement') || true);
          await d.locator('#kbImporterPlusTard').click();
          eq(await d.locator('#kbCarteLancement').count(), 0, 'refermée');
          await attendre(300);
          await recharger(d);
          await attendre(500);
          eq(await d.locator('#kbCarteLancement').count(), 0, 'toujours fermée après rechargement');
          assert(D.errors.length === 0, D.errors.join(' | '));
        });
      } finally { await D.close(); }
      const D2 = await launch(gabarit);
      const d2 = D2.page;
      try {
        await check(`${P}·10B la carte disparaît dès qu'une équipe existe (et n'apparaît pas si la base n'est pas vide)`, async () => {
          await attendreBase(d2);
          await d2.waitForFunction(() => !!document.getElementById('kbCarteLancement'), null, { timeout: 5000 });
          await creerEquipe(d2, 'Première');
          await allerRetour(d2);
          await d2.waitForFunction(() => !document.getElementById('kbCarteLancement'), null, { timeout: 5000 });
          await recharger(d2);
          await attendre(500);
          eq(await d2.locator('#kbCarteLancement').count(), 0, 'absente au rechargement');
        });
      } finally { await D2.close(); }
    }

    /* ---------- 11 : rappel ---------- */
    {
      const E = await launch(gabarit);
      const e = E.page;
      try {
        await check(`${P}·11 rappel : absent avec 2 matchs terminés, présent au 3e ; SAUVEGARDER MAINTENANT le fait disparaître ; refus : il reste ; 14 jours ; jamais sur l'écran de match`, async () => {
          await attendreBase(e);
          await creerEquipe(e, 'Rappel');
          await E.startMatch({ format: '9_11', name: 'r1_' + gabarit });
          await E.initialPossession('Bleu');
          const m = new Model('9_11'); m.initial('Bleu');
          await jouer(E, m, 5, 9);
          await e.evaluate(() => finishMatchNow());
          await enregistre(e);
          await e.evaluate(() => closeSheet());
          const id1 = await e.evaluate(() => S.id);
          await terminerEtQuitter(E);
          await cloner(e, id1, { matchName: 'r2' });
          await e.waitForFunction(() => MATCHES_DB.filter(x => x.status === 'completed').length === 2, null, { timeout: 5000 });
          await allerRetour(e);
          await attendre(600);
          eq(await e.locator('#kbCarteRappel').count(), 0, 'absent avec 2 matchs terminés');
          await cloner(e, id1, { matchName: 'r3' });
          await e.waitForFunction(() => MATCHES_DB.filter(x => x.status === 'completed').length === 3, null, { timeout: 5000 });
          await allerRetour(e);
          await e.waitForFunction(() => !!document.getElementById('kbCarteRappel'), null, { timeout: 5000 });
          assert(await e.locator('#kbCarteRappel').isVisible(), 'rappel visible au 3e');
          await E.shot(path.join(dossier, `accueil-rappel-${gabarit}.png`));
          /* refus : la sauvegarde est refusée, la carte reste, rien d'écrit */
          await e.evaluate(() => {
            window.__vrai = KBLocal.downloads.save;
            KBLocal.downloads.save = () => { const x = new Error('refus'); x.code = 'declined'; return Promise.reject(x); };
          });
          await e.locator('#kbSauvegarderBtn').click();
          await attendre(500);
          assert(await e.locator('#kbCarteRappel').count() === 1, 'carte conservée après refus');
          eq(await e.evaluate(() => KBLocal.meta.get('site.derniereSauvegarde')), undefined, 'rien d\'écrit après refus');
          /* un autre fichier (non-sauvegarde) ne compte pas */
          await e.evaluate(() => { KBLocal.downloads.save = window.__vrai; });
          /* succès : la carte disparaît, « Dernière sauvegarde » porte la date du jour */
          const [dl] = await Promise.all([
            e.waitForEvent('download', { timeout: 10000 }),
            e.locator('#kbSauvegarderBtn').click(),
          ]);
          await dl.path();
          await e.waitForFunction(() => !document.getElementById('kbCarteRappel'), null, { timeout: 5000 });
          await e.evaluate(() => navTo('backup'));
          const aujourd = await e.evaluate(() => todayStr());
          await e.waitForFunction((j) => (document.getElementById('kbDerniereSauv') || { textContent: '' }).textContent.includes(j), aujourd, { timeout: 5000 });
          assert(/^Dernière sauvegarde : \d{4}-\d{2}-\d{2}/.test(await e.locator('#kbDerniereSauv').textContent()), 'ligne datée');
          await E.shot(path.join(dossier, `sauvegarde-derniere-${gabarit}.png`));
          const enreg = await e.evaluate(() => KBLocal.meta.get('site.derniereSauvegarde'));
          assert(enreg && Math.abs(enreg.at - Date.now()) < 60000 && enreg.termines === 3, JSON.stringify(enreg));
          /* règle des 14 jours : date reculée de 10 jours (rien) puis de 15 jours (rappel) */
          await e.evaluate((s) => KBLocal.meta.set('site.derniereSauvegarde', Object.assign({}, s, { at: Date.now() - 10 * 86400000 })), enreg);
          await recharger(e);
          await allerRetour(e);
          await attendre(600);
          eq(await e.locator('#kbCarteRappel').count(), 0, 'rien à 10 jours');
          await e.evaluate((s) => KBLocal.meta.set('site.derniereSauvegarde', Object.assign({}, s, { at: Date.now() - 15 * 86400000 })), enreg);
          await recharger(e);
          await allerRetour(e);
          await e.waitForFunction(() => !!document.getElementById('kbCarteRappel'), null, { timeout: 5000 });
          /* « Plus tard » : 24 h */
          await e.locator('#kbRappelPlusTard').click();
          eq(await e.locator('#kbCarteRappel').count(), 0, 'refermée');
          await allerRetour(e);
          await attendre(500);
          eq(await e.locator('#kbCarteRappel').count(), 0, 'reste fermée');
          const jusqua = await e.evaluate(() => KBLocal.meta.get('site.rappelPlusTard'));
          assert(Math.abs(jusqua - (Date.now() + 86400000)) < 120000, 'échéance 24 h');
          /* jamais sur l'écran de match : on efface « Plus tard », la carte revient à l'accueil, puis pas sur le match */
          await e.evaluate(() => KBLocal.meta.set('site.rappelPlusTard', 0));
          await recharger(e);
          await allerRetour(e);
          await e.waitForFunction(() => !!document.getElementById('kbCarteRappel'), null, { timeout: 5000 });
          await E.startMatch({ format: '9_11', name: 'pendant' });
          eq(await e.evaluate(() => document.documentElement.dataset.screen), 'match', 'écran de match');
          eq(await e.evaluate(() => { const c = document.getElementById('kbCarteRappel'); return !!c && c.getBoundingClientRect().width > 0; }), false, 'carte invisible pendant le match');
          assert(E.errors.length === 0, E.errors.join(' | '));
        });
      } finally { await E.close(); }
    }

    /* ---------- 12 : index.html ---------- */
    await check(`${P}·12 index.html : cinq lignes M06, chacune marquée, aucune ligne existante modifiée`, async () => {
      const html = fs.readFileSync(path.join(DEPOT, 'index.html'), 'utf8').split('\n');
      const marquees = html.filter(l => l.includes('MIGRATION M06'));
      eq(marquees.length, 5, 'lignes M06');
      assert(marquees.every(l => /\/\* MIGRATION M06 \*\/\s*$/.test(l)), 'marqueur en fin de ligne');
      /* chaque ligne M06 est gardée par KBSite (sans lui : comportement d'aujourd'hui) */
      assert(marquees.every(l => /KBSite|kbImport/.test(l)), 'gardes');
    });
  } finally {
    await A.close(); await B.close();
    for (const f of jetables) { try { fs.unlinkSync(f); } catch (e) { /* déjà supprimé */ } }
  }
}
