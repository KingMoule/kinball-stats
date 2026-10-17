/* STAT-4 : chiffres faux des statistiques (revue 3, S1 S2 S3 S5 S8). Détail : tests/docs/STAT4.md. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launch, assert, eq, rng, DEPOT } from '../lib.mjs';
import { Model, pickAction, play } from '../model.mjs';

const require = createRequire(import.meta.url);
const XLSX = require(path.join(DEPOT, 'vendor', 'xlsx.full.min.js'));
const feuille = (wb, nom) => XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, defval: '' });
const telecharger = async (app, appel) => {
  await app.ev(() => openExportMenu());
  const [dl] = await Promise.all([app.page.waitForEvent('download'), app.page.locator(`[onclick="${appel}"]`).click()]);
  return fs.readFileSync(await dl.path());
};

export const gabarits = ['tablette', 'telephone'];

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] STAT4`;

  /* S1 : un duel peut exclure Bleu ; l'onglet Zones retombait sur computeOverall()['Bleu'] = undefined. */
  await check(`${P}·1 onglet Zones d'un duel Gris contre Noir : rendu sans erreur, première équipe active choisie, rouvrir STATS aussi`, async () => {
    const app = await launch(gabarit);
    try {
      await app.startMatch({ format: 'duel11', excluded: 'Bleu', name: 'duel_sans_bleu' });
      await app.initialPossession('Gris');
      await app.lancer({ target: 'Noir', caught: false });
      await app.lancer({ target: 'Gris', caught: true });
      const r = await app.openStatsTab('zones');
      assert(r.rich, 'tableau des zones absent : ' + r.text.slice(0, 80));
      const btn = await app.ev(() => [...document.querySelectorAll('#statsBody .zone-team-row .heat-btn')].map(b => [b.getAttribute('onclick'), b.classList.contains('active')]));
      eq(btn, [["setMatchZoneTeam('Gris')", true], ["setMatchZoneTeam('Noir')", false]], 'boutons : Gris actif, pas de Bleu');
      eq(await app.ev(() => matchZoneTeam), 'Bleu', 'le choix n\'est pas réécrit par le rendu');
      /* rouvrir STATS (statTab.match reste à 'zones') */
      await app.backToMatch(); await app.settle();
      await app.ev(() => openStats());
      assert(await app.ev(() => !!document.querySelector('#statsBody .zone-team-row')), 'réouverture : onglet Zones rendu');
      /* choix Noir, puis un duel qui exclut Noir : retombe sur Bleu */
      await app.page.locator(`#statsBody [onclick="setMatchZoneTeam('Noir')"]`).click();
      eq(await app.ev(() => document.querySelector('#statsBody .heat-btn.active').getAttribute('onclick')), "setMatchZoneTeam('Noir')", 'Noir choisi');
      await app.backToMatch(); await app.settle();
      await app.startMatch({ format: 'duel11', excluded: 'Noir', name: 'duel_sans_noir' });
      await app.initialPossession('Bleu');
      await app.lancer({ target: 'Gris', caught: false });
      await app.openStatsTab('zones');
      eq(await app.ev(() => document.querySelector('#statsBody .heat-btn.active').getAttribute('onclick')), "setMatchZoneTeam('Bleu')", 'Noir hors jeu : Bleu actif');
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
  });

  /* S2 : en-têtes du tableau « Par période » : pastille rendue (pas de balisage en texte), nom échappé une seule fois. */
  await check(`${P}·2 « Par période » : en-tête court avec pastille, nom « A&B » échappé une fois (texte et title)`, async () => {
    const app = await launch(gabarit);
    try {
      await app.ev(() => { window.__pwn = 0; });
      await app.startMatch({ format: '9_11', names: { Bleu: 'A&B', Gris: '<b>x</b>' }, name: 'evo_noms' });
      await app.initialPossession('Bleu');
      await app.lancer({ target: 'Gris', caught: false });
      await app.lancer({ target: 'Noir', caught: true });
      await app.openStatsTab('overall');
      const d = await app.ev(() => {
        const th = document.querySelector('#statsBody th[onclick*="matchEvolution"][onclick*="off_Bleu"]');
        const thG = document.querySelector('#statsBody th[onclick*="matchEvolution"][onclick*="off_Gris"]');
        const sm = th.querySelector('.sm'), lg = th.querySelector('.lg');
        const vis = e => getComputedStyle(e).display !== 'none';
        return { lg: lg.textContent, sm: sm.textContent, sw: sm.querySelectorAll('.evo-sw').length, title: th.getAttribute('title'),
          lgG: thG.querySelector('.lg').textContent, bG: thG.querySelectorAll('b').length,
          visible: vis(sm) ? th.querySelector('.sm').innerText : th.querySelector('.lg').innerText };
      });
      eq(d.lg, 'OFF A&B', 'libellé long : nom échappé une seule fois');
      eq(d.title, 'Trier par OFF A&B', 'title');
      eq(d.sm, 'OFF ', 'libellé court : texte sans balisage');
      eq(d.sw, 1, 'libellé court : une pastille');
      eq([d.lgG, d.bG], ['OFF <b>x</b>', 0], 'nom avec balises : affiché en texte');
      assert(!/[<>]|&amp;/.test(d.visible), 'texte visible sans balisage : ' + d.visible);
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
  });

  /* S3 + S8 : points du match dérivés de l'historique, colonne neuve en fin de ligne du XLSX « Équipes ». */
  if (gabarit === 'tablette') await check(`${P}·3 XLSX « Équipes » : « Points marqués (match) » en dernière colonne = points rejoués par le modèle sur 3 périodes (élimination comprise) ; « Score final » inchangé`, async () => {
    const app = await launch(gabarit);
    try {
      await app.startMatch({ format: '9_11', name: 'points_match' });
      await app.initialPossession('Bleu');
      const m = new Model('9_11'); m.initial('Bleu');
      const tot = { Bleu: 0, Gris: 0, Noir: 0 };
      const orig = m._faultBy.bind(m);
      m._faultBy = team => { m.inPlay().forEach(t => { if (t !== team) tot[t]++; }); return orig(team); };
      const r = rng(404); let garde = 0;
      while (m.period < 3 && garde++ < 400) await play(app, m, pickAction(m, r));
      assert(m.period >= 3 && m.log.eliminations > 0, 'trois périodes et une élimination');
      const d = await app.ev(() => ({ pts: matchPoints(), sc: { ...S.scores } }));
      eq(d.pts, tot, 'matchPoints() = points du modèle');
      const wb = XLSX.read(await telecharger(app, 'exportXLSX()'), { type: 'buffer' });
      const eqp = feuille(wb, 'Équipes');
      eq(eqp[0].length, 17, 'dix-sept colonnes');
      eq(eqp[0][16], 'Points marqués (match)', 'colonne neuve en fin de ligne');
      eq(eqp[0][1], 'Score final', 'colonne « Score final » gardée à sa place');
      eq(eqp.slice(1).map(l => [l[0], l[1], l[16]]), ['Bleu', 'Gris', 'Noir'].map(t => [t, d.sc[t], tot[t]]), 'valeurs par équipe');
      /* ancien match sans before : aucun point compté, aucune erreur */
      eq(await app.ev(() => matchPoints({ activeTeams: ['Bleu', 'Gris'], history: [{ type: 'lancer', details: { result: 'échappé', target: 'Gris' } }, null] })), { Bleu: 0, Gris: 0 }, 'événements sans before');
      /* S8 : détail du % de victoire, le dénominateur = simulations achevées */
      await app.backToMatch(); await app.settle();
      const w = await app.ev(() => {
        if (!WP.result) return null;
        WP.result = { ...WP.result, unfinished: 10 };
        openWinDetail();
        const t = document.getElementById('sheet').textContent; closeSheet();
        return { t, n: WP.result.n - 10 };
      });
      assert(w, 'résultat du % de victoire absent');
      assert(w.t.includes(`victoires sur ${w.n} (`) && !w.t.includes(`sur ${w.n + 10} (`), 'dénominateur = n - inachevées : ' + w.t.slice(0, 160));
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
  });

  /* S5 : zones des fautes, même dénominateur (fautes localisées) dans le match et dans le cumul. */
  if (gabarit === 'tablette') await check(`${P}·4 fautes par zone : même % dans le match et dans le cumul quand des fautes n'ont pas de position ; mention sous le tableau du cumul`, async () => {
    const app = await launch(gabarit);
    try {
      await app.startMatch({ format: 'libre3', name: 'fautes_zones' });   /* sans seuil : Bleu garde le ballon après chaque faute */
      await app.initialPossession('Bleu');
      const pos = [[0.15, 0.15], [0.15, 0.15], [0.15, 0.15], [0.5, 0.5], [0.85, 0.85], [0.5, 0.15]];
      for (let k = 0; k < 10; k++) {
        await app.faute({ at: pos[k % pos.length] });
      }
      const d = await app.ev(() => {
        /* quatre fautes perdent leur position (anciens matchs ou saisie sans position) */
        let n = 0;
        S.history.forEach(e => { if (e.type === 'faute_directe' && e.before.possession === 'Bleu' && n < 4 && e.details.position_norm && e.details.position_norm[0] > 0.4) { delete e.details.position_norm; n++; } });
        const fz = computeFaultZones('Bleu', 'all');
        const copy = JSON.parse(JSON.stringify(S)); copy.id = 'stat4-test'; copy.teamIds = { Bleu: 'T_S4', Gris: null, Noir: null };
        MATCHES_DB.push(copy);
        try {
          const agg = computeTeamAggregate('T_S4');
          const h = document.createElement('div'); h.innerHTML = sectionTeamFaults(agg);
          const tab = [...h.querySelectorAll('table')].find(t => t.querySelector('th[onclick*="teamFaultZones"]'));
          const pctCol = [...tab.querySelectorAll('thead th')].findIndex(th => /pct/.test(th.getAttribute('onclick')));
          const cumul = {};
          tab.querySelectorAll('tbody tr').forEach(tr => { const c = tr.children; const lab = Object.values(ZONE_LABEL).find(l => c[0].textContent.trim().endsWith(l)); cumul[lab] = c[pctCol].textContent.trim(); });
          const match = {}; ZONES.forEach(z => { match[ZONE_LABEL[z]] = pctStr(fz.counts[z], fz.total); });
          return { cumul, match, enleve: n, total: fz.total, faults: agg.faults, note: h.textContent.includes(`${n} faute(s) directe(s) sans position`) };
        } finally { MATCHES_DB.pop(); }
      });
      assert(d.enleve > 0 && d.total + d.enleve === d.faults, `fautes sans position : ${d.enleve}, localisées ${d.total}, total ${d.faults}`);
      for (const z of Object.keys(d.match)) eq(d.cumul[z], d.match[z], `zone ${z} : cumul = match`);
      assert(d.note, 'mention des fautes sans position sous le tableau du cumul');
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
  });
}
