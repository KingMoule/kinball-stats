/* EXPORT-1 : situation des fautes et équipe permanente dans les exports (revue 3, S4 et S6). Détail : tests/docs/EXPORT1.md. */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launch, assert, eq, rng, DEPOT } from '../lib.mjs';
import { Model, pickAction, play } from '../model.mjs';

const require = createRequire(import.meta.url);
const XLSX = require(path.join(DEPOT, 'vendor', 'xlsx.full.min.js'));
const SIT = 'Situation (avec fautes)', OFFF = 'Réussite offensive (avec fautes)';

/* Lecteur CSV (« ; », guillemets doublés, \r\n entre les lignes). */
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
  if (champ !== '' || ligne.length) { ligne.push(champ); lignes.push(ligne); }
  return lignes;
}
const telecharger = async (app, ouvrir, appel) => {
  await app.ev(ouvrir);
  const [dl] = await Promise.all([app.page.waitForEvent('download'), app.page.locator(`[onclick="${appel}"]`).click()]);
  return fs.readFileSync(await dl.path());
};
const tousLesMatchs = async app => lireCSV((await telecharger(app, () => openBackup(), 'exportAllMatchesCSV()')).toString('utf8'));

/* Tableau croisé du CSV : par équipe attaquante et « Situation (avec fautes) », lignes où « Réussite offensive (avec fautes) » est remplie. */
const croise = (rows, noms) => {
  const out = {};
  Object.entries(noms).forEach(([t, n]) => {
    out[t] = {};
    [['arretee', 'Arrêtée'], ['continue', 'Continue']].forEach(([id, lab]) => {
      const l = rows.filter(r => r['Équipe attaquante'] === n && r[SIT] === lab && r[OFFF] !== '');
      out[t]['offF_' + id] = { attempts: l.length, successes: l.filter(r => r[OFFF] === 1).length };
    });
  });
  return out;
};

export const gabarits = ['tablette', 'telephone'];

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] EXPORT1`;

  /* S4 : la situation des fautes directes, pour recalculer OFF arrêtée / OFF continue depuis le CSV. */
  if (gabarit === 'tablette') await check(`${P}·1 « Situation (avec fautes) » en dernière colonne des Actions : le tableau croisé redonne offF_arretee et offF_continue de l'écran (partie aléatoire, puis ancien match sans before.stopped) ; « Situation » inchangée ; export « tous les matchs » identique`, async () => {
    const app = await launch(gabarit);
    try {
      await app.startMatch({ format: '9_11', name: 'situations_fautes' });
      await app.initialPossession('Bleu');
      const m = new Model('9_11'); m.initial('Bleu');
      const r = rng(505); let garde = 0;
      while (m.period < 2 && garde++ < 300) await play(app, m, pickAction(m, r));
      const d = await app.ev(() => {
        const b = buildActionRows();
        return { header: b.header, rows: b.rows, types: S.history.map(e => e.type), ecran: (() => { const s = computeSituations(), o = {}; ATEAMS().forEach(t => { o[t] = { offF_arretee: s[t].offF_arretee, offF_continue: s[t].offF_continue }; }); return o; })(),
          noms: Object.fromEntries(ATEAMS().map(t => [t, nm(t)])), id: S.id,
          fautes: S.history.map((e, i) => e.type === 'faute_directe' ? situationOfFaute(S.history, i) : null).filter(Boolean) };
      });
      eq(d.header[d.header.length - 1], SIT, 'dernière colonne');
      eq(d.header[d.header.length - 2], OFFF, 'juste après « Réussite offensive (avec fautes) »');
      assert(d.fautes.includes('arretee') && d.fautes.includes('continue'), 'des fautes dans les deux situations : ' + d.fautes.join(','));
      eq(croise(d.rows, d.noms), d.ecran, 'tableau croisé = écran');
      d.rows.forEach((x, i) => {
        const t = d.types[i];
        if (t === 'lancer') eq(x[SIT], x['Situation'], `ligne ${i + 1} : un lancer garde sa situation`);
        else if (t === 'faute_directe') { eq(x['Situation'], '', `ligne ${i + 1} : « Situation » reste vide pour une faute`); assert(['Arrêtée', 'Continue'].includes(x[SIT]), `ligne ${i + 1} : faute rangée`); }
        else eq(x[SIT], '', `ligne ${i + 1} (${t}) : vide`);
      });
      /* l'export « tous les matchs » porte la même colonne, ligne par ligne */
      const [h, ...L] = await tousLesMatchs(app);
      const k = h.indexOf(SIT), ki = h.indexOf('ID du match');
      assert(k >= 0, 'colonne présente dans « tous les matchs »');
      eq(L.filter(l => l[ki] === d.id).map(l => l[k]), d.rows.map(x => x[SIT]), '« tous les matchs » : mêmes valeurs');
      /* ancien match : les fautes sans before.stopped se reconstituent comme pour l'écran */
      const v = await app.ev(() => {
        S.history.forEach(e => { if (e.type === 'faute_directe' && e.before) delete e.before.stopped; });
        const b = buildActionRows();
        return { rows: b.rows, ecran: (() => { const s = computeSituations(), o = {}; ATEAMS().forEach(t => { o[t] = { offF_arretee: s[t].offF_arretee, offF_continue: s[t].offF_continue }; }); return o; })(), noms: Object.fromEntries(ATEAMS().map(t => [t, nm(t)])),
          vides: b.rows.filter((x, i) => S.history[i].type === 'faute_directe' && !x['Situation (avec fautes)']).length };
      });
      eq(v.vides, 0, 'ancien match : chaque faute a une situation');
      eq(croise(v.rows, v.noms), v.ecran, 'ancien match : tableau croisé = écran');
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
  });

  /* S6 : feuille « Match » : une ligne « ID équipe <couleur> » par équipe en jeu, après la date. */
  await check(`${P}·2 feuille « Match » (matchInfoRows et XLSX téléchargé) : « ID équipe » de chaque équipe en jeu après « Date du match », vide pour un nom libre ; duel sans Noir : deux lignes`, async () => {
    const app = await launch(gabarit);
    try {
      await app.startMatch({ format: '9_11', names: { Bleu: 'Laval', Gris: 'Libre', Noir: 'Lévis' }, name: 'id_equipes' });
      await app.ev(() => { S.teamIds = { Bleu: 't_laval', Gris: null, Noir: 't_levis' }; });
      await app.initialPossession('Bleu');
      await app.lancer({ target: 'Gris', caught: false });
      const info = await app.ev(() => matchInfoRows());
      const i = info.findIndex(x => x[0] === 'Date du match');
      eq(info.slice(i + 1), [['ID équipe Bleu', 't_laval'], ['ID équipe Gris', ''], ['ID équipe Noir', 't_levis']], 'lignes ajoutées après la date');
      const wb = XLSX.read(await telecharger(app, () => openExportMenu(), 'exportXLSX()'), { type: 'buffer' });
      const f = XLSX.utils.sheet_to_json(wb.Sheets['Match'], { header: 1, defval: '' });
      eq(f.slice(-3).map(l => [l[0], l[1]]), [['ID équipe Bleu', 't_laval'], ['ID équipe Gris', ''], ['ID équipe Noir', 't_levis']], 'XLSX : trois dernières lignes');
      eq(f[0][0], 'Fichier', 'première ligne inchangée');
      /* duel sans Noir ; un ancien match sans teamIds */
      const r = await app.ev(() => {
        const sauve = S;
        try {
          S = JSON.parse(JSON.stringify(sauve)); S.activeTeams = ['Bleu', 'Gris'];
          const duel = matchInfoRows().filter(x => /^ID équipe /.test(x[0]));
          delete S.teamIds;
          const vieux = matchInfoRows().filter(x => /^ID équipe /.test(x[0]));
          return { duel, vieux, at: ATEAMS() };
        } finally { S = sauve; }
      });
      eq(r.at, ['Bleu', 'Gris'], 'deux équipes en jeu');
      eq(r.duel, [['ID équipe Bleu', 't_laval'], ['ID équipe Gris', '']], 'duel : deux lignes');
      eq(r.vieux, [['ID équipe Bleu', ''], ['ID équipe Gris', '']], 'sans teamIds : vides, sans erreur');
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
  });

  /* S6 : export « tous les matchs » : « ID équipe 1/2/3 » en fin de ligne, par emplacement du match lu. */
  await check(`${P}·3 « tous les matchs » : quatre colonnes ajoutées en fin (« Situation (avec fautes) », « ID équipe 1/2/3 ») ; même équipe renommée et changée de couleur = même ID ; nom libre, emplacement hors jeu et ancien match : vide`, async () => {
    const app = await launch(gabarit);
    try {
      await app.startMatch({ format: '9_11', names: { Bleu: 'Laval', Gris: 'Libre', Noir: 'Lévis' }, name: 'tous_ids' });
      await app.initialPossession('Bleu');
      await app.lancer({ target: 'Gris', caught: false });
      await app.faute({ code: 'EXT', at: [0.4, 0.4] });
      await app.ev(() => {
        const base = JSON.parse(JSON.stringify(S));
        const copie = (id, t, f) => { const m = JSON.parse(JSON.stringify(base)); m.id = id; m.createdAt = t; m.status = 'completed'; f(m); return m; };
        MATCHES_DB = [
          copie('m_1', 1000, m => { m.teamIds = { Bleu: 't_laval', Gris: null, Noir: 't_levis' }; }),
          copie('m_2', 2000, m => { m.names = { Bleu: 'Lévis', Gris: 'Laval Élite', Noir: 'X' }; m.activeTeams = ['Bleu', 'Gris']; m.teamIds = { Bleu: 't_levis', Gris: 't_laval', Noir: 't_fantome' }; }),
          copie('m_3', 3000, m => { delete m.teamIds; }),
        ];
        DELETED_MATCHES = [];
        S = freshState();
      });
      const [h, ...L] = await tousLesMatchs(app);
      eq(h.length, 44, 'quarante colonnes figées, plus quatre');
      eq(h.slice(-4), [SIT, 'ID équipe 1', 'ID équipe 2', 'ID équipe 3'], 'colonnes ajoutées à la fin, dans cet ordre');
      eq(h.slice(0, 3), ['ID du match', 'Date du match', 'Heure de l’action'], 'début inchangé');
      eq(h[39], 'Équipe éliminée', 'ancienne dernière colonne à sa place');
      L.forEach((l, i) => eq(l.length, h.length, `ligne ${i + 2} : colonnes`));
      const col = n => h.indexOf(n);
      const ids = id => { const l = L.find(x => x[col('ID du match')] === id); return [1, 2, 3].map(k => l[col('ID équipe ' + k)]); };
      eq(ids('m_1'), ['t_laval', '', 't_levis'], 'match 1 : nom libre vide');
      eq(ids('m_2'), ['t_levis', 't_laval', ''], 'match 2 : Laval renommée et passée en Gris garde son ID ; Noir hors jeu : vide');
      eq(ids('m_3'), ['', '', ''], 'ancien match sans teamIds : vide');
      eq(L.filter(l => l[col('ID du match')] === 'm_1').map(l => l[col(SIT)]), ['Arrêtée', 'Arrêtée'], 'situation de l’échappé et de la faute qui suit');
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
  });
}
