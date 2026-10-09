/* C26 : garde-fous du match (revue du 2026-10-09 : R9, R7, R6, R8, R20).
   1  R9 : SUPPRIMER une équipe = feuille armée avec le nom, puis deleted:true récupérable depuis Sauvegarde (aussi après un
      rechargement) ; hors des choix ; les matchs passés gardent noms et fiche ; la sauvegarde complète la contient ;
   2  R7 : « Et maintenant ? » n'est plus refermable d'un appui à côté ; un match terminé refuse terrain (appui, glisser),
      changements, ↶, FIN PÉRIODE, TERMINER ; rien n'est écrit (historique et base inchangés) ;
   3  R6 : ↶ après une fin de période manuelle (menu TERMINER, FIN PÉRIODE du format libre, avec ou sans vainqueur) défait cette
      fin seule et ramène exactement l'état d'avant ; les lecteurs de l'historique (stats, WP, situation, +/-, export) l'ignorent ;
   4  R6 : le pointage reste cohérent (total pair hors duel) sur une suite aléatoire avec fins de période manuelles annulées ;
   5  R8 : l'identifiant d'un joueur reste attaché à sa ligne (renommer, homonymes, retrait, ajout, données existantes intactes) ;
   6  R20 : la même équipe enregistrée ne peut pas occuper deux couleurs (message, lancement bloqué) ; plus d'équipe répétée d'office.
   Contrôle négatif : KINBALL_HTML=<avant>/kinball.C26.avant.html KINBALL_ONLY=C26 node tests/run.mjs */
import fs from 'node:fs';
import { launch, assert, eq, diff, rng } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];

const PRET = app => app.page.waitForFunction(() => typeof DB !== 'undefined' && !!DB && typeof AUTHOR_ID !== 'undefined' && !!AUTHOR_ID, null, { timeout: 8000, polling: 20 });
const enregistre = app => app.page.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok', null, { timeout: 8000, polling: 20 });
const joueursDe = (pref, n = 5) => Array.from({ length: n }, (_, i) => ({ id: pref + (i + 1), name: pref.toUpperCase() + ' joueur ' + (i + 1) }));
const creerEquipe = (app, id, name, players) => app.ev(async ([i, n, p]) => { await dbSetTeam({ id: i, name: n, players: p, createdAt: 1, updatedAt: 1 }); }, [id, name, players]);
/* État de jeu sans les champs d'interface. */
const etat = app => app.ev(() => { const c = JSON.parse(JSON.stringify(S)); delete c.updatedAt; delete c.sheetDismissable; return c; });
const clic = (app, sel) => app.page.locator(sel + ':visible').first().click();
const total = s => s.scores.Bleu + s.scores.Gris + s.scores.Noir;

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] C26`;
  const tel = gabarit === 'telephone';

  /* ============ 1 : R9, équipe à la corbeille ============ */
  {
    const app = await launch(gabarit);
    const p = app.page;
    try {
      await PRET(app);
      await check(`${P}·1 R9 · SUPPRIMER une équipe : feuille armée avec le nom, deleted:true, récupérable (même après rechargement), hors des choix ; les matchs passés gardent noms et fiche ; la sauvegarde la contient`, async () => {
        await creerEquipe(app, 'team_aa', 'Faucons', joueursDe('fa'));
        await creerEquipe(app, 'team_bb', 'Aigles', joueursDe('ai'));
        await creerEquipe(app, 'team_cc', 'Hiboux', joueursDe('hi'));
        await p.waitForFunction(() => TEAMS_DB.length === 3);
        /* un match joué avec Faucons (Bleu) et Aigles (Gris), terminé */
        await app.ev(() => { navHome(); openNewMatch(); });
        await p.selectOption('#teamPickBleu', 'team_aa'); await p.selectOption('#teamPickGris', 'team_bb'); await p.selectOption('#teamPickNoir', '__free__');
        await p.fill('#teamFreeNoir', 'Libre');
        for (const slot of ['Bleu', 'Gris']) { const pref = slot === 'Bleu' ? 'fa' : 'ai'; for (let i = 1; i <= 4; i++) await p.locator(`[onclick="toggleLineupPlayer('${slot}','${pref}${i}')"]`).click(); }
        await p.locator('[onclick="startMatch()"]').click();
        await p.waitForFunction(() => S.id && S.awaitingInitial);
        await app.initialPossession('Bleu');
        await app.lancer({ target: 'Gris', caught: false, player: 'fa1' });
        await app.ev(() => finishMatchNow());
        await enregistre(app);
        await app.ev(() => { closeSheet(); navHome(); });
        /* ANNULER : l'équipe reste */
        await app.ev(() => openTeamEditor('team_aa'));
        await clic(app, '[onclick="deleteTeamEditor()"]');
        eq(await app.ev(() => document.getElementById('sheet').classList.contains('open')), true, 'feuille de confirmation');
        const txt = await app.ev(() => document.getElementById('sheet').textContent);
        assert(txt.includes('Faucons') && /5 joueurs/.test(txt) && /corbeille/i.test(txt), 'la feuille nomme l\'équipe : ' + txt);
        eq(await app.ev(() => { const b = document.querySelector('#sheet .armed'); return b ? b.disabled : null; }), true, 'bouton de confirmation armé (inactif au départ)');
        await app.clickSheet('closeSheet()');
        await app.settle();
        eq(await app.ev(() => [TEAMS_DB.length, DELETED_TEAMS.length]), [3, 0], 'ANNULER : rien ne change');
        /* confirmer */
        await clic(app, '[onclick="deleteTeamEditor()"]');
        await p.waitForFunction(() => { const b = document.querySelector('#sheet .armed'); return b && !b.disabled; }, null, { timeout: 4000, polling: 20 });
        await app.clickSheet("doDeleteTeam('team_aa')");
        await p.waitForFunction(() => DELETED_TEAMS.length === 1 && TEAMS_DB.length === 2);
        const t = await app.ev(() => DELETED_TEAMS[0]);
        eq([t.id, t.deleted, t.name, t.players.length, typeof t.deletedAt], ['team_aa', true, 'Faucons', 5, 'number'], 'équipe écrite deleted:true, alignement intact');
        assert((await app.ev(() => currentScreen())) !== 'teamEditor', 'l\'éditeur est refermé');
        /* hors des choix */
        await app.ev(() => { navHome(); openNewMatch(); });
        eq(await app.ev(() => [...document.querySelectorAll('#teamPickBleu option')].map(o => o.value)), ['team_bb', 'team_cc', '__free__'], 'choix de match');
        await app.ev(() => { navHome(); openTeamManager(); });
        eq(await p.locator('#teamListBody tr.clickable').count(), 2, '« Mes équipes »');
        await app.ev(() => { navHome(); openTeamOverview(); });
        eq(await p.locator('#teamOverviewBody tr').count() >= 1, true, 'classement');
        assert(!(await app.ev(() => document.getElementById('teamOverviewBody').textContent)).includes('Faucons'), 'classement sans l\'équipe');
        await app.ev(() => { navHome(); openTeamStatsPicker(); });
        assert(!(await app.ev(() => document.getElementById('teamStatsPickerBody').textContent)).includes('Faucons'), 'choix de fiche sans l\'équipe');
        /* matchs passés : noms et fiche gardés */
        await app.ev(() => { navHome(); openMatchHistory(); });
        const h = await app.ev(() => document.getElementById('matchHistoryBody').textContent);
        assert(h.includes('Faucons') && h.includes('Aigles'), 'l\'historique garde les noms : ' + h.slice(0, 160));
        await app.ev(() => { navHome(); openTeamAggregate('team_aa'); });
        eq(await app.ev(() => document.getElementById('appBarTitle').textContent), 'Faucons', 'fiche : le nom, pas « ? »');
        eq(await app.ev(() => computeTeamAggregate('team_aa').matchesPlayed), 1, 'fiche : le match joué');
        assert(/corbeille/.test(await app.ev(() => document.getElementById('teamStatsBody').textContent)), 'la fiche dit que l\'équipe est à la corbeille');
        eq(await p.locator('#teamStatsBody [onclick^="openTeamEditor("]').count(), 0, 'pas de « Modifier l\'alignement » pour une équipe à la corbeille');
        /* persiste après rechargement ; la corbeille la liste ; la sauvegarde complète la contient */
        await p.reload({ waitUntil: 'domcontentloaded' });
        await PRET(app);
        await p.waitForFunction(() => TEAMS_DB.length === 2 && DELETED_TEAMS.length === 1);
        await app.ev(() => { navHome(); openBackup(); });
        eq(await p.locator('#trashSection [onclick="doRestoreTeam(\'team_aa\')"]').count(), 1, 'la corbeille propose « Récupérer »');
        const [dl] = await Promise.all([p.waitForEvent('download'), app.ev(() => exportFullBackup())]);
        const sauv = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
        eq(sauv.teams.map(x => x.id).sort(), ['team_aa', 'team_bb', 'team_cc'], 'la sauvegarde complète contient l\'équipe à la corbeille');
        eq(sauv.teams.find(x => x.id === 'team_aa').deleted, true, 'marquée deleted');
        /* récupérer */
        await p.locator('#trashSection [onclick="doRestoreTeam(\'team_aa\')"]').click();
        await p.waitForFunction(() => TEAMS_DB.length === 3 && DELETED_TEAMS.length === 0);
        const r = await app.ev(() => getTeam('team_aa'));
        eq([r.deleted, r.deletedAt, r.players.map(x => x.id)], [undefined, undefined, ['fa1', 'fa2', 'fa3', 'fa4', 'fa5']], 'équipe récupérée telle quelle');
        /* effacer pour de bon : confirmation armée */
        await app.ev(() => dbTrashTeam('team_cc'));
        await p.waitForFunction(() => DELETED_TEAMS.length === 1);
        await app.ev(() => { navHome(); openBackup(); });
        await p.locator('#trashSection [onclick="confirmPurgeTeam(\'team_cc\')"]').click();
        eq(await app.ev(() => document.querySelector('#sheet .armed').disabled), true, 'effacement armé');
        await p.waitForFunction(() => !document.querySelector('#sheet .armed').disabled, null, { timeout: 4000, polling: 20 });
        await app.clickSheet("doPurgeTeam('team_cc')");
        await p.waitForFunction(() => DELETED_TEAMS.length === 0 && TEAMS_DB.length === 2);
        eq(app.errors, [], 'aucune erreur de page');
      });
    } finally { await app.close(); }
  }

  /* ============ 2 : R7, un match terminé refuse toute saisie ============ */
  {
    const app = await launch(gabarit);
    const p = app.page;
    try {
      await PRET(app);
      await check(`${P}·2 R7 · « Et maintenant ? » non refermable d'un appui à côté ; match terminé : terrain, changements, ↶, FIN PÉRIODE, TERMINER refusés, rien d'écrit`, async () => {
        await app.startMatch({ format: '9_11', withRosters: true });
        await app.initialPossession('Bleu');
        await app.lancer({ target: 'Gris', caught: false, player: 'Bleu_p1' });
        await app.lancer({ target: 'Bleu', caught: true, player: 'Gris_p1' });
        await enregistre(app);
        /* TERMINER -> TERMINER LE MATCH -> TERMINER */
        await clic(app, tel ? '.mb-finish' : '.icon-btn.finish');
        await app.clickSheet('confirmFinishMatch()');
        await p.waitForFunction(() => { const b = document.querySelector('#sheet .armed'); return b && !b.disabled; }, null, { timeout: 4000, polling: 20 });
        await app.clickSheet('finishMatchNow()');
        await p.waitForFunction(() => S.status === 'completed' && /Et maintenant/.test(document.getElementById('sheet').textContent));
        /* appui à côté de la feuille : elle reste */
        await p.waitForTimeout(500);
        await p.mouse.click(10, 10);
        await app.page.waitForTimeout(300);
        eq(await app.ev(() => document.getElementById('sheet').classList.contains('open')), true, 'la feuille reste ouverte après un appui à côté');
        eq(await app.ev(() => S.sheetDismissable), false, 'non refermable');
        /* on force la fermeture (ancien chemin) : le terrain ne répond plus */
        await app.ev(() => closeSheet());
        await app.settle();
        const H0 = await app.ev(() => S.history.length), E0 = await etat(app);
        const base0 = await app.ev(() => JSON.stringify(getMatchRecord(S.id).history.length));
        await app._tap([0.5, 0.5]);
        eq(await app.ev(() => [document.getElementById('sheet').classList.contains('open'), pending === null]), [false, true], 'appui sur le terrain : aucune saisie');
        const a = await app._pt([0.3, 0.3]), b = await app._pt([0.7, 0.7]);
        await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, { steps: 2 }); await p.mouse.up();
        eq(await app.ev(() => [document.getElementById('sheet').classList.contains('open'), pending === null, radialBusy()]), [false, true, false], 'glisser sur le terrain : aucune saisie');
        /* ↶ : bouton inactif et fonction muette */
        eq(await app.ev(() => [...document.querySelectorAll('#undoBtn,#undoBtnPhone')].filter(e => e.getClientRects().length).every(e => e.disabled)), true, 'bouton ↶ inactif');
        await app.ev(() => { undo(); undoTap(); });
        /* changements, fin de période, terminer */
        await app.ev(() => { openLineupSheet('Bleu'); });
        eq(await app.ev(() => document.getElementById('sheet').classList.contains('open')), false, 'feuille des joueurs refusée');
        await app.ev(() => { lineupSheetTeam = 'Bleu'; subOut = 'Bleu_p1'; pickSubIn('Bleu_p5'); lineupSheetTeam = null; subOut = null; });
        await app.ev(() => { openFinishMenu(); });
        eq(await app.ev(() => document.getElementById('sheet').classList.contains('open')), false, 'menu TERMINER refusé');
        await app.ev(() => { endPeriodByLeader(); endPeriodManually('Bleu'); });
        await app.settle();
        await app.page.waitForTimeout(100);
        const E1 = await etat(app);
        const d = diff(E1, E0); assert(!d, 'état du match changé : ' + d);
        eq(await app.ev(() => S.history.length), H0, 'historique inchangé');
        await enregistre(app);
        eq(await app.ev(() => getMatchRecord(S.id).history.length), JSON.parse(base0), 'base inchangée');
        /* VOIR LES STATS puis retour : le terrain reste inerte */
        await app.ev(() => openStats());
        await app.ev(() => navBack());
        await app._tap([0.4, 0.4]);
        eq(await app.ev(() => [document.getElementById('sheet').classList.contains('open'), pending === null, S.history.length]), [false, true, H0], 'après un détour par les stats');
        eq(app.errors, [], 'aucune erreur de page');
      });
    } finally { await app.close(); }
  }

  /* ============ 3 : R6, ↶ après une fin de période manuelle ============ */
  {
    await check(`${P}·3 R6 · ↶ après une fin de période manuelle (format libre, menu TERMINER, avec/sans vainqueur, pendant le message ou après) : défait cette fin seule, état d'avant exactement ; deux ↶ défont aussi l'action d'avant`, async () => {
      for (const cas of ['libre', 'menu', 'sans', 'pendant']) {
        const app = await launch(gabarit);
        try {
          await app.startMatch({ format: cas === 'libre' ? 'libre3' : '9_11' });
          await app.initialPossession('Bleu');
          await app.lancer({ target: 'Gris', caught: false });
          await app.faute({ code: 'EXT' });
          const E0 = await etat(app);
          const H0 = E0.history.length;
          const sig = x => JSON.stringify([x.scores, x.period, x.periodWins, x.possession, x.eliminated, x.duelActive, x.stopped, x.lineups]);
          if (cas === 'libre') { await clic(app, '[onclick="endPeriodByLeader()"]'); if (await app.sheetHas("endPeriodManually('')")) { const m = await app.ev(() => { const e = ATEAMS().filter(t => t !== S.eliminated); const max = Math.max(...e.map(t => S.scores[t])); return e.find(t => S.scores[t] === max); }); await app.clickSheet(`endPeriodManually('${m}')`); } }
          else if (cas === 'menu') { await app.ev(() => openFinishMenu()); await app.clickSheet("endPeriodManually('Gris')"); }
          else if (cas === 'sans') { await app.ev(() => openFinishMenu()); await app.clickSheet("endPeriodManually('')"); }
          else { await app.ev(() => openFinishMenu()); await app.clickSheet("endPeriodManually('Noir')"); }
          const fin = await app.ev(() => S.history[S.history.length - 1]);
          eq([fin.type, 'winner' in fin.details], ['fin_periode', true], `${cas} : événement fin_periode`);
          assert(cas === 'sans' ? fin.details.winner === null : typeof fin.details.winner === 'string', `${cas} : vainqueur ${fin.details.winner}`);
          if (cas === 'pendant') await app.page.waitForTimeout(40);   // ↶ pendant le message de fin de période
          else await app.settle();
          if (cas !== 'pendant') eq(await app.ev(() => S.period), 2, `${cas} : la période suivante est lancée`);
          await app.undo();
          const E1 = await etat(app);
          const d = diff(E1, E0); assert(!d, `${cas} : état d'avant exactement — ${d}`);
          eq(E1.history.length, H0, `${cas} : la dernière action est intacte`);
          eq(sig(E1), sig(E0), `${cas} : pointage, période, possession`);
          eq(await app.ev(() => periodEndTimer), null, `${cas} : minuterie arrêtée`);
          await app.page.waitForTimeout(1800);
          const d2 = diff(await etat(app), E0); assert(!d2, `${cas} : toujours l'état d'avant 2 s plus tard — ${d2}`);
          /* un deuxième ↶ défait l'action d'avant, comme avant */
          await app.undo();
          eq(await app.ev(() => S.history.length), H0 - 1, `${cas} : le ↶ suivant défait la dernière action`);
          eq(app.errors, [], `${cas} : aucune erreur de page`);
        } finally { await app.close(); }
      }
      /* historique vide : la fin de période est le premier événement ; ↶ la défait */
      {
        const app = await launch(gabarit);
        try {
          await app.startMatch({ format: '9_11' }); await app.initialPossession('Bleu');
          const E0 = await etat(app);
          await app.ev(() => openFinishMenu()); await app.clickSheet("endPeriodManually('Bleu')"); await app.settle();
          eq(await app.ev(() => [S.period, S.history.length]), [2, 1], 'période 2, un événement');
          await app.undo();
          const d = diff(await etat(app), E0); assert(!d, 'historique vide : retour à l\'état de départ — ' + d);
        } finally { await app.close(); }
      }
      /* fin automatique (seuil) : aucun événement fin_periode */
      {
        const app = await launch(gabarit);
        try {
          await app.startMatch({ format: 'duel11' }); await app.initialPossession('Bleu');
          await app.ev(() => { S.scores = { Bleu: 10, Gris: 4, Noir: 0 }; S.possession = 'Gris'; renderScoreboard(); });
          await app.faute({ code: 'APPEL' });
          await app.page.waitForTimeout(1800); await app.settle();
          eq(await app.ev(() => [S.period, S.history.map(e => e.type)]), [2, ['faute_directe']], 'fin automatique : un seul événement, pas de fin_periode');
        } finally { await app.close(); }
      }
    });

    await check(`${P}·3b R6 · les lecteurs de l'historique ignorent fin_periode : stats (toutes les sections), situation, phase, +/-, WP, compteurs d'actions, export Actions et brut`, async () => {
      const app = await launch(gabarit);
      try {
        await app.startMatch({ format: '9_11', withRosters: true });
        await app.initialPossession('Bleu');
        const j = (k) => app.ev(k => lineupOf(S.possession)[k], k);
        await app.lancer({ target: 'Gris', caught: true, player: await j(0) });
        await app.lancer({ target: 'Noir', caught: false, player: await j(1) });
        await app.faute({ code: 'EXT', player: await j(2) });
        await app.ev(() => openFinishMenu()); await app.clickSheet("endPeriodManually('Gris')"); await app.settle();
        const autre = () => app.ev(() => ATEAMS().find(t => t !== S.possession && t !== S.eliminated));
        await app.lancer({ target: await autre(), caught: true, player: await j(0) });
        await app.faute({ code: 'APPEL', player: await j(1) });
        await app.ev(() => openFinishMenu()); await app.clickSheet("endPeriodManually('')"); await app.settle();
        await app.lancer({ target: await autre(), caught: false, player: await j(3) });
        eq(await app.ev(() => S.history.filter(e => e.type === 'fin_periode').length), 2, 'deux fins de période manuelles dans l\'historique');
        /* sorties de tous les lecteurs, avec les événements puis sans eux (même S) */
        const lire = () => app.ev(() => {
          const out = {};
          for (const s of STAT_SECTIONS.filter(s => s.match)) out['stats:' + s.id] = s.match();
          out.h2h = computeH2H('all'); out.faults = computeFaults('all'); out.overall = computeOverall(); out.sit = computeSituations();
          out.k = wpCountK();
          out.sitOf = S.history.map((e, i) => situationOf(S.history, i));
          out.phase = S.history.map((e, i) => phaseOf(S.history, i, getFormat(S)));
          out.actions = S.history.filter(e => e.type === 'lancer' || e.type === 'faute_directe' || e.type === 'reprise').length;
          out.recap = matchRecapHTML();
          const rows = buildActionRows().rows.filter(r => r['Type d’action'] !== 'Fin de période'); rows.forEach(r => { delete r['No']; });
          out.rows = rows;
          const raw = buildRawRows(); out.raw = raw.rows.filter(r => r.event_type !== 'fin_periode').map(r => { const c = { ...r }; delete c.event_index; delete c.winner; return c; });
          return JSON.parse(JSON.stringify(out));
        });
        const avec = await lire();
        const total = await app.ev(() => S.history.length);
        const sans = await app.ev(() => { window.__h = S.history; S.history = S.history.filter(e => e.type !== 'fin_periode'); return S.history.length; });
        assert(sans === total - 2, 'événements retirés pour comparer');
        const sansEv = await lire();
        await app.ev(() => { S.history = window.__h; });
        for (const k of Object.keys(avec)) {
          if (k === 'sitOf' || k === 'phase') continue;   // indexés par événement : comparés ci-dessous sans les cases fin_periode
          eq(JSON.stringify(avec[k]), JSON.stringify(sansEv[k]), `lecteur « ${k} » : identique avec ou sans fin_periode`);
        }
        const types = await app.ev(() => S.history.map(e => e.type));
        const garde = (arr) => arr.filter((_, i) => types[i] !== 'fin_periode');
        eq(JSON.stringify(garde(avec.sitOf)), JSON.stringify(sansEv.sitOf), 'situation de chaque lancer');
        eq(JSON.stringify(garde(avec.phase)), JSON.stringify(sansEv.phase), 'phase de chaque action');
        /* l'export Actions a une ligne par fin de période, au même titre qu'un changement */
        const lignes = await app.ev(() => buildActionRows().rows.filter(r => r['Type d’action'] === 'Fin de période').map(r => [r['No'], r['Période'], r['Résultat'], r['Équipe attaquante'], r['Joueur']]));
        eq(lignes.length, 2, 'deux lignes « Fin de période »');
        eq(lignes[0][2], 'Période gagnée par Gris', 'vainqueur noté');
        eq(lignes[1][2], 'Période sans vainqueur', 'sans vainqueur');
        eq([lignes[0][1], lignes[1][1]], [1, 2], 'période terminée');
        eq(await app.ev(() => buildActionRows().rows.length), total, 'une ligne par événement');
        const brut = await app.ev(() => buildRawRows().rows.filter(r => r.event_type === 'fin_periode').map(r => r.winner));
        eq(brut, ['Gris', ''], 'export brut : colonne winner');
        eq(app.errors, [], 'aucune erreur de page');
      } finally { await app.close(); }
    });

    await check(`${P}·4 R6 · invariant du fuzz : total des points pair hors duel, y compris avec des fins de période manuelles annulées (graine fixe)`, async () => {
      const app = await launch(gabarit);
      try {
        await app.startMatch({ format: '9_11' }); await app.initialPossession('Bleu');
        const r = rng(777);
        let manuelles = 0, annulees = 0;
        for (let i = 0; i < 60; i++) {
          const x = r();
          const info = await app.ev(() => ({ po: S.possession, el: S.eliminated, ts: ATEAMS(), aw: S.awaitingDuelStart }));
          if (info.aw) { await app.duelStart(info.ts.find(t => t !== info.el)); continue; }
          if (x < 0.14) {
            const E0 = await etat(app);
            await app.ev(() => openFinishMenu());
            const t = info.ts.filter(t => t !== info.el)[Math.floor(r() * 2)];
            await app.clickSheet(`endPeriodManually('${t}')`);
            manuelles++;
            if (r() < 0.6) { await app.page.waitForTimeout(r() < 0.5 ? 30 : 1700); await app.settle(); await app.undo(); annulees++; const d = diff(await etat(app), E0); assert(!d, `pas ${i} : ↶ de la fin de période ≠ état d'avant — ${d}`); }
            else await app.settle();
          } else if (x < 0.30) await app.faute({ code: 'APPEL' });
          else {
            const cible = info.ts.find(t => t !== info.po && t !== info.el);
            await app.lancer({ target: cible, caught: r() < 0.5 });
          }
          const s = await etat(app);
          if (s.activeTeams.length === 3 && !s.duelActive) assert(total(s) % 2 === 0, `pas ${i} : total impair hors duel ${JSON.stringify(s.scores)}`);
          for (const t of ['Bleu', 'Gris', 'Noir']) assert(s.scores[t] >= 0, `pas ${i} : pointage négatif`);
          assert(app.errors.length === 0, app.errors.join(' | '));
        }
        assert(manuelles >= 4 && annulees >= 2, `la suite exerce des fins manuelles (${manuelles}) et des annulations (${annulees})`);
      } finally { await app.close(); }
    });
  }

  /* ============ 5 : R8, l'identifiant d'un joueur reste attaché à sa ligne ============ */
  {
    const app = await launch(gabarit);
    const p = app.page;
    try {
      await PRET(app);
      await check(`${P}·5 R8 · éditeur d'équipe : renommer garde l'identifiant, deux homonymes gardent deux identifiants, retrait et ajout ; données existantes non réécrites`, async () => {
        const noms = () => p.locator('#playerRows .player-row input').evaluateAll(l => l.map(i => i.value));
        const enregistrer = async () => {
          const id = await app.ev(() => editingTeamId), u0 = id ? await app.ev(i => getTeam(i).updatedAt, id) : null;
          await p.locator('[onclick="saveTeamEditor()"]').click();
          await p.waitForFunction(() => currentScreen() !== 'teamEditor');
          if (id) await p.waitForFunction(([i, u]) => getTeam(i).updatedAt !== u, [id, u0]);
        };
        /* création par l'interface : deux « Alex » */
        await app.ev(() => { navHome(); openTeamEditor(null); });
        await p.fill('#teamEditorName', 'Faucons');
        const rows = p.locator('#playerRows .player-row input');
        await rows.nth(0).fill('Alex'); await rows.nth(1).fill('Alex');
        await p.locator('.add-player-btn').click(); await p.locator('#playerRows .player-row input').nth(2).fill('Julie');
        await enregistrer();
        await p.waitForFunction(() => TEAMS_DB.length === 1);
        const t0 = await app.ev(() => JSON.parse(JSON.stringify(TEAMS_DB[0])));
        eq(t0.players.map(x => x.name), ['Alex', 'Alex', 'Julie'], 'joueurs créés');
        eq(new Set(t0.players.map(x => x.id)).size, 3, 'trois identifiants distincts dès la création');
        /* rouvrir et enregistrer sans rien changer : mêmes identifiants, homonymes distincts */
        await app.ev(id => openTeamEditor(id), t0.id);
        eq(await noms(), ['Alex', 'Alex', 'Julie'], 'éditeur rouvert');
        await enregistrer();
        const t1 = await app.ev(() => JSON.parse(JSON.stringify(TEAMS_DB[0])));
        eq(t1.players, t0.players, 'enregistrer sans changer : mêmes identifiants, homonymes distincts');
        /* corriger une faute de frappe : Julie -> Julie B. garde son identifiant */
        await app.ev(id => openTeamEditor(id), t0.id);
        await p.locator('#playerRows .player-row input').nth(2).fill('Julie B.');
        await enregistrer();
        const t2 = await app.ev(() => JSON.parse(JSON.stringify(TEAMS_DB[0])));
        eq(t2.players.map(x => x.name), ['Alex', 'Alex', 'Julie B.'], 'renommé');
        eq(t2.players.map(x => x.id), t0.players.map(x => x.id), 'les trois identifiants sont conservés');
        /* renommer un homonyme : l'autre garde le sien, l'ordre n'a pas d'importance */
        await app.ev(id => openTeamEditor(id), t0.id);
        await p.locator('#playerRows .player-row input').nth(1).fill('Alexandre');
        await enregistrer();
        const t3 = await app.ev(() => JSON.parse(JSON.stringify(TEAMS_DB[0])));
        eq(t3.players.map(x => x.id), t0.players.map(x => x.id), 'identifiants conservés après renommage d\'un homonyme');
        /* retirer la première ligne, ajouter une neuve : la neuve a un nouvel identifiant, les autres gardent le leur */
        await app.ev(id => openTeamEditor(id), t0.id);
        await p.locator('#playerRows .player-row .player-remove').first().click();
        await p.locator('.add-player-btn').click();
        await p.locator('#playerRows .player-row input').last().fill('Alex');
        await enregistrer();
        const t4 = await app.ev(() => JSON.parse(JSON.stringify(TEAMS_DB[0])));
        eq(t4.players.map(x => x.name), ['Alexandre', 'Julie B.', 'Alex'], 'après retrait et ajout');
        eq([t4.players[0].id, t4.players[1].id], [t0.players[1].id, t0.players[2].id], 'les lignes gardées gardent leur identifiant');
        assert(!t0.players.some(x => x.id === t4.players[2].id), 'la ligne neuve reçoit un identifiant neuf (pas celui du joueur retiré, même s\'il porte le même nom)');
        /* données déjà mélangées par l'ancien éditeur (deux joueurs, même identifiant) : l'éditeur ne les réécrit pas */
        await creerEquipe(app, 'team_dup', 'Doublons', [{ id: 'p_dup', name: 'Sam' }, { id: 'p_dup', name: 'Sam' }, { id: 'p_autre', name: 'Lou' }]);
        await p.waitForFunction(() => TEAMS_DB.length === 2);
        await app.ev(() => openTeamEditor('team_dup'));
        await enregistrer();
        eq(await app.ev(() => getTeam('team_dup').players.map(x => x.id)), ['p_dup', 'p_dup', 'p_autre'], 'identifiants existants non réécrits');
        eq(app.errors, [], 'aucune erreur de page');
      });
    } finally { await app.close(); }
  }

  /* ============ 6 : R20, la même équipe sur deux couleurs ============ */
  {
    const app = await launch(gabarit);
    const p = app.page;
    try {
      await PRET(app);
      await check(`${P}·6 R20 · Nouveau match : la même équipe enregistrée sur deux couleurs est refusée (message, lancement bloqué) ; plus d'équipe répétée d'office ; deux équipes distinctes ou un nom libre passent`, async () => {
        await creerEquipe(app, 'team_aa', 'Faucons', joueursDe('fa'));
        await p.waitForFunction(() => TEAMS_DB.length === 1);
        /* choix par défaut (aucune valeur retenue) : on vide les sélecteurs puis on redessine */
        const defauts = () => app.ev(() => { navHome(); openNewMatch(); ['Bleu', 'Gris', 'Noir'].forEach(s => { document.getElementById('teamPick' + s).selectedIndex = -1; }); renderTeamPickers(); return ['Bleu', 'Gris', 'Noir'].map(s => document.getElementById('teamPick' + s).value); });
        eq(await defauts(), ['team_aa', '__free__', '__free__'], 'une seule équipe : les autres couleurs sont en nom libre');
        await creerEquipe(app, 'team_bb', 'Aigles', joueursDe('ai'));
        await p.waitForFunction(() => TEAMS_DB.length === 2);
        eq(await defauts(), ['team_aa', 'team_bb', '__free__'], 'deux équipes : deux couleurs, la troisième libre');
        /* le doublon */
        await p.selectOption('#teamPickGris', 'team_aa');
        await p.locator('[onclick="startMatch()"]').click();
        const msg = await app.ev(() => document.getElementById('newMatchError').textContent);
        assert(/Faucons/.test(msg) && /deux couleurs/.test(msg) && /Bleu/.test(msg) && /Gris/.test(msg), 'message clair : ' + msg);
        eq(await app.ev(() => [S.id, currentScreen()]), [null, 'newMatch'], 'lancement bloqué');
        /* en format à deux équipes, la couleur exclue ne compte pas */
        await app.ev(() => { setFormatTeams(2); setFormatPreset('duel11'); setExcludedTeam('Noir'); });
        await p.locator('[onclick="startMatch()"]').click();
        assert(/deux couleurs/.test(await app.ev(() => document.getElementById('newMatchError').textContent)), 'Bleu et Gris encore en doublon en duel');
        await app.ev(() => { document.getElementById('teamPickNoir').value = 'team_aa'; });   // couleur exclue, masquée
        await p.selectOption('#teamPickGris', 'team_bb');
        await p.locator('[onclick="startMatch()"]').click();
        await p.waitForFunction(() => S.id && S.awaitingInitial);
        eq(await app.ev(() => [S.names.Bleu, S.names.Gris, S.teamIds.Bleu, S.teamIds.Gris]), ['Faucons', 'Aigles', 'team_aa', 'team_bb'], 'la couleur exclue (même équipe) ne bloque pas un duel');
        /* trois couleurs : deux équipes distinctes + nom libre passent */
        await app.ev(() => { S = freshState(); navHome(); openNewMatch(); setFormatTeams(3); setFormatPreset('9_11'); });
        await p.selectOption('#teamPickNoir', '__free__'); await p.fill('#teamFreeNoir', 'Libre');
        await p.locator('[onclick="startMatch()"]').click();
        await p.waitForFunction(() => S.id && S.awaitingInitial);
        eq(await app.ev(() => S.teamIds), { Bleu: 'team_aa', Gris: 'team_bb', Noir: null }, 'lancement normal');
        eq(app.errors, [], 'aucune erreur de page');
      });
    } finally { await app.close(); }
  }
}
