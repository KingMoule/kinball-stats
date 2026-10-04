/* Suite de outils/resync.mjs (sans banc complet). Chaque cas travaille sur une COPIE
   temporaire du dépôt (git init, un commit), jamais sur le dépôt lui-même.
   Commande : NODE_PATH=<dossier de playwright> node tests/local/resync.test.mjs
   (Playwright ne sert qu'au cas 8 ; PASS / FAIL par cas, code de sortie 1 au moindre échec.) */
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const lire = (p) => fs.readFileSync(p);
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'kinball-resync-test-'));
let nCopie = 0;

/* ---------- copie de travail : le dépôt (fichiers du disque) + git init + un commit ---------- */
function copie() {
  const dst = path.join(TMP, 'depot' + (++nCopie));
  fs.cpSync(DEPOT, dst, { recursive: true, filter: (src) => { const n = path.basename(src); return n !== '.git' && n !== 'node_modules'; } });
  const g = (...a) => { const r = spawnSync('git', a, { cwd: dst, encoding: 'utf8' }); if (r.status !== 0) throw new Error('git ' + a.join(' ') + ' : ' + r.stderr); return r.stdout; };
  g('init', '-q'); g('config', 'user.email', 't@t'); g('config', 'user.name', 't'); g('add', '-A'); g('commit', '-q', '-m', 'copie de test');
  return { dst, g };
}
function lancer(dst, argv) {
  const r = spawnSync(process.execPath, [path.join(DEPOT, 'outils', 'resync.mjs'), ...argv, '--racine', dst], { encoding: 'utf8', maxBuffer: 1 << 26 });
  return { code: r.status, sortie: (r.stdout || '') + (r.stderr || ''), out: r.stdout || '', err: r.stderr || '' };
}
/* empreinte de tout le dossier (hors .git) : « rien d'écrit » = identique avant / après */
function empreinteDossier(dir) {
  const lignes = [];
  const marcher = (d, b = '') => {
    for (const e of fs.readdirSync(path.join(d, b), { withFileTypes: true }).sort((x, y) => x.name < y.name ? -1 : 1)) {
      if (e.name === '.git') continue;
      const r = b ? b + '/' + e.name : e.name;
      if (e.isDirectory()) marcher(d, r); else lignes.push(r + ' ' + sha(lire(path.join(d, r))));
    }
  };
  marcher(dir);
  return sha(lignes.join('\n'));
}

/* ---------- fabrication des « nouvelles versions amont » à partir de la base ---------- */
const BASE = lire(path.join(DEPOT, 'amont', 'kinball.amont.html')).toString('utf8');
function remplacer(txt, de, vers, nom) {
  const i = txt.indexOf(de);
  if (i < 0 || txt.indexOf(de, i + 1) >= 0) throw new Error('préparation du cas : « ' + nom + ' » introuvable ou ambigu dans la base');
  return txt.slice(0, i) + vers + txt.slice(i + de.length);
}
const L_ENTREE = "    case 'match':           renderScoreboard(); break;";
const L_ENTREE2 = "    case 'match':           renderScoreboard(); reopenMatchSheets(); break;";
const FIN_DUEL = "  closeSheet(); renderScoreboard(); save();\n}\n\n/* ---------- FIELD DRAG ---------- */";
const FONCTION = "  closeSheet(); renderScoreboard(); save();\n}\nfunction reopenMatchSheets(){\n  /* reprise des feuilles ouvertes après rechargement (ajout de test) */\n  if(S.awaitingDuelStart){ openSheet('duel'); }\n}\n\n/* ---------- FIELD DRAG ---------- */";
const R_PITCH = ".sub-pitch{position:relative; border-radius:14px; padding:14px; background:linear-gradient(#17402F,#0F3023); border:1px solid rgba(255,255,255,.18); overflow:hidden;}";
function faconC24(txt) {
  txt = remplacer(txt, L_ENTREE, L_ENTREE2, 'onEnterScreen');
  txt = remplacer(txt, FIN_DUEL, FONCTION, 'chooseDuelStart');
  txt = remplacer(txt, R_PITCH, R_PITCH.replace('overflow:hidden', 'overflow:visible'), '.sub-pitch');
  return txt;
}

/* ---------- compte rendu ---------- */
let pass = 0, fail = 0;
async function cas(nom, fn) {
  try { await fn(); pass++; console.log('PASS  ' + nom); }
  catch (e) { fail++; console.log('FAIL  ' + nom + '\n      ' + String(e.message).split('\n').join('\n      ')); }
}
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion fausse'); };
const marqueurs = (txt) => txt.split('\n').filter(l => l.includes('MIGRATION'));
const ecrireNouveau = (dir, nom, txt) => { const p = path.join(dir, nom); fs.writeFileSync(p, txt); return p; };

const nbMarqDepot = marqueurs(lire(path.join(DEPOT, 'index.html')).toString('utf8')).length;
ok(nbMarqDepot >= 15, 'le dépôt devrait porter au moins 15 lignes MIGRATION (trouvé ' + nbMarqDepot + ')');

/* 1 */
await cas('1 · à vide (nouveau = base) : « rien à faire », code 0, rien d\'écrit', async () => {
  const { dst } = copie(); const avant = empreinteDossier(dst);
  const r = lancer(dst, [path.join(dst, 'amont', 'kinball.amont.html')]);
  ok(r.code === 0, 'code ' + r.code + '\n' + r.sortie);
  ok(/Rien à faire/.test(r.out), 'message « Rien à faire » absent');
  ok(empreinteDossier(dst) === avant, 'des fichiers ont changé');
});

/* 2 et 7 : même copie de départ, deux dépôts identiques */
let sortieC24 = '';
await cas('2 · amont « façon C24 » : fusion propre, trois changements, marqueurs, amont/, empreinte, check-release, version avancée', async () => {
  const { dst, g } = copie();
  const nouveau = faconC24(BASE);
  const f = ecrireNouveau(TMP, 'c24.html', nouveau);
  const versionAvant = lire(path.join(dst, 'kbsite.js')).toString('utf8').match(/var VERSION_SITE = '([^']*)'/)[1];
  const marqAvant = marqueurs(lire(path.join(dst, 'index.html')).toString('utf8'));
  const r = lancer(dst, [f]); sortieC24 = r.sortie;
  ok(r.code === 0, 'code ' + r.code + '\n' + r.sortie);
  const idx = lire(path.join(dst, 'index.html')).toString('utf8');
  ok(idx.includes(L_ENTREE2), 'changement onEnterScreen absent');
  ok(idx.includes('function reopenMatchSheets(){'), 'fonction reopenMatchSheets absente');
  ok(idx.includes(R_PITCH.replace('overflow:hidden', 'overflow:visible')), 'règle .sub-pitch non reprise');
  const marqApres = marqueurs(idx);
  ok(marqApres.length === marqAvant.length && marqAvant.every(l => marqApres.filter(x => x === l).length === marqAvant.filter(x => x === l).length), 'marqueurs MIGRATION changés (' + marqAvant.length + ' avant, ' + marqApres.length + ' après)');
  ok(lire(path.join(dst, 'amont', 'kinball.amont.html')).equals(lire(f)), 'amont/ n\'est pas identique au nouveau fichier');
  const emp = lire(path.join(dst, 'amont', 'EMPREINTE.txt')).toString('utf8');
  ok(emp.includes(sha(lire(f))) && emp.includes(lire(f).length + ' octets'), 'EMPREINTE.txt pas à jour :\n' + emp);
  const cr = spawnSync(process.execPath, [path.join(dst, 'outils', 'check-release.mjs'), '--racine', dst], { encoding: 'utf8' });
  ok(cr.status === 0, 'check-release : ' + cr.stdout + cr.stderr);
  const versionApres = lire(path.join(dst, 'kbsite.js')).toString('utf8').match(/var VERSION_SITE = '([^']*)'/)[1];
  ok(versionApres !== versionAvant && versionApres > versionAvant, 'version non avancée : ' + versionAvant + ' -> ' + versionApres);
  ok(!/^(<<<<<<<|>>>>>>>)/m.test(idx), 'marqueur de conflit dans index.html');
  ok(!r.out.includes('AVERTISSEMENTS'), 'avertissement inattendu :\n' + r.out);
  /* rien n'est commité par l'outil */
  ok(g('log', '--oneline').trim().split('\n').length === 1, 'l\'outil a commité');
});

/* 3 : conflits sur accroches */
let sortieConflit = '';
await cas('3 · amont modifié sur une accroche : conflits listés avec leur accroche, code 2, rien d\'écrit', async () => {
  const { dst } = copie();
  const idxTxt = lire(path.join(dst, 'index.html')).toString('utf8').split('\n');
  const iM06 = idxTxt.findIndex(l => l.includes('KBSite.sauvegardeV2(payload)'));
  ok(iM06 > 0, 'accroche M06 introuvable');
  const voisine = idxTxt[iM06 - 1];
  let nouveau = remplacer(BASE, "await window.claude.use('db') : null; }", "await window.claude.use('db', {v:2}) : null; }", 'use db');
  nouveau = remplacer(nouveau, voisine + '\n', voisine + ' /* changé par l\'amont */\n', 'ligne voisine de M06');
  const f = ecrireNouveau(TMP, 'conflit.html', nouveau);
  const avant = empreinteDossier(dst);
  const r = lancer(dst, [f]); sortieConflit = r.sortie;
  ok(r.code === 2, 'code ' + r.code + '\n' + r.sortie);
  ok(/CONFLIT : \d+ zone/.test(r.out), 'liste des conflits absente');
  const n = Number(r.out.match(/CONFLIT : (\d+) zone/)[1]);
  ok(n >= 2, 'moins de deux conflits (' + n + ')');
  ok((r.out.match(/accroche MIGRATION la plus proche/g) || []).length === n, 'une accroche par conflit attendue');
  ok(/capabilityEntry|MIGRATION M03/.test(r.out) && /MIGRATION M06/.test(r.out), 'accroches M03 et M06 non citées');
  const m = r.out.match(/Fichier annoté[^:]*: (.+)/);
  ok(m && fs.existsSync(m[1].trim()), 'fichier annoté absent');
  ok(!path.resolve(m[1].trim()).startsWith(dst), 'fichier annoté dans le dépôt');
  ok(lire(m[1].trim()).toString('utf8').includes('<<<<<<<'), 'le fichier annoté ne montre pas les conflits');
  ok(empreinteDossier(dst) === avant, 'des fichiers du dépôt ont changé');
});

/* 4 */
await cas('4 · dépôt non propre : refus, rien d\'écrit', async () => {
  const { dst } = copie();
  fs.appendFileSync(path.join(dst, 'index.html'), '\n<!-- modification non commitée -->\n');
  const f = ecrireNouveau(TMP, 'c24b.html', faconC24(BASE));
  const avant = empreinteDossier(dst);
  const r = lancer(dst, [f]);
  ok(r.code === 1 && /pas propre/.test(r.err), 'attendu refus (code 1, « pas propre ») : ' + r.code + '\n' + r.sortie);
  ok(empreinteDossier(dst) === avant, 'des fichiers ont changé');
  /* même refus avec un fichier non suivi */
  const c2 = copie(); fs.writeFileSync(path.join(c2.dst, 'nouveau.txt'), 'x');
  const r2 = lancer(c2.dst, [f]);
  ok(r2.code === 1 && /pas propre/.test(r2.err), 'fichier non suivi : refus attendu');
});

/* 5 */
await cas('5 · nouveau fichier en CRLF : refus clair, rien d\'écrit', async () => {
  const { dst } = copie();
  const f = ecrireNouveau(TMP, 'crlf.html', faconC24(BASE).replace(/\n/g, '\r\n'));
  const avant = empreinteDossier(dst);
  const r = lancer(dst, [f]);
  ok(r.code === 1 && /CRLF/.test(r.err) && /fins de ligne/.test(r.err), 'message attendu :\n' + r.sortie);
  ok(empreinteDossier(dst) === avant, 'des fichiers ont changé');
});

/* 6 */
await cas('6 · amont qui ajoute un <script src="https://…"> et un quatrième window.claude.use( : fusion propre, 2 avertissements', async () => {
  const { dst } = copie();
  let nouveau = remplacer(BASE, FIN_DUEL, "  closeSheet(); renderScoreboard(); save();\n}\nasync function chargerAilleurs(){ return window.claude.use('autre'); }\n\n/* ---------- FIELD DRAG ---------- */", 'ajout use');
  nouveau = remplacer(nouveau, '  <div class="brand-sub">Statistiques de match</div>', '  <script src="https://exemple.invalide/lib.js"></script>\n  <div class="brand-sub">Statistiques de match</div>', 'ajout script');
  const f = ecrireNouveau(TMP, 'avert.html', nouveau);
  const r = lancer(dst, [f]);
  ok(r.code === 0, 'code ' + r.code + '\n' + r.sortie);
  ok(/AVERTISSEMENTS \(2\)/.test(r.out), 'deux avertissements attendus :\n' + r.out);
  ok(/adresse http\(s\)/.test(r.out) && /window\.claude\.use\( hors de capabilityEntry/.test(r.out), 'avertissements non reconnus :\n' + r.out);
});

/* 7 */
await cas('7 · --essai sur le cas 2 : même sortie, aucune écriture', async () => {
  const { dst } = copie();
  const f = path.join(TMP, 'c24.html');
  const avant = empreinteDossier(dst);
  const r = lancer(dst, [f, '--essai']);
  ok(r.code === 0, 'code ' + r.code + '\n' + r.sortie);
  ok(empreinteDossier(dst) === avant, 'des fichiers ont changé en essai');
  const net = (s) => s.split('\n').filter(l => !/^(ESSAI|RÉSULTAT)/.test(l) && !l.includes(dst) && !l.includes(TMP) && !l.includes('kinball-resync-')).join('\n');
  ok(net(r.sortie) === net(sortieC24), 'la sortie diffère de celle du cas 2 :\n--- essai\n' + net(r.sortie) + '\n--- réel\n' + net(sortieC24));
  ok(/ESSAI : rien n'a été écrit/.test(r.out), 'ligne ESSAI absente');
});

/* 8 */
await cas('8 · le résultat du cas 2 se charge dans Chromium sans erreur console', async () => {
  let playwright;
  try { playwright = require('playwright'); }
  catch (e) {
    for (const d of [...(process.env.NODE_PATH || '').split(path.delimiter).filter(Boolean), '/home/claude/.npm-global/lib/node_modules']) {
      try { playwright = createRequire(path.join(d, '/'))('playwright'); break; } catch {}
    }
    if (!playwright) throw new Error('Playwright introuvable (NODE_PATH)');
  }
  const { dst } = copie();
  const r = lancer(dst, [path.join(TMP, 'c24.html')]);
  ok(r.code === 0, 'resync : code ' + r.code + '\n' + r.sortie);
  const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.png': 'image/png' };
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname); if (p.endsWith('/')) p += 'index.html';
    if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const f = path.join(dst, path.normalize(p));
    if (!f.startsWith(dst) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(fs.readFileSync(f));
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const browser = await playwright.chromium.launch();
  try {
    const page = await (await browser.newContext({ viewport: { width: 1180, height: 820 } })).newPage();
    const erreurs = [];
    page.on('pageerror', e => erreurs.push('pageerror : ' + e.message));
    page.on('console', m => { if (m.type() === 'error') erreurs.push('console : ' + m.text()); });
    page.on('requestfailed', q => erreurs.push('requête échouée : ' + q.url()));
    await page.goto('http://127.0.0.1:' + srv.address().port + '/index.html', { waitUntil: 'load' });
    await page.waitForTimeout(1500);
    const etat = await page.evaluate(() => ({ app: typeof navTo === 'function' && typeof S === 'object', fn: typeof reopenMatchSheets, kb: typeof KBSite, loc: typeof KBLocal }));
    ok(etat.app && etat.fn === 'function' && etat.kb === 'object' && etat.loc === 'object', 'page non initialisée : ' + JSON.stringify(etat));
    ok(erreurs.length === 0, 'erreurs :\n' + erreurs.join('\n'));
  } finally { await browser.close(); srv.close(); }
});

/* 9 */
await cas('9 · MIGRATION.md : commandes existantes, lancées telles qu\'écrites ; ni chemin local ni nom de personne', async () => {
  const md = lire(path.join(DEPOT, 'MIGRATION.md')).toString('utf8');
  ok(!/\/home\//.test(md) && !/C:\\/.test(md), 'chemin local dans MIGRATION.md');
  for (const mot of ['Gagnon', 'Arnaud', 'Moule', 'gstarnaud', '@gmail', '/Users/']) ok(!md.includes(mot), 'nom ou adresse personnelle : ' + mot);
  /* tout fichier cité après « node » existe */
  const cites = [...md.matchAll(/node\s+((?:outils|tests|sim)\/[\w./-]+)/g)].map(x => x[1]);
  ok(cites.length >= 5, 'trop peu de commandes citées : ' + cites.length);
  for (const c of new Set(cites)) ok(fs.existsSync(path.join(DEPOT, c)), 'commande citée sur un fichier inexistant : ' + c);
  /* les commandes de resync, telles qu'écrites (le chemin du fichier est remplacé), sur une copie */
  const { dst } = copie();
  const f = path.join(TMP, 'c24.html');
  const blocs = [...md.matchAll(/node outils\/resync\.mjs "<chemin du nouveau fichier amont>\.html"( --essai)?/g)];
  ok(blocs.length === 2, 'les deux commandes de resynchronisation attendues dans MIGRATION.md');
  const essai = lancer(dst, [f, '--essai']); ok(essai.code === 0, 'commande --essai : code ' + essai.code);
  const reel = lancer(dst, [f]); ok(reel.code === 0, 'commande réelle : code ' + reel.code);
  const ck = spawnSync(process.execPath, [path.join(dst, 'outils', 'check-release.mjs'), '--racine', dst], { encoding: 'utf8' });
  ok(ck.status === 0, 'check-release.mjs sans --ecrire : ' + ck.stdout + ck.stderr);
  const ck2 = spawnSync(process.execPath, [path.join(dst, 'outils', 'check-release.mjs'), '--racine', dst, '--ecrire'], { encoding: 'utf8' });
  ok(ck2.status === 0 && /Rien n'a changé/.test(ck2.stdout), 'check-release.mjs --ecrire : ' + ck2.stdout + ck2.stderr);
  /* commandes git du document : syntaxe acceptée par git */
  const { g } = { g: (...a) => spawnSync('git', a, { cwd: dst, encoding: 'utf8' }) };
  ok(g('diff', '--no-index', '--stat', path.join(DEPOT, 'amont', 'kinball.amont.html'), path.join(dst, 'amont', 'kinball.amont.html')).status === 1, 'git diff --no-index attendu avec écart');
  ok(g('diff', '--stat').status === 0, 'git diff --stat');
});

/* 10 : --tests */
await cas('10 · --tests : copie intacte de tests/ et sim/ de l\'amont dans amont/, liste des écarts, rien dans tests/ ni sim/ du dépôt', async () => {
  const { dst } = copie();
  const amontTests = path.join(TMP, 'amont-dossier');
  fs.mkdirSync(path.join(amontTests, 'tests', 'scenarios'), { recursive: true }); fs.mkdirSync(path.join(amontTests, 'sim'), { recursive: true });
  fs.writeFileSync(path.join(amontTests, 'tests', 'lib.mjs'), '// lib d\'origine\n');
  fs.writeFileSync(path.join(amontTests, 'tests', 'scenarios', 'C24.mjs'), '// scénario C24\n');
  fs.writeFileSync(path.join(amontTests, 'sim', 'simcore.js'), '// moteur\n');
  const avantTestsSim = empreinteDossier(path.join(dst, 'tests')) + empreinteDossier(path.join(dst, 'sim'));
  const r = lancer(dst, [path.join(dst, 'amont', 'kinball.amont.html'), '--tests', amontTests]);
  ok(r.code === 0, 'code ' + r.code + '\n' + r.sortie);
  ok(lire(path.join(dst, 'amont', 'tests', 'scenarios', 'C24.mjs')).toString() === '// scénario C24\n' && fs.existsSync(path.join(dst, 'amont', 'sim', 'simcore.js')), 'copie absente');
  ok(/première copie/.test(r.out), 'amorçage non signalé');
  ok(empreinteDossier(path.join(dst, 'tests')) + empreinteDossier(path.join(dst, 'sim')) === avantTestsSim, 'tests/ ou sim/ du dépôt modifiés');
  /* deuxième passage (après commit) : un scénario nouveau, lib.mjs changé */
  spawnSync('git', ['add', '-A'], { cwd: dst }); spawnSync('git', ['commit', '-q', '-m', 'amorçage'], { cwd: dst });
  fs.writeFileSync(path.join(amontTests, 'tests', 'lib.mjs'), '// lib changée\n');
  fs.writeFileSync(path.join(amontTests, 'tests', 'scenarios', 'C25.mjs'), '// scénario C25\n');
  const r2 = lancer(dst, [path.join(dst, 'amont', 'kinball.amont.html'), '--tests', amontTests]);
  ok(r2.code === 0 && /\+ tests\/scenarios\/C25\.mjs/.test(r2.out) && /~ tests\/lib\.mjs/.test(r2.out), 'liste des écarts :\n' + r2.sortie);
  /* dossier --tests invalide : refus avant toute écriture */
  const avant = empreinteDossier(dst);
  spawnSync('git', ['add', '-A'], { cwd: dst }); spawnSync('git', ['commit', '-q', '-m', 'x'], { cwd: dst });
  const r3 = lancer(dst, [path.join(TMP, 'c24.html'), '--tests', path.join(TMP, 'inexistant')]);
  ok(r3.code === 1 && empreinteDossier(dst) === avant, 'dossier --tests invalide : refus attendu');
});

/* 11 : base falsifiée */
await cas('11 · amont/ qui ne correspond pas à EMPREINTE.txt : refus, rien d\'écrit', async () => {
  const { dst, g } = copie();
  fs.appendFileSync(path.join(dst, 'amont', 'kinball.amont.html'), '\n');
  g('commit', '-q', '-am', 'base abîmée');
  const avant = empreinteDossier(dst);
  const r = lancer(dst, [path.join(TMP, 'c24.html')]);
  ok(r.code === 1 && /EMPREINTE/.test(r.err), 'refus attendu :\n' + r.sortie);
  ok(empreinteDossier(dst) === avant, 'des fichiers ont changé');
});

/* sortie complète des cas 2 et 3 (utile au rapport) */
if (process.env.RESYNC_MONTRER) {
  console.log('\n===== sortie du cas 2 =====\n' + sortieC24 + '\n===== sortie du cas 3 =====\n' + sortieConflit);
}
fs.rmSync(TMP, { recursive: true, force: true });
console.log('\n' + pass + ' PASS, ' + fail + ' FAIL');
process.exit(fail ? 1 : 0);
