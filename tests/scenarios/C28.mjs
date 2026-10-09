/* C28 : exports pour l'analyse (revue du 2026-10-09 : R10, R11 ; décision : « ajouts sûrs » et « Excel en français »).
   1  match ordinaire : en-tête et valeurs de la version d'avant INCHANGÉS, quatre colonnes ajoutées à la fin (feuille Actions) ;
   2  les quatre colonnes : ID du match, Date du match (ISO 8601), Heure de l'action (nouveaux événements), Code de faute (dont DÉF ILL) ;
   3  ancien match (sans `at`, sans date) : colonnes vides, aucune erreur, export complet ;
   4  deux ou trois équipes de même nom : « Laval », « Laval (2) », « Laval (3) » dans l'en-tête et dans les colonnes d'équipe, aucune colonne en double ;
   5  « ; » « " » retour chariot et saut de ligne dans un nom : le CSV se relit avec les mêmes colonnes (en-tête compris) ;
   6  formules (= + - @ tabulation) : apostrophe dans le CSV, texte pur dans le XLSX ; en-tête échappé comme les données ;
   7  décimales : virgule dans les deux CSV, point-virgule inchangé, BOM gardé, entiers sans virgule ; vrais nombres dans le XLSX ;
   8  XLSX (téléchargement réel) : feuille « Match » avec ID et date à la fin, Actions identique au CSV ;
   9  `at` ne change rien d'autre : absent de `before` et de `details`, ↶ exact, jamais envoyé à la collecte.
   Contrôle négatif : KINBALL_HTML=<avant>/kinball.C28.avant.html KINBALL_ONLY=C28 node tests/run.mjs */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { launch, assert, eq, diff, HTML, DEPOT, exigerAvant, KNOWN_AVANT } from '../lib.mjs';
import { demarrer } from '../../collecte/faux-serveur.mjs';

const require = createRequire(import.meta.url);
const XLSX = require(path.join(DEPOT, 'vendor', 'xlsx.full.min.js'));

export const gabarits = ['tablette', 'telephone'];
const AVANT_NOM = 'kinball.C28.avant.html';
const NOUVELLES = ['ID du match', 'Date du match', 'Heure de l’action', 'Code de faute'];

/* Lecteur CSV (séparateur « ; », guillemets doublés, \r\n entre les lignes, \r et \n tolérés entre guillemets). */
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
const csvActions = async app => (await telecharger(app, 'exportCSV()'));
const arrondi = x => { const c = { ...x }; for (const k of ['X départ', 'Y départ', 'X arrivée', 'Y arrivée']) if (typeof c[k] === 'number') c[k] = Math.round(c[k] * 100) / 100; return c; };

/* Une petite partie : lancer échappé, faute EXT, DÉF ILL, reprise, lancer attrapé. */
async function jouer(app, opts = {}) {
  await app.startMatch({ format: '9_11', names: opts.names || {}, name: opts.nom || 'essai_c28', withRosters: !!opts.rosters });
  await app.initialPossession('Bleu');
  await app.lancer({ target: 'Gris', caught: false, from: [0.3, 0.3], to: [0.7, 0.6], player: opts.rosters ? 'Bleu_p1' : undefined });   // Gris prend le ballon
  await app.faute({ code: 'EXT', at: [0.4, 0.4], player: opts.rosters ? 'Gris_p1' : undefined });
  await app.defIll({ target: 'Bleu' });
  await app.reprise({ team: 'Noir' });
  await app.lancer({ target: 'Gris', caught: true, from: [0.2, 0.7], to: [0.6, 0.2], player: opts.rosters ? 'Noir_p1' : undefined });
}

export default async function ({ gabarit, check }) {
  const P = `[${gabarit}] C28`;

  /* ============ 1 et 2 : en-tête inchangé + colonnes ajoutées ============ */
  await check(`${P}·1 match ordinaire : en-tête et valeurs de la version d'avant inchangés, quatre colonnes ajoutées à la fin (Actions, CSV et XLSX) ; feuille « Match » : ID et date ajoutés à la fin`, async () => {
    const ref = exigerAvant(AVANT_NOM);
    const sortie = async opts => {
      const app = await launch(gabarit, opts);
      try {
        await jouer(app, { names: { Bleu: 'Laval', Gris: 'Québec', Noir: 'Lévis' }, rosters: true });
        const r = await app.ev(() => ({ b: buildActionRows(), info: matchInfoRows(), raw: buildRawRows() }));
        const csv = lireCSV((await csvActions(app)).toString('utf8'));
        return { header: r.b.header, rows: r.b.rows.map(arrondi), info: r.info, rawHeader: r.raw.header, csv };
      } finally { await app.close(); }
    };
    const a = await sortie({ html: ref }), b = await sortie({});
    eq(b.header.slice(0, a.header.length), a.header, 'les colonnes existantes : mêmes noms, même ordre');
    eq(b.header.slice(a.header.length), NOUVELLES, 'quatre colonnes ajoutées, à la fin, dans cet ordre');
    eq(b.header.length, a.header.length + 4, 'rien d\'autre');
    eq(b.rows.length, a.rows.length, 'même nombre de lignes');   /* « Saisi par » mis à part : la copie d'avant, servie sans stockage, n'a pas d'identité d'appareil */
    b.rows.forEach((x, i) => a.header.filter(k => k !== 'Saisi par').forEach(k => eq(x[k], a.rows[i][k], `ligne ${i + 1}, « ${k} » (valeur d'une colonne existante)`)));
    eq(b.csv[0], b.header, 'ligne d\'en-tête du CSV = en-tête');
    eq(b.csv[0].slice(0, a.header.length), a.csv[0], 'en-tête du CSV : mêmes colonnes qu\'avant, dans le même ordre');
    eq(b.csv.length, a.csv.length, 'même nombre de lignes');
    eq(b.rawHeader, a.rawHeader, 'données brutes : même en-tête');
    const sansAuteur = rows => rows.filter(x => x[0] !== 'Stats prises par');   // l'identité de l'appareil n'existe pas dans la copie d'avant
    eq(b.info.slice(0, a.info.length).filter(x => x[0] !== 'Stats prises par'), sansAuteur(a.info), 'feuille « Match » : lignes existantes inchangées, même ordre');
    eq(b.info.slice(a.info.length).map(x => x[0]), ['ID du match', 'Date du match'], 'feuille « Match » : ID et date ajoutés à la fin');
  }, KNOWN_AVANT);

  await check(`${P}·2 les quatre colonnes : ID du match, Date du match (ISO 8601), Heure de l'action (nouveaux événements, croissante), Code de faute (EXT, DÉF ILL), vide ailleurs`, async () => {
    const app = await launch(gabarit);
    try {
      const t0 = Date.now();
      await jouer(app, {});
      const r = await app.ev(() => ({ rows: buildActionRows().rows, id: S.id, cree: S.createdAt, types: S.history.map(e => e.type), ats: S.history.map(e => e.at), info: matchInfoRows() }));
      const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
      r.rows.forEach((x, i) => {
        eq(x['ID du match'], r.id, `ligne ${i + 1} : ID du match`);
        eq(x['Date du match'], new Date(r.cree).toISOString(), `ligne ${i + 1} : date du match = création`);
        assert(ISO.test(x['Date du match']), 'date ISO 8601 avec fuseau : ' + x['Date du match']);
        assert(ISO.test(x['Heure de l’action']), `ligne ${i + 1} : heure ISO 8601 : ` + x['Heure de l’action']);
        eq(x['Heure de l’action'], r.ats[i], `ligne ${i + 1} : l'heure est celle de l'événement`);
        const t = Date.parse(x['Heure de l’action']);
        assert(t >= t0 - 1000 && t <= Date.now() + 1000, 'heure plausible');
        if (i) assert(t >= Date.parse(r.rows[i - 1]['Heure de l’action']), 'heures croissantes');
      });
      const code = r.rows.map(x => x['Code de faute']);
      eq(code, ['', 'EXT', 'DÉF ILL', '', ''], 'code de faute : stable, à côté du libellé existant');
      eq(r.rows.map(x => x['Type de faute']), ['', 'EXTÉRIEUR', 'DÉFENSIVE ILLÉGALE', '', ''], 'le libellé existant est inchangé');
      eq(r.info.slice(-2), [['ID du match', r.id], ['Date du match', new Date(r.cree).toISOString()]], 'feuille « Match »');
      /* l'heure d'un changement de joueur et d'une fin de période manuelle */
      await app.ev(() => { openFinishMenu(); }); await app.clickSheet("endPeriodManually('Bleu')"); await app.settle();
      const t = await app.ev(() => S.history[S.history.length - 1]);
      eq(t.type, 'fin_periode'); assert(typeof t.at === 'string' && ISO.test(t.at), 'heure de la fin de période');
    } finally { await app.close(); }
  });

  await check(`${P}·2b changement de joueur et alignement tardif : heure posée ; les lignes de l'export ont leur heure`, async () => {
    const app = await launch(gabarit);
    try {
      await app.startMatch({ format: '9_11', withRosters: true }); await app.initialPossession('Bleu');
      await app.ev(() => { openLineupSheet('Bleu'); pickSubOut('Bleu_p1'); pickSubIn('Bleu_p5'); closeLineupSheet(); });
      await app.settle();
      const r = await app.ev(() => ({ types: S.history.map(e => e.type), rows: buildActionRows().rows }));
      eq(r.types, ['changement']);
      assert(/^\d{4}-\d{2}-\d{2}T/.test(r.rows[0]['Heure de l’action']), 'heure du changement : ' + r.rows[0]['Heure de l’action']);
      eq(r.rows[0]['Code de faute'], '');
    } finally { await app.close(); }
  });

  /* ============ 3 : ancien match ============ */
  await check(`${P}·3 ancien match (événements sans heure, sans date de création) : colonnes vides, export complet sans erreur`, async () => {
    const app = await launch(gabarit);
    try {
      await jouer(app, {});
      await app.ev(() => { S.history.forEach(e => { delete e.at; }); delete S.createdAt; });
      const r = await app.ev(() => ({ rows: buildActionRows().rows, header: buildActionRows().header, raw: buildRawRows(), info: matchInfoRows() }));
      r.rows.forEach((x, i) => eq([x['Heure de l’action'], x['Date du match']], ['', ''], `ligne ${i + 1} : heure et date vides`));
      eq(r.rows.length, 5, 'une ligne par événement');
      eq(r.rows.map(x => x['Code de faute']), ['', 'EXT', 'DÉF ILL', '', ''], 'le code de faute se lit aussi sur un ancien match');
      eq(r.info.slice(-2).map(x => x[1] === '' ? 'vide' : 'rempli'), ['rempli', 'vide'], 'ID présent, date vide');
      const csv = lireCSV((await csvActions(app)).toString('utf8'));
      eq(csv.length, 6, 'CSV complet'); csv.forEach(l => eq(l.length, r.header.length, 'colonnes par ligne'));
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
  });

  /* ============ 4 : homonymes ============ */
  await check(`${P}·4 deux ou trois équipes de même nom : « Laval », « Laval (2) », « Laval (3) » dans l'en-tête et les colonnes d'équipe ; aucune colonne en double ; un nom distinct reste tel quel`, async () => {
    for (const [noms, attendu] of [
      [{ Bleu: 'Laval', Gris: 'Laval', Noir: 'Québec' }, ['Laval', 'Laval (2)', 'Québec']],
      [{ Bleu: 'Laval', Gris: 'Laval', Noir: 'Laval' }, ['Laval', 'Laval (2)', 'Laval (3)']],
      [{ Bleu: 'Laval', Gris: 'Québec', Noir: 'Laval' }, ['Laval', 'Québec', 'Laval (2)']],
      [{ Bleu: 'Laval', Gris: 'Québec', Noir: 'Lévis' }, ['Laval', 'Québec', 'Lévis']],
    ]) {
      const app = await launch(gabarit);
      try {
        await jouer(app, { names: noms });
        const r = await app.ev(() => ({ b: buildActionRows(), aoa: teamSummaryAoa() }));
        eq(r.b.header.filter((h, i) => r.b.header.indexOf(h) !== i), [], 'aucune colonne en double');
        attendu.forEach(n => {
          assert(r.b.header.includes(`Score ${n} avant`), `colonne « Score ${n} avant » : ${r.b.header.filter(h => /^Score/.test(h))}`);
          assert(r.b.header.includes(`Sur le terrain — ${n}`), `colonne « Sur le terrain — ${n} »`);
        });
        /* ligne 1 : Bleu attaque Gris (tout à zéro avant) ; ligne 2, la faute de Gris : Bleu +1 et Noir +1 déjà comptés */
        const l1 = r.b.rows[0], l2 = r.b.rows[1];
        eq([l1['Équipe attaquante'], l1['Équipe ciblée']], [attendu[0], attendu[1]], 'équipes attaquante et ciblée distinguées');
        eq(attendu.map(n => l1[`Score ${n} avant`]), [0, 0, 0], 'scores avant (ligne 1)');
        eq(attendu.map(n => l2[`Score ${n} avant`]), [1, 0, 1], 'trois colonnes de score distinctes sur une même ligne (ligne 2)');
        eq(attendu.map(n => l2[`Sur le terrain — ${n}`]), ['', '', ''], 'sans alignement : colonnes vides mais distinctes');
        eq(r.aoa.slice(1).map(x => x[0]), attendu, 'feuille « Équipes » : noms distingués aussi');
        const csv = lireCSV((await csvActions(app)).toString('utf8'));
        eq(csv[0], r.b.header, 'CSV : en-tête identique');
      } finally { await app.close(); }
    }
    /* la valeur de la seconde colonne ne remplace plus la première (R10) : les scores diffèrent après la faute de Gris */
    const app = await launch(gabarit);
    try {
      await jouer(app, { names: { Bleu: 'Laval', Gris: 'Laval', Noir: 'Québec' } });
      const l = await app.ev(() => buildActionRows().rows[2]);   // après lancer échappé (Bleu, Noir +1) et faute de Gris (Bleu +1, Noir +1)
      eq([l['Score Laval avant'], l['Score Laval (2) avant'], l['Score Québec avant']], [2, 0, 2], 'chaque équipe a son score');
    } finally { await app.close(); }
  });

  /* ============ 5 : caractères spéciaux ============ */
  await check(`${P}·5 « ; », guillemets, retour chariot et saut de ligne dans un nom : le CSV se relit avec les mêmes colonnes, en-tête compris, et les mêmes valeurs`, async () => {
    const app = await launch(gabarit);
    try {
      const nom = 'Les "Aigles"; A', nom2 = 'Ligne\rdeux', nom3 = 'Haut\nBas;';
      await jouer(app, { names: { Bleu: nom, Gris: 'Gris', Noir: 'Noir' } });
      await app.ev(([a, b]) => { S.names.Gris = a; S.names.Noir = b; save(); }, [nom2, nom3]);
      const r = await app.ev(() => buildActionRows());
      const csv = lireCSV((await csvActions(app)).toString('utf8'));
      eq(csv[0], r.header, 'en-tête relu identique (colonnes non décalées)');
      csv.forEach((l, i) => eq(l.length, r.header.length, `ligne ${i} : nombre de colonnes`));
      eq(csv.length, r.rows.length + 1, 'nombre de lignes');
      r.rows.forEach((x, i) => r.header.forEach((h, k) => {
        const v = x[h] === undefined || x[h] === null ? '' : (typeof x[h] === 'number' ? String(x[h]).replace('.', ',') : String(x[h]));
        eq(csv[i + 1][k], v, `ligne ${i + 1}, « ${h} »`);
      }));
      assert(r.header.includes(`Score ${nom} avant`) && r.header.includes(`Score ${nom2} avant`) && r.header.includes(`Sur le terrain — ${nom3}`), 'noms spéciaux dans l\'en-tête');
      const brut = lireCSV((await telecharger(app, 'exportRawCSV()')).toString('utf8'));
      brut.forEach((l, i) => eq(l.length, brut[0].length, `brut, ligne ${i}`));
    } finally { await app.close(); }
  });

  /* ============ 6 : formules ============ */
  await check(`${P}·6 texte commençant par = + - @ ou une tabulation : apostrophe dans le CSV (jamais dans le XLSX) ; l'en-tête est échappé comme les données ; nombres négatifs inchangés`, async () => {
    const app = await launch(gabarit);
    try {
      const noms = { Bleu: '=HYPERLINK("http://x.invalid/?"&A1;"clic")', Gris: '+SOMME(1;2)', Noir: '@cmd' };
      await jouer(app, { names: noms });
      await app.ev(() => { S.names.Noir = '-2+3'; });
      const csv = lireCSV((await csvActions(app)).toString('utf8'));
      const h = csv[0], l1 = csv[1];
      const iAtt = h.indexOf('Équipe attaquante'), iCib = h.indexOf('Équipe ciblée');
      eq(l1[iAtt], "'" + noms.Bleu, 'texte commençant par « = » : apostrophe');
      eq(l1[iCib], "'" + noms.Gris, 'texte commençant par « + » : apostrophe');
      const noir = csv.map(l => l[iAtt]).find(x => x && x.includes('-2+3'));
      eq(noir, "'-2+3", 'texte commençant par « - » : apostrophe');
      /* unitaire sur la fonction de cellule */
      const u = await app.ev(() => ({
        a: csvEscape('=1+1'), b: csvEscape('+1'), c: csvEscape('-1x'), d: csvEscape('@A1'), e: csvEscape('\tx'), f: csvEscape('\rx'),
        n: csvEscape(-1), n2: csvEscape(-0.5), z: csvEscape(0), t: csvEscape('texte normal'), v: csvEscape(''), nul: csvEscape(null), g: csvEscape('a;b'),
        en: toCSV(['=a', 'b;c', 'd"e'], [{ '=a': 1, 'b;c': 'x', 'd"e': 2.5 }]),
      }));
      eq([u.a, u.b, u.c, u.d], ["'=1+1", "'+1", "'-1x", "'@A1"], 'quatre débuts de formule');
      eq([u.e, u.f], ["'\tx", "\"'\rx\""], 'tabulation et retour chariot (celui-ci entre guillemets)');
      eq([u.n, u.n2, u.z], ['-1', '-0,5', '0'], 'les nombres ne sont pas des textes : pas d\'apostrophe');
      eq([u.t, u.v, u.nul, u.g], ['texte normal', '', '', '"a;b"'], 'texte ordinaire, vide, nul, point-virgule');
      eq(u.en, "'=a;\"b;c\";\"d\"\"e\"\r\n1;x;2,5", 'en-tête échappé comme les données');
      /* XLSX : texte pur, sans apostrophe, jamais une formule */
      const x = XLSX.read(await telecharger(app, 'exportXLSX()'), { type: 'buffer' });
      const aoa = XLSX.utils.sheet_to_json(x.Sheets['Actions'], { header: 1, raw: true });
      const cellule = aoa[1][aoa[0].indexOf('Équipe attaquante')];
      eq(cellule, noms.Bleu, 'XLSX : le texte est tel quel');
      for (const f of Object.keys(x.Sheets['Actions'])) assert(!f.startsWith('!') ? !x.Sheets['Actions'][f].f : true, 'aucune formule dans le XLSX (' + f + ')');
    } finally { await app.close(); }
  });

  /* ============ 7 : décimales ============ */
  await check(`${P}·7 décimales : virgule dans les deux CSV, « ; » et BOM gardés, entiers sans virgule, dates inchangées ; le XLSX garde de vrais nombres`, async () => {
    const app = await launch(gabarit);
    try {
      await jouer(app, {});
      const r = await app.ev(() => { const b = buildActionRows(); return { rows: b.rows, header: b.header }; });
      const octets = await csvActions(app);
      eq([octets[0], octets[1], octets[2]], [0xEF, 0xBB, 0xBF], 'BOM UTF-8 gardé');
      const csv = lireCSV(octets.toString('utf8'));
      eq(octets.toString('utf8').includes('\r\n'), true, 'fin de ligne \\r\\n');
      const iX = csv[0].indexOf('X départ'), iY = csv[0].indexOf('Y arrivée');
      r.rows.forEach((x, i) => {
        if (typeof x['X départ'] === 'number') eq(csv[i + 1][iX], String(x['X départ']).replace('.', ','), 'X départ à la virgule');
        if (typeof x['Y arrivée'] === 'number') eq(csv[i + 1][iY], String(x['Y arrivée']).replace('.', ','), 'Y arrivée à la virgule');
      });
      assert(csv.slice(1).some(l => /^\d,\d+$/.test(l[iX])), 'au moins une coordonnée décimale (0,xxx)');
      /* aucune cellule numérique avec un point (les colonnes de date et de texte sont exclues) */
      const texte = new Set(['Date du match', 'Heure de l’action']);
      csv.slice(1).forEach((l, i) => l.forEach((c, k) => { if (!texte.has(csv[0][k]) && /^-?\d+\.\d+$/.test(c)) throw new Error(`ligne ${i + 1}, « ${csv[0][k]} » : décimale avec un point (${c})`); }));
      eq(csv[1][csv[0].indexOf('No')], '1', 'entier sans virgule');
      eq(csv[1][csv[0].indexOf('Période')], '1', 'période entière');
      assert(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(csv[1][csv[0].indexOf('Heure de l’action')]), 'la date garde son point des millisecondes');
      /* données brutes : coordonnées en liste « 0,3|0,7 » */
      const brut = lireCSV((await telecharger(app, 'exportRawCSV()')).toString('utf8'));
      const iS = brut[0].indexOf('start_norm');
      assert(iS > 0, 'colonne start_norm');
      assert(brut.slice(1).some(l => /^\d,\d+\|\d,\d+$/.test(l[iS])), 'liste de coordonnées à la virgule : ' + brut.slice(1).map(l => l[iS]).join(' / '));
      brut.slice(1).forEach(l => l.forEach(c => assert(!/^-?\d+\.\d+(\|-?\d+\.\d+)*$/.test(c), 'décimale avec un point dans le brut : ' + c)));
      /* XLSX : de vrais nombres */
      const x = XLSX.read(await telecharger(app, 'exportXLSX()'), { type: 'buffer' });
      const ws = x.Sheets['Actions'], aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
      const ixl = aoa[0].indexOf('X départ');
      assert(typeof aoa[1][ixl] === 'number' && Math.abs(aoa[1][ixl] - r.rows[0]['X départ']) < 1e-9, 'XLSX : X départ est un nombre : ' + aoa[1][ixl]);
      const ref = ws[XLSX.utils.encode_cell({ r: 1, c: ixl })];
      eq(ref.t, 'n', 'type de cellule numérique');
      const iid = aoa[0].indexOf('ID du match');
      eq(typeof aoa[1][iid], 'string', 'ID du match : texte');
    } finally { await app.close(); }
  });

  /* ============ 8 : XLSX ============ */
  await check(`${P}·8 XLSX (téléchargement réel) : feuille « Match » avec ID et date à la fin, feuille Actions = CSV (colonnes et valeurs), autres feuilles présentes`, async () => {
    const app = await launch(gabarit);
    try {
      await jouer(app, { names: { Bleu: 'Laval', Gris: 'Laval', Noir: 'Québec' }, nom: 'finale' });
      const id = await app.ev(() => S.id);
      const x = XLSX.read(await telecharger(app, 'exportXLSX()'), { type: 'buffer' });
      eq(x.SheetNames, ['Match', 'Actions', 'Équipes', 'Joueurs', 'Arrêté-continu', 'Reprises de jeu', 'Zones', 'Head-to-head', 'Types de fautes', 'Données brutes'].filter(n => x.SheetNames.includes(n)), 'feuilles, dans l\'ordre d\'avant');
      const match = XLSX.utils.sheet_to_json(x.Sheets['Match'], { header: 1, raw: true });
      eq(match.slice(-2).map(r => r[0]), ['ID du match', 'Date du match'], 'feuille « Match » : lignes ajoutées en fin');
      eq(match.slice(-2)[0][1], id, 'ID du match');
      assert(/^\d{4}-\d{2}-\d{2}T/.test(match.slice(-1)[0][1]), 'date du match ISO');
      eq(match[0][0], 'Fichier', 'première ligne inchangée');
      const act = XLSX.utils.sheet_to_json(x.Sheets['Actions'], { header: 1, raw: true });
      const csv = lireCSV((await csvActions(app)).toString('utf8'));
      eq(act[0], csv[0], 'Actions : même en-tête que le CSV');
      eq(act.length, csv.length, 'même nombre de lignes');
      eq(act[0].slice(-4), NOUVELLES, 'quatre colonnes ajoutées en fin');
      eq(act.slice(1).map(l => l[act[0].indexOf('Code de faute')] ?? ''), ['', 'EXT', 'DÉF ILL', '', ''], 'codes de faute dans le XLSX');
    } finally { await app.close(); }
  });

  /* ============ 9 : `at` ne change rien d'autre ============ */
  await check(`${P}·9 \`at\` : propre à l'événement (ni dans before ni dans details), ↶ exact, sauvegarde et rechargement intacts`, async () => {
    const app = await launch(gabarit);
    try {
      await jouer(app, { rosters: true });
      const r = await app.ev(() => ({
        evts: S.history.map(e => Object.keys(e).sort().join()),
        befores: S.history.map(e => 'at' in e.before),
        details: S.history.map(e => 'at' in (e.details || {})),
        snap: Object.keys(snapshotBefore()).sort().join(),
      }));
      r.evts.forEach((k, i) => assert(/\bat\b/.test(k), `événement ${i} : champ at`));
      eq([r.befores.some(Boolean), r.details.some(Boolean)], [false, false], 'at absent de before et de details');
      eq(r.snap, 'awaitingDuelStart,awaitingInitial,duelActive,eliminated,lineups,period,periodWins,possession,scores,stopped', 'snapshotBefore inchangé');
      /* ↶ restaure l'état d'avant exactement */
      const E0 = await app.state();
      const info = await app.ev(() => ({ cible: ATEAMS().find(t => t !== S.possession && t !== S.eliminated), joueur: lineupOf(S.possession)[0] }));
      await app.lancer({ target: info.cible, caught: false, player: info.joueur });
      eq(await app.ev(() => S.history.length), 6, 'une action de plus');
      await app.undo();
      const d = diff(await app.state(), E0); assert(!d, '↶ : état d\'avant exactement — ' + d);
      /* sauvegarde puis relecture de la base : at conservé */
      await app.page.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok');
      const enBase = await app.ev(() => MATCHES_DB.find(m => m.id === S.id).history.map(e => e.at));
      eq(enBase, await app.ev(() => S.history.map(e => e.at)), 'heures conservées dans la base');
      eq(app.errors, [], 'aucune erreur de page');
    } finally { await app.close(); }
  });

  await check(`${P}·11 audit E1 · une liste de coordonnées négatives du CSV brut n'est pas préfixée d'une apostrophe ; un vrai texte en = + - @ l'est toujours`, async () => {
    const app = await launch(gabarit);
    try {
      await jouer(app, {});
      await app.ev(() => { S.history[0].details.start_norm = [-0.042, 0.4]; S.history[0].details.end_norm = [0.5, -0.25]; });
      const brut = lireCSV((await telecharger(app, 'exportRawCSV()')).toString('utf8'));
      const iS = brut[0].indexOf('start_norm'), iE = brut[0].indexOf('end_norm');
      eq([brut[1][iS], brut[1][iE]], ['-0,042|0,4', '0,5|-0,25'], 'coordonnées négatives : ni apostrophe ni point');
      const u = await app.ev(() => ({ a: csvEscape('-0,042|0,4'), b: csvEscape('-5'), c: csvEscape('-2+3'), d: csvEscape('=1+1'), e: csvEscape('+1'), f: csvEscape('@x'), g: csvEscape('-|0,4'), h: csvEscape('-0,5x') }));
      eq([u.a, u.b], ['-0,042|0,4', '-5'], 'nombre et liste de nombres négatifs');
      eq([u.c, u.d, u.e, u.f, u.g, u.h], ["'-2+3", "'=1+1", "'+1", "'@x", "'-|0,4", "'-0,5x"], 'vrais textes : apostrophe conservée');
    } finally { await app.close(); }
  });

  await check(`${P}·12 audit E2 · le suffixe des homonymes ne tombe jamais sur le nom d'une autre équipe, dans tous les ordres (« Laval », « Laval », « Laval (2) »)`, async () => {
    const app = await launch(gabarit);
    try {
      await jouer(app, {});
      for (const noms of [['Laval', 'Laval', 'Laval (2)'], ['Laval (2)', 'Laval', 'Laval'], ['Laval', 'Laval (2)', 'Laval'], ['Laval', 'Laval', 'Laval'], ['Laval (2)', 'Laval (2)', 'Laval (2)'], ['A', 'B', 'C']]) {
        const r = await app.ev(n => { S.names = { Bleu: n[0], Gris: n[1], Noir: n[2] }; const b = buildActionRows(); return { ate: ATEAMS().map(nm), header: b.header, eq: teamSummaryAoa().slice(1).map(x => x[0]) }; }, noms);
        eq(new Set(r.ate).size, 3, `noms distincts pour ${JSON.stringify(noms)} : ${JSON.stringify(r.ate)}`);
        eq(r.header.filter((h, i) => r.header.indexOf(h) !== i), [], `aucun en-tête en double pour ${JSON.stringify(noms)}`);
        eq(r.eq, r.ate, 'feuille Équipes : les mêmes noms');
        eq(r.ate[noms.findIndex((n, i) => noms.indexOf(n) === i)], noms[0], 'la première équipe garde son nom');
      }
    } finally { await app.close(); }
  });

  await check(`${P}·10 la collecte ne reçoit pas \`at\` : le contenu envoyé et son empreinte sont ceux d'avant`, async () => {
    const racine = path.dirname(HTML);
    const faux = await demarrer({});
    const cfg = { collecteUrl: faux.url, contact: 'contact-test@example.invalid' };
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (u === '/sw.js') { res.writeHead(404); res.end(); return; }
      if (u === '/config.js') { res.writeHead(200, { 'content-type': types['.js'], 'cache-control': 'no-store' }); res.end('window.KB_CONFIG = ' + JSON.stringify(cfg) + ';'); return; }
      const f = path.join(racine, u === '/' ? 'index.html' : u);
      if (!f.startsWith(racine) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(f).pipe(res);
    });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const app = await launch(gabarit, { url: 'http://127.0.0.1:' + srv.address().port + '/' });
    const p = app.page;
    try {
      await p.waitForFunction(() => typeof DB !== 'undefined' && !!DB && !!AUTHOR_ID && typeof KBSite !== 'undefined' && !!KBSite.collecte, null, { timeout: 8000, polling: 20 });
      await jouer(app, {});
      await app.ev(() => finishMatchNow());
      await p.waitForFunction(() => !pendingSaveId && dbSyncState === 'ok', null, { timeout: 8000 });
      const local = await app.ev(() => S.history.map(e => e.at));
      assert(local.every(a => typeof a === 'string'), 'le match local porte les heures');
      await app.ev(() => { closeSheet(); navTo('backup'); });
      await p.locator('#kbCollecteInterrupteur').click();
      await p.waitForFunction(() => /1 partag/.test((document.getElementById('kbCollecteEtat') || {}).textContent || ''), null, { timeout: 8000 });
      const envoye = JSON.parse(faux.posts[0].corps).match;
      eq(envoye.history.length, local.length, 'tous les événements sont partis');
      envoye.history.forEach((e, i) => assert(!('at' in e), `événement ${i} : at ne part pas`));
      assert(!JSON.stringify(envoye).includes(local[0]), 'aucune heure dans l\'envoi');
    } finally { await app.close(); srv.closeAllConnections?.(); srv.close(); if (faux.arreter) await faux.arreter(); }
  });
}
