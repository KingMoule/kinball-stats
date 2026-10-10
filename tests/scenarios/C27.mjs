/* C27 : stockage de l'appareil (revue du 2026-10-09 : R2, R1). Les pannes sont simulées dans Chromium, jamais observées sur un iPad.
   1  R2 : la connexion IndexedDB meurt en plein match sans prévenir (db.close(), comme le bogue iOS après une longue veille) :
      l'action suivante est enregistrée sans recharger l'app (autant d'actions en base qu'en mémoire, badge « ok », plus rien
      « non enregistré »), la copie de secours est retirée, les actions d'après aussi ;
   2  R2 : transaction refusée deux fois de suite (InvalidStateError) : le badge passe à « Non enregistré », puis RÉESSAYER
      MAINTENANT réussit dès que la panne cesse, sans recharger ; l'écriture en attente n'est pas perdue ;
   3  R1 : IndexedDB s'ouvre mais la lecture des matchs échoue : bandeau d'accueil « la lecture a échoué », copie de secours
      proposée avec l'avertissement (jamais prise pour « aucun match »), « Récupérer » explique qu'il faut attendre, aucune
      attente sans fin ; quand la lecture revient, le bandeau normal apparaît et « Récupérer » restaure le match.
   Contrôle négatif : KINBALL_HTML=<site avec kinball.C27.avant.html, kblocal.C27.avant.js, kbsite.C27.avant.js> KINBALL_ONLY=C27. */
import { launch, assert, eq } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];

/* Capture la connexion IndexedDB utilisée par la façade (la première qui ouvre une transaction). */
const ESPION = () => {
  window.__ouvertures = 0; window.__dbs = [];
  const o = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function () { window.__ouvertures++; return o.apply(this, arguments); };
  const t = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function () { if (!window.__dbs.includes(this)) window.__dbs.push(this); return t.apply(this, arguments); };
};
const enBase = app => app.ev(async () => {
  const db = await new Promise((ok, ko) => { const q = indexedDB.open('kinball-stats'); q.onsuccess = () => ok(q.result); q.onerror = ko; });
  const tout = await new Promise(ok => { const g = db.transaction(['docs']).objectStore('docs').getAll(); g.onsuccess = () => ok(g.result); });
  db.close();
  const d = tout.find(x => x.data && x.data.id === S.id);
  return d ? d.data.history.length : null;
});
const calme = (app, ms = 400) => app.page.waitForTimeout(ms);
const sync = app => app.ev(() => ({ etat: dbSyncState, nonEnregistre: hasUnsavedWork(), copie: !!localStorage.getItem('kinball_backup_' + S.id) }));

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] C27`;

  /* ============ 1 : R2, connexion morte en plein match ============ */
  {
    const app = await launch(gabarit);
    try {
      await app.page.addInitScript(ESPION);
      await app.page.reload({ waitUntil: 'domcontentloaded' });
      await app.page.waitForFunction(() => typeof startMatch === 'function' && typeof DB !== 'undefined' && !!DB);
      await check(`${P}·1 R2 · la connexion IndexedDB meurt sans prévenir en plein match : l'action suivante est enregistrée sans recharger, la copie de secours retirée, les actions d'après aussi`, async () => {
        await app.startMatch({ format: '9_11' });
        await app.initialPossession('Bleu');
        await app.faute({ code: 'APPEL' });
        await app.faute({ code: 'EXT' });
        await app.page.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok');
        eq(await enBase(app), 2, 'deux actions en base avant la panne');
        const ouv0 = await app.ev(() => window.__ouvertures);
        await app.ev(() => window.__dbs[0].close());                 // la connexion meurt, aucun événement
        await app.faute({ code: 'PENTE' });
        await app.page.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok', null, { timeout: 8000 });
        eq(await app.ev(() => S.history.length), 3, 'trois actions en mémoire');
        eq(await enBase(app), 3, 'trois actions en base : la troisième n\'est pas restée en mémoire seulement');
        const s = await sync(app);
        eq([s.etat, s.nonEnregistre, s.copie], ['ok', false, false], 'badge ok, rien en attente, copie de secours retirée');
        assert((await app.ev(() => window.__ouvertures)) > ouv0, 'une connexion neuve a été ouverte');
        await app.faute({ code: 'TROP COURT' });
        await app.faute({ code: 'OFF ILL' });
        await app.page.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok');
        eq(await enBase(app), 5, 'les actions suivantes aussi, sans recharger');
        eq(app.errors.filter(e => !/Abonnement|interrompu/.test(e)), [], 'aucune erreur de page');
      });
    } finally { await app.close(); }
  }

  /* ============ 2 : R2, transaction refusée deux fois, puis RÉESSAYER MAINTENANT ============ */
  {
    const app = await launch(gabarit);
    try {
      await app.page.addInitScript(ESPION);
      await app.page.reload({ waitUntil: 'domcontentloaded' });
      await app.page.waitForFunction(() => typeof startMatch === 'function' && typeof DB !== 'undefined' && !!DB);
      await check(`${P}·2 R2 · connexion morte et transactions refusées (InvalidStateError) tant que dure la panne : « Non enregistré », rien de perdu ; la panne cesse : RÉESSAYER MAINTENANT enregistre sans recharger (sur une connexion neuve)`, async () => {
        await app.startMatch({ format: '9_11' });
        await app.initialPossession('Bleu');
        await app.faute({ code: 'APPEL' });
        await app.page.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok');
        await app.ev(() => {
          /* La connexion en usage est morte pour de bon ; tant que dure la panne, toute connexion refuse aussi les transactions. */
          window.__panne = true; window.__morte = window.__dbs[0];
          const t = IDBDatabase.prototype.transaction;
          IDBDatabase.prototype.transaction = function () { if (this === window.__morte || window.__panne) throw new DOMException('connexion perdue (simulée)', 'InvalidStateError'); return t.apply(this, arguments); };
        });
        await app.faute({ code: 'EXT' });
        await app.page.waitForFunction(() => dbSyncState === 'error', null, { timeout: 8000 });
        let s = await sync(app);
        eq([s.etat, s.nonEnregistre, s.copie], ['error', true, true], 'badge « non enregistré », copie de secours gardée');
        await app.ev(() => { window.__panne = false; });              // la panne cesse
        await app.ev(() => retryNow());
        await app.page.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok', null, { timeout: 8000 });
        s = await sync(app);
        eq([s.etat, s.nonEnregistre, s.copie], ['ok', false, false], 'après RÉESSAYER MAINTENANT : enregistré');
        eq(await enBase(app), 2, 'les deux actions sont en base');
      });
    } finally { await app.close(); }
  }

  /* ============ 3 : R1, la base s'ouvre mais la lecture des matchs échoue ============ */
  {
    const app = await launch(gabarit);
    const p = app.page;
    try {
      await check(`${P}·3 R1 · la lecture échoue : bandeau « la lecture a échoué », copie de secours proposée avec avertissement, « Récupérer » attend sans message figé ; la lecture revient : bandeau normal, « Récupérer » restaure le match`, async () => {
        const match = { id: 'match_secours', status: 'in_progress', matchName: 'finale régionale', updatedAt: Date.now(), createdAt: Date.now(), authorId: null,
          names: { Bleu: 'A', Gris: 'B', Noir: 'C' }, teamIds: { Bleu: null, Gris: null, Noir: null }, scores: { Bleu: 3, Gris: 2, Noir: 1 }, periodWins: { Bleu: 0, Gris: 0, Noir: 0 },
          activeTeams: ['Bleu', 'Gris', 'Noir'], period: 1, possession: 'Bleu', history: [{ type: 'faute_directe', before: {}, details: { fault_type: 'APPEL', position_norm: [0.5, 0.5] } }] };
        await p.addInitScript(([m]) => {
          localStorage.setItem('kinball_backup_' + m.id, JSON.stringify({ savedToServer: false, at: Date.now(), match: m }));
          window.__panne = true;
          const o = IDBIndex.prototype.getAll;
          IDBIndex.prototype.getAll = function () { if (window.__panne) throw new DOMException('lecture impossible (simulée)', 'UnknownError'); return o.apply(this, arguments); };
        }, [match]);
        await p.reload({ waitUntil: 'domcontentloaded' });
        await p.waitForFunction(() => typeof startMatch === 'function' && typeof DB !== 'undefined' && !!DB);
        await p.waitForFunction(() => lecturesEchouees.size > 0, null, { timeout: 8000 });
        await calme(app, 300);
        const etat = await app.ev(() => ({
          bandeau: getComputedStyle(document.getElementById('backupRecovery')).display !== 'none',
          texteBandeau: document.getElementById('backupRecovery').textContent,
          alerte: getComputedStyle(document.getElementById('dbUnavailable')).display !== 'none',
          texteAlerte: document.getElementById('dbUnavailable').textContent,
          attendre: KBSite.baseIncomplete(), matchs: MATCHES_DB.length,
        }));
        eq(etat.bandeau, true, 'la copie de secours est proposée malgré la lecture en panne');
        assert(/n'a pas pu être lu/.test(etat.texteBandeau) && /finale régionale/.test(etat.texteBandeau), 'avertissement dans le bandeau : ' + etat.texteBandeau);
        eq(etat.alerte, true, 'bandeau d\'accueil : la lecture a échoué');
        assert(/lecture du stockage/.test(etat.texteAlerte), 'texte : ' + etat.texteAlerte);
        eq(etat.attendre, false, 'plus d\'attente sans fin');
        eq(etat.matchs, 0, 'aucun match lu (et personne ne l\'a pris pour « aucun match en base »)');
        /* « Récupérer » pendant la panne : message clair, rien n'est restauré */
        await app.ev(() => restoreLocalBackup('match_secours'));
        const msg = await app.ev(() => document.getElementById('sheet').textContent.replace(/\s+/g, ' '));
        assert(/n'a pas pu être lu/.test(msg) && !/encore en cours de lecture/.test(msg), 'message : ' + msg);
        eq(await app.ev(() => [S.id, localStorage.getItem('kinball_backup_match_secours') !== null]), [null, true], 'rien restauré, copie gardée');
        await app.ev(() => closeSheet());
        /* la lecture revient : l'app relit toute seule */
        await app.ev(() => { window.__panne = false; });
        await p.waitForFunction(() => lecturesEchouees.size === 0, null, { timeout: 15000 });
        await calme(app, 300);
        const apres = await app.ev(() => ({
          bandeau: getComputedStyle(document.getElementById('backupRecovery')).display !== 'none',
          texte: document.getElementById('backupRecovery').textContent,
          alerte: getComputedStyle(document.getElementById('dbUnavailable')).display !== 'none',
        }));
        eq([apres.bandeau, apres.alerte], [true, false], 'la lecture revient : bandeau d\'accueil retiré, copie toujours proposée');
        assert(!/n'a pas pu être lu/.test(apres.texte), 'plus d\'avertissement : ' + apres.texte);
        await app.ev(() => restoreLocalBackup('match_secours'));
        await p.waitForFunction(() => S.id === 'match_secours');
        eq(await app.ev(() => [S.history.length, currentScreen()]), [1, 'match'], '« Récupérer » restaure le match');
        await p.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok', null, { timeout: 8000 });
        eq(await enBase(app), 1, 'le match restauré est enregistré');
      });
    } finally { await app.close(); }
  }
}
