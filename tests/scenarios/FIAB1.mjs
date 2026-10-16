/* FIAB-1 : sauvegarde et reprise (revue du 2026-10-16 : données I1, I2, M2, M3, M5 ; saisie N1, N6, N8 ; audit #13).
   Détail : tests/docs/FIAB1.md. */
import { launch, assert, eq } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];

const sansPanne = app => app.errors.filter(e => !/panne simulée|Échec de/.test(e));
const prete = app => app.page.waitForFunction(() => typeof startMatch === 'function' && typeof DB !== 'undefined' && !!DB, null, { timeout: 8000 });
const attendreEcritures = app => app.page.waitForFunction(() => !hasUnsavedWork(), null, { timeout: 12000, polling: 20 });
const enBase = (app, id) => app.ev(i => { const r = getMatchRecord(i); return r ? r.history.length : null; }, id);
const attendreBase = (app, id, n) => app.page.waitForFunction(([i, k]) => { const r = getMatchRecord(i); return r && r.history.length >= k; }, [id, n], { timeout: 12000, polling: 20 });
const copie = (app, id) => app.ev(i => { const v = JSON.parse(localStorage.getItem('kinball_backup_' + i) || 'null'); return v ? { n: v.match.history.length, deleted: !!v.match.deleted } : null; }, id);
const titreFeuille = app => app.ev(() => document.getElementById('sheet').classList.contains('open') && document.querySelector('#sheet .sheet-title') ? document.querySelector('#sheet .sheet-title').textContent : null);

/* Doublure de writeMatchDoc : échoue tant que __panne, sinon écrit pour de bon. */
const poserDoublure = app => app.ev(() => {
  window.__vrai = window.writeMatchDoc; window.__panne = false; window.__appels = 0;
  window.writeMatchDoc = async m => {
    window.__appels++;
    if (window.__panne) throw new Error('panne simulée');
    return window.__vrai(m);
  };
});

async function nouveau(app, { name, fautes = 3 }) {
  await app.startMatch({ format: '9_11', name });
  await app.initialPossession('Bleu');
  for (let k = 0; k < fautes; k++) await app.faute({});
  return app.ev(() => S.id);
}

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] FIAB1`;

  /* ---------- 1. I2 : la première écriture réussit, la seconde échoue (scénario B) ---------- */
  await check(`${P}·1 écriture N réussie pendant que N+1 attend, puis N+1 en échec : la réussite de N n'efface ni pendingSaveId ni la copie de N+1`, async () => {
    const app = await launch(gabarit);
    try {
      await prete(app);
      const id = await nouveau(app, { name: 'ScenarioB', fautes: 2 });
      await attendreEcritures(app);
      await app.ev(() => {
        window.__vrai = window.writeMatchDoc; window.__appels = 0;
        window.__porte = new Promise(r => { window.__ouvrir = r; });
        window.writeMatchDoc = async m => {
          const k = ++window.__appels;
          if (k === 1) { await window.__porte; return window.__vrai(m); }   // N : réussit après la porte
          if (window.__panne2 !== false) throw new Error('panne simulée');     // N+1 : échoue
          return window.__vrai(m);
        };
      });
      await app.faute({});
      await app.page.waitForFunction(() => window.__appels >= 1, null, { timeout: 4000 });
      /* l'action N+1 arrive après que N a pris son état */
      await app.faute({});
      const n = await app.ev(() => S.history.length);
      await app.ev(() => window.__ouvrir());
      await app.page.waitForFunction(() => window.__appels >= 2 && dbSyncState === 'error', null, { timeout: 6000 });
      const etat = await app.ev(i => ({ pend: pendingSaveId === i, retry: !!retryTimer }), id);
      eq([etat.pend, etat.retry], [true, true], 'pendingSaveId et réessai gardés');
      eq(await copie(app, id), { n, deleted: false }, 'copie de N+1 gardée');
      await app.ev(() => { window.__panne2 = false; });
      await attendreEcritures(app);
      await attendreBase(app, id, n);
      eq(await enBase(app, id), n, 'N+1 écrit par le réessai automatique');
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  /* ---------- 2. I1 : REPRENDRE reprend la copie locale plus récente ---------- */
  await check(`${P}·2 fermeture brutale avec des actions non écrites, puis REPRENDRE : la copie locale est reprise, la première action ne l'écrase pas, rien n'est perdu au rechargement`, async () => {
    const app = await launch(gabarit);
    try {
      await prete(app);
      const id = await nouveau(app, { name: 'Brutal', fautes: 2 });
      await attendreEcritures(app);
      await poserDoublure(app);
      await app.ev(() => { window.__panne = true; });
      await app.faute({}); await app.faute({}); await app.faute({});
      const n = await app.ev(() => S.history.length);
      eq(await enBase(app, id), n - 3, 'la base a 3 actions de moins');
      eq((await copie(app, id)).n, n, 'copie locale complète');
      /* fermeture brutale */
      await app.page.reload({ waitUntil: 'domcontentloaded' });
      await prete(app);
      await app.page.waitForFunction(i => !!getMatchRecord(i), id, { timeout: 8000 });
      await app.page.waitForFunction(() => document.getElementById('backupRecovery').style.display === 'block', null, { timeout: 8000 });
      eq(await app.ev(() => document.getElementById('resumeCard').style.display), 'flex', 'carte REPRENDRE affichée en même temps');
      await app.page.locator('#resumeCard').click();
      await app.page.waitForFunction(() => currentScreen() === 'match');
      eq(await app.ev(() => [S.id, S.history.length]), [id, n], 'REPRENDRE : S est la copie locale, pas la version de la base');
      eq(await app.ev(() => document.getElementById('backupRecovery').style.display), 'none', 'bannière masquée');
      await app.settle();
      await app.faute({});
      await attendreEcritures(app);
      await attendreBase(app, id, n + 1);
      await app.page.reload({ waitUntil: 'domcontentloaded' });
      await prete(app);
      await app.page.waitForFunction(i => !!getMatchRecord(i), id, { timeout: 8000 });
      eq(await enBase(app, id), n + 1, 'après rechargement : toutes les actions, y compris celles de la copie');
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  /* ---------- 3. audit #13 : réessai pendant la consultation d'une archive ---------- */
  await check(`${P}·3 réessai pendant la consultation d'une archive : le match de saisie s'écrit, l'archive jamais`, async () => {
    const app = await launch(gabarit);
    try {
      await prete(app);
      const arch = await nouveau(app, { name: 'Archive', fautes: 2 });
      await attendreEcritures(app);
      await app.ev(() => finishMatchNow());
      await attendreEcritures(app);
      const id = await nouveau(app, { name: 'Vivant', fautes: 1 });
      await attendreEcritures(app);
      await poserDoublure(app);
      await app.ev(() => { window.__panne = true; });
      await app.faute({}); await app.faute({});
      const n = await app.ev(() => S.history.length);
      const archAvant = await app.ev(a => getMatchRecord(a).updatedAt, arch);
      await app.ev(a => { closeSheet(); viewArchivedMatchStats(a); }, arch);
      eq(await app.ev(i => [viewingArchive, LIVE_S.id], id), [true, id], 'archive consultée');
      await app.ev(() => { window.__ecrits = []; const o = window.writeMatchDoc; window.writeMatchDoc = m => { window.__ecrits.push(m.id); return o(m); }; window.__panne = false; });
      /* le minuteur de réessai tombe pendant la consultation */
      await app.page.waitForFunction(() => !hasUnsavedWork(), null, { timeout: 30000, polling: 50 });
      await attendreBase(app, id, n);
      eq(await enBase(app, id), n, 'le match de saisie est écrit pendant la consultation');
      eq(await app.ev(() => window.__ecrits.every(x => x === LIVE_S.id)), true, 'seul le match de saisie est écrit');
      eq(await app.ev(a => getMatchRecord(a).updatedAt, arch), archAvant, 'archive non réécrite');
      eq(await app.ev(a => [viewingArchive, S.id], arch), [true, arch], 'toujours en consultation');
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  /* ---------- 4. audit #13 : NOUVEAU MATCH protégé ---------- */
  await check(`${P}·4 NOUVEAU MATCH pendant une écriture en échec : refus avec message, le match n'est pas remplacé ; après l'écriture, le nouveau match démarre`, async () => {
    const app = await launch(gabarit);
    try {
      await prete(app);
      const id = await nouveau(app, { name: 'Protege', fautes: 2 });
      await attendreEcritures(app);
      await poserDoublure(app);
      await app.ev(() => { window.__panne = true; });
      await app.faute({});
      const n = await app.ev(() => S.history.length);
      await app.ev(() => { navHome(); openNewMatch(); });
      await app.page.locator('[onclick="startMatch()"]').click();
      eq(await titreFeuille(app), 'ENREGISTREMENT EN COURS', 'message de refus');
      eq(await app.ev(() => [S.id, S.history.length]), [id, n], 'S est toujours le match en attente');
      await app.ev(() => { window.__panne = false; });
      await app.clickSheet('closeSheet(); retryNow()');
      await attendreEcritures(app);
      eq(await enBase(app, id), n, 'match écrit en entier');
      await app.settle();
      await app.page.locator('[onclick="startMatch()"]').click();
      await app.page.waitForFunction(i => S.id && S.id !== i && S.awaitingInitial, id, { timeout: 4000 });
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  /* ---------- 5. M3 / N6 : « Récupérer ce match » protégé, saisie jetée ---------- */
  await check(`${P}·5 « Récupérer ce match » pendant une écriture en échec d'un autre match : refus ; ensuite, récupération sans saisie orpheline`, async () => {
    const app = await launch(gabarit);
    try {
      await prete(app);
      const idB = await nouveau(app, { name: 'Copie', fautes: 2 });
      await attendreEcritures(app);
      /* une copie locale plus fournie que la base pour B (d'une session précédente) */
      await app.ev(i => { const c = JSON.parse(JSON.stringify(getMatchRecord(i))); c.history.push(JSON.parse(JSON.stringify(c.history[c.history.length - 1]))); c.updatedAt = Date.now() + 1000; localStorage.setItem('kinball_backup_' + i, JSON.stringify({ savedToServer: false, at: Date.now(), match: c })); }, idB);
      const idA = await nouveau(app, { name: 'Ecrit', fautes: 1 });
      await attendreEcritures(app);
      await poserDoublure(app);
      await app.ev(() => { window.__panne = true; });
      await app.faute({});
      await app.ev(() => { navHome(); pending = { type: 'lancer', orphelin: true }; });
      await app.ev(i => restoreLocalBackup(i), idB);
      eq(await titreFeuille(app), 'ENREGISTREMENT EN COURS', 'refus');
      eq(await app.ev(() => S.id), idA, 'S toujours A');
      await app.ev(() => { window.__panne = false; closeSheet(); retryNow(); });
      await attendreEcritures(app);
      await app.settle();
      await app.ev(i => restoreLocalBackup(i), idB);
      eq(await app.ev(() => [S.id, pending, currentScreen()]), [idB, null, 'match'], 'B récupéré, saisie de A jetée');
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  /* ---------- 6. M2 : corbeille du match en cours depuis l'historique ---------- */
  await check(`${P}·6 mettre à la corbeille depuis l'historique le match en cours dont une écriture a échoué : il ne réapparaît pas, et il part avec toutes ses actions`, async () => {
    const app = await launch(gabarit);
    try {
      await prete(app);
      const id = await nouveau(app, { name: 'Corbeille', fautes: 2 });
      await attendreEcritures(app);
      await poserDoublure(app);
      /* les écritures du match vivant échouent, une mise à la corbeille passe (la panne est « passagère » pour elle) */
      await app.ev(() => { const o = window.writeMatchDoc; window.writeMatchDoc = async m => { if (!m.deleted && window.__panneVivant) throw new Error('panne simulée'); return o(m); }; window.__panneVivant = true; });
      await app.faute({});
      const n = await app.ev(() => S.history.length);
      await app.ev(() => navHome());
      await app.ev(i => doDeleteMatch(i), id);
      await app.ev(() => { window.__panneVivant = false; });
      await attendreEcritures(app);
      await app.page.waitForFunction(i => DELETED_MATCHES.some(m => m.id === i), id, { timeout: 8000 });
      await app.page.waitForTimeout(2500);   // un ancien réessai aurait réécrit le match vivant
      eq(await app.ev(i => [!!getMatchRecord(i), (DELETED_MATCHES.find(m => m.id === i) || {}).history.length], id), [false, n], 'à la corbeille avec toutes ses actions, pas dans l\'historique');
      eq(await app.ev(() => document.getElementById('resumeCard').style.display), 'none', 'pas de carte REPRENDRE');
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  /* ---------- 7. M5 : « Ne pas enregistrer » en échec ---------- */
  await check(`${P}·7 « Ne pas enregistrer » quand l'écriture échoue : les actions non écrites restent (match de saisie, copie locale), puis s'écrivent`, async () => {
    const app = await launch(gabarit);
    try {
      await prete(app);
      const id = await nouveau(app, { name: 'Jete', fautes: 2 });
      await attendreEcritures(app);
      await poserDoublure(app);
      await app.ev(() => { window.__panne = true; });
      await app.faute({}); await app.faute({});
      const n = await app.ev(() => S.history.length);
      await app.ev(() => discardMatch());
      await app.page.waitForFunction(() => document.getElementById('sheet').classList.contains('open') && /toutes ses actions/.test(document.getElementById('sheet').textContent), null, { timeout: 6000 });
      eq(await app.ev(i => [S.id, S.history.length, !!S.deleted, pendingSaveId === i], id), [id, n, false, true], 'le match redevient le match de saisie');
      eq(await copie(app, id), { n, deleted: false }, 'copie locale complète, non supprimée');
      await app.ev(() => { window.__panne = false; });
      await attendreEcritures(app);
      await attendreBase(app, id, n);
      eq(await app.ev(i => [getMatchRecord(i).history.length, !!getMatchRecord(i).deleted], id), [n, false], 'écrit en entier, toujours dans l\'historique');
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  /* ---------- 8. N8 : REPRENDRE sur un match tout juste terminé ---------- */
  await check(`${P}·8 match terminé dont l'écriture n'est pas confirmée : pas de carte REPRENDRE, resumeMatch n'ouvre pas le terrain`, async () => {
    const app = await launch(gabarit);
    try {
      await prete(app);
      const id = await nouveau(app, { name: 'Termine', fautes: 2 });
      await attendreEcritures(app);
      await poserDoublure(app);
      await app.ev(() => { window.__panne = true; finishMatchNow(); });
      eq(await app.ev(i => getMatchRecord(i).status, id), 'in_progress', 'la base le croit encore en cours');
      await app.ev(() => { closeSheet(); navHome(); });
      eq(await app.ev(() => [document.getElementById('resumeCard').style.display, findResumableMatch()]), ['none', null], 'pas de carte');
      await app.ev(i => { resumeMatch(); resumeMatch(i); }, id);
      eq(await app.ev(() => currentScreen()), 'home', 'reste à l\'accueil');
      await app.ev(() => { window.__panne = false; retryNow(); });
      await attendreEcritures(app);
      eq(await app.ev(i => getMatchRecord(i).status, id), 'completed', 'terminé une fois écrit');
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });
}
