/* C08 : export « tous les matchs » au format long (D84 colonnes figées, D77 ajouts seulement, D89).
   1  trois matchs de test (en cours, supprimé, à 0 action, homonymes) : exactement les actions des matchs non supprimés, un seul en-tête, mêmes colonnes ;
   2  colonnes d'identité et de contenu : ID, date, heure, période, type, résultat, situation, phase, joueur, faute, zones, coordonnées, scores par emplacement ;
   3  aucun en-tête ne porte un nom d'équipe ; noms hostiles (=1+1, guillemets, « ; », saut de ligne) protégés ; un match à 2 équipes garde ses emplacements ;
   4  les exports d'un match (CSV actions, brut, JSON, XLSX) sont inchangés par l'ajout (et, si la copie d'avant existe, identiques à elle) ;
   5  format Excel français : « ; », BOM, \r\n, virgules décimales, entiers sans virgule ;
   6  lecture seule : stockage (MATCHES_DB, corbeille) et état du match en cours inchangés ;
   7  relu par un lecteur CSV : nombre de colonnes constant.
   Contrôle négatif : KINBALL_HTML=<index.html de main> KINBALL_ONLY=C08 node tests/run.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launch, assert, eq, DEPOT, avantPath } from '../lib.mjs';

const require = createRequire(import.meta.url);
const XLSX = require(path.join(DEPOT, 'vendor', 'xlsx.full.min.js'));
export const gabarits = ['tablette', 'telephone'];

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
const HOSTILE = '=1+1';
const HOSTILE2 = 'a"b;c\nd';

async function jouer(app, { format = '9_11', names = {}, nom = 'essai_c08', rosters = true } = {}) {
  await app.startMatch({ format, names, name: nom, withRosters: rosters });
  const duel = format.startsWith('duel');
  await app.initialPossession('Bleu');
  await app.lancer({ target: 'Gris', caught: false, from: [0.3, 0.3], to: [0.7, 0.6], player: rosters ? 'Bleu_p1' : undefined });
  await app.faute({ code: 'EXT', at: [0.4, 0.4], player: rosters ? 'Gris_p1' : undefined });
  if (!duel) {
    await app.defIll({ target: 'Bleu' });
    await app.reprise({ team: 'Noir' });
    await app.lancer({ target: 'Gris', caught: true, from: [0.2, 0.7], to: [0.6, 0.2], player: rosters ? 'Noir_p1' : undefined });
  }
}
/* Installe en « stockage » des copies du match joué (S) : lecture seule pour l'export. */
async function installer(app) {
  await app.ev(({ HOSTILE, HOSTILE2 }) => {
    const base = JSON.parse(JSON.stringify(S));
    const copie = (id, t, f) => { const m = JSON.parse(JSON.stringify(base)); m.id = id; m.createdAt = t; f && f(m); return m; };
    const A = copie('m_a', 3000, m => { m.status = 'completed'; m.names = { Bleu: 'Laval', Gris: 'Laval', Noir: 'Québec' }; m.matchName = 'A'; });
    const B = copie('m_b', 1000, m => { m.status = 'in_progress'; m.names = { Bleu: HOSTILE, Gris: HOSTILE2, Noir: '-Lévis' }; m.matchName = 'B'; m.history = m.history.slice(0, 3); m.authorId = null; });
    const C = copie('m_c', 2000, m => { m.status = 'completed'; m.history = []; m.matchName = 'C'; });
    const D = copie('m_d', 500, m => { m.status = 'completed'; m.deleted = true; m.deletedAt = 600; m.matchName = 'D'; });
    const E = copie('m_e', 4000, m => { m.status = 'completed'; m.history.forEach(e => { delete e.at; }); delete m.createdAt; m.matchName = 'E ancien'; delete m.activeTeams; delete m.format; });
    window.__avant = { n: { A: A.history.length, B: B.history.length, E: E.history.length } };
    MATCHES_DB = [A, B, C, E]; DELETED_MATCHES = [D];
  }, { HOSTILE, HOSTILE2 });
}
async function telecharger(app, declencheur) {
  const [dl] = await Promise.all([app.page.waitForEvent('download'), declencheur()]);
  return { buf: fs.readFileSync(await dl.path()), nom: dl.suggestedFilename() };
}
const clicExport = app => async () => {
  await app.ev(() => openBackup());
  await app.page.locator('[onclick="exportAllMatchesCSV()"]').click();
};
const instantane = app => app.ev(() => JSON.stringify({ M: MATCHES_DB, D: DELETED_MATCHES, S }));
const diffCourt = (a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `différence à ${i} : ${JSON.stringify(a.slice(Math.max(0, i - 40), i + 40))} / ${JSON.stringify(b.slice(Math.max(0, i - 40), i + 40))}`; };
const exporterTous = async app => { const r = await telecharger(app, clicExport(app)); return { ...r, texte: r.buf.toString('utf8') }; };

/* Les sorties d'un match, telles que l'app les remet (téléchargements réels) et telles qu'elle les construit. */
async function sortiesUnMatch(app) {
  const dl = async appel => {
    await app.ev(() => openExportMenu());
    return (await telecharger(app, () => app.page.locator(`[onclick="${appel}"]`).click())).buf;
  };
  const construit = await app.ev(() => JSON.stringify({ a: buildActionRows(), r: buildRawRows(), i: matchInfoRows(), s: (() => { const c = JSON.parse(JSON.stringify(S)); delete c.sheetDismissable; return JSON.stringify(c); })() }));
  const xl = XLSX.read(await dl('exportXLSX()'), { type: 'buffer' });
  const feuilles = {}; xl.SheetNames.forEach(n => { feuilles[n] = XLSX.utils.sheet_to_json(xl.Sheets[n], { header: 1, defval: '' }); });
  return { construit, csv: (await dl('exportCSV()')).toString('hex'), brut: (await dl('exportRawCSV()')).toString('hex'), json: await (async () => { const c = JSON.parse((await dl('exportJSON()')).toString('utf8')); delete c.sheetDismissable; return JSON.stringify(c); })(), feuilles: JSON.stringify(feuilles) };
}

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] C08`;

  await check(`${P}·1 trois matchs de test (en cours, supprimé, 0 action, homonymes, ancien) : exactement les actions des matchs non supprimés, ordre date puis saisie, un seul en-tête, mêmes colonnes, nom de fichier horodaté`, async () => {
    const app = await launch(gabarit);
    try {
      await jouer(app, { names: { Bleu: 'Laval', Gris: 'Laval', Noir: 'Québec' } });
      await installer(app);
      const { texte, nom } = await exporterTous(app);
      assert(/^kinball-tous-les-matchs-\d{4}-\d{2}-\d{2}\.csv$/.test(nom), 'nom de fichier : ' + nom);
      const [h, ...L] = lireCSV(texte);
      const nb = await app.ev(() => window.__avant.n);
      eq(L.length, nb.A + nb.B + nb.E, 'actions de A, B et E seulement (C sans action, D supprimé)');
      const ids = L.map(l => l[h.indexOf('ID du match')]);
      eq([...new Set(ids)], ['m_e', 'm_b', 'm_a'], 'ordre : date croissante (E sans date, B 1000, A 3000)');
      eq(ids.filter(x => x === 'm_b').length, nb.B, 'le match en cours est inclus (3 actions)');
      eq(L.filter(l => l[h.indexOf('ID du match')] === 'm_a').map(l => l[h.indexOf('No')]), Array.from({ length: nb.A }, (_, i) => String(i + 1)), 'ordre de saisie dans un match');
      assert(!ids.includes('m_c') && !ids.includes('m_d'), 'ni le match vide ni le supprimé');
      eq(h.filter((x, i) => h.indexOf(x) !== i), [], 'aucune colonne en double');
      eq(texte.replace(/^\uFEFF/, '').split('\r\n').filter(l => l.startsWith('ID du match;')).length, 1, 'un seul en-tête');
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
  });

  await check(`${P}·2 colonnes : ID, date, heure (vide si absente), période, type, résultat, situation, phase, joueur, faute et code, zones, coordonnées, scores et joueurs par emplacement, équipes comme valeurs`, async () => {
    const app = await launch(gabarit);
    try {
      await jouer(app, { names: { Bleu: 'Laval', Gris: 'Laval', Noir: 'Québec' } });
      await installer(app);
      const { texte } = await exporterTous(app);
      const [h, ...L] = lireCSV(texte);
      const ligne = (id, no) => { const l = L.find(x => x[h.indexOf('ID du match')] === id && x[h.indexOf('No')] === String(no)); const o = {}; h.forEach((k, i) => { o[k] = l[i]; }); return o; };
      const a1 = ligne('m_a', 1), a2 = ligne('m_a', 2), a3 = ligne('m_a', 3), a5 = ligne('m_a', 5);
      eq([a1['Équipe 1'], a1['Équipe 2'], a1['Équipe 3']], ['Laval', 'Laval (2)', 'Québec'], 'noms d’équipes en valeurs, par emplacement (homonymes distingués)');
      eq(a1['Date du match'], '1970-01-01T00:00:03.000Z', 'date du match ISO');
      assert(/^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(a1['Heure de l’action']), 'heure de l’action ISO : ' + a1['Heure de l’action']);
      eq([a1['Type d’action'], a1['Résultat'], a1['Situation'], a1['Phase'], a1['Période']], ['Lancer', 'Échappé', 'Arrêtée', 'Début', '1'], 'lancer 1');
      eq([a1['Équipe en possession'], a1['Équipe attaquante'], a1['Équipe ciblée'], a1['Joueur']], ['Laval', 'Laval', 'Laval (2)', 'Bleu joueur 1'], 'équipes et joueur en valeurs');
      eq([a1['Zone de départ'], a1['X départ'], a1['Y départ'], a1['X arrivée'], a1['Y arrivée']].map(x => x === '' ? 'vide' : 'rempli'), ['rempli', 'rempli', 'rempli', 'rempli', 'rempli'], 'zones et coordonnées');
      eq([a1['Score équipe 1 avant'], a1['Score équipe 2 avant'], a1['Score équipe 3 avant']], ['0', '0', '0'], 'scores avant (lancer 1)');
      eq([a2['Type d’action'], a2['Type de faute'] !== '', a2['Code de faute']], ['Faute directe', true, 'EXT'], 'faute et code');
      eq([a2['Score équipe 1 avant'], a2['Score équipe 2 avant'], a2['Score équipe 3 avant']], ['1', '0', '1'], 'scores avant (faute)');
      eq(a3['Code de faute'], 'DÉF ILL', 'code DÉF ILL');
      eq(a1['Sur le terrain — équipe 1'], 'Bleu joueur 1 | Bleu joueur 2 | Bleu joueur 3 | Bleu joueur 4', 'joueurs sur le terrain par emplacement');
      eq(a5['Résultat'], 'Attrapé', 'lancer attrapé');
      /* match ancien : colonnes de récence vides, rien ne casse */
      const e1 = ligne('m_e', 1);
      eq([e1['Heure de l’action'], e1['Date du match']], ['', ''], 'ancien match : heure et date vides');
    } finally { await app.close(); }
  });

  await check(`${P}·3 aucun en-tête ne porte un nom d'équipe ; noms hostiles (=1+1, -, guillemets, « ; », saut de ligne) protégés ; match à deux équipes : emplacement 3 vide`, async () => {
    const app = await launch(gabarit);
    try {
      await jouer(app, { format: 'duel11', names: { Bleu: 'Duelliste', Gris: 'Autre' }, nom: 'duel' });
      const duel = await app.ev(() => { const d = JSON.parse(JSON.stringify(S)); d.id = 'm_d2'; d.createdAt = 9000; return d; });
      await jouer(app, { names: { Bleu: 'Laval', Gris: 'Québec', Noir: 'Lévis' } });
      await installer(app);
      await app.ev(d => { MATCHES_DB.push(d); }, duel);
      const { texte } = await exporterTous(app);
      const [h, ...L] = lireCSV(texte);
      for (const n of ['Laval', 'Québec', 'Lévis', 'Duelliste', 'Autre', 'Bleu', 'Gris', 'Noir', HOSTILE]) assert(!h.some(c => c.includes(n)), `un en-tête contient « ${n} »`);
      const val = (id, no, k) => L.find(x => x[h.indexOf('ID du match')] === id && x[h.indexOf('No')] === String(no))[h.indexOf(k)];
      eq(val('m_b', 1, 'Équipe 1'), "'" + HOSTILE, 'nom =1+1 protégé par une apostrophe');
      eq(val('m_b', 1, 'Équipe 2'), HOSTILE2, 'guillemets, « ; » et saut de ligne : le CSV se relit à l’identique');
      eq(val('m_b', 1, 'Équipe 3'), "'-Lévis", 'nom commençant par « - » protégé');
      assert(texte.includes('"a""b;c\nd"'), 'cellule entre guillemets, guillemet doublé');
      eq([val('m_d2', 1, 'Équipe 1'), val('m_d2', 1, 'Équipe 2'), val('m_d2', 1, 'Équipe 3')], ['Duelliste', 'Autre', ''], 'duel : emplacement 3 vide');
      eq([val('m_d2', 2, 'Score équipe 3 avant'), val('m_d2', 2, 'Sur le terrain — équipe 3')], ['', ''], 'duel : score et joueurs de l’emplacement 3 vides');
      L.forEach((l, i) => eq(l.length, h.length, `ligne ${i + 1} : colonnes constantes`));
    } finally { await app.close(); }
  });

  await check(`${P}·4 les exports d'un match (CSV actions, XLSX, brut, JSON, structures) sont strictement identiques avant et après l'ajout (et à la copie d'avant si elle est fournie)`, async () => {
    const app = await launch(gabarit);
    try {
      await jouer(app, { names: { Bleu: 'Laval', Gris: 'Québec', Noir: 'Lévis' } });
      await app.ev(() => { S.createdAt = 1700000000000; });
      const avant = await sortiesUnMatch(app);
      await installer(app);
      await exporterTous(app);
      const apres = await sortiesUnMatch(app);
      for (const k of Object.keys(avant)) eq(apres[k] === avant[k], true, `sortie « ${k} » inchangée` + (apres[k] === avant[k] ? '' : ' : ' + diffCourt(avant[k], apres[k])));
      const ref = avantPath('kinball.C08.avant.html');
      if (ref) {
        const vieux = await launch(gabarit, { html: ref });
        try {
          await jouer(vieux, { names: { Bleu: 'Laval', Gris: 'Québec', Noir: 'Lévis' } });
          const r = await vieux.ev(() => ({ h: buildActionRows().header, hr: buildRawRows().header }));
          const n = await app.ev(() => ({ h: buildActionRows().header, hr: buildRawRows().header }));
          eq(n, r, 'en-têtes identiques à ceux de main');
        } finally { await vieux.close(); }
      }
    } finally { await app.close(); }
  });

  await check(`${P}·5 format Excel français : « ; », BOM, \\r\\n, virgules décimales, entiers sans virgule, aucun \\n ou \\r hors guillemets`, async () => {
    const app = await launch(gabarit);
    try {
      await jouer(app, { names: { Bleu: 'Laval', Gris: 'Québec', Noir: 'Lévis' } });
      await installer(app);
      const { buf, texte } = await exporterTous(app);
      assert(buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF, 'BOM UTF-8');
      assert(texte.endsWith('\r\n'), 'fin de ligne \\r\\n');
      const sansGuillemets = texte.replace(/"(?:[^"]|"")*"/g, '""');
      assert(!/(?<!\r)\n|\r(?!\n)/.test(sansGuillemets), 'retours de ligne : \\r\\n seulement hors guillemets');
      const [h, ...L] = lireCSV(texte);
      const col = k => h.indexOf(k);
      const coords = L.flatMap(l => ['X départ', 'Y départ', 'X arrivée', 'Y arrivée'].map(k => l[col(k)])).filter(x => x !== '');
      assert(coords.length > 0, 'des coordonnées');
      coords.forEach(x => assert(/^-?\d+(,\d+)?$/.test(x), 'coordonnée sans point : ' + x));
      assert(coords.some(x => x.includes(',')), 'au moins une virgule décimale');
      L.forEach(l => ['No', 'Période', 'Score équipe 1 avant', 'Score équipe 2 avant', 'Score équipe 3 avant', 'Réussite offensive'].forEach(k => assert(/^\d*$/.test(l[col(k)]), `entier sans virgule (${k}) : ${l[col(k)]}`)));
      L.forEach(l => assert(/^\d{4}-\d\d-\d\dT/.test(l[col('Date du match')]) || l[col('Date du match')] === '', 'date ISO gardée'));
    } finally { await app.close(); }
  });

  await check(`${P}·6 lecture seule : stockage (matchs, corbeille) et état du match en cours inchangés après l'export ; S rendu`, async () => {
    const app = await launch(gabarit);
    try {
      await jouer(app, { names: { Bleu: 'Laval', Gris: 'Québec', Noir: 'Lévis' } });
      await installer(app);
      const idxAvant = await app.ev(() => (window.__S = S, S.id));
      const avant = await instantane(app);
      const lsAvant = await app.ev(() => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
      await exporterTous(app);
      eq(await instantane(app), avant, 'MATCHES_DB, corbeille et S inchangés');
      eq(await app.ev(() => S === window.__S && S.id), idxAvant, 'S est le même objet qu’avant');
      eq(await app.ev(() => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)]))), lsAvant, 'localStorage inchangé');
      /* un match illisible n'empêche pas l'export des autres et laisse S en place */
      await app.ev(() => { MATCHES_DB.push({ id: 'm_x', status: 'completed', history: [{ type: 'lancer', details: null, before: { scores: 1 } }], names: {}, scores: {} }); });
      await exporterTous(app);
      eq(await app.ev(() => S === window.__S), true, 'S rendu même si un match est illisible');
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
  });

  await check(`${P}·7 relu par un lecteur CSV : nombre de colonnes constant sur toutes les lignes, y compris avec des noms et joueurs hostiles`, async () => {
    const app = await launch(gabarit);
    try {
      await jouer(app, { names: { Bleu: 'Laval', Gris: 'Québec', Noir: 'Lévis' } });
      await installer(app);
      await app.ev(({ H, H2 }) => { MATCHES_DB.forEach(m => { (m.rosters.Bleu || []).forEach((p, i) => { p.name = i % 2 ? H : H2; }); }); }, { H: HOSTILE, H2: HOSTILE2 });
      const { texte } = await exporterTous(app);
      const [h, ...L] = lireCSV(texte);
      assert(L.length > 0, 'des lignes');
      L.forEach((l, i) => eq(l.length, h.length, `ligne ${i + 2} : colonnes`));
      assert(L.some(l => l.some(c => c.includes("'" + HOSTILE) || c === "'" + HOSTILE)) || texte.includes("'" + HOSTILE), 'joueur =1+1 protégé');
    } finally { await app.close(); }
  });
}
