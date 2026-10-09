/* C25 : import et sécurité (revue du 2026-10-09 : R5, R4, R3, R22).
   1  noms hostiles (équipes enregistrées, joueurs, noms libres, nom de match) à chaque écran qui les affiche : aucune exécution
      (compteur posé par le test), aucun élément injecté, le texte reste lisible tel quel ;
   2  identifiants hostiles injectés en mémoire (sans passer par l'import) : les écrans s'affichent sans exécution et chaque
      bouton rend au gestionnaire l'identifiant d'origine, intact ;
   3  import d'un fichier piégé (les trois cas de la revue) : écarté, compte rendu, rien en base, rien d'exécuté ;
   4  import d'un fichier mal formé : « N importés, M écartés (raison) », les bons enregistrements entrent, l'Historique et
      « Mes équipes » s'affichent, aucune erreur de page ;
   5  fichiers valides d'aujourd'hui (sauvegarde v1, v2, archive) : importés exactement comme avant, aucun écart ;
   6  R3 : export « JSON — Tout le match » puis import : le match revient, identique ; un match seul mal formé est écarté ;
   7  R22 : un match importé sans auteur n'est jamais envoyé à la collecte, un match avec auteur l'est.
   Contrôle négatif : KINBALL_HTML=<avant>/kinball.C25.avant.html (et kbcollect.C25.avant.js pour 7). */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { launch, assert, eq, HTML } from '../lib.mjs';
import { demarrer } from '../../collecte/faux-serveur.mjs';

export const gabarits = ['tablette', 'telephone'];

const CPT = 'window.__x=(window.__x||0)+1';
const ent = t => [...t].map(c => '&#' + c.charCodeAt(0) + ';').join('');   // le code survit à toUpperCase() (message ATTRAPÉ / ÉCHAPPÉ)
const H1 = `<img src=x onerror="${ent(CPT)}">`;
const H2 = `"'><svg onload="${CPT}">`;
const H3 = `');${CPT};//`;
const sains = app => app.ev(() => ({ x: window.__x || 0, el: document.querySelectorAll('body [onerror], body [onload], img[src="x"]').length }));
async function sur(app, quoi) {
  app.etape = quoi;
  const r = await sains(app);
  eq(r.x, 0, `code exécuté (${quoi})`);
  eq(r.el, 0, `élément injecté (${quoi})`);
  eq(app.errors, [], `erreurs de page (${quoi})`);
}
const joueurs = (pref, nom) => [1, 2, 3, 4, 5].map(i => ({ id: pref + i, name: `${nom} J${i}` }));
const importer = async (app, obj, nom = 'sauvegarde.json') => {
  await app.ev(() => { navHome(); openBackup(); });
  await app.page.setInputFiles('#importFileInput', { name: nom, mimeType: 'application/json', buffer: Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)) });
  await app.page.waitForFunction(() => /Import terminé|Fichier invalide|Import impossible/.test(document.getElementById('backupStatus').textContent));
  return app.ev(() => document.getElementById('backupStatus').textContent);
};
const PRET = app => app.page.waitForFunction(() => typeof DB !== 'undefined' && !!DB && typeof AUTHOR_ID !== 'undefined' && !!AUTHOR_ID, null, { timeout: 8000, polling: 20 });
const enregistre = app => app.page.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok', null, { timeout: 8000, polling: 20 });

/* Un match valide minimal (forme d'un vrai match terminé), pour les fichiers d'essai. */
const matchValide = (id, extra = {}) => Object.assign({
  id, status: 'completed', matchName: 'essai ' + id, createdAt: 1760000000000, updatedAt: 1760000900000,
  names: { Bleu: 'Alpha', Gris: 'Beta', Noir: 'Gamma' }, teamIds: { Bleu: null, Gris: null, Noir: null },
  rosters: { Bleu: [], Gris: [], Noir: [] }, lineups: { Bleu: [], Gris: [], Noir: [] }, startingLineups: { Bleu: [], Gris: [], Noir: [] },
  scores: { Bleu: 1, Gris: 0, Noir: 0 }, period: 1, periodWins: { Bleu: 0, Gris: 0, Noir: 0 }, activeTeams: ['Bleu', 'Gris', 'Noir'],
  format: { id: '9_11', label: '9 / 11', teams: 3 }, authorId: 'u_00000000-aaaa-bbbb-cccc-000000000009',
  history: [{ type: 'lancer', before: {}, details: { attacker: 'Bleu', target: 'Gris', result: 'attrapé' } }],
}, extra);

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] C25`;
  const tel = gabarit === 'telephone';

  /* ============ 1 : noms hostiles à chaque écran ============ */
  {
    const app = await launch(gabarit);
    const p = app.page;
    try {
      await check(`${P}·1 noms hostiles (équipes, joueurs, noms libres, match) : accueil, Nouveau match, saisie, feuilles, stats, fiches, historique, corbeille — aucune exécution`, async () => {
        await PRET(app);
        await app.ev(async ([a, b, pa, pb]) => {
          await dbSetTeam({ id: 'team_aa', name: a, players: pa, createdAt: 1, updatedAt: 1 });
          await dbSetTeam({ id: 'team_bb', name: b, players: pb, createdAt: 1, updatedAt: 1 });
        }, [H1, H2, joueurs('pa', H1), joueurs('pb', H2)]);
        await p.waitForFunction(() => TEAMS_DB.length === 2);
        await sur(app, 'accueil');
        /* Nouveau match : équipes enregistrées + alignements choisis, Noir en nom libre piégé. */
        await app.ev(() => { navHome(); openNewMatch(); });
        await p.selectOption('#teamPickBleu', 'team_aa');
        await p.selectOption('#teamPickGris', 'team_bb');
        await p.selectOption('#teamPickNoir', '__free__');
        await p.fill('#teamFreeNoir', H3);
        await p.fill('#matchName', H1 + H2);
        for (const [slot, pref] of [['Bleu', 'pa'], ['Gris', 'pb']]) {
          for (let i = 1; i <= 4; i++) await p.locator(`[onclick="toggleLineupPlayer('${slot}','${pref}${i}')"]`).click();
        }
        await sur(app, 'Nouveau match');
        await p.locator('[onclick="startMatch()"]').click();
        await p.waitForFunction(() => S.id && S.awaitingInitial);
        await app.initialPossession('Bleu');
        await sur(app, 'terrain');
        /* messages éclair et feuilles de joueurs avec les noms piégés */
        const joueur = (k) => app.ev(k => lineupOf(S.possession)[k], k);
        await app.lancer({ target: 'Gris', caught: true, player: await joueur(0) });
        await app.lancer({ target: 'Noir', caught: false, player: await joueur(1) });
        await app.faute({ code: 'EXT', player: await joueur(2) });
        await sur(app, 'après lancers et faute');
        eq(await app.ev(() => S.names.Noir), H3, 'le nom libre est conservé tel quel');
        /* feuille des joueurs (alignement) */
        await app.ev(() => openLineupSheet('Bleu'));
        await sur(app, 'feuille des joueurs');
        await app.ev(() => closeLineupSheet());
        /* Toutes les sections de statistiques du match, puis zones, fautes, heat map */
        await app.ev(() => { openStats(); });
        for (const id of await app.ev(() => STAT_SECTIONS.filter(s => s.match).map(s => s.id))) {
          await app.ev(i => setStatTab('match', i), id);
          await sur(app, 'stats ' + id);
        }
        await app.ev(() => { setStatTab('match', 'h2h'); });
        const parcourir = async (tab, sel, quoi) => {
          await app.ev(t => setStatTab('match', t), tab);
          const n = await p.locator(sel).count();
          assert(n > 0, `éléments cliquables dans « ${tab} »`);
          for (let i = 0; i < n; i++) {
            await app.ev(t => setStatTab('match', t), tab);
            await p.locator(sel).nth(i).evaluate(e => e.click()); await sur(app, quoi);
            await app.ev(() => { navBack(); if (currentScreen() !== 'stats') openStats(); });
          }
        };
        await parcourir('h2h', '#statsBody [onclick^="openZoneDetail("]', 'zones détaillées');
        await parcourir('fautes', '#statsBody tr.clickable', 'détail des fautes');
        await parcourir('overall', '#statsBody tr.clickable', 'zones d\'une équipe');
        /* Fin du match : feuille « Et maintenant ? », puis Historique, Classement, fiches, corbeille */
        await app.ev(() => navBack());
        await app.ev(() => finishMatchNow());
        await sur(app, 'fin de match');
        await enregistre(app);
        await app.ev(() => { closeSheet(); navHome(); });
        await sur(app, 'accueil après match');
        for (const [fn, nom] of [['openTeamManager', 'Mes équipes'], ['openMatchHistory', 'Historique'], ['openTeamOverview', 'Classement'], ['openTeamStatsPicker', 'Statistiques d\'une équipe']]) {
          await app.ev(f => { navHome(); window[f](); }, fn);
          await sur(app, nom);
        }
        /* fiches cumulées (équipe enregistrée A, puis B qui a lancé sur le nom libre piégé) : toutes les sections, puis chaque
           ligne d'adversaire (clé « libre:<nom> » dans l'onclick) */
        for (const tid of ['team_aa', 'team_bb']) {
          await app.ev(t => { navHome(); openTeamAggregate(t); }, tid);
          await sur(app, 'fiche d\'équipe');
          for (const id of await app.ev(() => STAT_SECTIONS.filter(s => s.team).map(s => s.id))) {
            await app.ev(i => setStatTab('team', i), id);
            await sur(app, 'fiche ' + id);
          }
          await app.ev(() => setStatTab('team', 'h2h'));
          const n = await p.locator('#teamStatsBody tr[onclick^="openTeamOppZoneDetail("]').count();
          assert(n >= 1, 'lignes d\'adversaires cliquables dans le head-to-head de ' + tid);
          const titres = [];
          for (let i = 0; i < n; i++) {
            await app.ev(() => { if (currentScreen() !== 'teamStats') openTeamAggregate(currentAggTeamId); setStatTab('team', 'h2h'); });
            await p.locator('#teamStatsBody tr[onclick^="openTeamOppZoneDetail("]').nth(i).evaluate(e => e.click());
            await sur(app, 'zones contre un adversaire');
            eq(await app.ev(() => currentScreen()), 'zoneDetail', 'l\'écran des zones s\'ouvre pour l\'adversaire');
            titres.push(await app.ev(() => document.getElementById('appBarTitle').textContent));
            await app.ev(() => navBack());
          }
          if (tid === 'team_bb') assert(titres.includes(H2 + ' ↔ ' + H3), 'titre de l\'écran des zones : le nom libre piégé, tel quel : ' + JSON.stringify(titres));
          if (tid === 'team_bb') assert(await p.locator('#teamStatsBody tr[onclick*="libre"]').count() >= 1, 'clé d\'adversaire « libre: » présente pour le nom libre');
        }
        /* corbeille : le match piégé y passe puis revient */
        const id = await app.ev(() => S.id);
        await app.ev(i => { navHome(); dbTrashMatch(i); }, id);
        await p.waitForFunction(i => DELETED_MATCHES.some(x => x.id === i), id);
        await app.ev(() => { navHome(); openBackup(); });
        await app.ev(() => renderTrash());
        await sur(app, 'corbeille');
        eq(await p.locator('#trashSection tr').count() > 1, true, 'la corbeille liste le match piégé');
        await app.ev(i => { dbRestoreMatch(i); }, id);
        await p.waitForFunction(i => !!getMatchRecord(i), id);
        /* le texte piégé reste lisible tel quel quelque part (échappé, pas supprimé) */
        await app.ev(() => { navHome(); openMatchHistory(); });
        const texte = await app.ev(() => document.getElementById('matchHistoryBody').innerText);
        assert(texte.includes(H1 + H2), 'le nom du match piégé s\'affiche tel quel, en texte : ' + texte.slice(0, 120));
        await sur(app, 'fin');
      });
    } finally { await app.close(); }
  }

  /* ============ 2 : identifiants hostiles injectés (défense à l'affichage, sans passer par l'import) ============ */
  {
    const app = await launch(gabarit);
    const p = app.page;
    try {
      await check(`${P}·2 identifiants hostiles déjà en mémoire : écrans sans exécution, et chaque bouton rend l'identifiant d'origine`, async () => {
        await PRET(app);
        const ID_E = `e');${CPT};//`, ID_J = `j"><img src=x onerror="${CPT}">`, ID_M = `m');${CPT};('`, ID_E2 = `e2"><svg onload="${CPT}">`;
        await p.waitForTimeout(400);   // les premiers instantanés de la base sont passés : on fige les reconstructions
        await app.ev(([ide, idj, idm, ide2]) => {
          window.__args = [];
          window.rebuildMatches = () => {};
          for (const f of ['openTeamAggregate', 'openTeamEditor', 'viewArchivedMatchStats', 'confirmDeleteMatch', 'doRestoreMatch', 'confirmPurgeMatch', 'toggleLineupPlayer', 'openTeamOppZoneDetail']) {
            window[f] = (...a) => { window.__args.push([f, ...a]); };
          }
          TEAMS_DB.push({ id: ide, name: 'Équipe E', updatedAt: 1, players: [1, 2, 3, 4].map(i => ({ id: i === 1 ? idj : 'x' + i, name: 'J' + i })) });
          TEAMS_DB.push({ id: ide2, name: 'Équipe E2', updatedAt: 1, players: [] });
          const m = {
            id: idm, status: 'completed', matchName: 'M', createdAt: 5, updatedAt: 5, names: { Bleu: 'A', Gris: 'B', Noir: 'C' },
            teamIds: { Bleu: ide, Gris: ide2, Noir: null }, scores: { Bleu: 1, Gris: 0, Noir: 0 }, periodWins: { Bleu: 0, Gris: 0, Noir: 0 }, history: [], authorId: null,
          };
          MATCHES_DB.push(m);
          DELETED_MATCHES.push(Object.assign({}, m, { id: idm + 'd', deleted: true, deletedAt: 9 }));
        }, [ID_E, ID_J, ID_M, ID_E2]);
        await app.ev(() => { renderTeamPickers(); navHome(); });
        await sur(app, 'accueil');
        eq(await app.ev(() => [...document.querySelectorAll('#teamPickBleu option')].map(o => o.value).slice(0, 2)), [ID_E, ID_E2], 'valeurs des <option> intactes');
        /* alignement : sélectionner l'équipe puis cliquer le joueur hostile */
        await app.ev(() => { openNewMatch(); });
        await p.selectOption('#teamPickBleu', ID_E);
        await sur(app, 'alignement');
        await p.locator('#lineupBleu .adv-player-btn').first().click();
        eq(await app.ev(() => window.__args.slice(-1)[0]), ['toggleLineupPlayer', 'Bleu', ID_J], 'identifiant de joueur transmis tel quel');
        /* Mes équipes */
        await app.ev(() => { navHome(); openTeamManager(); });
        await sur(app, 'Mes équipes');
        await p.locator('#teamListBody tr.clickable').first().click();
        eq(await app.ev(() => window.__args.slice(-1)[0]), ['openTeamEditor', ID_E], 'ligne d\'équipe');
        /* Statistiques d'une équipe (cartes) */
        await app.ev(() => { navHome(); openTeamStatsPicker(); });
        await sur(app, 'choix d\'équipe');
        await p.locator('#teamStatsPickerBody .team-card').first().click();
        eq(await app.ev(() => window.__args.slice(-1)[0]), ['openTeamAggregate', ID_E], 'carte d\'équipe');
        /* Historique : ligne, équipes liées, suppression */
        await app.ev(() => { navHome(); openMatchHistory(); });
        await sur(app, 'Historique');
        await p.locator('#matchHistoryBody tr.clickable').first().click();
        eq(await app.ev(() => window.__args.slice(-1)[0]), ['viewArchivedMatchStats', ID_M], 'ligne de match');
        await p.locator('#matchHistoryBody .inline-link').first().click();
        eq(await app.ev(() => window.__args.slice(-1)[0]), ['openTeamAggregate', ID_E], 'équipe liée');
        await p.locator('#matchHistoryBody .row-delete').first().click();
        eq(await app.ev(() => window.__args.slice(-1)[0]), ['confirmDeleteMatch', ID_M], 'bouton corbeille');
        /* Corbeille */
        await app.ev(() => { navHome(); openBackup(); renderTrash(); });
        await sur(app, 'corbeille');
        await p.locator('#trashSection .inline-link').first().click();
        eq(await app.ev(() => window.__args.slice(-1)[0]), ['doRestoreMatch', ID_M + 'd'], 'Récupérer');
        await p.locator('#trashSection .row-delete').first().click();
        eq(await app.ev(() => window.__args.slice(-1)[0]), ['confirmPurgeMatch', ID_M + 'd'], 'Effacer');
        await sur(app, 'fin');
      });
    } finally { await app.close(); }
  }

  /* ============ 3 et 4 : import piégé, import mal formé ============ */
  {
    const app = await launch(gabarit);
    const p = app.page;
    try {
      await PRET(app);
      await check(`${P}·3 import piégé (identifiants d'équipe, de joueur, de match, d'auteur) : tout est écarté, compte rendu, rien en base, rien d'exécuté`, async () => {
        const fichier = {
          format: 'kinball_backup', version: 1,
          teams: [
            { id: `t1"><img src=x onerror="${CPT}">`, name: 'Piège équipe', updatedAt: 1, players: [] },
            { id: 'team_ok1', name: 'Bonne', updatedAt: 1, players: [{ id: `p1" data-x="<img src=x onerror=${CPT}>`, name: 'J1' }] },
            { id: 'team_ok2', name: 'Bonne 2', updatedAt: 1, players: joueurs('ok', 'J') },
          ],
          matches: [
            matchValide(`m');${CPT};//`),
            matchValide('match_auteur', { authorId: `u_x/../../${CPT}` }),
            matchValide('match_roster', { rosters: { Bleu: [{ id: `r');${CPT};//`, name: 'R' }], Gris: [], Noir: [] } }),
            matchValide('match_bon'),
          ],
        };
        const t = await importer(app, fichier);
        assert(/Import terminé : 1 équipe\(s\) ajoutée\(s\), 0 mise\(s\) à jour, 1 match\(s\) ajouté\(s\)/.test(t), 'compte des importés : ' + t);
        assert(/5 importé/.test(t) === false && /2 importés, 5 écartés/.test(t), 'compte rendu « N importés, M écartés » : ' + t);
        assert(/identifiant invalide/.test(t) && /joueurs mal formés/.test(t), 'raisons : ' + t);
        eq(await app.ev(() => TEAMS_DB.map(x => x.id).sort()), ['team_ok2'], 'équipes en base');
        eq(await app.ev(() => MATCHES_DB.map(x => x.id)), ['match_bon'], 'matchs en base');
        await app.ev(() => { navHome(); openTeamManager(); });
        await app.ev(() => { navHome(); openNewMatch(); });
        await sur(app, 'après import piégé');
      });
      await check(`${P}·4 import mal formé : les bons enregistrements entrent, les autres sont comptés et écartés, l'Historique et « Mes équipes » s'affichent`, async () => {
        const mauvais = [
          ['sans names', (() => { const m = matchValide('mv_names'); delete m.names; return m; })()],
          ['names non texte', matchValide('mv_names2', { names: { Bleu: 1, Gris: 'B', Noir: 'C' } })],
          ['history absente', (() => { const m = matchValide('mv_hist'); delete m.history; return m; })()],
          ['history non liste', matchValide('mv_hist2', { history: 'oui' })],
          ['history : élément nul', matchValide('mv_hist3', { history: [null] })],
          ['scores en texte', matchValide('mv_scores', { scores: { Bleu: '1', Gris: 0, Noir: 0 } })],
          ['sans scores', (() => { const m = matchValide('mv_scores2'); delete m.scores; return m; })()],
          ['statut inconnu', matchValide('mv_statut', { status: 'bizarre' })],
          ['id vide', matchValide('')],
          ['id numérique', matchValide(12)],
          ['id avec espace', matchValide('a b')],
          ['null', null],
          ['texte', 'bonjour'],
          ['periodWins en liste', matchValide('mv_pw', { periodWins: [1] })],
        ];
        const fichier = {
          format: 'kinball_backup', version: 1,
          teams: [
            { id: 'team_bon', name: 'Équipe bonne', updatedAt: 3, players: joueurs('b', 'J') },
            { id: 'team_sp', name: 'Sans joueurs', updatedAt: 3 },
            { id: 'team_nom', name: 12, players: [] },
            { id: 'team_pl', name: 'Joueur nul', players: [null] },
            null,
          ],
          matches: [matchValide('match_bon2', { updatedAt: 1760000999000 }), ...mauvais.map(x => x[1])],
        };
        const t = await importer(app, fichier);
        const nb = 4 + mauvais.length;   // équipes écartées (4) + matchs écartés
        assert(/1 équipe\(s\) ajoutée\(s\), 0 mise\(s\) à jour, 1 match\(s\) ajouté\(s\)/.test(t), 'importés : ' + t);
        assert(new RegExp(`2 importés, ${nb} écartés`).test(t), `« 2 importés, ${nb} écartés » : ` + t);
        for (const raison of ['noms mal formés', 'scores mal formés', 'historique mal formé', 'statut inconnu', 'identifiant invalide', 'joueurs mal formés', 'match illisible']) assert(t.includes(raison), 'raison « ' + raison + ' » : ' + t);
        const ids = await app.ev(() => MATCHES_DB.map(x => x.id).sort());
        eq(ids, ['match_bon', 'match_bon2'], 'seuls les bons matchs sont en base');
        await app.ev(() => { navHome(); openMatchHistory(); });
        eq(await p.locator('#matchHistoryBody tr.clickable').count(), 2, 'l\'Historique affiche les deux matchs');
        await app.ev(() => { navHome(); openTeamManager(); });
        eq(await p.locator('#teamListBody tr.clickable').count(), 2, '« Mes équipes » affiche les deux équipes');
        await app.ev(() => { navHome(); openTeamOverview(); });
        eq(app.errors, [], 'aucune erreur de page');
        /* fichier qui n'est pas une sauvegarde */
        for (const faux of ['{"teams":"abc"}', '{"matches":{"a":1}}', '[1,2]', '{"id":"x","history":3}', '{"format":"kinball_backup"}']) {
          const r = await importer(app, faux);
          assert(/Fichier invalide/.test(r), faux + ' → ' + r);
        }
        eq(await app.ev(() => MATCHES_DB.length), 2, 'rien de plus en base');
      });
    } finally { await app.close(); }
  }

  /* ============ 5 et 6 : fichiers valides d'aujourd'hui, aller-retour de l'export JSON ============ */
  {
    const A = await launch(gabarit);
    try {
      await PRET(A);
      await A.ev(async () => { await dbSetTeam({ id: 'team_zz', name: 'Zèbres', players: [1, 2, 3, 4].map(i => ({ id: 'z' + i, name: 'Z' + i })), createdAt: 1, updatedAt: 1 }); });
      await A.page.waitForFunction(() => TEAMS_DB.length === 1);
      await A.startMatch({ format: '9_11', names: { Bleu: 'Laval', Gris: 'Québec', Noir: 'Lévis' } });
      await A.initialPossession('Bleu');
      await A.lancer({ target: 'Gris', caught: true });
      await A.lancer({ target: 'Noir', caught: false });
      await A.faute({ code: 'APPEL' });
      await enregistre(A);
      const etatA = await A.ev(() => JSON.parse(JSON.stringify(S)));

      await check(`${P}·5 sauvegarde v1, sauvegarde v2 et archive d'aujourd'hui : importées comme avant, aucun écart annoncé`, async () => {
        const base = await A.ev(() => ({ teams: JSON.parse(JSON.stringify(TEAMS_DB)), matches: JSON.parse(JSON.stringify(MATCHES_DB)) }));
        eq(base.matches.length, 1, 'un match en base');
        const v1 = { format: 'kinball_backup', version: 1, exportedAt: 'x', teams: base.teams, matches: base.matches };
        const v2 = await A.ev(b => { const x = { format: 'kinball_backup', version: 1, exportedAt: 'x', teams: b.teams, matches: b.matches }; if (typeof KBSite !== 'undefined' && KBSite.sauvegardeV2) KBSite.sauvegardeV2(x); return x; }, base);
        eq(v2.version, 2, 'sauvegarde v2 produite par le site');
        assert(v2.counts && v2.counts.matches === 1, 'décomptes v2');
        const arch = { format: 'kinball_archive', version: 1, exportedAt: 'x', teams: base.teams, matches: base.matches };
        for (const [nom, f] of [['v1', v1], ['v2', v2], ['archive', arch]]) {
          const B = await launch(gabarit);
          try {
            await PRET(B);
            const t = await importer(B, f);
            assert(/Import terminé : 1 équipe\(s\) ajoutée\(s\), 0 mise\(s\) à jour, 1 match\(s\) ajouté\(s\), 0 mis à jour\./.test(t), nom + ' : ' + t);
            assert(!/écarté/.test(t) && !/Attention/.test(t), nom + ' : aucun écart annoncé : ' + t);
            eq(await B.ev(() => MATCHES_DB[0].history.length), 3, nom + ' : actions');
            eq(await B.ev(() => MATCHES_DB[0].names), { Bleu: 'Laval', Gris: 'Québec', Noir: 'Lévis' }, nom + ' : noms');
          } finally { await B.close(); }
        }
      });

      await check(`${P}·6 R3 · « JSON — Tout le match, réimportable » : l'export se réimporte tel quel (match identique) ; un match seul mal formé est écarté ; le contenu de l'export est inchangé`, async () => {
        await A.ev(() => openExportMenu());
        const [dl] = await Promise.all([A.page.waitForEvent('download'), A.page.locator('[onclick="exportJSON()"]').click()]);
        const fichier = fs.readFileSync(await dl.path(), 'utf8');
        eq(fichier, JSON.stringify(etatA === null ? null : await A.ev(() => S), null, 2), 'l\'export écrit toujours l\'état du match seul, tel quel (format inchangé)');
        const B = await launch(gabarit);
        try {
          await PRET(B);
          const t = await importer(B, fichier);
          assert(/1 match\(s\) ajouté\(s\)/.test(t) && !/écarté/.test(t), 'import : ' + t);
          const recu = await B.ev(() => JSON.parse(JSON.stringify(MATCHES_DB[0])));
          eq(recu.id, etatA.id, 'identifiant');
          eq(recu.history, etatA.history, 'historique identique');
          eq(recu.scores, etatA.scores, 'scores');
          eq(recu.names, etatA.names, 'noms');
          /* deuxième import du même fichier : « mis à jour », jamais en double */
          const t2 = await importer(B, fichier);
          assert(/0 match\(s\) ajouté\(s\), 0 mis à jour\. 1 ignoré/.test(t2), 'deuxième import (déjà à jour, ignoré) : ' + t2);
          eq(await B.ev(() => MATCHES_DB.length), 1, 'pas de doublon');
          /* un match seul mais mal formé : écarté, pas de plantage */
          const casse = JSON.parse(fichier); delete casse.names; casse.id = 'match_casse';
          const t3 = await importer(B, casse);
          assert(/0 importé/.test(t3) && /1 écarté/.test(t3) && /noms mal formés/.test(t3), 'match seul mal formé : ' + t3);
          await B.ev(() => { navHome(); openMatchHistory(); });
          eq(await B.page.locator('#matchHistoryBody tr.clickable').count(), 1, 'Historique intact');
          eq(B.errors, [], 'aucune erreur de page');
        } finally { await B.close(); }
      });
    } finally { await A.close(); }
  }

  /* ============ 7 : R22 — un match importé sans auteur n'est jamais envoyé ============ */
  {
    const RACINE = path.dirname(HTML);   // le site testé (dossier de la copie « d'avant » pour le contrôle négatif)
    const faux = await demarrer({});
    const cfg = { valeur: { collecteUrl: faux.url, contact: 'contact-test@example.invalid' } };
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (u === '/sw.js') { res.writeHead(404); res.end(); return; }
      if (u === '/config.js') { res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }); res.end('window.KB_CONFIG = ' + JSON.stringify(cfg.valeur) + ';'); return; }
      const f = path.join(RACINE, u === '/' ? 'index.html' : u);
      if (!f.startsWith(RACINE) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
      res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const app = await launch(gabarit, { url: 'http://127.0.0.1:' + srv.address().port + '/' });
    const p = app.page;
    try {
      await check(`${P}·7 R22 · match importé sans auteur : visible dans l'Historique, réimportable, jamais envoyé à la collecte ; un match avec auteur l'est`, async () => {
        await p.waitForFunction(() => typeof DB !== 'undefined' && !!DB && !!AUTHOR_ID && typeof KBSite !== 'undefined' && !!KBSite.collecte, null, { timeout: 8000, polling: 20 });
        const moi = await app.ev(() => AUTHOR_ID);
        const sansAuteur = matchValide('match_sans_auteur'); delete sansAuteur.authorId;
        const t = await importer(app, { format: 'kinball_backup', version: 1, teams: [], matches: [sansAuteur, matchValide('match_mien', { authorId: moi })] });
        assert(/2 match\(s\) ajouté\(s\)/.test(t), 'import : ' + t);
        eq(await app.ev(() => MATCHES_DB.map(m => m.id).sort()), ['match_mien', 'match_sans_auteur'], 'les deux sont visibles');
        eq(await app.ev(() => getMatchRecord('match_sans_auteur').authorId === undefined), true, 'aucun auteur inventé');
        await app.ev(() => navTo('backup'));
        await p.locator('#kbCollecteInterrupteur').click();
        await p.waitForFunction(() => /partagé/.test((document.getElementById('kbCollecteEtat') || {}).textContent || ''), null, { timeout: 8000 });
        await p.waitForTimeout(800);
        const envoyes = faux.recus ? JSON.stringify(faux.recus()) : '';
        const lignes = faux.posts.map(x => JSON.parse(x.corps).match.id);
        eq(lignes, ['match_mien'], 'seul le match avec auteur est parti');
        assert(!envoyes.includes('match_sans_auteur'), 'le match sans auteur n\'est nulle part chez le serveur');
        eq(await app.ev(() => Object.keys(KBSite.collecte.etat().file)), ['match_mien'], 'boîte d\'envoi');
        /* il reste réimportable : un export de la sauvegarde complète le contient */
        const complet = await app.ev(() => { const x = { matches: [].concat(MATCHES_DB, DELETED_MATCHES) }; return x.matches.map(m => m.id).sort(); });
        eq(complet, ['match_mien', 'match_sans_auteur'], 'présent dans la sauvegarde complète');
      });
    } finally { await app.close(); srv.closeAllConnections?.(); srv.close(); if (faux.fermer) await faux.fermer(); }
  }
}
