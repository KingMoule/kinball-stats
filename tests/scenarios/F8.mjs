/* F8 : courbe du % de victoire au fil du match (onglet « % victoire » des statistiques). Détail : tests/docs/F8.md. */
import { launch, assert, eq, rng } from '../lib.mjs';
import { Model, pickAction, play } from '../model.mjs';

export const gabarits = ['tablette', 'telephone'];

/* Attend la fin de la fenêtre de fin de période et du calcul en direct. */
const calme = app => app.page.waitForFunction(() => !periodEndBusy() && !periodEndView && !WP.inFlight && !WP.dirty, null, { timeout: 10000, polling: 20 });
/* Ouvre l'onglet et attend la courbe complète. */
const courbe = async app => {
  await app.openStatsTab('wp');
  await app.page.waitForFunction(() => !WPC.todo.length && document.querySelector('#statsBody .wpc-svg'), null, { timeout: 30000, polling: 50 });
  return app.ev(() => WPC.samples.filter(s => s.calc).map(s => ({ x: s.x, per: s.per, m: ATEAMS().map(t => s.res.match[t].toFixed(1)), p: ATEAMS().map(t => s.res.period[t].toFixed(1)) })));
};
/* Joue une partie à graine fixe sans reprise de jeu ; après chaque action, note chaque nouveau résultat des barres. */
async function partie(app, format, graine, jusqua) {
  await app.ev(() => { WP.seedFixed = 4242; });
  await app.startMatch({ format });
  await app.initialPossession('Bleu');
  const m = new Model(format); m.initial('Bleu');
  const r = rng(graine), live = [];
  let vu = 0, garde = 0;
  while (m.period < jusqua && garde++ < 500) {
    const a = pickAction(m, r);
    if (a.t === 'reprise') continue;
    await play(app, m, a);
    await calme(app);
    const x = await app.ev(n => WP.stats.applied > n ? { n: WP.stats.applied, m: ATEAMS().map(t => wpPct(t, 'match').toFixed(1)), p: ATEAMS().map(t => wpPct(t, 'period').toFixed(1)) } : null, vu);
    if (x) { vu = x.n; live.push({ m: x.m, p: x.p }); }
  }
  return live;
}

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] F8`;

  if (gabarit === 'tablette') await check(`${P}·1 la courbe redonne, point par point, chaque résultat des barres du direct (9/11 avec duels jusqu'à la période 3, puis 11/13), match et période`, async () => {
    for (const [format, graine] of [['9_11', 808], ['11_13', 909]]) {
      const app = await launch(gabarit);
      try {
        const live = await partie(app, format, graine, 3);
        assert(live.length >= 8, `${format} : au moins 8 calculs en direct (${live.length})`);
        const c = await courbe(app);
        eq(c.map(s => ({ m: s.m, p: s.p })), live, `${format} : un point par calcul du direct, mêmes valeurs`);
        assert(await app.ev(() => WPC.samples.some(s => s.duel && s.calc)), `${format} : des points en duel`);
        eq(app.errors, [], 'aucune erreur de page');
      } finally { await app.close(); }
    }
  });

  if (gabarit === 'tablette') await check(`${P}·2 fins de période manuelles et changements de joueur ne déplacent aucun point ; un ancien événement sans before est sauté sans erreur ; libre : pas d'onglet`, async () => {
    const app = await launch(gabarit);
    try {
      await app.ev(() => { WP.seedFixed = 4242; WP.minK = 2; });
      await app.startMatch({ format: '9_11', withRosters: true });
      await app.initialPossession('Bleu');
      const j = k => app.ev(k => lineupOf(S.possession)[k], k);
      const autre = () => app.ev(() => ATEAMS().find(t => t !== S.possession && t !== S.eliminated));
      for (let i = 0; i < 4; i++) { await app.lancer({ target: await autre(), caught: i % 2 === 0, player: await j(i % 4) }); await calme(app); }
      await app.faute({ code: 'EXT', player: await j(2) }); await calme(app);
      await app.ev(() => openFinishMenu()); await app.clickSheet("endPeriodManually('Gris')"); await app.settle(); await calme(app);
      for (let i = 0; i < 3; i++) { await app.lancer({ target: await autre(), caught: false, player: await j(0) }); await calme(app); }
      const plan = () => app.ev(() => { WPC.key = null; wpcEnsure(); return JSON.stringify(WPC.samples.map(s => [s.x, s.per, !!s.calc, !!s.egal, s.state])); });
      const avec = await plan();
      const types = await app.ev(() => S.history.map(e => e.type));
      assert(types.includes('fin_periode'), 'une fin de période manuelle dans l\'historique');
      const sans = await app.ev(() => { window.__h = S.history; S.history = S.history.filter(e => e.type !== 'fin_periode'); return S.history.length; });
      eq(await plan(), avec, 'sans fin_periode : mêmes points');
      await app.ev(() => { S.history = window.__h.concat([{ type: 'changement', details: { team: 'Bleu' }, before: window.__h[0].before }]); });
      eq(await plan(), avec, 'avec un changement de plus : mêmes points');
      await app.ev(() => { S.history = window.__h.map((e, i) => i === 1 ? Object.assign({}, e, { before: undefined }) : e); });
      const trou = JSON.parse(await plan());
      eq(trou.length, JSON.parse(avec).length - 1, 'un point de moins (état inconnu)');
      await app.ev(() => { S.history = window.__h; });
      const c = await courbe(app);
      assert(c.length >= 2 && c.some(s => s.per === 2), 'des calculs en période 2');
      assert(sans < types.length, 'événement retiré');
      await app.backToMatch();
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
    const app2 = await launch(gabarit);
    try {
      await app2.startMatch({ format: 'libre3' }); await app2.initialPossession('Bleu');
      await app2.lancer({ target: 'Gris', caught: false });
      await app2.ev(() => { statTab.match = 'wp'; openStats(); });
      const r = await app2.ev(() => ({ tab: !!document.querySelector(`.stat-tab[onclick="setStatTab('match','wp')"]`), actif: activeSection('match').id, ids: STAT_SECTIONS.filter(s => s.match).map(s => s.id) }));
      eq(r.tab, false, 'pas d\'onglet « % victoire » en format libre');
      eq(r.actif, 'overall', 'retour sur la Vue d\'ensemble');
      assert(r.ids.includes('wp'), 'la famille reste déclarée');
      assert(/sans fin de période/.test(await app2.ev(() => sectionMatchWinCurve())), 'appel direct : message, sans erreur');
      eq(app2.errors, [], 'aucune erreur de page');
    } finally { await app2.close(); }
  });

  await check(`${P}·3 rien n'est calculé hors de l'onglet et rien n'entre dans S ni dans la sauvegarde ; le calcul reprend où il en était ; toucher un point le lit ; MATCH / PÉRIODE ; pas de débordement`, async () => {
    const app = await launch(gabarit);
    try {
      await partie(app, '9_11', 808, 2);
      const avantS = await app.ev(() => JSON.stringify(S));
      await app.ev(() => { window.__saves = 0; const s0 = window.save; window.save = function(){ window.__saves++; return s0.apply(this, arguments); }; });
      await app.openStatsTab('overall');
      await app.page.waitForTimeout(300);
      const total = await app.ev(() => { wpcEnsure(); return WPC.todo.length; });
      assert(total >= 3, 'des points à calculer');
      await app.page.waitForTimeout(300);
      eq(await app.ev(() => WPC.todo.length), total, 'onglet non affiché : aucun calcul');
      /* ouvrir l'onglet, le quitter après un point ou deux, revenir */
      await app.page.locator(`.stat-tab[onclick="setStatTab('match','wp')"]`).click();
      await app.page.waitForFunction(n => WPC.todo.length < n, total, { timeout: 5000, polling: 5 });
      await app.ev(() => setStatTab('match', 'overall'));
      const reste = await app.ev(() => WPC.todo.length);
      await app.page.waitForTimeout(400);
      eq(await app.ev(() => WPC.todo.length), reste, 'onglet quitté : le calcul s\'arrête');
      const c = await courbe(app);
      eq(c.length, total, 'reprise : tous les points, aucun refait ni perdu');
      eq(await app.ev(() => JSON.stringify(S)), avantS, 'S inchangé');
      eq(await app.ev(() => window.__saves), 0, 'aucune sauvegarde');
      const rec = await app.ev(() => JSON.stringify(getMatchRecord(S.id) || {}));
      assert(!/wpc|"res"/.test(rec), 'rien de la courbe dans le match enregistré');
      /* lecture d'un point au toucher */
      const lu = () => app.ev(() => { const r = document.querySelector('.wpc-read'); return { x: Number(r.dataset.x), txt: r.textContent }; });
      const dernier = await lu();
      eq(dernier.x, c[c.length - 1].x, 'par défaut : le dernier point');
      await app.page.locator('.wpc-hit[data-i="0"]').click();
      const premier = await lu();
      eq(premier.x, c[0].x, 'toucher la première bande : premier point');
      assert(premier.txt.includes(Math.round(Number(c[0].m[0])) + ' %'), 'valeur de match de Bleu affichée');
      await app.page.locator(`.heat-btn[onclick="setWpcKind('period')"]`).click();
      const per = await lu();
      eq(per.x, c[0].x, 'le point choisi reste en passant à PÉRIODE');
      assert(per.txt.includes(Math.round(Number(c[0].p[0])) + ' %'), 'valeur de période de Bleu affichée');
      assert(/période en cours/.test(await app.ev(() => document.getElementById('statsBody').textContent)), 'titre en mode période');
      const deb = await app.ev(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, svg: document.querySelector('.wpc-svg').getBoundingClientRect().right }));
      assert(deb.sw <= deb.cw && deb.svg <= deb.cw + 0.5, `aucun débordement horizontal (${JSON.stringify(deb)})`);
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
  });

  if (gabarit === 'tablette') await check(`${P}·4 match terminé puis rouvert depuis l'historique : même courbe qu'en fin de match`, async () => {
    const app = await launch(gabarit);
    try {
      await partie(app, '9_11', 808, 2);
      const fin = await courbe(app);
      await app.backToMatch();
      const id = await app.ev(() => S.id);
      await app.ev(() => finishMatchNow());
      await app.page.waitForTimeout(300);
      await app.ev(() => { closeSheet(); navHome(); });
      await app.ev(i => { WPC.key = null; viewArchivedMatchStats(i); }, id);
      eq(await app.ev(() => viewingArchive && S.status), 'completed', 'archive ouverte');
      eq(await courbe(app), fin, 'même courbe');
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
  });
}
