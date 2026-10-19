/* DONNEES2 — revue données M1, M4, M6, M7, M8 (M10 : tests/local/kblocal.test.mjs).
   Vérifications au niveau des fonctions de l'app, sur un match écrit directement dans la base. */
import { launch, assert, eq } from '../lib.mjs';

export const gabarits = ['tablette'];

const attendreBase = (p) => p.waitForFunction(() => typeof DB !== 'undefined' && !!DB && typeof AUTHOR_ID !== 'undefined' && !!AUTHOR_ID && typeof KBSite !== 'undefined', null, { timeout: 8000, polling: 20 });

export default async function ({ gabarit, check }) {
  const app = await launch(gabarit);
  const p = app.page;
  const P = `[${gabarit}] DONNEES2`;
  try {
    await attendreBase(p);
    /* Un match terminé de la base, avec un updatedAt connu et ancien. */
    const id = await p.evaluate(async () => {
      const m = Object.assign(freshState(), { id: uid('match'), matchName: 'D2', status: 'completed', createdAt: 1000, updatedAt: 1000 });
      m.authorId = AUTHOR_ID;
      await writeMatchDoc(m);
      return m.id;
    });
    await p.waitForFunction((i) => !!getMatchRecord(i), id, { timeout: 8000, polling: 30 });

    await check(`${P} · M1 mise à la corbeille et restauration changent updatedAt`, async () => {
      assert(await p.evaluate((i) => dbTrashMatch(i), id), 'mise à la corbeille');
      await p.waitForFunction((i) => DELETED_MATCHES.some(x => x.id === i), id, { timeout: 8000, polling: 30 });
      const t1 = await p.evaluate((i) => DELETED_MATCHES.find(x => x.id === i).updatedAt, id);
      assert(t1 > 1000, 'updatedAt de la corbeille > ancien : ' + t1);
      assert(await p.evaluate((i) => dbRestoreMatch(i), id), 'restauration');
      await p.waitForFunction((i) => !!getMatchRecord(i), id, { timeout: 8000, polling: 30 });
      const t2 = await p.evaluate((i) => getMatchRecord(i).updatedAt, id);
      assert(t2 >= t1, 'updatedAt de la restauration >= celui de la corbeille');
    });

    await check(`${P} · M4 un état d'écriture en attente n'est pas effacé par une lecture`, async () => {
      const r = await p.evaluate(() => {
        const avant = { id: pendingSaveId, etat: dbSyncState };
        pendingSaveId = 'x'; setSyncState('error'); setSyncStateLecture();
        const gardé = dbSyncState;
        pendingSaveId = null; setSyncStateLecture();
        const net = dbSyncState;
        pendingSaveId = avant.id; setSyncState(avant.etat);
        return { gardé, net };
      });
      eq(r.gardé, 'error', 'reste en erreur tant qu\'une écriture est en attente');
      eq(r.net, 'ok', 'redevient ok sans écriture en attente');
    });

    await check(`${P} · M7 format et before mal formés sont écartés`, async () => {
      const r = await p.evaluate(() => {
        const base = () => Object.assign(freshState(), { id: uid('match'), status: 'completed' });
        const f = (x) => { const m = base(); m.format = x; return raisonMatch(m); };
        const b = base(); b.history = [{ type: 'lancer', before: 'x' }];
        const ok = base();
        return { chaine: f('9_11'), vide: f({}), inconnu: f({ id: 'zzz' }), bon: f(FORMATS['9_11']), avant: raisonMatch(b), sans: raisonMatch(ok) };
      });
      eq(r.chaine, 'format invalide'); eq(r.vide, 'format invalide'); eq(r.inconnu, 'format invalide');
      eq(r.bon, null, 'format valide accepté'); eq(r.avant, 'historique mal formé'); eq(r.sans, null, 'match sans format accepté');
    });

    await check(`${P} · M6 doublon dans le fichier : le plus récent gagne`, async () => {
      const r = await p.evaluate(async () => {
        const kb = await KBSite.importDebut({});
        const a = { id: 'dup', updatedAt: 200 }, b = { id: 'dup', updatedAt: 100 };
        return { a: kb.garder('match', a), b: kb.garder('match', b) };
      });
      eq(r.a, true, 'premier retenu'); eq(r.b, false, 'doublon plus ancien ignoré');
    });

    await check(`${P} · M8 lecture en panne : la copie supprimée n'est pas marquée synchronisée`, async () => {
      const r = await p.evaluate(() => {
        const copie = Object.assign(freshState(), { id: uid('match'), deleted: true, deletedAt: Date.now(), updatedAt: Date.now() });
        writeLocalBackup(copie);
        const avant = backupChecked;
        backupChecked = false; lecturesEchouees.add('matches');
        checkLocalBackups();
        const reste = listLocalBackups().some(b => b.match.id === copie.id);
        lecturesEchouees.delete('matches'); backupChecked = avant;
        markLocalBackupSynced(copie.id);
        return reste;
      });
      assert(r, 'la copie locale supprimée est gardée');
    });
  } finally { await app.close(); }
}
