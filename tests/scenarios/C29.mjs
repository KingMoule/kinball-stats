/* C29 · STAT-1 : la faute directe entre dans le total de lancers d'une équipe (OFF % compris).
   Match de contrôle à trois équipes, joué avec de vrais appuis ; toutes les valeurs attendues sont écrites en dur (calculées à la main) :
     E1  Bleu → Gris   échappé   z1  Bleu_p1          (arrêtée)
     E2  Gris  faute   EXT       z5  Gris_p1          (arrêtée : après un échappé)
     E3  Gris → Noir   attrapé   z7  Gris_p2          (arrêtée : après une faute)
     E4  Noir  faute   APPEL     z3  « ? »            (continue : Noir vient d'attraper)
     E5  Noir  faute d'équipe    z7                   (arrêtée : après une faute)
     E6  Noir → Bleu   échappé   z8  Noir_p1          (arrêtée)
     E7  Bleu → Gris   attrapé   z9  Bleu_p2          (arrêtée : Bleu a reçu un échappé)
     E8  Gris → Noir   échappé   z2  Gris_p1          (continue : Gris vient d'attraper)
     E9  Noir  faute   APPEL     z1  Noir_p1          (arrêtée : après un échappé)
   OFF % de la vue d'ensemble : Bleu 1/2 (50 %), Gris 1/3 (33 %), Noir 1/4 (25 %) ; sur les seuls lancers : 1/2, 1/2, 1/1.
   1  Vue d'ensemble du match (compteurs, tableau rendu) ; DÉF %, F %, scores inchangés
   2  cumul d'équipe et classement : mêmes pourcentages dans les deux écrans ; détail par adversaire inchangé
   3  grille H2H du match : valeurs d'avant ; arrêtée / continue : fautes dans les totaux, pas dans le détail
   4  zones OFF : la faute compte dans la case de sa position ; sans position, dans le total seulement
   5  par période : l'OFF % d'une période compte les fautes de cette période
   6  joueurs : une faute attribuée est un lancer raté ; faute « ? » ou d'équipe : aucune ligne de joueur
   7  exports : colonnes anciennes aux valeurs d'avant (en dur), colonnes neuves en fin de ligne et justes (CSV et XLSX)
   8  match sans aucune faute : stats et exports identiques à ceux d'avant (colonnes neuves = anciennes)
   Contrôle négatif : KINBALL_HTML=<copie de main>/index.html KINBALL_ONLY=C29 node tests/run.mjs doit échouer (1 à 7 ; le 8 échoue aussi : champs absents). */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launch, assert, eq, DEPOT, avantPath } from '../lib.mjs';

const require = createRequire(import.meta.url);
const XLSX = require(path.join(DEPOT, 'vendor', 'xlsx.full.min.js'));

export const gabarits = ['tablette'];

function lireCSV(texte) {
  if (texte.charCodeAt(0) === 0xFEFF) texte = texte.slice(1);
  const lignes = []; let ligne = [], champ = '', q = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (q) { if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i++; } else q = false; } else champ += c; }
    else if (c === '"') q = true;
    else if (c === ';') { ligne.push(champ); champ = ''; }
    else if (c === '\r' && texte[i + 1] === '\n') { ligne.push(champ); lignes.push(ligne); ligne = []; champ = ''; i++; }
    else champ += c;
  }
  ligne.push(champ); lignes.push(ligne);
  return lignes;
}
const telecharger = async (app, appel) => {
  await app.ev(() => openExportMenu());
  const [dl] = await Promise.all([app.page.waitForEvent('download'), app.page.locator(`[onclick="${appel}"]`).click()]);
  return fs.readFileSync(await dl.path());
};
const feuille = (wb, nom) => XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, defval: '' });

/* Le match de contrôle (voir l'en-tête). */
async function jouerControle(app) {
  await app.startMatch({ format: '9_11', withRosters: true, name: 'controle_c29' });
  await app.initialPossession('Bleu');
  await app.lancer({ target: 'Gris', caught: false, from: [0.3, 0.3], to: [0.7, 0.6], player: 'Bleu_p1' });          // E1
  await app.faute({ code: 'EXT', at: [0.5, 0.5], player: 'Gris_p1' });                                               // E2
  await app.lancer({ target: 'Noir', caught: true, from: [0.2, 0.7], to: [0.6, 0.2], player: 'Gris_p2' });           // E3
  await app.faute({ code: 'APPEL', at: [0.8, 0.2] });                                                                // E4 (joueur « ? »)
  await app.faute({ code: 'APPEL', at: [0.2, 0.8], player: '__equipe__' });                                          // E5
  await app.lancer({ target: 'Bleu', caught: false, from: [0.5, 0.9], to: [0.4, 0.5], player: 'Noir_p1' });          // E6
  await app.lancer({ target: 'Gris', caught: true, from: [0.8, 0.8], to: [0.6, 0.4], player: 'Bleu_p2' });           // E7
  await app.lancer({ target: 'Noir', caught: false, from: [0.5, 0.2], to: [0.3, 0.6], player: 'Gris_p1' });          // E8
  await app.faute({ code: 'APPEL', at: [0.1, 0.1], player: 'Noir_p1' });                                             // E9
}
/* Même début, sans aucune faute. */
async function jouerSansFaute(app) {
  await app.startMatch({ format: '9_11', withRosters: true, name: 'sans_faute_c29' });
  await app.initialPossession('Bleu');
  await app.lancer({ target: 'Gris', caught: false, from: [0.3, 0.3], to: [0.7, 0.6], player: 'Bleu_p1' });
  await app.lancer({ target: 'Noir', caught: true, from: [0.2, 0.7], to: [0.6, 0.2], player: 'Gris_p2' });
  await app.lancer({ target: 'Bleu', caught: false, from: [0.5, 0.9], to: [0.4, 0.5], player: 'Noir_p1' });
  await app.lancer({ target: 'Gris', caught: true, from: [0.8, 0.8], to: [0.6, 0.4], player: 'Bleu_p2' });
  await app.lancer({ target: 'Noir', caught: false, from: [0.5, 0.2], to: [0.3, 0.6], player: 'Gris_p1' });
}

/* Valeurs attendues du match de contrôle. */
const ATT = { Bleu: [2, 1], Gris: [3, 1], Noir: [4, 1] };            // tentatives avec fautes, réussites
const LANCERS = { Bleu: [2, 1], Gris: [2, 1], Noir: [1, 1] };        // lancers seuls
const ZONES_OLD = { Bleu: { z1: [1, 1], z9: [1, 0] }, Gris: { z2: [1, 1], z7: [1, 0] }, Noir: { z8: [1, 1] } };
const ZONES_NEW = { Bleu: { z1: [1, 1], z9: [1, 0] }, Gris: { z2: [1, 1], z5: [1, 0], z7: [1, 0] }, Noir: { z1: [1, 0], z3: [1, 0], z7: [1, 0], z8: [1, 1] } };

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] C29`;

  await check(`${P}·1 vue d'ensemble du match : OFF % = échappés / (lancers + fautes) ; DÉF %, F %, scores inchangés`, async () => {
    const app = await launch(gabarit);
    try {
      await jouerControle(app);
      const r = await app.ev(() => {
        const o = computeOverall(), f = computeFaults(), st = computeSituations(S);
        const c = {}; ATEAMS().forEach(t => { c[t] = overallCounters(t, o[t], st[t], f[t]); });
        const h = document.createElement('div'); h.innerHTML = sectionMatchOverall();
        const txt = {}; h.querySelectorAll('tbody tr').forEach(tr => { const n = tr.textContent; ['Bleu', 'Gris', 'Noir'].forEach(t => { if (n.startsWith(t)) txt[t] = tr.textContent; }); });
        return { n: S.history.length, scores: S.scores, c, txt,
          old: ATEAMS().map(t => [t, o[t].offAttempts, o[t].offSuccesses, o[t].defAttempts, o[t].defSuccesses]),
          faults: ATEAMS().map(t => [t, f[t].actions, f[t].faults]), sect: h.querySelector('.section-sub').textContent };
      });
      eq(r.n, 9, 'neuf événements');
      eq(r.scores, { Bleu: 6, Gris: 5, Noir: 3 }, 'scores inchangés');
      for (const t of ['Bleu', 'Gris', 'Noir']) {
        eq([r.c[t].off.attempts, r.c[t].off.successes], ATT[t], `${t} : OFF = échappés / (lancers + fautes)`);
      }
      eq(r.old.map(x => x.slice(0, 3)), [['Bleu', 2, 1], ['Gris', 2, 1], ['Noir', 1, 1]], 'les compteurs « lancers seuls » restent là');
      eq(r.old.map(x => [x[0], x[3], x[4]]), [['Bleu', 1, 0], ['Gris', 2, 1], ['Noir', 2, 1]], 'DÉF % inchangé');
      eq(r.faults, [['Bleu', 2, 0], ['Gris', 3, 1], ['Noir', 4, 3]], 'F % inchangé (actions, fautes)');
      eq(r.c.Bleu.def, { attempts: 1, successes: 0 }); eq(r.c.Noir.def, { attempts: 2, successes: 1 });
      assert(r.txt.Bleu.includes('50%') && r.txt.Gris.includes('33%') && r.txt.Noir.includes('25%'), 'les pourcentages rendus : ' + JSON.stringify(r.txt));
      assert(/fautes directes/.test(r.sect) && !/attaques non attrapées/.test(r.sect), 'définition de l\'OFF à jour : ' + r.sect);
    } finally { await app.close(); }
  });

  await check(`${P}·2 cumul d'équipe et classement : mêmes pourcentages, détail par adversaire inchangé`, async () => {
    const app = await launch(gabarit);
    try {
      await jouerControle(app);
      const r = await app.ev(() => {
        const copy = JSON.parse(JSON.stringify(S)); copy.id = 'c29-test'; copy.teamIds = { Bleu: 'T_A', Gris: 'T_B', Noir: 'T_C' };
        const sauveTeams = TEAMS_DB.slice();
        MATCHES_DB.push(copy);
        TEAMS_DB.push({ id: 'T_A', name: 'Équipe A', players: [] }, { id: 'T_B', name: 'Équipe B', players: [] }, { id: 'T_C', name: 'Équipe C', players: [] });
        try {
          const out = { lb: {}, g: {}, h2h: {}, sit: {}, zoneOff: {}, html: {} };
          computeLeaderboard().forEach(x => { if (/^T_/.test(x.id)) out.lb[x.id] = [x.offPct, x.defPct, x.faultPct]; });
          ['T_A', 'T_B', 'T_C'].forEach(id => {
            const agg = computeTeamAggregate(id), g = teamGlobals(agg);
            out.g[id] = [g.offAttempts, g.offSuccesses];
            out.h2h[id] = Object.values(agg.h2h).map(o => [o.name, o.offAttempts, o.offSuccesses]);
            out.sit[id] = { tot: [agg.situationTotal.off_arretee, agg.situationTotal.off_continue],
              opp: Object.values(agg.situations).map(s => [s.name, s.off_arretee.attempts, s.off_continue.attempts]) };
            out.zoneOff[id] = ZONES.map(z => agg.zoneOff[z].attempts);
            const h = document.createElement('div'); h.innerHTML = sectionTeamOverall(agg); out.html[id] = h.querySelector('tbody tr').textContent;
          });
          return out;
        } finally { MATCHES_DB.pop(); TEAMS_DB.length = 0; sauveTeams.forEach(t => TEAMS_DB.push(t)); }
      });
      eq(r.g, { T_A: [2, 1], T_B: [3, 1], T_C: [4, 1] }, 'cumul : tentatives = lancers + fautes, réussites inchangées');
      eq(r.lb, { T_A: [50, 0, 0], T_B: [33, 50, 33], T_C: [25, 50, 75] }, 'classement : OFF 50 / 33 / 25 %, DÉF et F % inchangés');
      assert(r.html.T_C.includes('25%') && r.html.T_B.includes('33%') && r.html.T_A.includes('50%'), 'fiche d\'équipe = classement : ' + JSON.stringify(r.html));
      /* détail par adversaire : lancers seuls (Gris : 2 lancers contre Noir ; Noir : 1 lancer contre Bleu) */
      eq(r.h2h.T_B.filter(x => x[1]).map(x => x[1]), [2], 'Gris : seuls ses 2 lancers sont dans le détail par adversaire');
      eq(r.h2h.T_C.reduce((n, x) => n + x[1], 0), 1, 'Noir : 1 lancer, aucune faute dans les adversaires');
      eq(r.sit.T_C.tot, [{ attempts: 3, successes: 1 }, { attempts: 1, successes: 0 }], 'Noir : arrêtée 1/3 (1 lancer + 2 fautes), continue 0/1 (1 faute)');
      eq(r.sit.T_B.tot, [{ attempts: 2, successes: 0 }, { attempts: 1, successes: 1 }], 'Gris : arrêtée 0/2 (1 lancer + 1 faute), continue 1/1');
      eq(r.sit.T_C.opp.reduce((n, x) => n + x[1] + x[2], 0), 1, 'Noir : le détail par adversaire reste sur les lancers (1)');
      eq(r.zoneOff.T_C, [1, 0, 1, 0, 0, 0, 1, 1, 0], 'zones du cumul : z1 (faute), z3 (faute), z7 (faute), z8 (lancer)');
    } finally { await app.close(); }
  });

  await check(`${P}·3 head-to-head : grille du match et arrêtée / continue des adversaires inchangées`, async () => {
    const app = await launch(gabarit);
    try {
      await jouerControle(app);
      const r = await app.ev(() => {
        const h = computeH2H(), out = {};
        Object.keys(h).forEach(k => { out[k] = [h[k].attempts, h[k].successes, h[k].arretee.attempts, h[k].continue.attempts]; });
        return out;
      });
      eq(r, { Bleu_Gris: [2, 1, 2, 0], Bleu_Noir: [0, 0, 0, 0], Gris_Bleu: [0, 0, 0, 0], Gris_Noir: [2, 1, 1, 1], Noir_Bleu: [1, 1, 1, 0], Noir_Gris: [0, 0, 0, 0] },
        'grille H2H : lancers seulement, une faute n\'a pas de cible');
      const s = await app.ev(() => { const st = computeSituations(S); return ['Bleu', 'Gris', 'Noir'].map(t => [st[t].off_arretee, st[t].off_continue, st[t].offF_arretee, st[t].offF_continue].map(c => [c.attempts, c.successes])); });
      eq(s, [[[2, 1], [0, 0], [2, 1], [0, 0]], [[1, 0], [1, 1], [2, 0], [1, 1]], [[1, 1], [0, 0], [3, 1], [1, 0]]], 'arrêtée / continue : lancers seuls d\'un côté, avec fautes de l\'autre');
    } finally { await app.close(); }
  });

  await check(`${P}·4 zones OFF : la faute compte dans la case de sa position ; sans position, dans le total seulement ; DÉF inchangé`, async () => {
    const app = await launch(gabarit);
    try {
      await jouerControle(app);
      const lire = () => app.ev(() => {
        const o = computeOverall(), out = {};
        ATEAMS().forEach(t => {
          out[t] = { nouv: {}, anc: {}, def: ZONES.map(z => o[t].defZones[z].attempts + '/' + o[t].defZones[z].successes).join(','), tot: o[t].offTentatives };
          ZONES.forEach(z => {
            const n = o[t].offZonesF[z], a = o[t].offZones[z];
            if (n.attempts) out[t].nouv[z] = [n.attempts, n.successes];
            if (a.attempts) out[t].anc[z] = [a.attempts, a.successes];
          });
        });
        return out;
      });
      const r = await lire();
      for (const t of ['Bleu', 'Gris', 'Noir']) { eq(r[t].nouv, ZONES_NEW[t], `${t} : zones OFF avec fautes`); eq(r[t].anc, ZONES_OLD[t], `${t} : zones OFF « lancers seuls » inchangées`); }
      /* DÉF : Noir reçoit E3 (arrivée [0.6,0.2] = z2, attrapé) et E8 (arrivée [0.3,0.6] = z4, échappé) */
      eq(r.Noir.def, '0/0,1/1,0/0,1/0,0/0,0/0,0/0,0/0,0/0', 'zones DÉF de Noir inchangées');
      /* sans position : la faute E5 (z7 de Noir) compte dans le total mais dans aucune case */
      const s = await app.ev(() => {
        const e = S.history[4], pos = e.details.position_norm; delete e.details.position_norm;
        try { const o = computeOverall().Noir; return { tot: o.offTentatives, z7: o.offZonesF.z7.attempts, somme: ZONES.reduce((n, z) => n + o.offZonesF[z].attempts, 0) }; }
        finally { e.details.position_norm = pos; }
      });
      eq(s, { tot: 4, z7: 0, somme: 3 }, 'faute sans position : dans le total (4), dans aucune case (z7 vide, 3 cases comptées)');
      /* l'écran Zones du match */
      const html = await app.ev(() => { matchZoneTeam = 'Noir'; const h = document.createElement('div'); h.innerHTML = sectionMatchZones(); return h.querySelectorAll('tbody tr').length; });
      eq(html, 9, 'neuf cases');
    } finally { await app.close(); }
  });

  await check(`${P}·5 par période : l'OFF % d'une période compte les fautes de cette période`, async () => {
    const app = await launch(gabarit);
    try {
      await jouerControle(app);
      const r = await app.ev(() => {
        const normal = computeOffDefByPeriod(S);
        const copie = JSON.parse(JSON.stringify(S)); copie.history[8].before.period = 2;   // E9 (faute de Noir) dans la période 2
        const deux = computeOffDefByPeriod(copie);
        return { p1: normal.periods, n1: ['Bleu', 'Gris', 'Noir'].map(t => [normal.teams[t][1].offAtt, normal.teams[t][1].offSucc, normal.teams[t][1].defAtt, normal.teams[t][1].defSucc]),
          p2: deux.periods, noir1: deux.teams.Noir[1], noir2: deux.teams.Noir[2] };
      });
      eq(r.p1, [1], 'une période');
      eq(r.n1, [[2, 1, 1, 0], [3, 1, 2, 1], [4, 1, 2, 1]], 'période 1 : tentatives avec fautes ; DÉF inchangée');
      eq(r.p2, [1, 2], 'une période qui n\'a qu\'une faute est listée');
      eq([r.noir1.offAtt, r.noir1.offSucc], [3, 1], 'Noir, période 1 : sans la faute de la période 2');
      eq([r.noir2.offAtt, r.noir2.offSucc, r.noir2.defAtt], [1, 0, 0], 'Noir, période 2 : la faute est une tentative ratée');
    } finally { await app.close(); }
  });

  await check(`${P}·6 joueurs : une faute attribuée est un lancer raté (y compris par situation) ; faute « ? » ou d'équipe : aucune ligne`, async () => {
    const app = await launch(gabarit);
    try {
      await jouerControle(app);
      const r = await app.ev(() => {
        const out = { rows: {}, extra: {} };
        ATEAMS().forEach(t => {
          const acc = {}; const e = accumulatePlayerStats(S, t, acc);
          out.extra[t] = [e.unattributed, e.teamFaults, e.unknownFaults];
          Object.values(acc).forEach(x => { out.rows[x.id] = [x.throws, x.throwsF, x.succ, x.faults, x.throwsF_arretee, x.throwsF_continue, x.throws_arretee, x.throws_continue]; });
        });
        const h = document.createElement('div'); h.innerHTML = sectionMatchPlayers();
        out.txt = {}; h.querySelectorAll('tbody tr').forEach(tr => { out.txt[tr.querySelector('td').textContent.trim()] = tr.textContent; });
        return out;
      });
      /* [lancers seuls, lancers avec fautes, réussis, fautes, avecFautes arrêtée, avecFautes continue, seuls arrêtée, seuls continue] */
      eq(r.rows.Gris_p1, [1, 2, 1, 1, 1, 1, 0, 1], 'Gris_p1 : 1 lancer réussi (continue) + 1 faute (arrêtée) = 1/2');
      eq(r.rows.Noir_p1, [1, 2, 1, 1, 2, 0, 1, 0], 'Noir_p1 : 1 lancer réussi + 1 faute, tous deux en arrêtée = 1/2');
      eq(r.rows.Bleu_p1, [1, 1, 1, 0, 1, 0, 1, 0], 'Bleu_p1 : sans faute, inchangé');
      eq(r.rows.Bleu_p2, [1, 1, 0, 0, 1, 0, 1, 0], 'Bleu_p2 : inchangé'); eq(r.rows.Gris_p2, [1, 1, 0, 0, 1, 0, 1, 0], 'Gris_p2 : inchangé');
      eq(Object.keys(r.rows).filter(k => r.rows[k][1] > 0 || r.rows[k][3] > 0).sort(), ['Bleu_p1', 'Bleu_p2', 'Gris_p1', 'Gris_p2', 'Noir_p1'], 'la faute « ? » et la faute d\'équipe ne comptent chez aucun joueur');
      eq(['Noir_p2', 'Noir_p3', 'Noir_p4'].map(k => r.rows[k].slice(0, 6)), [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]], 'les autres joueurs de Noir : rien');
      eq(r.extra.Noir, [0, 1, 1], 'Noir : 1 faute d\'équipe, 1 faute sans joueur (annoncées sous le tableau)');
      assert(r.txt['Gris joueur 1'].includes('50%') && r.txt['Noir joueur 1'].includes('50%'), 'OFF % rendu des deux joueurs : ' + JSON.stringify(r.txt));
    } finally { await app.close(); }
  });

  await check(`${P}·7 exports : colonnes anciennes aux valeurs d'avant, colonnes neuves en fin de ligne et justes (XLSX et CSV)`, async () => {
    const app = await launch(gabarit);
    try {
      await jouerControle(app);
      const labels = await app.ev(() => ZONE_LABEL);
      const wb = XLSX.read(await telecharger(app, 'exportXLSX()'), { type: 'buffer' });
      /* Équipes : 13 colonnes d'avant, puis trois neuves */
      const eqp = feuille(wb, 'Équipes');
      eq(eqp[0].slice(13, 16), ['Attaques (avec fautes)', 'Attaques réussies (avec fautes)', 'Efficacité offensive (%) (avec fautes)'], 'Équipes : trois colonnes neuves en fin de ligne');
      eq(eqp[0].slice(0, 13), ['Équipe', 'Score final', 'Périodes gagnées', 'Attaques', 'Attaques réussies', 'Efficacité offensive (%)', 'Ballons reçus', 'Ballons attrapés', 'Efficacité défensive (%)', 'Actions offensives', 'Fautes directes', 'Fautes (%)', 'Défensives illégales']);
      eq(eqp.slice(1).map(l => l.slice(0, 13)), [['Bleu', 6, 0, 2, 1, 50, 1, 0, 0, 2, 0, 0, 0], ['Gris', 5, 0, 2, 1, 50, 2, 1, 50, 3, 1, 33.3, 0], ['Noir', 3, 0, 1, 1, 100, 2, 1, 50, 4, 3, 75, 0]], 'Équipes : colonnes anciennes aux valeurs de main');
      eq(eqp.slice(1).map(l => l.slice(13, 16)), [[2, 1, 50], [3, 1, 33.3], [4, 1, 25]], 'Équipes : colonnes neuves');
      /* Zones */
      const zn = feuille(wb, 'Zones');
      eq(zn[0].slice(6), ['Tentatives (avec fautes)', 'Réussites (avec fautes)', 'Efficacité (%) (avec fautes)'], 'Zones : colonnes neuves');
      eq(zn[0].slice(0, 6), ['Équipe', 'Côté', 'Zone', 'Tentatives', 'Réussites', 'Efficacité (%)']);
      const cellules = (idx0, idx1) => { const out = {}; zn.slice(1).filter(l => l[1] === 'Offensive' && l[idx0] !== 0).forEach(l => { (out[l[0]] ||= {})[Object.keys(labels).find(k => labels[k] === l[2])] = [l[idx0], l[idx1]]; }); return out; };
      eq(cellules(3, 4), ZONES_OLD, 'Zones : colonnes anciennes (lancers seuls)');
      eq(cellules(6, 7), ZONES_NEW, 'Zones : colonnes neuves (avec les fautes)');
      zn.slice(1).filter(l => l[1] === 'Défensive').forEach(l => eq(l.slice(6), l.slice(3, 6), 'Zones DÉF : colonnes neuves = anciennes'));
      /* Joueurs */
      const jo = feuille(wb, 'Joueurs');
      eq(jo[0].slice(16), ['Lancers (avec fautes)', 'Lancers réussis (avec fautes)', 'Efficacité offensive (%) (avec fautes)', 'Lancers arrêtés (avec fautes)', 'Réussis arrêtés (avec fautes)', 'Efficacité arrêtée (%) (avec fautes)', 'Lancers continus (avec fautes)', 'Réussis continus (avec fautes)', 'Efficacité continue (%) (avec fautes)'], 'Joueurs : neuf colonnes neuves en fin de ligne');
      const g1 = jo.find(l => l[1] === 'Gris joueur 1');
      eq(g1.slice(2, 5), [1, 1, 100], 'Joueurs : Gris joueur 1, colonnes anciennes (1 lancer réussi)');
      eq(g1.slice(16), [2, 1, 50, 1, 0, 0, 1, 1, 100], 'Joueurs : Gris joueur 1, colonnes neuves (lancer + faute)');
      /* Arrêté-continu */
      const ac = feuille(wb, 'Arrêté-continu');
      eq(ac[0].slice(6), ['Tentatives (avec fautes)', 'Réussites (avec fautes)', 'Efficacité (%) (avec fautes)'], 'Arrêté-continu : colonnes neuves');
      const noirArr = ac.find(l => l[0] === 'Noir' && l[1] === 'Offensive' && l[2] === 'Arrêtée'), noirCont = ac.find(l => l[0] === 'Noir' && l[1] === 'Offensive' && l[2] === 'Continue');
      eq([noirArr.slice(3, 6), noirArr.slice(6)], [[1, 1, 100], [3, 1, 33.3]], 'Arrêté-continu : Noir arrêtée, 1/1 d\'avant puis 1/3 avec les fautes');
      eq([noirCont.slice(3, 6), noirCont.slice(6)], [[0, 0, ''], [1, 0, 0]], 'Arrêté-continu : Noir continue, 0/0 d\'avant puis 0/1');
      /* Head-to-head et Types de fautes : aucun changement de forme */
      eq(feuille(wb, 'Head-to-head')[0], ['Équipe attaquante', 'Équipe ciblée', 'Situation', 'Tentatives', 'Réussites', 'Efficacité (%)'], 'Head-to-head : inchangé');
      /* Actions : une colonne 1/0 dont la moyenne égale l'OFF % de l'écran */
      const ax = feuille(wb, 'Actions');
      eq(ax[0][ax[0].length - 1], 'Réussite offensive (avec fautes)', 'Actions : colonne neuve en fin de ligne');
      eq(ax[0].slice(-5, -1), ['ID du match', 'Date du match', 'Heure de l’action', 'Code de faute'], 'Actions : les colonnes de C28 gardent leur place');
      const iAtt = ax[0].indexOf('Équipe attaquante'), iNew = ax[0].length - 1, iOld = ax[0].indexOf('Réussite offensive');
      const moy = (col, eqp_) => { const v = ax.slice(1).filter(l => l[iAtt] === eqp_ && l[col] !== '').map(l => l[col]); return v.length ? Math.round(1000 * v.reduce((a, b) => a + b, 0) / v.length) / 10 : null; };
      eq(['Bleu', 'Gris', 'Noir'].map(t => moy(iNew, t)), [50, 33.3, 25], 'Actions : la moyenne de la colonne neuve = OFF % de l\'écran');
      eq(['Bleu', 'Gris', 'Noir'].map(t => moy(iOld, t)), [50, 50, 100], 'Actions : « Réussite offensive » ancienne, inchangée');
      eq(ax.slice(1).map(l => l[iNew]), [1, 0, 0, 0, 0, 1, 0, 1, 0], 'Actions : une valeur par événement (faute = 0)');
      eq(ax.slice(1).map(l => l[iOld]), [1, '', 0, '', '', 1, 0, 1, ''], 'Actions : « Réussite offensive » ancienne (vide pour une faute)');
      /* CSV : mêmes colonnes que la feuille Actions */
      const csv = lireCSV((await telecharger(app, 'exportCSV()')).toString('utf8')).filter(l => l.length > 1);
      eq(csv[0], ax[0], 'CSV : même en-tête que la feuille Actions');
      eq(csv.slice(1).map(l => l[iNew]), ['1', '0', '0', '0', '0', '1', '0', '1', '0'], 'CSV : colonne neuve');
      /* Comparaison complète avec main si une copie existe (KINBALL_AVANT) */
      const ref = avantPath('kinball.C29.avant.html');
      if (ref) {
        const app2 = await launch(gabarit, { html: ref });
        try {
          await jouerControle(app2);
          const a = await app2.ev(() => ({ h: buildActionRows().header, r: buildActionRows().rows.map(x => { const c = { ...x }; delete c['Saisi par']; delete c['Heure de l’action']; delete c['Date du match']; delete c['ID du match']; return c; }), eq: teamSummaryAoa(), zn: zoneAoa(), jo: playerAoa(), sit: situationAoa().aoa }));
          const b = await app.ev(() => ({ h: buildActionRows().header, r: buildActionRows().rows.map(x => { const c = { ...x }; delete c['Saisi par']; delete c['Heure de l’action']; delete c['Date du match']; delete c['ID du match']; return c; }), eq: teamSummaryAoa(), zn: zoneAoa(), jo: playerAoa(), sit: situationAoa().aoa }));
          eq(b.h.slice(0, a.h.length), a.h, 'copie de main : en-têtes des Actions');
          b.r.forEach((x, i) => a.h.filter(k => !['Saisi par', 'Heure de l’action', 'Date du match', 'ID du match'].includes(k)).forEach(k => eq(x[k], a.r[i][k], `copie de main : ligne ${i + 1}, « ${k} »`)));
          for (const k of ['eq', 'zn', 'jo', 'sit']) b[k].forEach((l, i) => eq(l.slice(0, a[k][i].length), a[k][i], `copie de main : feuille ${k}, ligne ${i}`));
        } finally { await app2.close(); }
      }
    } finally { await app.close(); }
  });

  await check(`${P}·8 match sans aucune faute : stats et exports identiques (colonnes neuves = colonnes anciennes)`, async () => {
    const app = await launch(gabarit);
    try {
      await jouerSansFaute(app);
      const r = await app.ev(() => {
        const o = computeOverall(), st = computeSituations(S);
        const out = { ov: ATEAMS().map(t => [o[t].offTentatives === o[t].offAttempts, JSON.stringify(o[t].offZonesF) === JSON.stringify(o[t].offZones), o[t].fautes]),
          sit: ATEAMS().map(t => ['arretee', 'continue'].every(x => JSON.stringify(st[t]['offF_' + x]) === JSON.stringify(st[t]['off_' + x]))),
          per: JSON.stringify(computeOffDefByPeriod(S).periods),
          eq: teamSummaryAoa().slice(1).map(l => [l.slice(3, 6), l.slice(13, 16)]), act: buildActionRows() };
        const acc = {}; accumulatePlayerStats(S, 'Gris', acc); out.pl = Object.values(acc).map(x => [x.throws === x.throwsF, x.throws_arretee === x.throwsF_arretee, x.throws_continue === x.throwsF_continue]);
        out.jo = playerAoa().slice(1).map(l => [l.slice(2, 11), l.slice(16)]);
        out.act = out.act.rows.map(x => [x['Réussite offensive'], x['Réussite offensive (avec fautes)']]);
        return out;
      });
      r.ov.forEach(x => eq(x, [true, true, 0], 'compteurs avec fautes = lancers seuls'));
      r.sit.forEach(x => eq(x, true, 'arrêtée / continue identiques'));
      eq(r.per, '[1]');
      r.eq.forEach(([a, n]) => eq(n, a, 'Équipes : colonnes neuves = anciennes'));
      r.jo.forEach(([a, n]) => eq(n, a, 'Joueurs : colonnes neuves = anciennes'));
      r.act.forEach(([a, n]) => eq(n, a, 'Actions : colonne neuve = ancienne'));
      r.pl.forEach(x => eq(x, [true, true, true], 'joueurs : lancers avec fautes = lancers'));
    } finally { await app.close(); }
  });
}
