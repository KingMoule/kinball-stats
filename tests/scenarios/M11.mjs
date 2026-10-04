/* M11 — Copie locale périmée (F1 de l'audit M10) : jamais d'écrasement d'un match plus récent.
   A : copie PÉRIMÉE (moins d'actions que la base) -> pas de bandeau, 0 écriture, « Récupérer » refusé, copie supprimée.
   B : copie PLUS RÉCENTE que la base -> bandeau, récupération OK.
   C : match ABSENT de la base -> bandeau, récupération OK.
   D : copie plus ancienne qu'un match à la corbeille -> pas de bandeau.
   Les écritures de la façade sont comptées en enveloppant IDBObjectStore.put (magasin « docs »). */
import { launch, assert, eq, rng } from '../lib.mjs';
import { Model, pickAction, play } from '../model.mjs';

export const gabarits = ['tablette', 'telephone'];

const lireBase = (p) => p.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open('kinball-stats');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => {
    const db = r.result, g = db.transaction('docs', 'readonly').objectStore('docs').getAll();
    g.onsuccess = () => { db.close(); res(g.result); };
    g.onerror = () => rej(g.error);
  };
}));
const enregistre = (p) => p.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok', null, { timeout: 8000, polling: 20 });
const attendreBase = (p) => p.waitForFunction(() => typeof DB !== 'undefined' && !!DB && typeof AUTHOR_ID !== 'undefined' && !!AUTHOR_ID && typeof KBSite !== 'undefined', null, { timeout: 8000, polling: 20 });
/* Rechargement, puis attente de la décision de l'app (backupChecked) : le bandeau est alors définitif. */
const recharger = async (p) => {
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
  await attendreBase(p);
  await p.waitForFunction(() => backupChecked === true && !KBSite.baseIncomplete(), null, { timeout: 8000, polling: 20 });
  await new Promise(r => setTimeout(r, 300));
};
const bandeau = (p) => p.evaluate(() => { const b = document.getElementById('backupRecovery'); return b && b.style.display !== 'none' ? b.innerText.replace(/\n+/g, ' | ') : null; });
const copieLS = (p, id) => p.evaluate((i) => localStorage.getItem('kinball_backup_' + i), id);
const poserCopie = (p, id, c) => p.evaluate(([i, c]) => localStorage.setItem('kinball_backup_' + i, c), [id, c]);
const nActions = (p, id) => p.evaluate((i) => { const x = getMatchRecord(i) || DELETED_MATCHES.find(y => y.id === i); return x ? x.history.length : -1; }, id);
async function jouer(app, m, n, r) {
  let k = 0;
  while ((await app.ev(() => S.history.length)) < n && k++ < 80) {
    if (m.awaitingDuel) break;
    await play(app, m, pickAction(m, r), { manualDuel: true });
  }
}
const compterPuts = (p) => p.addInitScript(() => {
  window.__puts = 0;
  const o = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...a) { if (this.name === 'docs') window.__puts++; return o.apply(this, a); };
});
const copieDe = (p) => p.evaluate(() => JSON.stringify({ savedToServer: false, at: Date.now(), match: JSON.parse(JSON.stringify(S)) }));
const nouveauMatch = async (app, nom, graine) => {
  await app.startMatch({ format: '9_11', name: nom });
  await app.initialPossession('Bleu');
  const m = new Model('9_11'); m.initial('Bleu');
  return { m, r: rng(graine) };
};
const quitter = (p) => p.evaluate(() => { S = freshState(); navHome(); });

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] M11`;

  /* ---------- A : copie périmée ---------- */
  {
    const app = await launch(gabarit); const p = app.page;
    try {
      await attendreBase(p);
      await compterPuts(p);
      const { m, r } = await nouveauMatch(app, 'perime_' + gabarit, 11);
      await jouer(app, m, 10, r); await enregistre(p);
      const copie10 = await copieDe(p);
      const id = await app.ev(() => S.id);
      await jouer(app, m, 25, r); await enregistre(p);
      await p.evaluate(() => finishMatchNow()); await enregistre(p); await p.evaluate(() => closeSheet());
      const avant = await nActions(p, id);
      await quitter(p);
      await poserCopie(p, id, copie10);
      const baseAvant = JSON.stringify(await lireBase(p));
      await recharger(p);
      await check(`${P}·1 copie périmée : pas de bandeau, 0 écriture, base inchangée`, async () => {
        eq(await bandeau(p), null, 'bandeau');
        eq(await p.evaluate(() => window.__puts), 0, 'écritures');
        eq(JSON.stringify(await lireBase(p)), baseAvant, 'base');
        assert(avant > 10, 'préparation : base à ' + avant + ' actions');
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
      await check(`${P}·2 « Récupérer » forcé : refus clair, copie supprimée, base intacte`, async () => {
        await p.evaluate((i) => restoreLocalBackup(i), id);
        assert(await p.evaluate(() => /COPIE NON RÉCUPÉRÉE/.test(document.getElementById('sheet').innerText)), 'feuille de refus');
        eq(await copieLS(p, id), null, 'copie supprimée');
        eq(await p.evaluate(() => window.__puts), 0, 'écritures');
        eq(JSON.stringify(await lireBase(p)), baseAvant, 'base');
        eq(await nActions(p, id), avant, 'actions du match');
        assert(await p.evaluate((i) => S.id !== i, id), 'le match n’est pas chargé dans S');
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    } finally { await app.close(); }
  }

  /* ---------- B : copie plus récente que la base ---------- */
  {
    const app = await launch(gabarit); const p = app.page;
    try {
      await attendreBase(p);
      const { m, r } = await nouveauMatch(app, 'recent_' + gabarit, 12);
      await jouer(app, m, 10, r); await enregistre(p);
      const id = await app.ev(() => S.id);
      const base10 = await p.evaluate((i) => JSON.parse(JSON.stringify(getMatchRecord(i))), id);
      await jouer(app, m, 18, r); await enregistre(p);
      const copie18 = await copieDe(p);
      const n18 = await app.ev(() => S.history.length);
      await p.evaluate((b) => writeMatchDoc(b), base10);   // la base « en retard » : la vraie perte
      await p.waitForFunction(([i, n]) => (getMatchRecord(i) || {history: []}).history.length === n, [id, base10.history.length]);
      await quitter(p);
      await poserCopie(p, id, copie18);
      await recharger(p);
      await check(`${P}·3 copie plus récente : bandeau, récupération, la base reprend les actions`, async () => {
        const b = await bandeau(p);
        assert(b && /Un match n'avait pas été sauvegardé/.test(b), 'bandeau : ' + b);
        await p.evaluate((i) => restoreLocalBackup(i), id);
        await enregistre(p);
        eq(await nActions(p, id), n18, 'actions après récupération');
        assert(await p.evaluate(() => !/COPIE NON RÉCUPÉRÉE/.test(document.getElementById('sheet').innerText)), 'pas de refus');
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    } finally { await app.close(); }
  }

  /* ---------- C : match absent de la base ---------- */
  {
    const app = await launch(gabarit); const p = app.page;
    try {
      await attendreBase(p);
      const { m, r } = await nouveauMatch(app, 'absent_' + gabarit, 13);
      await jouer(app, m, 12, r); await enregistre(p);
      const id = await app.ev(() => S.id);
      const copie = await copieDe(p);
      const n = await app.ev(() => S.history.length);
      await p.evaluate((i) => dbDeleteMatchDoc(getMatchRecord(i)), id);
      await p.waitForFunction((i) => !getMatchRecord(i), id);
      await quitter(p);
      await poserCopie(p, id, copie);
      await recharger(p);
      await check(`${P}·4 match absent de la base : bandeau, récupération`, async () => {
        eq(await nActions(p, id), -1, 'préparation : absent');
        const b = await bandeau(p);
        assert(b && /absent du stockage/.test(b), 'bandeau : ' + b);
        await p.evaluate((i) => restoreLocalBackup(i), id);
        await enregistre(p);
        eq(await nActions(p, id), n, 'actions après récupération');
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    } finally { await app.close(); }
  }

  /* ---------- D : copie plus ancienne qu'un match à la corbeille ---------- */
  {
    const app = await launch(gabarit); const p = app.page;
    try {
      await attendreBase(p);
      const { m, r } = await nouveauMatch(app, 'corbeille_' + gabarit, 14);
      await jouer(app, m, 10, r); await enregistre(p);
      const copie10 = await copieDe(p);
      const id = await app.ev(() => S.id);
      await jouer(app, m, 16, r); await enregistre(p);
      await quitter(p);
      await p.evaluate((i) => dbTrashMatch(i), id);
      await p.waitForFunction((i) => DELETED_MATCHES.some(x => x.id === i), id);
      await poserCopie(p, id, copie10);
      await recharger(p);
      await check(`${P}·5 copie plus ancienne qu'un match à la corbeille : pas de bandeau`, async () => {
        eq(await bandeau(p), null, 'bandeau');
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    } finally { await app.close(); }
  }

  /* ---------- E : textes « serveur / connexion / en ligne » (F5), mode local seulement ---------- */
  {
    const app = await launch(gabarit); const p = app.page;
    try {
      await attendreBase(p);
      const INTERDITS = /serveur|connexion|en ligne|Claude|synchronis/i;
      await check(`${P}·6 textes du mode local : accueil, carte d'archivage, badge, feuille, échec de corbeille`, async () => {
        const t = await p.evaluate(() => ({
          sub: document.querySelector('[onclick="openBackup()"] .hc-sub').textContent,
          arch: document.querySelector('[onclick^="startArchiveOldMatches("]').closest('.backup-card').querySelector('.bc-sub').textContent,
        }));
        eq(t.sub, 'Exporter, importer', 'sous-titre');
        assert(!INTERDITS.test(t.arch) && /de plus de 180 jours/.test(t.arch), 'carte d’archivage : ' + t.arch);
        await p.evaluate(() => setSyncState('error'));
        const badge = await p.evaluate(() => document.getElementById('syncBadgeText').textContent);
        assert(!INTERDITS.test(badge), 'badge : ' + badge);
        await p.evaluate(() => openSyncSheet());
        const feuille = await p.evaluate(() => document.getElementById('sheet').innerText);
        assert(!INTERDITS.test(feuille), 'feuille : ' + feuille);
        await p.evaluate(() => { closeSheet(); setSyncState('ok'); });
        /* échec de mise à la corbeille : l'écriture est refusée */
        await app.startMatch({ format: '9_11', name: 'echec_' + gabarit });
        await app.initialPossession('Bleu');
        await p.evaluate(() => { window.__w = writeMatchDoc; window.writeMatchDoc = async () => { throw new Error('refusé'); }; });
        await p.evaluate(() => discardMatch());
        const echec = await p.evaluate(() => document.getElementById('sheet').innerText);
        assert(/STOCKAGE INACCESSIBLE/.test(echec) && !INTERDITS.test(echec), 'échec : ' + echec);
        await p.evaluate(() => { window.writeMatchDoc = window.__w; closeSheet(); });
      });
      await check(`${P}·7 hors mode local (KBSite.local faux) : textes d'origine inchangés`, async () => {
        await p.evaluate(() => { KBSite.local = false; setSyncState('error'); });
        eq(await p.evaluate(() => document.getElementById('syncBadgeText').textContent), 'Non synchronisé — touchez pour en savoir plus', 'badge');
        await p.evaluate(() => openSyncSheet());
        assert(await p.evaluate(() => /SYNCHRONISATION/.test(document.getElementById('sheet').innerText)), 'titre');
        await p.evaluate(() => { closeSheet(); KBSite.local = true; setSyncState('ok'); });
      });
    } finally { await app.close(); }
  }
}
