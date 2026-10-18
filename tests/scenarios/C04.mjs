/* C04 : fiche joueur cumulée. Détail : tests/docs/C04.md. */
import { launch, assert, eq } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];

/* Deux copies du match en cours, rangées dans l'historique comme deux matchs de l'équipe T_C04 (Bleu). */
const ranger = (app, nomJoueur) => app.ev(nom => {
  const roster = S.rosters.Bleu.map(p => p.id === 'Bleu_p1' ? { id: p.id, name: nom } : p);
  TEAMS_DB.push({ id: 'T_C04', name: 'Les Bleus', players: roster });
  [['c04_a', 'Premier', 2000], ['c04_b', 'Second', 1000]].forEach(([id, matchName, t]) => {
    const c = JSON.parse(JSON.stringify(S));
    Object.assign(c, { id, matchName, status: 'completed', updatedAt: t, teamIds: { Bleu: 'T_C04', Gris: null, Noir: null } });
    c.names = { Bleu: 'Les Bleus', Gris: 'Rivaux', Noir: 'Noir' };
    MATCHES_DB.push(c);
  });
}, nomJoueur);

/* La possession change à chaque lancer : chaque action est faite par l'équipe qui a le ballon, Bleu_p1 en tête de ses lancers. */
async function jouer(app) {
  await app.startMatch({ format: '9_11', withRosters: true });
  await app.initialPossession('Bleu');
  const plan = [[false, 'p1'], [true, 'p1'], [false, 'p2'], [true, 'p1'], [false, 'p1'], ['bleu', 'p1'], ['faute', 'p1'], [true, 'p2']];
  for (const [res, j] of plan) {
    const eq_ = await app.ev(() => S.possession);
    const joueur = eq_ + '_' + j;
    if (res === 'bleu') {   // rend le ballon à Bleu (un ballon attrapé par Bleu), sans compter ses lancers
      if (eq_ !== 'Bleu') await app.lancer({ target: 'Bleu', caught: true, player: joueur });
      continue;
    }
    if (res === 'faute') { await app.faute({ code: 'EXT', player: joueur }); continue; }
    const cible = (await app.ev(() => ATEAMS().filter(t => t !== S.possession)))[0];
    await app.lancer({ target: cible, caught: res, player: joueur });
  }
}

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] C04`;

  await check(`${P}·1 appui sur un joueur du cumul d'équipe : fiche = somme de ses matchs, ligne par match, retour exact`, async () => {
    const app = await launch(gabarit);
    try {
      await jouer(app);
      const attendu = await app.ev(() => { const a = {}; accumulatePlayerStats(S, 'Bleu', a); const x = a.Bleu_p1; return { lanc: x.throwsF, succ: x.succ, ftes: x.faults, pm: x.plus - x.minus, act: x.onCourt }; });
      assert(attendu.lanc >= 3 && attendu.ftes === 1, 'préparation : ' + JSON.stringify(attendu));
      await ranger(app, '<b>Jo</b> & Cie');
      await app.ev(() => { navHome(); openTeamAggregate('T_C04'); setStatTab('team', 'joueurs'); });
      const lignes = await app.ev(() => [...document.querySelectorAll('#teamStatsBody tr.clickable')].map(r => r.getAttribute('onclick')));
      assert(lignes.length >= 2, 'joueurs cliquables dans le cumul : ' + lignes.length);
      assert(lignes.some(o => o.includes("'Bleu_p1'")), 'ligne de Bleu_p1 : ' + lignes);
      await app.page.locator(`#teamStatsBody tr[onclick*="'Bleu_p1'"]`).click();
      eq(await app.ev(() => [currentScreen(), document.documentElement.dataset.screen]), ['playerCard', 'playerCard'], 'écran de la fiche');
      const f = await app.ev(() => ({
        titre: document.getElementById('appBarTitle').textContent,
        tuiles: [...document.querySelectorAll('#playerCardBody .pc-tile')].map(t => [t.querySelector('.pc-label').textContent, t.querySelector('.pc-val').textContent]),
        lignes: document.querySelectorAll('#playerCardBody tr.clickable').length,
        gras: document.querySelectorAll('#playerCardBody b').length,
        texte: document.querySelector('#playerCardBody .as-name').textContent,
        ordre: [...document.querySelectorAll('#playerCardBody tr.clickable td:first-child b')].map(b => b.textContent),
        debord: document.getElementById('playerCardBody').scrollWidth > document.getElementById('playerCardBody').clientWidth + 1,
      }));
      const tuile = l => f.tuiles.find(t => t[0] === l)[1];
      eq(f.titre, '<b>Jo</b> & Cie', 'titre en texte');
      eq(f.texte, '<b>Jo</b> & Cie', 'nom en texte, sans balisage');
      eq(f.lignes, 2, 'une ligne par match');
      eq(f.ordre, ['Premier', 'Second'], 'plus récent d\'abord');
      eq(+tuile('Lancers'), 2 * attendu.lanc, 'lancers = somme des deux matchs');
      eq(+tuile('Fautes'), 2 * attendu.ftes, 'fautes');
      eq(tuile('OFF %'), Math.round(100 * 2 * attendu.succ / (2 * attendu.lanc)) + '%', 'OFF %');
      eq(tuile('+/-'), (2 * attendu.pm > 0 ? '+' : '') + 2 * attendu.pm, '+/-');
      assert(!f.debord, 'pas de débordement horizontal');
      /* une ligne de match ouvre les stats de ce match ; ↩ revient sur la fiche, qui se redessine */
      await app.page.locator('#playerCardBody tr.clickable').first().click();
      eq(await app.ev(() => [currentScreen(), viewingArchive, S.id]), ['stats', true, 'c04_a'], 'stats du match archivé');
      await app.ev(() => navBack());
      eq(await app.ev(() => [currentScreen(), viewingArchive, !!document.querySelector('#playerCardBody .pc-tile')]), ['playerCard', false, true], 'retour sur la fiche, archive quittée');
      await app.ev(() => navBack());
      eq(await app.ev(() => currentScreen()), 'teamStats', 'retour sur l\'équipe');
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
  });

  await check(`${P}·2 joueur sans match : message vide ; tri de la fiche ; S et stockage inchangés`, async () => {
    const app = await launch(gabarit);
    try {
      await jouer(app);
      await ranger(app, 'Jo');
      const avant = await app.ev(() => JSON.stringify(S) + JSON.stringify(MATCHES_DB));
      await app.ev(() => { navHome(); openPlayerCard('T_C04', 'Bleu_p9'); });
      assert(await app.ev(() => /Aucune stat pour ce joueur/.test(document.getElementById('playerCardBody').textContent)), 'message vide');
      await app.ev(() => openPlayerCard('T_C04', 'Bleu_p1'));
      await app.page.locator('#playerCardBody th', { hasText: 'Match' }).click();
      eq(await app.ev(() => [...document.querySelectorAll('#playerCardBody tr.clickable td:first-child b')].map(b => b.textContent)), ['Premier', 'Second'], 'tri conservé sur la fiche (décroissant au premier appui)');
      await app.page.locator('#playerCardBody th', { hasText: 'Match' }).click();
      eq(await app.ev(() => [...document.querySelectorAll('#playerCardBody tr.clickable td:first-child b')].map(b => b.textContent)), ['Second', 'Premier'], 'second appui : croissant');
      eq(await app.ev(() => JSON.stringify(S) + JSON.stringify(MATCHES_DB)), avant, 'rien d\'écrit');
      eq(await app.ev(() => Object.keys(S).includes('currentPlayerCard')), false, 'état d\'interface hors de S');
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
  });
}
