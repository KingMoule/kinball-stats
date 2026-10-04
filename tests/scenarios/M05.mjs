/* M05 — Fichiers sur iPad : feuille de partage.
   Critères 1 à 6 et 9 du brief M05 (le critère 7, « git diff HEAD -- index.html vide »,
   se vérifie à la main au moment du commit ; le 8, c'est le banc complet).
   navigator.share / navigator.canShare sont remplacés par des doublures posées par
   addInitScript (Chromium sous Linux n'a pas de partage). Téléphone (tactile) : critères
   1 à 4 et 6. Tablette (Chromium sans tactile = ordinateur) : critère 5 ; la même tablette
   avec navigator.standalone simulé (iPad installé) montre la feuille « FICHIER PRÊT ». */
import fs from 'node:fs';
import path from 'node:path';
import { launch, assert, eq, rng, SORTIE } from '../lib.mjs';
import { Model, pickAction, play } from '../model.mjs';

export const gabarits = ['tablette', 'telephone'];

const NOM_MATCH = 'A/B : finale ?';
const NOM_NET = 'A_B _ finale _';          // « A/B : finale ? » nettoyé (le « ? » final devient « _ »)
const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/* Doublures posées AVANT le chargement de la page. __mode : 'ok' ou nom d'erreur, ou liste
   (un élément par appel ; le dernier se répète). Les fichiers reçus sont gardés pour relecture. */
const DOUBLURE = () => {
  window.__fichiers = []; window.__evts = []; window.__flash = []; window.__mode = 'ok'; window.__canShare = true;
  window.addEventListener('kb:fichier', e => window.__evts.push(e.detail));
  navigator.canShare = (d) => window.__canShare && !!d && Array.isArray(d.files) && d.files.length === 1;
  navigator.share = function (d) {
    window.__fichiers.push({ cles: Object.keys(d), nb: (d.files || []).length, f: d.files[0] });
    const m = Array.isArray(window.__mode) ? (window.__mode.length > 1 ? window.__mode.shift() : window.__mode[0]) : window.__mode;
    if (m === 'ok') return Promise.resolve();
    const e = new Error('x'); e.name = m; return Promise.reject(e);
  };
};
const SIMULER_IPAD = () => { try { Object.defineProperty(navigator, 'standalone', { value: false, configurable: true }); } catch (e) {} };

const attendreBase = (p) => p.waitForFunction(() => typeof DB !== 'undefined' && !!DB && typeof AUTHOR_ID !== 'undefined' && !!AUTHOR_ID, null, { timeout: 8000, polling: 20 });
const enregistre = (p) => p.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok', null, { timeout: 8000, polling: 20 });
const attendre = (ms) => new Promise(r => setTimeout(r, ms));

async function jouer(app, m, n, graine) {
  const r = rng(graine);
  let k = 0;
  while ((await app.ev(() => S.history.length)) < n && k++ < 120) {
    if (m.awaitingDuel) break;
    await play(app, m, pickAction(m, r), { manualDuel: true });
  }
}

/* Prépare une page : doublures, rechargement, match terminé de quelques actions, instruments d'essai. */
async function preparer(app, { ipad = false } = {}) {
  const p = app.page;
  await p.context().addInitScript(DOUBLURE);
  if (ipad) await p.context().addInitScript(SIMULER_IPAD);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined' && typeof KBSite !== 'undefined');
  await attendreBase(p);
  await app.startMatch({ format: '9_11', name: NOM_MATCH });
  await p.evaluate(() => { WP.minK = 1; });
  await app.initialPossession('Bleu');
  const m = new Model('9_11'); m.initial('Bleu');
  await jouer(app, m, 12, 505);
  await p.evaluate(() => finishMatchNow());
  await enregistre(p);
  await p.evaluate(() => closeSheet());
  /* Instruments d'essai : résultat de saveFile et messages éclair, sans rien changer à l'app. */
  await p.evaluate(() => {
    window.__sf = [];
    const o = saveFile; saveFile = async function (...a) { const r = await o.apply(this, a); window.__sf.push(r); return r; };
    const f = flashMessage; flashMessage = function (...a) { window.__flash.push(String(a[0])); return f.apply(this, a); };
  });
  await app.settle();
}
const reinit = (p) => p.evaluate(() => { window.__fichiers.length = 0; window.__evts.length = 0; window.__flash.length = 0; window.__sf.length = 0; window.__canShare = true; window.__mode = 'ok'; });
const aujourdhui = (p) => p.evaluate(() => todayStr());
const sheetOuverte = (p) => p.evaluate(() => document.getElementById('sheet').classList.contains('open'));
const feuillePrete = (p) => p.waitForFunction(() => { const s = document.getElementById('sheet'); return s.classList.contains('open') && !!s.querySelector('#kbFichierPret'); }, null, { timeout: 5000, polling: 20 });
/* Relit un fichier partagé : octets en base64 + métadonnées. */
const lire = (p, i) => p.evaluate(async (k) => {
  const x = window.__fichiers[k];
  const buf = new Uint8Array(await x.f.arrayBuffer());
  let s = ''; for (let j = 0; j < buf.length; j++) s += String.fromCharCode(buf[j]);
  return { cles: x.cles, nb: x.nb, nom: x.f.name, type: x.f.type, taille: x.f.size, b64: btoa(s) };
}, i);

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] M05`;
  const tablette = gabarit === 'tablette';
  const dossier = path.join(SORTIE, 'captures', 'M05');
  fs.mkdirSync(dossier, { recursive: true });
  const app = await launch(gabarit);
  const p = app.page;
  try {
    /* ---------- Téléphone : tactile, doublures ---------- */
    if (!tablette) {
      await preparer(app);
      const jour = await aujourdhui(p);
      const SIX = [
        { id: 'CSV actions', appel: () => exportCSV(), nom: NOM_NET + '_' + 'actions.csv', type: 'text/csv' },
        { id: 'CSV brut', appel: () => exportRawCSV(), nom: NOM_NET + '_brut.csv', type: 'text/csv' },
        { id: 'XLSX', appel: () => exportXLSX(), nom: NOM_NET + '.xlsx', type: TYPE_XLSX },
        { id: 'JSON match', appel: () => exportJSON(), nom: NOM_NET + '.json', type: 'application/json' },
        { id: 'sauvegarde complète', appel: () => exportFullBackup(), nom: 'kinball_sauvegarde_' + jour + '.json', type: 'application/json' },
      ];
      /* Un match terminé vieux de plus de 180 jours pour l'archivage (écriture par l'app elle-même). */
      const idVieux = await p.evaluate(async () => {
        const rec = JSON.parse(JSON.stringify(MATCHES_DB.find(m => m.id === S.id)));
        rec.id = 'm05_vieux'; rec.matchName = 'vieux match'; rec.updatedAt = Date.now() - 200 * 86400000; rec.createdAt = rec.updatedAt;
        await writeMatchDoc(rec);
        return rec.id;
      });
      await p.waitForFunction((id) => MATCHES_DB.some(m => m.id === id), idVieux, { timeout: 5000, polling: 20 });
      const nomArchive = 'kinball_archive_' + jour + '.json';

      await check(`${P}·1 les 6 appelants partagent exactement un File (nom, type, taille, contenu relu), sans téléchargement, saveFile vrai, kb:fichier {partage}`, async () => {
        let telechargements = 0; p.on('download', () => telechargements++);
        for (const c of SIX) {
          await reinit(p);
          await p.evaluate(c.appel);
          await attendre(150);
          const n = await p.evaluate(() => window.__fichiers.length);
          eq(n, 1, c.id + ' : appels de share');
          const f = await lire(p, 0);
          eq(f.cles, ['files'], c.id + ' : seulement files (ni title ni text)'); eq(f.nb, 1, c.id + ' : un seul fichier');
          eq(f.nom, c.nom, c.id + ' : nom'); eq(f.type, c.type, c.id + ' : type'); assert(f.taille > 0, c.id + ' : taille');
          eq(await p.evaluate(() => window.__sf), [true], c.id + ' : saveFile');
          eq(await p.evaluate(() => window.__evts), [{ filename: c.nom, moyen: 'partage' }], c.id + ' : kb:fichier');
          const octets = Buffer.from(f.b64, 'base64');
          if (c.id.startsWith('CSV')) {
            eq([...octets.subarray(0, 3)], [0xEF, 0xBB, 0xBF], c.id + ' : BOM');
            assert(octets.toString('utf8').split('\n').length > 5, c.id + ' : lignes');
          } else if (c.id === 'XLSX') {
            const classeur = await p.evaluate((b) => { const wb = XLSX.read(b, { type: 'base64' }); return { feuilles: wb.SheetNames, lignes: XLSX.utils.sheet_to_json(wb.Sheets['Actions'], { header: 1 }).length }; }, f.b64);
            assert(classeur.feuilles.includes('Match') && classeur.feuilles.includes('Actions'), 'feuilles : ' + classeur.feuilles.join(','));
            assert(classeur.lignes > 5, 'lignes Actions : ' + classeur.lignes);
          } else if (c.id === 'JSON match') {
            const j = JSON.parse(octets.toString('utf8'));
            eq(j.matchName, NOM_MATCH, 'JSON du match : nom'); assert(Array.isArray(j.history) && j.history.length >= 12, 'JSON : historique');
          } else {
            const j = JSON.parse(octets.toString('utf8'));
            eq(j.format, 'kinball_backup', 'format de la sauvegarde'); assert(j.matches.length >= 2, 'matchs : ' + j.matches.length);
          }
        }
        /* archivage (carte masquée en mode local : appel direct) */
        await reinit(p);
        await p.evaluate(() => confirmArchiveOldMatches(180));
        await p.waitForFunction(() => window.__sf.length === 1, null, { timeout: 8000 });
        const f = await lire(p, 0);
        eq(f.nom, nomArchive, 'archive : nom'); eq(f.type, 'application/json', 'archive : type'); eq(f.nb, 1);
        const j = JSON.parse(Buffer.from(f.b64, 'base64').toString('utf8'));
        eq(j.format, 'kinball_archive', 'archive : format'); eq(j.matches.map(m => m.id), [idVieux], 'archive : le vieux match');
        eq(await p.evaluate(() => window.__sf), [true], 'archive : saveFile');
        eq(await p.evaluate(() => window.__evts), [{ filename: nomArchive, moyen: 'partage' }], 'archive : kb:fichier');
        await p.waitForFunction((id) => !MATCHES_DB.some(m => m.id === id), idVieux, { timeout: 8000, polling: 20 });
        eq(telechargements, 0, 'téléchargements');
        assert(app.errors.length === 0, app.errors.join(' | '));
      });

      /* Remet le vieux match (il a été retiré par l'archivage réussi) pour les essais suivants. */
      const remettre = async () => {
        await p.evaluate(async () => {
          const rec = JSON.parse(JSON.stringify(MATCHES_DB.find(m => m.id === S.id)));
          rec.id = 'm05_vieux2'; rec.matchName = 'vieux match 2'; rec.updatedAt = Date.now() - 200 * 86400000; rec.createdAt = rec.updatedAt;
          await writeMatchDoc(rec);
        });
        await p.waitForFunction(() => MATCHES_DB.some(m => m.id === 'm05_vieux2'), null, { timeout: 5000, polling: 20 });
      };

      await check(`${P}·2 AbortError : saveFile faux, pas de « Export impossible », pas de kb:fichier ; archivage : « Export annulé », le match est toujours là`, async () => {
        let telechargements = 0; p.on('download', () => telechargements++);
        for (const c of SIX) {
          await reinit(p);
          await p.evaluate(() => { window.__mode = 'AbortError'; });
          await p.evaluate(c.appel);
          await attendre(120);
          eq(await p.evaluate(() => window.__sf), [false], c.id + ' : saveFile');
          eq(await p.evaluate(() => window.__flash.filter(t => /Export impossible/.test(t))), [], c.id + ' : message d\'erreur');
          eq(await p.evaluate(() => window.__evts), [], c.id + ' : kb:fichier');
          eq(await p.evaluate(() => window.__fichiers.length), 1, c.id + ' : un seul essai');
        }
        await remettre();
        await reinit(p);
        await p.evaluate(() => { window.__mode = 'AbortError'; });
        await p.evaluate(() => confirmArchiveOldMatches(180));
        await p.waitForFunction(() => window.__sf.length === 1, null, { timeout: 8000 });
        eq(await p.evaluate(() => window.__sf), [false]);
        eq(await p.evaluate(() => document.getElementById('backupStatus').textContent), 'Export annulé : rien n\'a été supprimé.');
        eq(await p.evaluate(() => MATCHES_DB.some(m => m.id === 'm05_vieux2')), true, 'le match est toujours là');
        eq(await p.evaluate(() => window.__evts), []);
        eq(await p.evaluate(() => window.__flash.filter(t => /Export impossible/.test(t))), []);
        eq(telechargements, 0, 'téléchargements');
      });

      await check(`${P}·3 NotAllowedError puis accepté : feuille « FICHIER PRÊT » (nom échappé), ENREGISTRER / PARTAGER rappelle share avec le même fichier, feuille fermée ; ANNULER : saveFile faux, sans message`, async () => {
        for (const c of SIX.filter(x => ['XLSX', 'sauvegarde complète', 'CSV actions'].includes(x.id))) {
          await reinit(p);
          await p.evaluate(() => { window.__mode = ['NotAllowedError', 'ok']; });
          const fin = p.evaluate(c.appel);
          await feuillePrete(p);
          eq(await p.evaluate(() => document.querySelector('#kbFichierPret .sheet-title').textContent), 'FICHIER PRÊT');
          eq(await p.evaluate(() => document.querySelector('#kbFichierPret .msg-center').textContent), c.nom, c.id + ' : nom affiché');
          eq(await p.evaluate(() => window.__fichiers.length), 1, c.id + ' : un seul share avant le geste');
          eq(await p.evaluate(() => S.sheetDismissable), false, 'feuille non fermable');
          await p.evaluate(() => closeSheetIfDismissable());
          eq(await sheetOuverte(p), true, 'un appui à côté ne ferme pas la feuille');
          if (c.id === 'XLSX') await app.shot(path.join(dossier, 'fichier-pret-telephone.png'));
          await app.clickSheet('KBSite.fichierPartager()');
          await fin;
          eq(await p.evaluate(() => window.__fichiers.length), 2, c.id + ' : share rappelé');
          const a = await lire(p, 0), b = await lire(p, 1);
          eq([b.nom, b.type, b.taille, b.b64 === a.b64 || c.id === 'XLSX'], [a.nom, a.type, a.taille, true], c.id + ' : même fichier');
          eq(await p.evaluate(() => window.__sf), [true]);
          eq(await p.evaluate(() => window.__evts), [{ filename: c.nom, moyen: 'partage' }]);
          eq(await sheetOuverte(p), false, 'feuille fermée');
        }
        await reinit(p);
        await p.evaluate(() => { window.__mode = 'NotAllowedError'; });
        const fin = p.evaluate(() => exportJSON());
        await feuillePrete(p);
        await app.clickSheet('KBSite.fichierAnnuler()');
        await fin;
        eq(await p.evaluate(() => window.__sf), [false], 'ANNULER : saveFile');
        eq(await p.evaluate(() => window.__flash.filter(t => /Export impossible/.test(t))), [], 'ANNULER : pas de message');
        eq(await p.evaluate(() => window.__evts), []);
        eq(await p.evaluate(() => window.__fichiers.length), 1, 'ANNULER : pas de second share');
        eq(await sheetOuverte(p), false);
        /* AbortError pendant le second essai : annulé, sans message */
        await reinit(p);
        await p.evaluate(() => { window.__mode = ['NotAllowedError', 'AbortError']; });
        const fin2 = p.evaluate(() => exportJSON());
        await feuillePrete(p);
        await app.clickSheet('KBSite.fichierPartager()');
        await fin2;
        eq(await p.evaluate(() => window.__sf), [false], 'abandon au second essai');
        eq(await p.evaluate(() => window.__flash.filter(t => /Export impossible/.test(t))), []);
        eq(await sheetOuverte(p), false);
        /* second NotAllowedError : lien de téléchargement */
        await reinit(p);
        await p.evaluate(() => { window.__mode = 'NotAllowedError'; });
        const fin3 = p.evaluate(() => exportJSON());
        await feuillePrete(p);
        const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), app.clickSheet('KBSite.fichierPartager()')]);
        await fin3;
        eq(dl.suggestedFilename(), NOM_NET + '.json');
        eq(await p.evaluate(() => window.__sf), [true]);
        eq(await p.evaluate(() => window.__evts), [{ filename: NOM_NET + '.json', moyen: 'telechargement' }]);
        eq(await sheetOuverte(p), false);
        assert(app.errors.length === 0, app.errors.join(' | '));
      });

      await check(`${P}·4 canShare faux, ou autre erreur de share : téléchargement classique, saveFile vrai, kb:fichier {telechargement}`, async () => {
        await reinit(p);
        await p.evaluate(() => { window.__canShare = false; });
        let [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.evaluate(() => exportXLSX())]);
        eq(dl.suggestedFilename(), NOM_NET + '.xlsx');
        eq(await p.evaluate(() => window.__fichiers.length), 0, 'share non appelé quand canShare est faux');
        eq(await p.evaluate(() => window.__sf), [true]);
        eq(await p.evaluate(() => window.__evts), [{ filename: NOM_NET + '.xlsx', moyen: 'telechargement' }]);
        await reinit(p);
        await p.evaluate(() => { window.__mode = 'DataError'; });
        [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.evaluate(() => exportFullBackup())]);
        eq(dl.suggestedFilename(), 'kinball_sauvegarde_' + jour + '.json');
        eq(await p.evaluate(() => window.__sf), [true]);
        eq(await p.evaluate(() => window.__evts), [{ filename: 'kinball_sauvegarde_' + jour + '.json', moyen: 'telechargement' }]);
        eq(await p.evaluate(() => window.__flash.filter(t => /Export impossible/.test(t))), []);
      });

      await check(`${P}·6 nom de match « ${NOM_MATCH} » : aucun caractère interdit dans les noms (partage et téléchargement)`, async () => {
        eq(NOM_NET, 'A_B _ finale _');
        for (const c of SIX) assert(!/[\\/:*?"<>|\u0000-\u001f]/.test(c.nom), c.nom);
        await reinit(p);
        await p.evaluate(() => exportXLSX());
        await attendre(150);
        eq((await lire(p, 0)).nom, 'A_B _ finale _.xlsx');
        await reinit(p);
        await p.evaluate(() => { window.__canShare = false; });
        const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.evaluate(() => exportCSV())]);
        eq(dl.suggestedFilename(), 'A_B _ finale __actions.csv');
      });

      await check(`${P}·9a captures du téléphone : feuille « FICHIER PRÊT » en portrait et appareil couché`, async () => {
        await reinit(p);
        await p.evaluate(() => { window.__mode = 'NotAllowedError'; });
        for (const ori of [90, -90]) {
          await p.setViewportSize({ width: 844, height: 390 });
          await p.evaluate(o => { try { Object.defineProperty(window, 'orientation', { get: () => o, configurable: true }); } catch (_) {} applyPhoneOrientation(); }, ori);
          const rot = await p.evaluate(() => uiRotation);
          assert(rot === 90 || rot === -90, 'verrou portrait actif : ' + rot);
          const fin = p.evaluate(() => exportJSON());
          await feuillePrete(p);
          await app.settle().catch(() => {});
          await app.shot(path.join(dossier, `fichier-pret-telephone-couche${ori > 0 ? '' : '-neg'}.png`));
          /* la feuille reste dans l'écran (rectangle visuel après rotation) */
          const r = await p.evaluate(() => { const b = document.getElementById('kbFichierPartager').getBoundingClientRect(); return { x: b.x, y: b.y, r: b.right, b: b.bottom, w: innerWidth, h: innerHeight }; });
          assert(r.x >= 0 && r.y >= 0 && r.r <= r.w + 1 && r.b <= r.h + 1, 'bouton dans l\'écran : ' + JSON.stringify(r));
          await app.clickSheet('KBSite.fichierAnnuler()');
          await fin;
          await p.setViewportSize({ width: 390, height: 844 });
          await p.evaluate(() => applyPhoneOrientation());
          await reinit(p);
          await p.evaluate(() => { window.__mode = 'NotAllowedError'; });
        }
      });
    }

    /* ---------- Tablette ---------- */
    if (tablette) {
      await preparer(app);
      await check(`${P}·5 appareil sans tactile (ordinateur), doublure qui accepte : téléchargement classique, share jamais appelé`, async () => {
        eq(await p.evaluate(() => ({ pts: navigator.maxTouchPoints, std: 'standalone' in navigator })), { pts: 0, std: false }, 'ordinateur : ni tactile ni standalone');
        for (const [appel, nom] of [[() => exportXLSX(), NOM_NET + '.xlsx'], [() => exportCSV(), NOM_NET + '_actions.csv'], [() => exportFullBackup(), null]]) {
          await reinit(p);
          const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 8000 }), p.evaluate(appel)]);
          if (nom) eq(dl.suggestedFilename(), nom);
          eq(await p.evaluate(() => window.__fichiers.length), 0, 'share jamais appelé');
          eq(await p.evaluate(() => window.__sf), [true]);
          const e = await p.evaluate(() => window.__evts);
          eq(e.length, 1); eq(e[0].moyen, 'telechargement');
        }
        assert(app.errors.length === 0, app.errors.join(' | '));
      });
    }
  } finally { await app.close(); }

  /* ---------- Tablette « iPad installé » (standalone simulé) : feuille « FICHIER PRÊT » ---------- */
  if (tablette) {
    const app2 = await launch('tablette');
    const q = app2.page;
    try {
      await preparer(app2, { ipad: true });
      await check(`${P}·9b tablette (iPad simulé) : feuille « FICHIER PRÊT » à l'écran ; ENREGISTRER / PARTAGER → partage, feuille fermée`, async () => {
        await reinit(q);
        await q.evaluate(() => { window.__mode = ['NotAllowedError', 'ok']; });
        const fin = q.evaluate(() => exportXLSX());
        await feuillePrete(q);
        await app2.settle().catch(() => {});
        await app2.shot(path.join(dossier, 'fichier-pret-tablette.png'));
        eq(await q.evaluate(() => document.querySelector('#kbFichierPret .msg-center').textContent), NOM_NET + '.xlsx');
        await app2.clickSheet('KBSite.fichierPartager()');
        await fin;
        eq(await q.evaluate(() => window.__fichiers.map(x => x.f.name)), [NOM_NET + '.xlsx', NOM_NET + '.xlsx']);
        eq(await q.evaluate(() => window.__evts), [{ filename: NOM_NET + '.xlsx', moyen: 'partage' }]);
        eq(await sheetOuverte(q), false);
        assert(app2.errors.length === 0, app2.errors.join(' | '));
      });
    } finally { await app2.close(); }
  }
}
