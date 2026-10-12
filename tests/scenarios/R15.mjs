/* R15 (D91) : un match sans aucune action n'a aucune valeur. Détail : tests/docs/R15.md. */
import { launch, assert, eq, avantPath } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];

const sansPanne = app => app.errors.filter(e => !/panne simulée/.test(e));
const attendreEcritures = app => app.page.waitForFunction(() => !hasUnsavedWork(), null, { timeout: 8000, polling: 20 });
const feuilleOuverte = app => app.ev(() => document.getElementById('sheet').classList.contains('open'));
/* Le vrai bouton ⌂ de l'écran de match (tablette : ruban ; téléphone : barre du bas). */
const clicHome = app => app.page.locator('[onclick="goHome()"]:visible').first().click();
const dansCorbeille = (app, id) => app.page.waitForFunction(i => DELETED_MATCHES.some(m => m.id === i), id, { timeout: 8000, polling: 20 });
const etat = (app, id) => app.ev(i => ({ actif: !!getMatchRecord(i), corbeille: DELETED_MATCHES.some(m => m.id === i), surS: S.id === i }), id);
/* Événements du moteur, tels que les poussent les fonctions de saisie (formes minimales lues par matchVide et l'export). */
const EV = {
  alignement: () => ({ type: 'alignement', before: {}, at: '2026-01-01T00:00:00.000Z', details: { team: 'Bleu', lineup_ids: 'a|b|c|d', lineup_names: 'A|B|C|D' } }),
  changement: () => ({ type: 'changement', before: {}, at: '2026-01-01T00:00:00.000Z', details: { team: 'Bleu', out: 'a', in: 'e' } }),
  fin_periode: () => ({ type: 'fin_periode', before: {}, at: '2026-01-01T00:00:00.000Z', details: { winner: null } }),
};
async function pousser(app, ...types) {
  await app.ev(([ts, E]) => { ts.forEach(t => S.history.push(E[t])); save(); }, [types, Object.fromEntries(Object.keys(EV).map(k => [k, EV[k]()]))]);
  await attendreEcritures(app);
}
async function vide(app, name = 'vide') {
  await app.startMatch({ format: '9_11', name }); await app.initialPossession('Bleu');
  return app.ev(() => S.id);
}
async function jouer1(app) {
  if (await app.awaitingDuel()) await app.duelStart('Gris');
  const info = await app.ev(() => ({ po: S.possession, el: S.eliminated, teams: ATEAMS() }));
  await app.lancer({ from: [0.3, 0.3], to: [0.7, 0.65], target: info.teams.find(t => t !== info.po && t !== info.el), caught: true });
}
/* Dépose un match directement dans la base locale (pas le match de saisie). */
const deposer = (app, o) => app.ev(async o => {
  const c = JSON.parse(JSON.stringify(Object.assign(freshState(), o)));
  c.createdAt = c.createdAt || Date.now(); c.updatedAt = c.updatedAt || Date.now();
  await writeMatchDoc(c); return c.id;
}, o);
const attendreBase = (app, ids) => app.page.waitForFunction(a => a.every(i => !!getMatchRecord(i)), ids, { timeout: 8000, polling: 20 });

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] R15`;

  await check(`${P}·1 matchVide : vrai pour history absent, [], null, sans type, alignement seul, changements seuls, les deux ; faux dès un lancer, une faute ou une fin de période`, async () => {
    const app = await launch(gabarit);
    try {
      const r = await app.ev(E => {
        const ev = k => E[k];
        const m = h => (h === undefined ? { status: 'in_progress' } : { status: 'in_progress', history: h });
        return {
          null: matchVide(null), absent: matchVide(m()), nonTableau: matchVide({ history: 'x' }), vide: matchVide(m([])),
          nul: matchVide(m([null, undefined])), sansType: matchVide(m([{ details: {} }, {}])),
          alignement: matchVide(m([ev('alignement')])), changements: matchVide(m([ev('changement'), ev('changement')])),
          les2: matchVide(m([ev('alignement'), ev('changement')])),
          lancer: matchVide(m([ev('alignement'), { type: 'lancer' }])), faute: matchVide(m([{ type: 'faute_directe' }])),
          fin: matchVide(m([ev('alignement'), ev('fin_periode')])),
          reprise: matchVide(m([{ type: 'reprise' }])),
          reprenable: [matchReprenable(m([ev('alignement')])), matchReprenable(m([{ type: 'lancer' }])), matchReprenable({ status: 'completed', history: [{ type: 'lancer' }] }), matchReprenable(null)],
        };
      }, { alignement: EV.alignement(), changement: EV.changement(), fin_periode: EV.fin_periode() });
      eq([r.null, r.absent, r.nonTableau, r.vide, r.nul, r.sansType, r.alignement, r.changements, r.les2], Array(9).fill(true), 'vides');
      eq([r.lancer, r.faute, r.fin], [false, false, false], 'avec une action');
      eq(r.reprise, true, 'une reprise de jeu seule n\'est pas une action (définition de Q13)');
      eq(r.reprenable, [false, true, false, false], 'matchReprenable : s\'appuie sur matchVide');
    } finally { await app.close(); }
  });

  await check(`${P}·2 ⌂ sur un match vide : corbeille sans feuille de confirmation, absent de l'historique, relu après rechargement`, async () => {
    const app = await launch(gabarit);
    try {
      const id = await vide(app);
      assert(!(await feuilleOuverte(app)), 'aucune feuille avant ⌂');
      await clicHome(app);
      eq(await app.ev(() => currentScreen()), 'home', 'retour à l\'accueil');
      assert(!(await feuilleOuverte(app)), 'aucune feuille « QUITTER LE MATCH EN COURS ? »');
      await dansCorbeille(app, id); await attendreEcritures(app);
      eq(await etat(app, id), { actif: false, corbeille: true, surS: true }, 'à la corbeille, pas dans l\'historique actif');
      eq(await app.ev(i => getMatchRecord(i), id), null);
      await app.ev(() => openMatchHistory());
      eq(await app.page.locator('#matchHistoryBody tbody tr').filter({ hasText: 'vide' }).count(), 0, 'absent de la liste');
      const corb = await app.ev(i => DELETED_MATCHES.find(m => m.id === i), id);
      eq([corb.deleted, typeof corb.deletedAt], [true, 'number'], 'deleted:true et deletedAt');
      /* pas de double suppression : ⌂ de nouveau ne réécrit rien */
      await app.ev(() => { window.__ecrits = 0; const o = window.writeMatchDoc; window.writeMatchDoc = m => { window.__ecrits++; return o(m); }; navHome(); navHome(); });
      await app.settle();
      eq(await app.ev(() => window.__ecrits), 0, 'aucune seconde écriture');
      /* rechargement : toujours à la corbeille */
      await app.page.reload({ waitUntil: 'domcontentloaded' });
      await app.page.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
      await dansCorbeille(app, id);
      eq(await etat(app, id), { actif: false, corbeille: true, surS: false }, 'après rechargement');
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  await check(`${P}·3 alignement seul, changements seuls, ou les deux : ⌂ met le match à la corbeille sans confirmation`, async () => {
    const app = await launch(gabarit);
    try {
      for (const [nom, types] of [['al', ['alignement']], ['ch', ['changement', 'changement']], ['les2', ['alignement', 'changement']]]) {
        const id = await vide(app, nom);
        await pousser(app, ...types);
        await clicHome(app);
        assert(!(await feuilleOuverte(app)), nom + ' : aucune feuille');
        await dansCorbeille(app, id);
        eq((await etat(app, id)).actif, false, nom + ' : absent de l\'historique actif');
      }
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  await check(`${P}·4 tous les chemins vers l'accueil : navHome, navBack (retour de pile vers home), navTab`, async () => {
    const app = await launch(gabarit);
    try {
      const chemins = {
        navHome: () => navHome(),
        navBack: () => navBack(),
        navTab: () => navTab('openMatchHistory'),
      };
      for (const [nom, f] of Object.entries(chemins)) {
        const id = await vide(app, nom);
        await app.ev(f);
        await dansCorbeille(app, id);
        eq((await etat(app, id)).actif, false, nom);
      }
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  await check(`${P}·5 match avec une action : ⌂ garde la confirmation, rien n'est supprimé ; QUITTER le laisse repris`, async () => {
    const app = await launch(gabarit);
    try {
      const id = await vide(app, 'joue');
      await jouer1(app);
      await clicHome(app);
      assert(await feuilleOuverte(app), 'feuille de confirmation');
      assert(/QUITTER LE MATCH EN COURS/.test(await app.ev(() => document.getElementById('sheet').innerHTML)), 'titre de la feuille');
      eq(await app.ev(() => currentScreen()), 'match', 'toujours sur le match');
      eq((await etat(app, id)).corbeille, false, 'rien supprimé');
      await app.clickSheet('navHome()');
      await app.settle(); await attendreEcritures(app);
      eq(await app.ev(() => currentScreen()), 'home');
      eq(await etat(app, id), { actif: true, corbeille: false, surS: true }, 'quitté, intact');
      eq(await app.ev(() => (findResumableMatch() || {}).id), id, 'repris par la bannière');
      /* une fin de période compte comme une action */
      const id2 = await vide(app, 'fin');
      await pousser(app, 'fin_periode');
      await app.ev(() => navHome()); await app.settle();
      eq((await etat(app, id2)).actif, true, 'fin de période = action : pas de corbeille');
    } finally { await app.close(); }
  });

  await check(`${P}·6 jamais un match terminé, une archive consultée, ni une saisie en cours (pending)`, async () => {
    const app = await launch(gabarit);
    try {
      /* terminé et sans action */
      const t = await vide(app, 'termine');
      await app.ev(() => { S.status = 'completed'; save(); }); await attendreEcritures(app);
      await app.ev(() => navHome()); await app.settle();
      eq((await etat(app, t)).corbeille, false, 'match terminé jamais supprimé');
      /* archive consultée : un match vide de la base, vu en consultation, puis retour à l'accueil */
      const a = await deposer(app, { id: 'archive_vide', status: 'in_progress', matchName: 'archive' });
      await attendreBase(app, [a]);
      await app.ev(() => { S = freshState(); viewArchivedMatchStats('archive_vide'); });
      eq(await app.ev(() => viewingArchive), true);
      await app.ev(() => navHome()); await app.settle();
      eq(await etat(app, a), { actif: true, corbeille: false, surS: false }, 'archive intacte');
      /* saisie d'un événement en cours */
      const p = await vide(app, 'pending');
      await app.ev(() => { beginEvent('faute_directe', { position_norm: [0.5, 0.5] }); navHome(); });
      eq((await etat(app, p)).corbeille, false, 'pending : pas de corbeille');
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  await check(`${P}·7 match vide déjà présent : non déplacé, non repris, non compté (matchs, actions, équipe), listé sans REPRENDRE ; non vide : REPRENDRE présent`, async () => {
    const app = await launch(gabarit);
    try {
      const T = 'equipe_x';
      const vid = await deposer(app, { id: 'pre_vide', status: 'in_progress', matchName: 'Pre vide', teamIds: { Bleu: T, Gris: null, Noir: null }, history: [EV.alignement(), EV.changement()], updatedAt: Date.now() });
      const jou = await deposer(app, { id: 'pre_joue', status: 'in_progress', matchName: 'Pre joue', teamIds: { Bleu: T, Gris: null, Noir: null }, history: [{ type: 'lancer', before: {}, details: {} }], updatedAt: Date.now() - 5000 });
      await attendreBase(app, [vid, jou]);
      /* la bannière ne propose que le match joué, même si le vide est plus récent */
      eq(await app.ev(() => findResumableMatch().id), 'pre_joue', 'findResumableMatch');
      await app.ev(() => { navHome(); renderStorageInfo(); });
      /* totaux */
      await app.ev(() => openBackup && openBackup());
      const info = await app.ev(() => { renderStorageInfo(); return document.getElementById('storageInfo').textContent; });
      assert(/^1 match,/.test(info) && /1 action enregistrée/.test(info), 'ligne de stockage : ' + info);
      eq(await app.ev(T => computeTeamAggregate(T).matchesPlayed, T), 1, 'matchesPlayed');
      /* historique : les deux lignes listées, un seul REPRENDRE */
      await app.ev(() => { navHome(); openMatchHistory(); });
      eq(await app.page.locator('#matchHistoryBody tbody tr').filter({ hasText: 'Pre vide' }).count(), 1, 'ligne vide listée');
      eq(await app.page.locator('#matchHistoryBody tbody tr').filter({ hasText: 'Pre vide' }).locator('.row-resume').count(), 0, 'sans REPRENDRE');
      eq(await app.page.locator('#matchHistoryBody tbody tr').filter({ hasText: 'Pre joue' }).locator('.row-resume').count(), 1, 'REPRENDRE pour le match joué');
      /* retour à l'accueil depuis plusieurs écrans : rien n'est déplacé */
      await app.ev(() => { navHome(); navTab('openMatchHistory'); navHome(); }); await app.settle();
      eq(await app.ev(() => [!!getMatchRecord('pre_vide'), DELETED_MATCHES.length]), [true, 0], 'non déplacé');
      /* bannière : seul le match joué */
      eq(await app.ev(() => { checkResume(); return document.getElementById('resumeSub').textContent.includes('Pre vide'); }), false, 'bannière sans le vide');
      /* le compteur de la liste des équipes */
      eq(await app.ev(() => matchReprenable(getMatchRecord('pre_vide'))), false);
      /* seul le vide : plus de bouton Reprendre du tout */
      await deposer(app, { id: 'pre_joue', status: 'completed', matchName: 'Pre joue', history: [{ type: 'lancer', before: {}, details: {} }] });
      await app.page.waitForFunction(() => getMatchRecord('pre_joue').status === 'completed', null, { timeout: 8000, polling: 20 });
      eq(await app.ev(() => findResumableMatch()), null, 'seul un match vide en cours : rien à reprendre');
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  await check(`${P}·8 restauration d'un match vide depuis la corbeille : il revient vide, ne compte pas, ne repart pas à la corbeille (pas de boucle)`, async () => {
    const app = await launch(gabarit);
    try {
      const id = await vide(app, 'boucle');
      await clicHome(app); await dansCorbeille(app, id); await attendreEcritures(app);
      await app.ev(i => dbRestoreMatch(i), id);
      await app.page.waitForFunction(i => !!getMatchRecord(i), id, { timeout: 8000, polling: 20 });
      eq(await etat(app, id), { actif: true, corbeille: false, surS: false }, 'restauré (le S mort est remplacé)');
      eq(await app.ev(i => [matchVide(getMatchRecord(i)), matchReprenable(getMatchRecord(i)), getMatchRecord(i).deleted], id), [true, false, undefined], 'vide, non repris');
      await app.ev(() => { navHome(); navHome(); openMatchHistory(); navHome(); }); await app.settle(); await attendreEcritures(app);
      eq(await etat(app, id), { actif: true, corbeille: false, surS: false }, 'après retours à l\'accueil : toujours là');
      /* le vide restauré ne devient pas le match de saisie par la reprise, mais s'il l'était, il repartirait : on le vérifie à part */
      await app.ev(i => { S = JSON.parse(JSON.stringify(getMatchRecord(i))); navHome(); }, id);
      await dansCorbeille(app, id);
      eq((await etat(app, id)).corbeille, true, 'en saisie et vide : de nouveau à la corbeille, une seule fois');
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  await check(`${P}·9 exports inchangés : un match joué donne les mêmes lignes qu'avant (copie d'avant si fournie) ; « tous les matchs » ignore un match sans lancer ni faute`, async () => {
    const app = await launch(gabarit);
    try {
      await vide(app, 'export');
      for (let k = 0; k < 3; k++) await jouer1(app);
      await app.abandon();
      const lire = a => a.ev(() => ({ act: buildActionRows(), brut: buildRawRows(), tout: buildAllActionRows(S), json: JSON.stringify(S, Object.keys(S).filter(k => !/^(id|createdAt|updatedAt|authorId)$/.test(k)).sort()) }));
      const r = await lire(app);
      assert(r.act.rows.length >= 3 && r.tout.length >= 3, 'lignes d\'export présentes');
      const ref = avantPath('kinball.R15.avant.html');
      if (ref) {
        const vieux = await launch(gabarit, { html: ref });
        try {
          await vide(vieux, 'export');
          for (let k = 0; k < 3; k++) await jouer1(vieux);
          await vieux.abandon();
          const o = await lire(vieux);
          const net = x => JSON.stringify(x).replace(/"(Saisi par|ID du match|Date du match|Heure de l’action|at|ts|time)":"[^"]*"/g, '"$1":"_"');
          eq(net(r.act), net(o.act), 'actions identiques'); eq(net(r.brut), net(o.brut), 'brut identique'); eq(net(r.tout), net(o.tout), '« tous les matchs » identique');
        } finally { await vieux.close(); }
      }
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  await check(`${P}·10 D-1 : mise à la corbeille non écrite (panne), rechargement : jamais proposée en « Récupérer », jamais remise en S ; la suppression est terminée ; un match joué ensuite n'est jamais écrit deleted:true`, async () => {
    const app = await launch(gabarit);
    try {
      const id = await vide(app, 'panne');
      await attendreEcritures(app);
      await app.ev(() => { window.__vrai = window.writeMatchDoc; window.writeMatchDoc = async () => { throw new Error('panne simulée'); }; });
      await clicHome(app);
      eq(await app.ev(() => S.deleted), true, 'S marqué à la corbeille');
      eq(await app.ev(i => { const b = JSON.parse(localStorage.getItem('kinball_backup_' + i)); return b && b.match.deleted; }, id), true, 'la copie locale porte deleted:true');
      eq(await app.ev(i => !!getMatchRecord(i), id), true, 'la base ne l\'a pas reçu');
      await app.page.reload({ waitUntil: 'domcontentloaded' });
      await app.page.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
      await dansCorbeille(app, id);
      eq(await app.ev(() => document.getElementById('backupRecovery').style.display !== 'block'), true, 'aucune bannière « Récupérer »');
      eq(await app.ev(i => localStorage.getItem('kinball_backup_' + i), id), null, 'copie locale marquée synchronisée');
      await app.ev(i => restoreLocalBackup(i), id);
      eq(await app.ev(() => [S.id, currentScreen()]), [null, 'home'], 'restoreLocalBackup ne remet rien en S');
      /* un match joué ensuite n'est jamais écrit avec deleted:true */
      await app.ev(() => { window.__ecrits = []; const o = window.writeMatchDoc; window.writeMatchDoc = m => { window.__ecrits.push([m.id, !!m.deleted]); return o(m); }; });
      const id2 = await vide(app, 'suite'); await jouer1(app); await attendreEcritures(app);
      const e = await app.ev(i => window.__ecrits.filter(x => x[0] === i), id2);
      assert(e.length >= 1 && e.every(x => x[1] === false), 'écritures du match joué : ' + JSON.stringify(e));
      /* latent : restauration d'un match encore S en mémoire */
      await app.ev(() => navHome());
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });
}
