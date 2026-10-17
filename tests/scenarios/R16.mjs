/* R16 + R19 (R27) : l'état d'interface sort de S ; « REPRENDRE » sur les lignes EN COURS de l'historique.
   Détail : tests/docs/R16.md. */
import fs from 'node:fs';
import { launch, assert, eq, avantPath, SORTIE } from '../lib.mjs';

export const gabarits = ['tablette', 'telephone'];
const TMP = `${SORTIE}/captures/R16`;
fs.mkdirSync(TMP, { recursive: true });

const UI = ['heatTeam', 'heatMode', 'heatSituation', 'heatView', 'sheetDismissable'];
const HOSTILE = `"><img src=x onerror="window.__pwn=1"> l'équipe; x`;

/* Quelques actions réelles : des lancers (un sur deux attrapé) puis des fautes. */
async function jouer(app, { lancers = 4, fautes = 0 } = {}) {
  for (let k = 0; k < lancers; k++) {
    if (await app.awaitingDuel()) await app.duelStart('Gris');
    const info = await app.ev(() => ({ po: S.possession, el: S.eliminated, teams: ATEAMS() }));
    const cible = info.teams.find(t => t !== info.po && t !== info.el);
    await app.lancer({ from: [0.2 + 0.1 * (k % 4), 0.3], to: [0.7 - 0.1 * (k % 3), 0.65], target: cible, caught: k % 2 === 0 });
  }
  for (let k = 0; k < fautes; k++) {
    if (await app.awaitingDuel()) await app.duelStart('Gris');
    await app.faute({});
  }
}
async function nouveau(app, opts = {}) {
  const { lancers = 4, fautes = 0, ...reste } = opts;
  await app.startMatch(reste); await app.initialPossession('Bleu');
  await jouer(app, { lancers, fautes });
  return app.ev(() => S.id);
}
/* Attend que la base ait livré ces matchs avec au moins n événements chacun. */
const sansPanne = app => app.errors.filter(e => !/panne simulée/.test(e));
const attendreBase = (app, attendus) => app.page.waitForFunction(a => a.every(([id, n]) => { const r = getMatchRecord(id); return r && r.history.length >= n; }), attendus, { timeout: 8000, polling: 20 });
const attendreEcritures = app => app.page.waitForFunction(() => !hasUnsavedWork(), null, { timeout: 8000, polling: 20 });
const histoire = app => app.ev(() => { navHome(); openMatchHistory(); });
const ligne = (app, nom) => app.page.locator('#matchHistoryBody tbody tr').filter({ hasText: nom });
/* Doublure d'écriture à porte : writeMatchDoc attend __ouvrir() puis écrit pour de bon, ou échoue tant que __panne. */
const poserPorte = app => app.ev(() => {
  window.__vrai = window.writeMatchDoc; window.__panne = false; window.__ecrits = [];
  window.writeMatchDoc = async m => {
    if (window.__panne) throw new Error('panne simulée');
    if (window.__porte) await window.__porte;
    window.__ecrits.push([m.id, m.history.length]);
    return window.__vrai(m);
  };
});
const fermerPorte = app => app.ev(() => { window.__porte = new Promise(r => { window.__ouvrir = r; }); });
const ouvrirPorte = app => app.ev(() => { window.__ouvrir && window.__ouvrir(); window.__porte = null; });

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] R16`;

  /* ---------- 1. S sans état d'interface ---------- */
  await check(`${P}·1 S n'a plus aucune clé d'interface : match neuf, feuille ouverte puis fermée, bascules heat, écriture, rechargement`, async () => {
    const app = await launch(gabarit);
    try {
      const cles = () => app.ev(U => Object.keys(S).filter(k => U.includes(k)), UI);
      eq(await app.ev(() => Object.keys(freshState()).filter(k => /^heat|sheetDismissable/.test(k))), [], 'freshState()');
      await app.ev(() => { window.__docs = []; const o = window.writeMatchDoc; window.writeMatchDoc = m => { window.__docs.push(JSON.stringify(m)); return o(m); }; });
      await app.startMatch({ format: '9_11', name: 'neuf' });
      eq(await cles(), [], 'match neuf (feuille « qui commence » ouverte)');
      await app.initialPossession('Bleu');
      await jouer(app, { lancers: 4 });
      eq(await cles(), [], 'après des actions');
      /* feuille : ouverte par un vrai appui sur le terrain, fermée par l'abandon */
      await app.abandon();
      await app.ev(() => { openSheet('<div>x</div>', true); }); eq(await app.ev(() => sheetDismissable), true, 'dismissable posé hors de S');
      eq(await cles(), [], 'feuille ouverte');
      await app.ev(() => closeSheet()); eq(await cles(), [], 'feuille fermée');
      /* bascules heat par de vrais appuis */
      await app.openStatsTab('heat');
      const clic = c => app.page.locator(`#statsBody [onclick="${c}"]`).first().click();
      await clic(`setHeatTeam('Gris')`); await clic(`setHeatMode('defense')`); await clic(`setHeatView('dots')`);
      const sit = app.page.locator('#statsBody [onclick^="setHeatSituation("]');
      if (await sit.count() > 1) await sit.nth(1).click();
      eq(await app.ev(() => [heatTeam, heatMode, heatView]), ['Gris', 'defense', 'dots'], 'les choix sont dans les variables de module');
      eq(await cles(), [], 'après les bascules heat');
      /* écriture : le document envoyé à la base n'a aucune de ces clés ; la copie locale non plus */
      await app.ev(() => { navBack(); save(); });
      await attendreEcritures(app);
      const docs = await app.ev(() => window.__docs.map(d => Object.keys(JSON.parse(d))));
      assert(docs.length >= 1, 'une écriture au moins');
      docs.forEach(k => eq(k.filter(x => UI.includes(x)), [], 'document écrit'));
      eq(await app.ev(U => { const out = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k.startsWith('kinball_backup_')) out.push(Object.keys(JSON.parse(localStorage.getItem(k)).match).filter(x => U.includes(x))); } return out; }, UI).then(a => a.flat()), [], 'copie locale');
      /* rechargement : le match relu depuis la base n'a pas ces clés non plus */
      const id = await app.ev(() => S.id);
      await app.page.reload({ waitUntil: 'domcontentloaded' });
      await app.page.waitForFunction(() => typeof startMatch === 'function' && typeof S !== 'undefined');
      await app.page.waitForFunction(i => { try { return !!getMatchRecord(i); } catch (e) { return false; } }, id, { timeout: 8000, polling: 50 }).catch(() => {});
      const relu = await app.ev(([i, U]) => { const r = getMatchRecord(i); return r ? Object.keys(r).filter(k => U.includes(k)) : null; }, [id, UI]);
      assert(relu !== null, 'le match écrit est relu après rechargement');
      eq(relu, [], 'match relu après rechargement');
      eq(await cles(), [], 'S après rechargement');
      assert(app.errors.length === 0, app.errors.join(' | '));
    } finally { await app.close(); }
  });

  /* ---------- 2. fermeture des feuilles ---------- */
  await check(`${P}·2 les feuilles se ferment comme avant : toucher à côté ferme une feuille fermable, jamais une feuille « qui commence »`, async () => {
    const app = await launch(gabarit);
    try {
      await app.startMatch({ format: '9_11' });
      eq(await app.ev(() => [sheetDismissable, document.getElementById('sheet').classList.contains('open')]), [false, true], 'feuille de départ non fermable');
      await app.ev(() => closeSheetIfDismissable());
      eq(await app.ev(() => document.getElementById('sheet').classList.contains('open')), true, 'closeSheetIfDismissable sans effet');
      await app.page.locator('#sheetBackdrop').click({ position: { x: 4, y: 4 } });
      eq(await app.ev(() => document.getElementById('sheet').classList.contains('open')), true, 'toucher à côté : reste ouverte');
      await app.initialPossession('Bleu');
      await app.ev(() => openSheet('<div class="sheet-title">TEST</div>', true));
      eq(await app.ev(() => sheetDismissable), true);
      await app.settle();
      await app.page.locator('#sheetBackdrop').click({ position: { x: 4, y: 4 } });
      await app.settle();
      eq(await app.ev(() => document.getElementById('sheet').classList.contains('open')), false, 'toucher à côté : fermée');
      await app.ev(() => openSheet('<div>a</div>', false)); eq(await app.ev(() => sheetDismissable), false, 'rouverte non fermable');
      await app.ev(() => closeSheet());
      eq(await app.ev(() => Object.keys(S).filter(k => k === 'sheetDismissable')), [], 'rien dans S');
    } finally { await app.close(); }
  });

  /* ---------- 3. heat map : bascules ---------- */
  await check(`${P}·3 Heat map : les quatre bascules fonctionnent (match en cours, match archivé, cumul d'équipe), sans save()`, async () => {
    const app = await launch(gabarit);
    try {
      await nouveau(app, { name: 'heat', lancers: 8 });
      await app.ev(() => { window.__saves = 0; const o = window.save; window.save = function (...x) { window.__saves++; return o.apply(this, x); }; window.__maj = S.updatedAt; });
      await app.openStatsTab('heat');
      const lire = () => app.ev(() => {
        const leg = document.querySelector('.heat-legend').textContent.replace(/\s+/g, ' ');
        return {
          act: [...document.querySelectorAll('#statsBody .heat-btn.active')].map(b => b.textContent.trim()),
          n: +(leg.match(/(\d+) lancer/) || [0, -1])[1], circles: document.querySelectorAll('.heat-field circle.heat-pt').length,
          cells: document.querySelectorAll('.heat-field svg g').length,
          attendu: ['offense', 'defense'].map(m => heatPointsFrom(S, heatTeam || ATEAMS()[0], m, 'all').length),
        };
      });
      const clic = c => app.page.locator(`#statsBody [onclick="${c}"]`).first().click();
      const b0 = await lire();
      assert(b0.act.includes('OFFENSIVE') && b0.act.includes('GRILLE'), 'défauts : offensive, grille : ' + b0.act);
      eq(await app.ev(() => [heatTeam, heatMode, heatSituation, heatView]), [null, 'offense', 'all', 'grid'], 'valeurs par défaut des variables');
      eq(await app.ev(() => document.querySelector('#statsBody .heat-btn.active').textContent.trim().length > 0), true, 'une équipe active');
      for (const t of ['Gris', 'Noir', 'Bleu']) {
        await clic(`setHeatTeam('${t}')`);
        eq(await app.ev(() => heatTeam), t); eq(await app.ev(t => document.querySelector('#statsBody .heat-btn.active').getAttribute('onclick'), t), `setHeatTeam('${t}')`, 'équipe active ' + t);
        const n = await lire();
        eq(n.n, n.attendu[0], 'lancers de ' + t + ' (offensive)');
      }
      await clic(`setHeatMode('defense')`);
      { const n = await lire(); assert(n.act.includes('DÉFENSIVE'), 'DÉFENSIVE active'); eq(n.n, n.attendu[1], 'défensive'); }
      await clic(`setHeatView('dots')`);
      { const n = await lire(); eq(n.circles, n.n, 'cercles = lancers'); assert(n.act.includes('POINTS'), 'POINTS actif'); }
      const sit = app.page.locator('#statsBody [onclick^="setHeatSituation("]');
      assert(await sit.count() > 1, 'filtre de situation présent');
      await sit.nth(1).click();
      eq(await app.ev(() => heatSituation !== 'all'), true, 'situation choisie');
      await clic(`setHeatView('grid')`); await clic(`setHeatMode('offense')`);
      eq(await app.ev(() => [window.__saves, S.updatedAt === window.__maj]), [0, true], 'aucun save() : plus rien à enregistrer');
      await app.shot(`${TMP}/R16-heat-${gabarit}.png`);

      /* archivé : une copie terminée du match, consultée */
      await app.ev(() => { heatSituation = 'all'; heatTeam = null; const c = JSON.parse(JSON.stringify(S)); c.id = 'arch_r16'; c.status = 'completed'; MATCHES_DB.push(c); viewArchivedMatchStats('arch_r16'); });
      eq(await app.ev(() => viewingArchive), true);
      await app.openStatsTab('heat');
      await clic(`setHeatTeam('Gris')`); await clic(`setHeatMode('defense')`);
      { const n = await lire(); assert(n.act.includes('DÉFENSIVE'), 'archive : défensive'); eq(n.n, n.attendu[1], 'archive : lancers = recalcul'); }
      await clic(`setHeatView('dots')`);
      { const n = await lire(); eq(n.circles, n.n, 'archive : cercles = lancers'); }
      eq(await app.ev(() => [window.__saves, viewingArchive]), [0, true], 'archive : aucun save()');
      await app.ev(() => { exitArchiveView(); MATCHES_DB = MATCHES_DB.filter(m => m.id !== 'arch_r16'); });

      /* cumul d'équipe : inchangé, et sans lien avec les choix du match */
      const cum = await app.ev(() => {
        const copy = JSON.parse(JSON.stringify(S)); copy.id = 'cum_r16'; copy.teamIds = { Bleu: 'T_X', Gris: 'T_Y', Noir: null };
        MATCHES_DB.push(copy);
        try {
          heatMode = 'defense'; heatView = 'dots'; teamHeatMode = 'offense'; teamHeatView = 'grid';
          const host = document.createElement('div'); host.innerHTML = sectionTeamHeat({ matchesPlayed: 1 }, 'T_X');
          return { act: [...host.querySelectorAll('.heat-btn.active')].map(b => b.textContent.trim()), n: heatPointsFrom(copy, 'Bleu', 'offense', 'all', 'start').length, leg: host.querySelector('.heat-legend').textContent };
        } finally { MATCHES_DB.pop(); heatMode = 'offense'; heatView = 'grid'; }
      });
      assert(cum.act.includes('OFFENSIVE') && cum.act.includes('GRILLE'), 'cumul : ses propres choix : ' + cum.act);
      eq(+cum.leg.match(/(\d+) lancer/)[1], cum.n, 'cumul : lancers');
      assert(app.errors.length === 0, app.errors.join(' | '));
    } finally { await app.close(); }
  });

  await check(`${P}·4 Heat map en duel à 2 équipes : une équipe absente retombe sur la première équipe active, sans erreur (match en cours et archivé)`, async () => {
    const app = await launch(gabarit);
    try {
      await nouveau(app, { format: 'duel11', excluded: 'Noir', name: 'duel', lancers: 3 });
      eq(await app.ev(() => ATEAMS()), ['Bleu', 'Gris'], 'duel Bleu-Gris');
      await app.ev(() => { heatTeam = 'Noir'; });   // équipe d'un match précédent, absente ici
      await app.openStatsTab('heat');
      const actives = () => app.ev(() => [...document.querySelectorAll('#statsBody .heat-btn.active')].map(b => b.getAttribute('onclick')));
      assert((await actives()).includes(`setHeatTeam('Bleu')`), 'retombe sur Bleu : ' + (await actives()));
      eq(await app.page.locator(`#statsBody [onclick="setHeatTeam('Noir')"]`).count(), 0, 'pas de bouton Noir');
      eq(await app.ev(() => Object.keys(S).filter(k => /^heat/.test(k))), [], 'S propre');
      await app.page.locator(`#statsBody [onclick="setHeatTeam('Gris')"]`).click();
      assert((await actives()).includes(`setHeatTeam('Gris')`), 'Gris choisi');
      /* duel en équipes Gris-Noir (Bleu absent) consulté en archive avec heatTeam = Bleu */
      const r = await app.ev(() => {
        const c = JSON.parse(JSON.stringify(S)); c.id = 'arch_duel'; c.status = 'completed'; c.activeTeams = ['Gris', 'Noir'];
        MATCHES_DB.push(c); heatTeam = 'Bleu';
        try { viewArchivedMatchStats('arch_duel'); const html = sectionMatchHeat(); return { ok: true, noBleu: !/setHeatTeam\('Bleu'\)/.test(html), gris: /class="heat-btn active[^"]*"[^>]*setHeatTeam\('Gris'\)|setHeatTeam\('Gris'\)/.test(html) && /heat-btn active[^>]*onclick="setHeatTeam\('Gris'\)"/.test(html) }; }
        catch (e) { return { ok: false, err: String(e) }; }
        finally { exitArchiveView(); MATCHES_DB = MATCHES_DB.filter(m => m.id !== 'arch_duel'); }
      });
      eq([r.ok, r.noBleu, r.gris], [true, true, true], 'archive Gris-Noir : ' + JSON.stringify(r));
      assert(app.errors.length === 0, app.errors.join(' | '));
    } finally { await app.close(); }
  });

  /* ---------- 5. ancien document ---------- */
  await check(`${P}·5 un match d'avant (avec heat* et sheetDismissable) se charge, se joue et se sauvegarde ; les champs sont ignorés`, async () => {
    const app = await launch(gabarit);
    try {
      const id = await nouveau(app, { name: 'ancien', lancers: 3 });
      await attendreEcritures(app);
      const ancien = await app.ev(() => {
        const c = JSON.parse(JSON.stringify(S));
        Object.assign(c, { heatTeam: 'Noir', heatMode: 'defense', heatSituation: 'stopped', heatView: 'dots', sheetDismissable: true });
        c.id = 'ancien_doc'; c.updatedAt = Date.now() + 10;
        return c;
      });
      await app.ev(() => { navHome(); });
      assert(await app.ev(d => raisonMatch(d) === null, ancien), 'accepté par la validation d\'import');
      await app.ev(d => { MATCHES_DB.push(d); heatTeam = null; heatMode = 'offense'; heatSituation = 'all'; heatView = 'grid'; }, ancien);
      await app.ev(() => { resumeMatch('ancien_doc'); });
      eq(await app.ev(() => [S.id, currentScreen()]), ['ancien_doc', 'match'], 'repris');
      await app.settle();
      const avant = await app.ev(() => S.history.length);
      await app.ev(() => { if (document.getElementById('sheet').classList.contains('open')) closeSheet(); });
      await jouer(app, { lancers: 1, fautes: 1 });
      eq(await app.ev(() => S.history.length), avant + 2, 'deux actions jouées');
      await attendreEcritures(app);
      await app.ev(() => save());
      await attendreEcritures(app);
      await app.openStatsTab('heat');
      const act = await app.ev(() => [...document.querySelectorAll('#statsBody .heat-btn.active')].map(b => b.textContent.trim()));
      assert(act.includes('OFFENSIVE') && act.includes('GRILLE') && !act.includes('DÉFENSIVE') && !act.includes('POINTS'), 'champs hérités ignorés : ' + act);
      assert(!(await app.ev(() => document.querySelector('#statsBody .heat-btn.active').getAttribute('onclick') === `setHeatTeam('Noir')`)), 'équipe héritée ignorée');
      eq(await app.ev(() => sheetDismissable), false, 'dismissable hérité ignoré (la feuille ouverte par le terrain décide)');
      assert(app.errors.length === 0, app.errors.join(' | '));
      void id;
    } finally { await app.close(); }
  });

  /* ---------- 6. historique : REPRENDRE ---------- */
  const monter = async app => {
    const ids = {};
    ids.alpha = await nouveau(app, { name: 'Alpha', lancers: 3 });
    ids.bravo = await nouveau(app, { name: 'Bravo', lancers: 2, fautes: 1 });
    ids.charlie = await nouveau(app, { name: 'Charlie', lancers: 2 });
    await app.ev(() => { finishMatchNow(); closeSheet(); }); await app.settle();
    await app.startMatch({ name: 'Delta' });             // lancé, sans aucune action
    ids.delta = await app.ev(() => S.id);
    await app.ev(() => closeSheet());
    await attendreEcritures(app);
    await attendreBase(app, [[ids.alpha, 3], [ids.bravo, 3], [ids.charlie, 2]]);
    return ids;
  };
  await check(`${P}·6 Historique : « REPRENDRE » sur chaque ligne EN COURS (au moins une action), absent des lignes terminées et vides ; reprend le bon match ; le reste de la ligne ouvre les stats`, async () => {
    const app = await launch(gabarit);
    try {
      const ids = await monter(app);
      eq(await app.ev(() => [getMatchRecord(S.id) && getMatchRecord(S.id).history.length, findResumableMatch().id]), [0, ids.bravo], 'Bravo est le plus récent à reprendre');
      await histoire(app);
      const bouton = nom => ligne(app, nom).locator('.row-resume');
      eq([await bouton('Alpha').count(), await bouton('Bravo').count(), await bouton('Charlie').count(), await bouton('Delta').count()], [1, 1, 0, 0], 'boutons : Alpha, Bravo oui ; Charlie (terminé), Delta (0 action) non');
      eq(await ligne(app, 'Charlie').locator('.status-badge').first().textContent(), 'TERMINÉ');
      const bb = await bouton('Alpha').boundingBox();
      assert(bb.width >= 44 && bb.height >= 44, `zone tactile ${bb.width}×${bb.height}`);
      eq(await bouton('Alpha').getAttribute('aria-label'), 'Reprendre le match Alpha', 'aria-label');
      eq(await app.ev(() => { const de = document.documentElement; return de.scrollWidth > de.clientWidth + 1; }), false, 'pas de débordement de la page');
      await app.shot(`${TMP}/R16-historique-${gabarit}.png`);
      /* le reste de la ligne : les stats de l'archive */
      await ligne(app, 'Alpha').locator('td').first().click();
      eq(await app.ev(() => [viewingArchive, currentScreen(), S.id]), [true, 'stats', ids.alpha], 'clic sur la ligne : stats de l\'archive');
      await app.ev(() => navBack());
      eq(await app.ev(() => viewingArchive), false, 'sortie de l\'archive');
      /* REPRENDRE sur le plus ancien (Alpha), pas sur le plus récent (Bravo) */
      await histoire(app);
      await bouton('Alpha').click();
      eq(await app.ev(() => [S.id, currentScreen(), viewingArchive, S.matchName, S.history.length]), [ids.alpha, 'match', false, 'Alpha', 3], 'Alpha repris');
      eq(await app.ev(() => navStack), ['home', 'match'], 'pile de navigation');
      /* le match repris se joue et s'enregistre */
      await jouer(app, { lancers: 0, fautes: 1 });
      eq(await app.ev(() => S.history.length), 4, 'une action de plus');
      await attendreEcritures(app);
      await attendreBase(app, [[ids.alpha, 4]]);
      /* sans argument : le plus récent, comme avant (barre d'app / bannière) */
      await app.ev(() => { navHome(); resumeMatch(); });
      eq(await app.ev(() => S.id), ids.alpha, 'sans argument : le plus récemment mis à jour (Alpha vient d\'être joué)');
      assert(app.errors.length === 0, app.errors.join(' | '));
    } finally { await app.close(); }
  });

  /* ---------- 7. reprendre B pendant que S est A ---------- */
  const scenarioProtection = async (nom, { avecArchive, panne }) => {
    const app = await launch(gabarit);
    try {
      const ids = {};
      ids.b = await nouveau(app, { name: 'Bravo', lancers: 2, fautes: 1 });
      await attendreEcritures(app);
      await attendreBase(app, [[ids.b, 3]]);
      await poserPorte(app);
      /* A : un match de plus, dont l'écriture est lente (porte fermée) ou en échec */
      if (panne) await app.ev(() => { window.__panne = true; }); else await fermerPorte(app);
      ids.a = await nouveau(app, { name: 'Alpha', lancers: 3, fautes: 1 });
      const nA = await app.ev(() => S.history.length);
      eq(await app.ev(() => hasUnsavedWork()), true, nom + ' : écriture de A non confirmée');
      const sRef = await app.ev(() => { window.__sRef = S; return S.id; });
      eq(sRef, ids.a);
      if (avecArchive) {
        await app.ev(() => { const c = JSON.parse(JSON.stringify(getMatchRecord(MATCHES_DB.find(m => m.matchName === 'Bravo').id))); c.id = 'arch_c'; c.status = 'completed'; MATCHES_DB.push(c); viewArchivedMatchStats('arch_c'); });
        eq(await app.ev(() => [viewingArchive, LIVE_S.id]), [true, ids.a], 'archive consultée, A mis de côté');
      } else {
        await app.ev(() => navHome());
      }
      /* l'écran de l'historique n'est pas atteignable depuis la consultation : on appelle ce que le bouton appelle */
      if (!avecArchive) { await app.ev(() => openMatchHistory()); await app.page.locator('#matchHistoryBody tbody tr').filter({ hasText: 'Bravo' }).locator('.row-resume').click(); }
      else await app.ev(i => resumeMatch(i), ids.b);
      /* refusé : rien n'a bougé, un message le dit */
      const etat = await app.ev(() => ({ id: S.id, n: S.history.length, ref: S === window.__sRef, arch: viewingArchive, live: LIVE_S ? LIVE_S.id : null, feuille: document.querySelector('#sheet .sheet-title') && document.querySelector('#sheet .sheet-title').textContent, ouverte: document.getElementById('sheet').classList.contains('open'), pend: hasUnsavedWork() }));
      eq([etat.ouverte, etat.feuille, etat.pend], [true, 'ENREGISTREMENT EN COURS', true], nom + ' : message de refus');
      if (avecArchive) eq([etat.arch, etat.live], [true, ids.a], nom + ' : consultation et match de saisie intacts');
      else eq([etat.id, etat.n, etat.ref], [ids.a, nA, true], nom + ' : S est toujours A, sans perte');
      /* la panne cesse : on réessaie par le bouton du message ; A est alors écrit en entier */
      if (panne) await app.ev(() => { window.__panne = false; }); else await ouvrirPorte(app);
      if (avecArchive) await app.ev(() => { closeSheet(); navHome(); retryNow(); });   // pendant la consultation, save() ne fait rien : on quitte l'archive d'abord
      else await app.clickSheet('closeSheet(); retryNow()');
      await attendreEcritures(app);
      await attendreBase(app, [[ids.a, nA]]);
      eq(await app.ev(a => getMatchRecord(a).history.length, ids.a), nA, nom + ' : A enregistré en entier (' + nA + ' actions)');
      /* maintenant la reprise passe */
      await app.settle();
      if (avecArchive) await app.ev(i => resumeMatch(i), ids.b);
      else { await app.ev(() => { navHome(); openMatchHistory(); }); await app.page.locator('#matchHistoryBody tbody tr').filter({ hasText: 'Bravo' }).locator('.row-resume').click(); }
      eq(await app.ev(() => [S.id, viewingArchive, currentScreen(), S.history.length]), [ids.b, false, 'match', 3], nom + ' : Bravo repris');
      /* et rien de A ne se perd : la copie de A est complète, B n'a pas été écrasé par A ni A par B */
      eq(await app.ev(([a, b]) => [getMatchRecord(a).history.length, getMatchRecord(b).history.length, getMatchRecord(a).matchName, getMatchRecord(b).matchName], [ids.a, ids.b]), [nA, 3, 'Alpha', 'Bravo'], nom + ' : A et B intacts dans la base');
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  };
  await check(`${P}·7 reprendre B pendant que S est A, écriture de A LENTE : refus avec message, aucune action de A perdue, reprise possible ensuite`, () => scenarioProtection('écriture lente', { avecArchive: false, panne: false }));
  await check(`${P}·8 reprendre B pendant que S est A, écriture de A EN ÉCHEC : refus avec message, réessai par le message, puis reprise`, () => scenarioProtection('écriture en échec', { avecArchive: false, panne: true }));
  await check(`${P}·9 pendant la consultation d'une archive (A mis de côté, écriture en échec) : la reprise de B est refusée sans toucher à la consultation ni à A`, () => scenarioProtection('archive + échec', { avecArchive: true, panne: true }));

  await check(`${P}·10 reprendre le match déjà dans S ne le remplace pas (S plus récent que sa copie), même écriture non confirmée ; sans écriture en vol, reprendre B ne perd rien de A`, async () => {
    const app = await launch(gabarit);
    try {
      const ids = {};
      ids.b = await nouveau(app, { name: 'Bravo', lancers: 2, fautes: 1 });
      await attendreEcritures(app); await attendreBase(app, [[ids.b, 3]]);
      ids.a = await nouveau(app, { name: 'Alpha', lancers: 2 });
      await attendreEcritures(app); await attendreBase(app, [[ids.a, 2]]);
      await poserPorte(app); await fermerPorte(app);
      await jouer(app, { lancers: 0, fautes: 2 });
      await app.ev(() => { window.__sRef = S; });
      const nA = await app.ev(() => S.history.length);
      eq(await app.ev(a => { const r = getMatchRecord(a); return !r || r.history.length < S.history.length; }, ids.a), true, 'la copie de la base est plus ancienne que S');
      await app.ev(a => { navHome(); resumeMatch(a); }, ids.a);
      eq(await app.ev(() => [S === window.__sRef, S.history.length, currentScreen(), document.getElementById('sheet').classList.contains('open') && document.querySelector('#sheet .sheet-title').textContent]), [true, nA, 'match', false], 'S gardé tel quel, aucun refus');
      await ouvrirPorte(app); await attendreEcritures(app); await attendreBase(app, [[ids.a, nA]]);
      /* écritures confirmées : reprendre B remplace S sans rien perdre */
      await app.ev(b => { navHome(); resumeMatch(b); }, ids.b);
      eq(await app.ev(() => [S.id, currentScreen()]), [ids.b, 'match'], 'B repris');
      eq(await app.ev(a => getMatchRecord(a).history.length, ids.a), nA, 'A complet dans la base');
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  /* ---------- 11. noms hostiles ---------- */
  await check(`${P}·11 noms hostiles (match et équipes) : aucune injection dans le bouton REPRENDRE, son aria-label ni le message de refus`, async () => {
    const app = await launch(gabarit);
    try {
      const nom = HOSTILE;
      const id = await nouveau(app, { name: nom, lancers: 2, names: { Bleu: HOSTILE, Gris: `G';alert(1);//`, Noir: '</td><b>N' } });
      await attendreEcritures(app); await attendreBase(app, [[id, 2]]);
      await histoire(app);
      eq(await app.page.locator('#matchHistoryBody tbody tr').count(), 1, 'une ligne');
      eq(await app.page.locator('#matchHistoryBody img').count(), 0, 'aucune image injectée');
      eq(await app.ev(() => window.__pwn), undefined, 'aucun script exécuté');
      const b = app.page.locator('#matchHistoryBody .row-resume');
      eq(await b.count(), 1);
      eq(await b.getAttribute('aria-label'), 'Reprendre le match ' + nom, 'aria-label = nom lu comme du texte');
      eq(await app.ev(() => document.querySelectorAll('#matchHistoryBody [onerror]').length), 0, 'aucun attribut onerror');
      /* le clic reprend bien CE match */
      await b.click();
      eq(await app.ev(() => [S.id, S.matchName, currentScreen()]), [id, nom, 'match']);
      /* message de refus : le nom du match qu'on quitte y est échappé */
      await poserPorte(app); await app.ev(() => { window.__panne = true; });
      await jouer(app, { lancers: 0, fautes: 1 });
      await app.ev(() => { navHome(); resumeMatch('inconnu'); });   // identifiant inconnu : sans effet
      eq(await app.ev(() => [currentScreen(), document.getElementById('sheet').classList.contains('open')]), ['home', false], 'identifiant inconnu : aucun effet');
      const autre = await app.ev(() => { const c = JSON.parse(JSON.stringify(S)); c.id = 'autre_r16'; c.matchName = 'Autre'; c.updatedAt = 1; MATCHES_DB.push(c); resumeMatch('autre_r16'); return document.getElementById('sheet').innerHTML; });
      assert(/ENREGISTREMENT EN COURS/.test(autre), 'refus affiché');
      eq(await app.ev(() => document.querySelectorAll('#sheet img').length), 0, 'message de refus : pas d\'image');
      eq(await app.ev(() => window.__pwn), undefined, 'aucun script exécuté (message)');
      assert(sansPanne(app).length === 0, sansPanne(app).join(' | '));
    } finally { await app.close(); }
  });

  /* ---------- 12. exports ---------- */
  await check(`${P}·12 exports : aucune colonne ni feuille ne lit les champs retirés ; exportJSON ne les contient plus ; identiques à main (copie d'avant si fournie), hors ces cinq clés de exportJSON`, async () => {
    const app = await launch(gabarit);
    try {
      await nouveau(app, { name: 'export', lancers: 4, fautes: 1 });
      const r = await app.ev(U => ({
        act: buildActionRows().header, brut: buildRawRows().header,
        info: matchInfoRows().map(x => String(x[0])),
        json: Object.keys(JSON.parse(JSON.stringify(S))),
      }), UI);
      [...r.act, ...r.brut, ...r.info].forEach(h => assert(!/heat|dismiss/i.test(h), 'colonne ou ligne suspecte : ' + h));
      eq(r.json.filter(k => UI.includes(k)), [], 'exportJSON : les cinq clés ont disparu');
      const ref = avantPath('kinball.R16.avant.html');
      if (ref) {
        const vieux = await launch(gabarit, { html: ref });
        try {
          await nouveau(vieux, { name: 'export', lancers: 4, fautes: 1 });
          const o = await vieux.ev(() => ({ act: buildActionRows().header, brut: buildRawRows().header, info: matchInfoRows().map(x => String(x[0])), json: Object.keys(S) }));
          eq(r.act, o.act, 'colonnes CSV actions identiques à main'); eq(r.brut, o.brut, 'colonnes brutes identiques à main'); eq(r.info, o.info, 'feuille « infos » identique à main');
          eq(o.json.filter(k => !r.json.includes(k)).sort(), [...UI].sort(), 'exportJSON : main avait ces cinq clés de plus, rien d\'autre');
          eq(r.json.filter(k => !o.json.includes(k)), [], 'aucune clé nouvelle');
        } finally { await vieux.close(); }
      }
    } finally { await app.close(); }
  });
}
