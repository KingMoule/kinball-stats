/* REDO (#7) : ↷ après ↶. Détail : tests/docs/REDO.md. */
import { launch, assert, eq } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];

async function un(gabarit, f, opts) {
  const app = await launch(gabarit, opts);
  try { return await f(app); } finally { await app.close(); }
}
const redoSel = '#redoBtn:visible, #redoBtnPhone:visible';
/* ↷ par un vrai clic, après le réarmement (comme App.undo pour ↶). */
async function redo(app) {
  await app.page.waitForFunction(() => Date.now() >= undoBlockedUntil + 10, null, { timeout: 4000, polling: 10 });
  await app.page.locator(redoSel).first().click({ timeout: 4000, noWaitAfter: true });
  await app.settle();
  await app.fieldStable();
}
const redoActif = app => app.ev(() => [...document.querySelectorAll('#redoBtn,#redoBtnPhone')].filter(e => e.getClientRects().length).map(e => !e.disabled));
async function ecritures(app) {
  await app.ev(() => { window.__docs = []; const w = window.writeMatchDoc; window.writeMatchDoc = m => { window.__docs.push({ h: m.history.length, period: m.period, scores: { ...m.scores } }); return w(m); }; });
}

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] REDO`;

  await check(`${P}·1 ↷ visible et inactif sans ↶ ; trois actions, ↶ ↶ ↶ puis ↷ ↷ ↷ : S identique à chaque étape (historique compris) ; chaque ↷ est enregistré ; ↷ inactif à la fin`, async () => {
    await un(gabarit, async app => {
      await app.startMatch({ format: '9_11', withRosters: true });
      await app.initialPossession('Bleu');
      eq(await redoActif(app), [false], '↷ présent et inactif au départ');
      const etats = [await app.state()];
      await app.lancer({ target: 'Gris', caught: true, player: 'Bleu_p1' }); etats.push(await app.state());
      await app.faute({ code: 'EXT' }); etats.push(await app.state());
      await app.lancer({ target: 'Noir', caught: false }); etats.push(await app.state());
      for (let k = 3; k > 0; k--) { await app.undo(); eq(await app.state(), etats[k - 1], `après ↶ n° ${4 - k}`); eq(await redoActif(app), [true], '↷ actif après ↶'); }
      await ecritures(app);
      for (let k = 1; k <= 3; k++) { await redo(app); eq(await app.state(), etats[k], `après ↷ n° ${k}`); }
      eq(await app.ev(() => window.__docs.map(d => d.h)), [1, 2, 3], 'une écriture par ↷, historique rétabli');
      eq(await redoActif(app), [false], '↷ inactif : plus rien à rétablir');
      eq(app.errors, [], 'aucune erreur de page');
    });
  });

  await check(`${P}·2 une action nouvelle après ↶ vide la pile ; un choix de possession aussi ; redo() sans pile ne fait rien`, async () => {
    await un(gabarit, async app => {
      await app.startMatch({ format: '9_11' });
      await app.initialPossession('Bleu');
      await app.lancer({ target: 'Gris', caught: true });
      await app.lancer({ target: 'Noir', caught: true });
      await app.undo();
      await app.faute({ code: 'APPEL' });
      eq(await redoActif(app), [false], '↷ inactif après une action nouvelle');
      const e = await app.state();
      await app.ev(() => redo()); await app.settle();
      eq(await app.state(), e, 'redo() ne change rien');
      eq(e.history.map(h => h.type), ['lancer', 'faute_directe'], 'historique');
      /* changement de joueur, ↶ dans la feuille de l'équipe, puis une autre action : pile vidée */
      await app.undo();
      eq(await app.ev(() => redoPossible()), true, 'pile après ↶');
      await app.ev(() => { S.awaitingInitial = true; }); await app.ev(() => chooseInitialPossession('Gris')); await app.settle();
      eq(await app.ev(() => redoPossible()), false, 'pile vidée par un choix de possession');
      eq(app.errors, [], 'aucune erreur de page');
    });
  });

  await check(`${P}·3 changement de joueur : ↶ dans la feuille de l'équipe puis ↷ du ruban rétablit l'échange ; alignement idem`, async () => {
    await un(gabarit, async app => {
      await app.startMatch({ format: '9_11', withRosters: true });
      await app.initialPossession('Bleu');
      await app.ev(() => { openLineupSheet('Bleu'); applySub('Bleu', 'Bleu_p1', 'Bleu_p5'); });
      const apres = await app.state();
      eq(apres.lineups.Bleu.includes('Bleu_p5'), true, 'échange fait');
      await app.ev(() => undoLineupChange()); await app.settle();
      eq((await app.state()).lineups.Bleu.includes('Bleu_p1'), true, '↶ dans la feuille');
      await app.ev(() => closeLineupSheet()); await app.settle();
      await redo(app);
      eq(await app.state(), apres, '↷ : échange rétabli, événement « changement » compris');
      eq(app.errors, [], 'aucune erreur de page');
    });
  });

  await check(`${P}·4 élimination : duel lancé puis ↶ ↷ : choix du duel rétabli sans feuille ; ↶ dans la feuille du duel puis ↷ : la feuille revient`, async () => {
    await un(gabarit, async app => {
      await app.startMatch({ format: '9_11' });
      await app.initialPossession('Bleu');
      await app.ev(() => { S.scores = { Bleu: 8, Gris: 6, Noir: 2 }; S.possession = 'Gris'; renderScoreboard(); });
      for (let i = 0; i < 6 && !(await app.awaitingDuel()); i++) await app.faute({ code: 'APPEL' });
      assert(await app.awaitingDuel(), 'élimination atteinte');
      const enAttente = await app.state();
      /* 1) ↶ dans la feuille du duel, puis ↷ : on retrouve l'attente du duel et sa feuille */
      await app.undoInSheet();
      assert(!(await app.awaitingDuel()), '↶ dans la feuille : avant l\'élimination');
      await redo(app);
      eq(await app.state(), enAttente, '↷ : état d\'attente du duel');
      assert(await app.sheetHas(`chooseDuelStart('Bleu')`), 'feuille du duel rouverte');
      /* 2) duel lancé, ↶ du ruban, ↷ : le choix est gardé */
      const qui = enAttente.eliminated === 'Bleu' ? 'Gris' : 'Bleu';
      await app.duelStart(qui);
      const lance = await app.state();
      await app.undo(); await redo(app);
      eq(await app.state(), lance, '↷ : duel lancé avec le même porteur');
      eq(await app.sheetOpen(), false, 'aucune feuille');
      eq(app.errors, [], 'aucune erreur de page');
    });
  });

  await check(`${P}·5 action au seuil, ↶ après le message puis ↷ : S = la période suivante (identique), sans fenêtre de fin de période ni ancien affichage`, async () => {
    await un(gabarit, async app => {
      await app.startMatch({ format: 'duel11' });
      await app.initialPossession('Bleu');
      await app.ev(() => { S.scores = { Bleu: 10, Gris: 4, Noir: 0 }; S.possession = 'Bleu'; renderScoreboard(); });
      await app.lancer({ target: 'Gris', caught: false });   // Bleu au seuil : période 1 gagnée
      const fin = await app.state();
      eq([fin.period, fin.periodWins.Bleu], [2, 1], 'période suivante');
      await app.undo();
      eq((await app.state()).period, 1, '↶ : période 1');
      await redo(app);
      eq(await app.state(), fin, '↷');
      eq(await app.ev(() => [periodEndBusy(), !!periodEndView, /PÉRIODE 2\b/.test(document.getElementById('periodTag').textContent)]), [false, false, true], 'ni fenêtre ni ancien affichage');
      eq(app.errors, [], 'aucune erreur de page');
    });
  });

  await check(`${P}·6 « Annuler » du message « PÉRIODE N TERMINÉE » (vrais délais) puis ↷ : S = l'état de la fenêtre (période suivante) ; ↷ refusé pendant une saisie`, async () => {
    await un(gabarit, async app => {
      await app.startMatch({ format: 'duel11' });
      await app.initialPossession('Bleu');
      await app.ev(() => { S.scores = { Bleu: 10, Gris: 4, Noir: 0 }; S.possession = 'Bleu'; renderScoreboard(); });
      const a = await app._pt([0.3, 0.3]), b = await app._pt([0.7, 0.7]), m = app.page.mouse;
      await m.move(a.x, a.y); await m.down(); await m.move(b.x, b.y, { steps: 2 }); await m.up();
      await app.clickSheet("pickResult('Gris',false)");
      await app._pickPlayer();
      await app.page.waitForFunction(() => !!document.querySelector('#sheet .period-undo') && periodEndTimer && Date.now() - periodMsgAt > UNDO_REARM_MS + 20, null, { timeout: 6000, polling: 10 });
      const fenetre = await app.state();
      eq(fenetre.period, 2, 'S déjà dans la période 2 pendant le message');
      await app.page.locator('#sheet .period-undo').click({ noWaitAfter: true });
      await app.page.waitForFunction(() => !periodEndBusy() && !document.getElementById('sheet').classList.contains('open'), null, { timeout: 4000, polling: 10 });
      eq((await app.state()).period, 1, 'Annuler : période 1');
      await redo(app);
      eq(await app.state(), fenetre, '↷');
      eq(await app.ev(() => [periodEndBusy(), !!periodEndView, !!document.querySelector('#sheet.open .msg-center')]), [false, false, false], 'aucun message rejoué');
      /* une saisie en cours : redo() refuse */
      await app.undo();
      await app._tap([0.5, 0.5]);
      await app.page.waitForFunction(() => !!pending, null, { timeout: 3000 });
      const e = await app.state();
      await app.ev(() => redo());
      eq(await app.state(), e, 'redo() refusé pendant une saisie');
      eq(await app.ev(() => redoPossible()), true, 'la pile reste');
      await app.ev(() => cancelPendingEvent());
      eq(app.errors, [], 'aucune erreur de page');
    }, { timescale: 1 });
  });

  await check(`${P}·7 fin de période à la main (format libre) : ↶ puis ↷ rétablit l'événement fin_periode et la période suivante`, async () => {
    await un(gabarit, async app => {
      await app.startMatch({ format: 'libre3' });
      await app.initialPossession('Bleu');
      await app.lancer({ target: 'Gris', caught: false });
      await app.page.waitForFunction(() => barreLibre(), null, { timeout: 4000, polling: 10 });
      await app.ev(() => { S.scores = { Bleu: 3, Gris: 1, Noir: 0 }; renderScoreboard(); endPeriodByLeader(); }); await app.settle();
      const fin = await app.state();
      eq([fin.period, fin.history[fin.history.length - 1].type], [2, 'fin_periode'], 'fin de période à la main');
      await app.undo();
      eq((await app.state()).period, 1, '↶');
      await redo(app);
      eq(await app.state(), fin, '↷');
      eq(app.errors, [], 'aucune erreur de page');
    });
  });

  await check(`${P}·8 la pile ne survit ni à un autre match, ni au rechargement, ni à un historique changé ailleurs ; un rebond sur ↷ ne rétablit qu'une action`, async () => {
    await un(gabarit, async app => {
      await app.startMatch({ format: '9_11' });
      await app.initialPossession('Bleu');
      for (const t of ['Gris', 'Noir', 'Gris']) await app.lancer({ target: t, caught: true });
      await app.undo(); await app.undo();
      /* rebond : deux appuis réels à 40 ms sur ↷ */
      const r = await app.ev(() => { const e = [...document.querySelectorAll('#redoBtn,#redoBtnPhone')].find(x => x.getClientRects().length); const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
      await app.page.waitForFunction(() => Date.now() >= undoBlockedUntil + 10, null, { timeout: 4000, polling: 10 });
      if (app.gabarit === 'telephone') { await app.page.touchscreen.tap(r.x, r.y); await app.page.waitForTimeout(40); await app.page.touchscreen.tap(r.x, r.y); }
      else { await app.page.mouse.click(r.x, r.y); await app.page.waitForTimeout(40); await app.page.mouse.click(r.x, r.y); }
      await app.settle();
      eq((await app.state()).history.length, 2, 'un seul ↷ pour un rebond');
      /* historique changé hors de ↶/↷ (autre appareil, banc) : la pile n'agit plus */
      await app.ev(() => { S.history.push(JSON.parse(JSON.stringify(S.history[S.history.length - 1]))); renderScoreboard(); });
      eq([await app.ev(() => redoPossible()), await redoActif(app)], [false, [false]], 'longueur différente : ↷ refusé');
      await app.ev(() => { S.history.pop(); renderScoreboard(); });
      eq(await app.ev(() => redoPossible()), true, 'même longueur : de nouveau possible');
      /* rechargement : la pile est une variable de module */
      const id = await app.ev(() => S.id);
      await app.page.reload({ waitUntil: 'domcontentloaded' });
      await app.page.waitForFunction(() => typeof startMatch === 'function' && typeof redoPile !== 'undefined');
      eq(await app.ev(() => redoPile.length), 0, 'pile vide au rechargement');
      /* autre match : NOUVEAU MATCH vide la pile */
      await app.ev(() => { redoPile = [{ ev: S.history[0] || {}, after: {}, id: S.id, n: S.history.length }]; });
      await app.startMatch({ format: '9_11', name: 'autre' });
      eq([await app.ev(() => redoPile.length), await app.ev(() => S.id !== undefined)], [0, true], 'pile vidée par un autre match (' + id + ')');
      eq(app.errors, [], 'aucune erreur de page');
    });
  });
}
