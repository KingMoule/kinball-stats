/* M03 — Stockage local branché : critères 2 à 10 du brief M03.
   Équipes et matchs vont dans IndexedDB (KBLocal) ; un match en cours survit à un
   rechargement ; échec d'écriture simulé ; kblocal.js absent ; textes ; sauvegarde
   exportée puis importée ; Worker du % de victoire en http://127.0.0.1. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { launch, assert, eq, diff, rng, DEPOT, SORTIE } from '../lib.mjs';
import { Model, pickAction, play } from '../model.mjs';
import { serveur } from '../serveur.mjs';   // M04 : serveur http partagé (déplacé depuis ce scénario)

/* Lecture directe de la base IndexedDB (indépendante de l'app) : enregistrements {path, parent, data}. */
const lireBase = (p) => p.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open('kinball-stats');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => {
    const db = r.result, g = db.transaction('docs', 'readonly').objectStore('docs').getAll();
    g.onsuccess = () => { db.close(); res(g.result); };
    g.onerror = () => rej(g.error);
  };
}));
/* Tout est écrit : plus d'écriture en attente, état de synchronisation « ok ». */
const enregistre = (p) => p.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok', null, { timeout: 8000, polling: 20 });
const attendreBase = (p) => p.waitForFunction(() => typeof DB !== 'undefined' && !!DB && typeof AUTHOR_ID !== 'undefined' && !!AUTHOR_ID, null, { timeout: 8000, polling: 20 });
const recharger = async (p) => {
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
  await attendreBase(p);
};
const MOTS = /Claude|serveur|en ligne|votre compte/i;

/* Joue n actions pseudo-aléatoires (modèle indépendant) ; s'arrête sans élimination. */
async function jouer(app, m, n, graine) {
  const r = rng(graine);
  let k = 0;
  while ((await app.ev(() => S.history.length)) < n && k++ < 80) {
    if (m.awaitingDuel) break;
    await play(app, m, pickAction(m, r), { manualDuel: true });
  }
}

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] M03`;
  const dossier = path.join(SORTIE, 'captures', 'M03');
  fs.mkdirSync(dossier, { recursive: true });

  /* ---------- 2 : reprise après rechargement ---------- */
  {
    const app = await launch(gabarit);
    const p = app.page;
    try {
      await check(`${P}·2 20 actions, rechargement : carte « reprendre », reprise, état identique`, async () => {
        await attendreBase(p);
        await app.startMatch({ format: '9_11', name: 'reprise_' + gabarit });
        await app.initialPossession('Bleu');
        const m = new Model('9_11'); m.initial('Bleu');
        await jouer(app, m, 20, 31);
        const avant = await app.state();
        assert(avant.history.length >= 20, 'actions jouées : ' + avant.history.length);
        await enregistre(p);
        await recharger(p);
        await p.waitForFunction(() => document.getElementById('resumeCard').style.display === 'flex', null, { timeout: 8000 });
        assert(await p.evaluate(() => S.id === null || !S.id), 'après rechargement, aucun match courant avant la reprise');
        await p.locator('#resumeCard').click();
        await p.waitForFunction(() => !!S.id && isVisible('match'));
        const apres = await app.state();
        eq(apres.history, avant.history, 'history');
        eq(apres.scores, avant.scores, 'scores');
        eq(apres.period, avant.period, 'période');
        eq(apres.possession, avant.possession, 'possession');
        const d = diff(avant, apres); assert(!d, 'état complet : ' + d);
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    } finally { await app.close(); }
  }

  /* ---------- 3 : équipes ---------- */
  {
    const app = await launch(gabarit);
    const p = app.page;
    try {
      await check(`${P}·3 équipe créée, modifiée, rechargée : présente ; supprimée : à la corbeille (hors des choix, récupérable), puis effacée pour de bon`, async () => {
        await attendreBase(p);
        await p.evaluate(() => { navHome(); openTeamEditor(null); });
        await p.fill('#teamEditorName', 'Faucons');
        await p.locator('#playerRows .player-row input').nth(0).fill('Alice');
        await p.locator('#playerRows .player-row input').nth(1).fill('Bob');
        await p.locator('[onclick="saveTeamEditor()"]').click();
        await p.waitForFunction(() => TEAMS_DB.length === 1);
        const id = await p.evaluate(() => TEAMS_DB[0].id);
        await recharger(p);
        await p.waitForFunction(() => TEAMS_DB.length === 1);
        eq(await p.evaluate(() => TEAMS_DB[0].name), 'Faucons', 'nom après rechargement');
        eq(await p.evaluate(() => TEAMS_DB[0].players.map(x => x.name)), ['Alice', 'Bob'], 'joueurs');
        /* modification */
        await p.evaluate((i) => openTeamEditor(i), id);
        await p.fill('#teamEditorName', 'Faucons B');
        await p.locator('[onclick="saveTeamEditor()"]').click();
        await p.waitForFunction(() => TEAMS_DB.length === 1 && TEAMS_DB[0].name === 'Faucons B');
        await recharger(p);
        await p.waitForFunction(() => TEAMS_DB.length === 1);
        eq(await p.evaluate(() => TEAMS_DB[0].name), 'Faucons B', 'nom modifié après rechargement');
        /* suppression (C26 · R9 : confirmation armée, corbeille, puis effacement pour de bon) */
        await p.evaluate((i) => openTeamEditor(i), id);
        await p.locator('[onclick="deleteTeamEditor()"]').click();
        await p.waitForFunction(() => { const b = document.querySelector('#sheet .armed'); return b && !b.disabled; }, null, { timeout: 4000, polling: 20 });
        await p.locator(`#sheet [onclick="doDeleteTeam('${id}')"]`).click();
        await p.waitForFunction(() => TEAMS_DB.length === 0);
        await recharger(p);
        await p.waitForTimeout(300);
        eq(await p.evaluate(() => [TEAMS_DB.length, DELETED_TEAMS.length]), [0, 1], 'équipe à la corbeille après rechargement : hors des choix, récupérable');
        eq((await lireBase(p)).filter(r => r.path.startsWith('teams/')).length, 1, 'document teams/ gardé (deleted:true)');
        await p.evaluate(() => { navHome(); openBackup(); });
        await p.locator(`#trashSection [onclick="confirmPurgeTeam('${id}')"]`).click();
        await p.waitForFunction(() => !document.querySelector('#sheet .armed').disabled, null, { timeout: 4000, polling: 20 });
        await p.locator(`#sheet [onclick="doPurgeTeam('${id}')"]`).click();
        await p.waitForFunction(() => DELETED_TEAMS.length === 0);
        await recharger(p);
        await p.waitForTimeout(300);
        eq(await p.evaluate(() => [TEAMS_DB.length, DELETED_TEAMS.length]), [0, 0], 'équipe effacée pour de bon après rechargement');
        eq((await lireBase(p)).filter(r => r.path.startsWith('teams/')).length, 0, 'documents teams/ dans la base');
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    } finally { await app.close(); }
  }

  /* ---------- 4 + 5 : corbeille ; chemins sans « anonyme » ---------- */
  {
    const app = await launch(gabarit);
    const p = app.page;
    try {
      let id = null;
      await check(`${P}·4 abandon -> corbeille ; Récupérer -> historique ; effacer pour de bon -> disparu après rechargement`, async () => {
        await attendreBase(p);
        await app.startMatch({ format: '9_11', name: 'corbeille_' + gabarit });
        await app.initialPossession('Bleu');
        const m = new Model('9_11'); m.initial('Bleu');
        await jouer(app, m, 6, 5);
        id = await p.evaluate(() => S.id);
        await enregistre(p);
        await p.evaluate(() => discardMatch());
        await p.waitForFunction((i) => DELETED_MATCHES.some(x => x.id === i) && !MATCHES_DB.some(x => x.id === i), id);
        await p.evaluate(() => closeSheet());
        await recharger(p);
        await p.waitForFunction((i) => DELETED_MATCHES.some(x => x.id === i), id);
        /* Récupérer, par le bouton de la corbeille */
        await p.evaluate(() => { navHome(); navTo('backup'); });
        await p.locator(`#trashSection [onclick="doRestoreMatch('${id}')"]`).click();
        await p.waitForFunction((i) => MATCHES_DB.some(x => x.id === i) && !DELETED_MATCHES.some(x => x.id === i), id);
        eq(await p.evaluate((i) => MATCHES_DB.find(x => x.id === i).history.length, id) >= 6, true, 'actions conservées');
        /* de nouveau à la corbeille (comme depuis l'historique), puis effacement définitif par la feuille */
        await p.evaluate((i) => dbTrashMatch(i), id);
        await p.waitForFunction((i) => DELETED_MATCHES.some(x => x.id === i), id);
        await p.evaluate((i) => confirmPurgeMatch(i), id);
        await app.clickSheet(`doPurgeMatch('${id}')`);
        await p.waitForFunction((i) => !DELETED_MATCHES.some(x => x.id === i) && !MATCHES_DB.some(x => x.id === i), id);
        await recharger(p);
        await p.waitForTimeout(300);
        eq(await p.evaluate((i) => [...MATCHES_DB, ...DELETED_MATCHES].some(x => x.id === i), id), false, 'absent après rechargement');
        assert(!(await lireBase(p)).some(r => r.path.endsWith('/' + id)), 'document encore dans la base');
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
      await check(`${P}·5 aucun chemin « anonyme » ; S.authorId = identifiant local (KBLocal user.id())`, async () => {
        await app.startMatch({ format: '9_11', name: 'chemins_' + gabarit });
        await app.initialPossession('Bleu');
        const m = new Model('9_11'); m.initial('Bleu');
        await jouer(app, m, 4, 9);
        await p.evaluate(() => { const t = { id: uid('team'), name: 'T', players: [{ id: uid('p'), name: 'x' }], createdAt: Date.now(), updatedAt: Date.now() }; return dbSetTeam(t); });
        await enregistre(p);
        const uid_ = await p.evaluate(() => KBLocal.use('user').then(u => u.id()));
        eq(await p.evaluate(() => S.authorId), uid_, 'S.authorId');
        eq(await p.evaluate(() => AUTHOR_ID), uid_, 'AUTHOR_ID');
        assert(/^u_/.test(uid_), 'identifiant local : ' + uid_);
        const recs = await lireBase(p);
        assert(recs.length > 0, 'base vide');
        const mauvais = recs.filter(r => /anonyme/i.test(r.path) || /anonyme/i.test(r.parent || ''));
        eq(mauvais.map(r => r.path), [], 'chemins « anonyme »');
        const chemins = recs.map(r => r.path);
        assert(chemins.some(c => c === 'matches/' + uid_), 'fiche d’auteur matches/<id>');
        assert(chemins.some(c => c.startsWith('matches/' + uid_ + '/items/')), 'match sous items/');
        assert(chemins.some(c => c.startsWith('teams/')), 'équipe sous teams/');
        assert(chemins.every(c => /^(teams\/[^/]+|matches\/[^/]+|matches\/[^/]+\/items\/[^/]+)$/.test(c)), 'forme des chemins : ' + chemins.join(' '));
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    } finally { await app.close(); }
  }

  /* ---------- 6 : écriture en échec simulé, puis réessai ---------- */
  {
    const app = await launch(gabarit);
    const p = app.page;
    try {
      await check(`${P}·6 écriture en échec : bandeau d'erreur, copie locale, puis réessai réussi sans perte`, async () => {
        await attendreBase(p);
        await app.startMatch({ format: '9_11', name: 'echec_' + gabarit });
        await app.initialPossession('Bleu');
        const m = new Model('9_11'); m.initial('Bleu');
        await jouer(app, m, 4, 12);
        await enregistre(p);
        /* la façade rejette désormais tout set() */
        await p.evaluate(() => {
          const c0 = DB.collection.bind(DB), d0 = DB.doc.bind(DB);
          window.__orig = { c0, d0 };
          const rejet = ref => { ref.set = () => Promise.reject(new Error('échec simulé')); return ref; };
          DB.collection = (path) => { const c = c0(path); const dd = c.doc.bind(c); c.doc = (id) => rejet(dd(id)); return c; };
          DB.doc = (path) => rejet(d0(path));
        });
        await jouer(app, m, 9, 13);
        const id = await p.evaluate(() => S.id);
        const n = await p.evaluate(() => S.history.length);
        assert(n >= 7, 'actions après la panne : ' + n);
        await p.waitForFunction(() => dbSyncState === 'error', null, { timeout: 8000 });
        eq(await p.evaluate(() => document.getElementById('syncBadge').className), 'error', 'classe du badge');
        assert(await p.locator('#syncBadge').isVisible(), 'badge d’erreur visible');
        const copie = await p.evaluate((i) => { const v = localStorage.getItem('kinball_backup_' + i); return v && JSON.parse(v).match.history.length; }, id);
        eq(copie, n, 'actions dans la copie kinball_backup_<id>');
        await app.shot(path.join(dossier, `echec-${gabarit}.png`));
        /* la façade revient : réessai */
        await p.evaluate(() => { DB.collection = window.__orig.c0; DB.doc = window.__orig.d0; retryNow(); });
        await enregistre(p);
        eq(await p.evaluate((i) => localStorage.getItem('kinball_backup_' + i), id), null, 'copie retirée après réussite');
        const rec = (await lireBase(p)).find(r => r.path.endsWith('/items/' + id));
        eq(rec.data.history.length, n, 'actions dans la base après réessai');
        eq(rec.data.history, await p.evaluate(() => JSON.parse(JSON.stringify(S.history))), 'history identique');
        assert(app.errors.filter(e => !/échec simulé/.test(e)).length === 0, app.errors.join(' | '));
      });
    } finally { await app.close(); }
  }

  /* ---------- 8 : mots interdits ; 9 : sauvegarde complète ---------- */
  {
    const app = await launch(gabarit);
    const p = app.page;
    try {
      await check(`${P}·8 aucun mot « Claude », « serveur », « en ligne », « votre compte » (accueil, Sauvegarde, synchronisation, bannière)`, async () => {
        await attendreBase(p);
        const textes = {};
        textes.accueil = await p.evaluate(() => { navHome(); return document.getElementById('home').innerText; });
        textes.dbUnavailable = await p.evaluate(() => document.getElementById('dbUnavailable').textContent);
        textes.sauvegarde = await p.evaluate(() => { navTo('backup'); return document.getElementById('backup').innerText; });
        await p.evaluate(() => { navHome(); openSyncSheet(); });
        textes.sync_ok = await p.evaluate(() => document.getElementById('sheet').innerText);
        await p.evaluate(() => closeSheet());
        /* état « erreur » de la feuille de synchronisation */
        await p.evaluate(() => { setSyncState('error'); openSyncSheet(); });
        textes.sync_err = await p.evaluate(() => document.getElementById('sheet').innerText);
        await p.evaluate(() => { closeSheet(); setSyncState('ok'); });
        /* bannière de récupération : une copie locale jamais enregistrée */
        await app.startMatch({ format: '9_11', name: 'banniere_' + gabarit });
        await app.initialPossession('Bleu');
        const m = new Model('9_11'); m.initial('Bleu');
        await jouer(app, m, 3, 4);
        await enregistre(p);
        const copie = await p.evaluate(() => { const c = JSON.parse(JSON.stringify(S)); c.id = 'm_fantome'; c.matchName = 'Fantôme'; c.updatedAt = Date.now() + 5000; return c; });
        await p.evaluate((c) => { localStorage.setItem('kinball_backup_' + c.id, JSON.stringify({ savedToServer: false, at: Date.now(), match: c })); }, copie);
        await recharger(p);
        await p.waitForFunction(() => document.getElementById('backupRecovery').style.display === 'block');
        textes.banniere = await p.evaluate(() => document.getElementById('backupRecovery').innerText);
        assert(/Fantôme/.test(textes.banniere), 'bannière de récupération absente');
        textes.accueil2 = await p.evaluate(() => { navHome(); return document.body.innerText; });
        for (const [k, t] of Object.entries(textes)) {
          const mm = t.match(MOTS);
          assert(!mm, `« ${mm && mm[0]} » dans ${k} : ${t.replace(/\s+/g, ' ').slice(0, 200)}`);
        }
        await p.evaluate(() => { navHome(); });
        await app.shot(path.join(dossier, `accueil-${gabarit}.png`));
        await p.evaluate(() => { navTo('backup'); });
        await p.waitForFunction(() => /protégé/.test(document.getElementById('kbStorageStatus').textContent));
        await app.shot(path.join(dossier, `sauvegarde-${gabarit}.png`));
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    } finally { await app.close(); }
  }

  {
    const src = await launch(gabarit);
    const dst = await launch(gabarit);
    try {
      await check(`${P}·9 sauvegarde exportée puis importée dans un contexte vide : mêmes équipes, matchs, actions, corbeille`, async () => {
        const a = src.page, b = dst.page;
        await attendreBase(a); await attendreBase(b);
        for (const nom of ['Faucons', 'Aigles']) {
          await a.evaluate(([n]) => dbSetTeam({ id: uid('team'), name: n, players: [{ id: uid('p'), name: n + ' 1' }], createdAt: Date.now(), updatedAt: Date.now() }), [nom]);
        }
        const ids = [];
        for (const [nom, nb, graine] of [['export_1', 9, 3], ['export_2', 7, 8], ['export_3', 5, 11]]) {
          await src.startMatch({ format: '9_11', name: nom + '_' + gabarit });
          await src.initialPossession('Bleu');
          const m = new Model('9_11'); m.initial('Bleu');
          await jouer(src, m, nb, graine);
          await enregistre(a);
          ids.push(await a.evaluate(() => S.id));
          await a.evaluate(() => { S = freshState(); navHome(); });
        }
        await a.evaluate((i) => dbTrashMatch(i), ids[2]);
        await a.waitForFunction((i) => DELETED_MATCHES.some(x => x.id === i), ids[2]);
        const compte = (pg) => pg.evaluate(() => ({
          equipes: TEAMS_DB.length, matchs: MATCHES_DB.length, corbeille: DELETED_MATCHES.length,
          actions: [...MATCHES_DB, ...DELETED_MATCHES].reduce((n, x) => n + x.history.length, 0),
        }));
        const avant = await compte(a);
        eq([avant.equipes, avant.matchs, avant.corbeille], [2, 2, 1], 'jeu de données de départ');
        await a.evaluate(() => navTo('backup'));
        const [dl] = await Promise.all([
          a.waitForEvent('download', { timeout: 10000 }),
          a.locator('[onclick="exportFullBackup()"]').click(),
        ]);
        const fichier = path.join(os.tmpdir(), 'm03_sauvegarde_' + gabarit + '_' + Date.now() + '.json');
        await dl.saveAs(fichier);
        await b.evaluate(() => navTo('backup'));
        await b.setInputFiles('#importFileInput', fichier);
        await b.waitForFunction(() => /Import terminé/.test(document.getElementById('backupStatus').textContent), null, { timeout: 10000 });
        await b.waitForFunction((n) => TEAMS_DB.length === n.equipes && MATCHES_DB.length === n.matchs && DELETED_MATCHES.length === n.corbeille, avant, { timeout: 8000 });
        eq(await compte(b), avant, 'comptes après import');
        /* et ça survit à un rechargement du contexte vide */
        await recharger(b);
        await b.waitForFunction((n) => TEAMS_DB.length === n.equipes && MATCHES_DB.length === n.matchs && DELETED_MATCHES.length === n.corbeille, avant, { timeout: 8000 });
        eq(await compte(b), avant, 'comptes après import et rechargement');
        fs.unlinkSync(fichier);
        assert(src.errors.length === 0 && dst.errors.length === 0, src.errors.concat(dst.errors).join(' | '));
      });
    } finally { await src.close(); await dst.close(); }
  }

  /* ---------- 7 : kblocal.js introuvable ---------- */
  {
    /* copie du site SANS kblocal.js (liens symboliques vers le reste) */
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'm03_sans_kblocal_'));
    for (const f of fs.readdirSync(DEPOT)) {
      if (f === 'kblocal.js' || f === '.git') continue;
      fs.symlinkSync(path.join(DEPOT, f), path.join(tmp, f));
    }
    const app = await launch(gabarit, { html: path.join(tmp, 'index.html') });
    const p = app.page;
    try {
      await check(`${P}·7 kblocal.js introuvable : bandeau « stockage indisponible », match jouable en mémoire, aucune exception`, async () => {
        eq(await p.evaluate(() => typeof KBLocal), 'undefined', 'KBLocal absent');
        await p.waitForFunction(() => document.getElementById('dbUnavailable').style.display === 'block', null, { timeout: 5000 });
        eq(await p.evaluate(() => DB), null, 'DB null');
        await p.evaluate(() => navHome());
        assert(await p.locator('#dbUnavailable').isVisible(), 'bandeau visible sur l’accueil');
        await app.startMatch({ format: '9_11', name: 'memoire_' + gabarit });
        await app.initialPossession('Bleu');
        const m = new Model('9_11'); m.initial('Bleu');
        await jouer(app, m, 5, 6);
        assert((await app.state()).history.length >= 5, 'match jouable');
        eq(await p.evaluate(() => dbSyncState), 'error', 'badge en erreur (comportement d’aujourd’hui)');
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    } finally { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
  }

  /* ---------- 10 : Worker du % de victoire en http://127.0.0.1 ---------- */
  {
    const srv = await serveur();
    const url = `http://127.0.0.1:${srv.address().port}/index.html`;
    const app = await launch(gabarit, { url });
    const p = app.page;
    try {
      await check(`${P}·10 le Worker du % de victoire démarre (mode « worker ») en http://127.0.0.1`, async () => {
        await attendreBase(p);
        await app.startMatch({ format: '9_11', name: 'worker_' + gabarit });
        await p.evaluate(() => { WP.minK = 1; });   // premier calcul dès la première faute / balle échappée (comme C13B)
        await app.initialPossession('Bleu');
        const m = new Model('9_11'); m.initial('Bleu');
        await jouer(app, m, 8, 21);
        await p.waitForFunction(() => WP.stats.sent > 0 && WP.result, null, { timeout: 15000 });
        const r = await p.evaluate(() => ({ mode: WP.mode, fb: WP.stats.fallbacks, sent: WP.stats.sent, w: !!WP.worker }));
        eq(r.mode, 'worker', 'mode');
        eq(r.fb, 0, 'replis');
        assert(r.w, 'Worker présent');
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    } finally { await app.close(); srv.close(); }
  }
}
