#!/usr/bin/env node
/* resync.mjs — reprend une nouvelle version du fichier amont dans index.html par fusion
   à trois voies (base = amont/kinball.amont.html, nôtre = index.html, leur = le nouveau
   fichier). Node seul, git en sous-processus, aucune dépendance.

   Usage : node outils/resync.mjs <nouveau fichier amont> [--essai] [--racine <dossier>]
                                  [--tests <dossier>]

   Codes de sortie : 0 fusion faite (ou rien à faire) ; 1 refus ou erreur (rien d'écrit) ;
   2 conflit (rien d'écrit dans le dépôt ; le résultat annoté est dans un fichier temporaire).

   Tout est contrôlé AVANT d'écrire quoi que ce soit. L'outil ne commite pas, ne pousse pas,
   ne résout jamais un conflit. L'état d'avant reste récupérable : le dépôt était propre
   (git checkout / git restore), et une copie des fichiers modifiés est faite hors du dépôt.

   --essai  : tout sauf les écritures.
   --tests  : dossier de l'amont qui contient tests/ et/ou sim/ (disposition d'origine) ;
              leur copie intacte est gardée dans amont/tests/ et amont/sim/ et la liste des
              fichiers nouveaux / changés / disparus est affichée. Aucune fusion automatique
              avec tests/ ni sim/ du dépôt : voir MIGRATION.md. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ICI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const essai = args.includes('--essai');
function valeurOption(nom) {
  const i = args.indexOf(nom);
  if (i < 0) return null;
  if (i + 1 >= args.length || args[i + 1].startsWith('--')) refuser('l\'option ' + nom + ' demande une valeur.');
  return args[i + 1];
}
function refuser(msg) { console.error('resync : REFUS — ' + msg); console.error('Rien n\'a été écrit.'); process.exit(1); }

const optRacine = valeurOption('--racine');
const optTests = valeurOption('--tests');
const positionnels = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--racine' || args[i] === '--tests') { i++; continue; }
  if (args[i] === '--essai') continue;
  if (args[i].startsWith('--')) refuser('option inconnue : ' + args[i]);
  positionnels.push(args[i]);
}
if (positionnels.length !== 1) refuser('usage : node outils/resync.mjs <nouveau fichier amont> [--essai] [--racine <dossier>] [--tests <dossier>]');

const racine = path.resolve(optRacine || path.join(ICI, '..'));
const fichierNouveau = path.resolve(positionnels[0]);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (...p) => path.join(racine, ...p);
const court = (s, n = 150) => { s = s.replace(/\r?\n$/, ''); return s.length > n ? s.slice(0, n) + '…' : s; };
function git(argv, opts = {}) {
  return spawnSync('git', argv, { cwd: racine, maxBuffer: 1 << 28, ...opts });
}

/* ---------- 1. Contrôles, avant toute écriture ---------- */
if (!fs.existsSync(fichierNouveau) || !fs.statSync(fichierNouveau).isFile()) refuser('le fichier donné est introuvable : ' + fichierNouveau);
for (const f of ['index.html', 'amont/kinball.amont.html', 'amont/EMPREINTE.txt', 'kbsite.js', 'sw.js']) {
  if (!fs.existsSync(rel(f))) refuser('fichier du dépôt introuvable : ' + f + ' (racine ' + racine + ')');
}
const st = git(['status', '--porcelain']);
if (st.status !== 0) refuser('git status a échoué (la racine est-elle un dépôt git ?) : ' + String(st.stderr || '').trim());
if (String(st.stdout).trim() !== '') {
  refuser('le dépôt n\'est pas propre (fichiers modifiés ou non suivis). Commitez ou rangez-les d\'abord :\n' +
    String(st.stdout).split('\n').filter(Boolean).slice(0, 12).map(l => '    ' + l).join('\n'));
}

const bufBase = fs.readFileSync(rel('amont', 'kinball.amont.html'));
const bufNouveau = fs.readFileSync(fichierNouveau);
const bufNotre = fs.readFileSync(rel('index.html'));

const empreinteTxt = fs.readFileSync(rel('amont', 'EMPREINTE.txt'), 'utf8');
const mEmp = empreinteTxt.match(/^sha256\s*:\s*([0-9a-f]{64})\s*$/m);
if (!mEmp) refuser('amont/EMPREINTE.txt ne contient pas de ligne « sha256 : <64 caractères> ».');
if (sha(bufBase) !== mEmp[1]) {
  refuser('amont/kinball.amont.html ne correspond pas à amont/EMPREINTE.txt (' + sha(bufBase).slice(0, 12) + '… ≠ ' + mEmp[1].slice(0, 12) + '…). La base de la fusion serait fausse : rétablir amont/ avant de continuer.');
}

const aCR = (b) => b.includes(0x0d);
if (aCR(bufNouveau) !== aCR(bufBase)) {
  refuser('fins de ligne différentes : le nouveau fichier est en ' + (aCR(bufNouveau) ? 'CRLF' : 'LF') +
    ' et la base (amont/) en ' + (aCR(bufBase) ? 'CRLF' : 'LF') + '. Rien n\'est converti en silence : convertir le nouveau fichier en ' +
    (aCR(bufBase) ? 'CRLF' : 'LF') + ' (même convention que la base), puis relancer.');
}
if (aCR(bufNotre) !== aCR(bufBase)) {
  refuser('index.html n\'a pas la même convention de fins de ligne que la base : régler cela d\'abord.');
}

/* --tests : le dossier doit exister (contrôlé ici, pas après les écritures) */
let dossierTests = null;
if (optTests) {
  dossierTests = path.resolve(optTests);
  if (!fs.existsSync(dossierTests) || !fs.statSync(dossierTests).isDirectory()) refuser('--tests : dossier introuvable : ' + dossierTests);
  if (!fs.existsSync(path.join(dossierTests, 'tests')) && !fs.existsSync(path.join(dossierTests, 'sim'))) {
    refuser('--tests : ni tests/ ni sim/ dans ' + dossierTests);
  }
}

console.log('resync : racine ' + racine);
console.log('Base (amont/)  : ' + sha(bufBase).slice(0, 12) + '…  ' + bufBase.length + ' octets');
console.log('Nouveau fichier: ' + sha(bufNouveau).slice(0, 12) + '…  ' + bufNouveau.length + ' octets  (' + fichierNouveau + ')');

if (bufNouveau.equals(bufBase)) {
  console.log('Rien à faire : le nouveau fichier est identique à la version amont déjà intégrée.');
  if (!dossierTests) process.exit(0);
}

/* ---------- 2. Fusion vers un dossier temporaire HORS du dépôt ---------- */
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kinball-resync-'));
const fusion = path.join(tmp, 'index.fusion.html');
let texteFusion = null;
if (!bufNouveau.equals(bufBase)) {
  const m = spawnSync('git', ['merge-file', '-p', '--diff3', '-L', 'index.html (nôtre)', '-L', 'amont intégré (base)', '-L', 'nouveau fichier amont (leur)',
    rel('index.html'), rel('amont', 'kinball.amont.html'), fichierNouveau], { cwd: tmp, maxBuffer: 1 << 28 });
  if (m.status === null || m.status < 0 || m.status > 127) {
    refuser('git merge-file a échoué (code ' + m.status + ') : ' + String(m.stderr || '').trim());
  }
  fs.writeFileSync(fusion, m.stdout);
  const nbConflits = m.status;

  /* ---------- 3. Conflits : lister, ne rien écrire ---------- */
  if (nbConflits > 0) {
    const lignesF = m.stdout.toString('utf8').split('\n');
    const lignesN = bufNotre.toString('utf8').split('\n');
    const accroches = [];
    lignesN.forEach((l, i) => { if (l.includes('MIGRATION')) accroches.push(i + 1); });
    const conflits = [];
    let etat = 'hors', nN = 0, cur = null;     // nN = ligne d'index.html atteinte
    for (const l of lignesF) {
      if (l.startsWith('<<<<<<< ')) { etat = 'notre'; cur = { ligne: nN + 1, notre: [], base: [], leur: [] }; continue; }
      if (etat === 'notre' && l.startsWith('||||||| ')) { etat = 'base'; continue; }
      if ((etat === 'notre' || etat === 'base') && l === '=======') { etat = 'leur'; continue; }
      if (etat === 'leur' && l.startsWith('>>>>>>> ')) { cur.fin = nN; conflits.push(cur); etat = 'hors'; cur = null; continue; }
      if (etat === 'hors') nN++;
      else if (etat === 'notre') { nN++; cur.notre.push(l); }
      else if (etat === 'base') cur.base.push(l);
      else if (etat === 'leur') cur.leur.push(l);
    }
    console.log('');
    console.log('CONFLIT : ' + conflits.length + ' zone(s) où les deux versions ont touché aux mêmes lignes. Rien n\'a été écrit dans le dépôt.');
    conflits.forEach((c, i) => {
      const debut = c.ligne, fin = Math.max(c.fin, c.ligne);
      let proche = null, dist = Infinity;
      for (const a of accroches) {
        const d = (a >= debut && a <= fin) ? 0 : Math.min(Math.abs(a - debut), Math.abs(a - fin));
        if (d < dist) { dist = d; proche = a; }
      }
      console.log('');
      console.log('  Conflit ' + (i + 1) + ' : index.html ligne ' + debut + (fin > debut ? ' à ' + fin : ''));
      if (proche !== null) {
        console.log('    accroche MIGRATION la plus proche : ligne ' + proche + (dist === 0 ? ' (dans la zone en conflit)' : ' (à ' + dist + ' ligne(s))') + ' : ' + court(lignesN[proche - 1].trim(), 110));
      } else console.log('    aucune accroche MIGRATION dans index.html');
      if (debut <= 3) console.log('    (tout début du fichier : l\'enveloppe de publication retirée par M02 est probablement en cause)');
      const montre = (titre, lignes) => {
        console.log('    ' + titre + ' (' + lignes.length + ' ligne(s)) :');
        if (!lignes.length) console.log('      (vide)');
        lignes.slice(0, 3).forEach(x => console.log('      | ' + court(x, 140)));
        if (lignes.length > 3) console.log('      | … ' + (lignes.length - 3) + ' ligne(s) de plus');
      };
      montre('côté index.html (nôtre)', c.notre);
      montre('côté nouveau fichier amont (leur)', c.leur);
    });
    console.log('');
    console.log('Fichier annoté (marqueurs <<<<<<< ||||||| ======= >>>>>>>, base comprise) : ' + fusion);
    console.log('Marche à suivre : voir MIGRATION.md, section « Resynchroniser » (corriger à la main dans index.html en gardant l\'accroche MIGRATION).');
    process.exit(2);
  }
  texteFusion = m.stdout;
}

/* ---------- 4. Fusion propre : contrôles sur le résultat avant écriture ---------- */
const nbMarqueurs = (buf) => {
  const mp = new Map();
  for (const l of buf.toString('utf8').split('\n')) if (l.includes('MIGRATION')) mp.set(l, (mp.get(l) || 0) + 1);
  return mp;
};
const avertissements = [];
if (texteFusion) {
  const avant = nbMarqueurs(bufNotre), apres = nbMarqueurs(texteFusion);
  const manques = [];
  for (const [l, n] of avant) {
    const k = apres.get(l) || 0;
    if (k !== n) manques.push('« ' + court(l.trim(), 100) + ' » : ' + n + ' avant, ' + k + ' après');
  }
  if (manques.length) {
    refuser('la fusion a perdu ou dupliqué des marqueurs MIGRATION (résultat dans ' + fusion + ') :\n    ' + manques.join('\n    '));
  }
  const txt = texteFusion.toString('utf8');
  const scripts = [...txt.matchAll(/<script\b([^>]*)>/gi)].filter(x => !/\bsrc\s*=/i.test(x[1]));
  if (scripts.length !== 1) {
    refuser('le résultat contient ' + scripts.length + ' balise(s) <script> sans src (une seule attendue) ; résultat dans ' + fusion);
  }

  /* ---------- 5. Avertissements ---------- */
  const lignesR = txt.split('\n');
  const lignesN = new Set(bufNotre.toString('utf8').split('\n'));
  const lignesB = new Map();
  for (const l of bufBase.toString('utf8').split('\n')) lignesB.set(l, (lignesB.get(l) || 0) + 1);
  const nouvelleVsNotre = (l) => !lignesN.has(l);

  // a) adresses http(s) dans src / href / @import / url(
  const reUrl = [/\b(?:src|href)\s*=\s*["']?\s*https?:\/\//i, /@import\s+(?:url\()?\s*["']?https?:/i, /url\(\s*["']?https?:\/\//i];
  lignesR.forEach((l, i) => {
    if (reUrl.some(r => r.test(l)) && nouvelleVsNotre(l)) avertissements.push('adresse http(s) dans un src / href / @import / url() — ligne ' + (i + 1) + ' du résultat : ' + court(l.trim(), 120) + '  → une ressource distante ne marche pas hors-ligne : à embarquer ou à retirer à la main');
  });
  // b) window.claude.use( hors de la fonction d'entrée de M03 (capabilityEntry)
  let dansEntree = false;
  lignesR.forEach((l, i) => {
    if (/^\s*function\s+capabilityEntry\s*\(/.test(l)) dansEntree = true;
    const dedans = dansEntree;
    if (dansEntree && /^\}/.test(l)) dansEntree = false;
    if (!dedans && l.includes('window.claude.use(') && nouvelleVsNotre(l)) avertissements.push('window.claude.use( hors de capabilityEntry — ligne ' + (i + 1) + ' du résultat : ' + court(l.trim(), 120) + '  → passer par capabilityEntry(nom) avec une accroche MIGRATION');
  });
  // c) mots à ne pas montrer dans un texte affiché : lignes introduites par l'amont (absentes de la base et d'index.html)
  const reMots = [[/\bClaude\b/, 'Claude'], [/serveur/i, 'serveur'], [/en ligne/i, 'en ligne'], [/votre compte/i, 'votre compte']];
  const restantB = new Map(lignesB);
  lignesR.forEach((l, i) => {
    const n = restantB.get(l) || 0;
    if (n > 0) { restantB.set(l, n - 1); return; }          // ligne déjà présente dans la base
    if (lignesN.has(l)) return;                              // ligne déjà dans index.html (retouche du site)
    const t = l.trim();
    if (!t || /^(\/\/|\/\*|\*|<!--)/.test(t)) return;       // commentaire seul : pas un texte affiché
    for (const [re, nom] of reMots) {
      if (re.test(l)) { avertissements.push('mot « ' + nom + ' » dans une ligne nouvelle — ligne ' + (i + 1) + ' du résultat : ' + court(t, 120) + '  → si c\'est un texte affiché, poser une accroche MIGRATION (« cet appareil » à la place)'); break; }
    }
  });
}

/* ---------- 6. Écritures (sauf --essai) ---------- */
const notesTests = [];
function listerFichiers(dir, base = '') {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const r = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) out.push(...listerFichiers(dir, r)); else if (e.isFile()) out.push(r);
  }
  return out.sort();
}
function planTests() {
  if (!dossierTests) return null;
  const plan = [];
  for (const sous of ['tests', 'sim']) {
    const src = path.join(dossierTests, sous);
    if (!fs.existsSync(src)) continue;
    const dst = rel('amont', sous);
    const aSrc = listerFichiers(src), aDst = listerFichiers(dst);
    const nouveaux = aSrc.filter(f => !aDst.includes(f));
    const changes = aSrc.filter(f => aDst.includes(f) && !fs.readFileSync(path.join(src, f)).equals(fs.readFileSync(path.join(dst, f))));
    const disparus = aDst.filter(f => !aSrc.includes(f));
    plan.push({ sous, src, dst, aSrc, nouveaux, changes, disparus, premiere: aDst.length === 0 });
  }
  return plan;
}
const plan = planTests();

if (texteFusion) {
  console.log('');
  console.log('Fusion propre : les changements amont sont repris, tous les marqueurs MIGRATION sont présents une fois chacun, un seul <script> sans src.');
  console.log('ÉCRITURE : index.html, amont/kinball.amont.html (octets du nouveau fichier), amont/EMPREINTE.txt, version du site (check-release --ecrire)');
}
if (plan) {
  console.log('');
  console.log('TESTS ET SIMULATION DE L\'AMONT (copie intacte dans amont/tests/ et amont/sim/) :');
  for (const p of plan) {
    if (p.premiere) console.log('  amont/' + p.sous + '/ : première copie (' + p.aSrc.length + ' fichier(s)) : tout est « nouveau », rien à comparer.');
    else console.log('  amont/' + p.sous + '/ : ' + p.nouveaux.length + ' nouveau(x), ' + p.changes.length + ' changé(s), ' + p.disparus.length + ' disparu(s).');
    p.nouveaux.filter(() => !p.premiere).forEach(f => console.log('    + ' + p.sous + '/' + f));
    p.changes.forEach(f => console.log('    ~ ' + p.sous + '/' + f));
    p.disparus.forEach(f => console.log('    - ' + p.sous + '/' + f));
  }
  console.log('  Ils ne sont PAS fusionnés avec tests/ ni sim/ du dépôt : voir MIGRATION.md, section 5.');
  const aComp = plan.find(p => p.sous === 'tests' && p.changes.includes('lib.mjs'));
  if (aComp) console.log('  lib.mjs a changé : git diff --no-index --stat <ancien amont/tests/lib.mjs> <nouveau>  (comparer à la main avec tests/lib.mjs du dépôt)');
}

if (essai) {
  console.log('');
  console.log('ESSAI : rien n\'a été écrit (dépôt intact).');
  finir();
} else {
  /* sauvegarde hors du dépôt, puis écritures ; retour arrière si check-release échoue */
  const aSauver = ['index.html', 'amont/kinball.amont.html', 'amont/EMPREINTE.txt', 'kbsite.js', 'sw.js'];
  const copieAvant = path.join(tmp, 'avant');
  const instantane = new Map();
  for (const f of aSauver) {
    const b = fs.readFileSync(rel(f));
    instantane.set(f, b);
    fs.mkdirSync(path.dirname(path.join(copieAvant, f)), { recursive: true });
    fs.writeFileSync(path.join(copieAvant, f), b);
  }
  const restaurer = () => { for (const [f, b] of instantane) fs.writeFileSync(rel(f), b); };
  const versionAvant = (instantane.get('kbsite.js').toString('utf8').match(/var VERSION_SITE = '([^']*)'/) || [])[1];
  try {
    if (texteFusion) {
      fs.writeFileSync(rel('index.html'), texteFusion);
      fs.writeFileSync(rel('amont', 'kinball.amont.html'), bufNouveau);
      const lignes = bufNouveau.toString('utf8').split('\n').length - (bufNouveau.length && bufNouveau[bufNouveau.length - 1] === 0x0a ? 1 : 0);
      const d = new Date(), z = (n) => String(n).padStart(2, '0');
      fs.writeFileSync(rel('amont', 'EMPREINTE.txt'),
        'fichier : kinball.amont.html (dernière version amont intégrée par outils/resync.mjs)\n' +
        'sha256  : ' + sha(bufNouveau) + '\n' +
        'taille  : ' + bufNouveau.length + ' octets\n' +
        'lignes  : ' + lignes + '\n' +
        'version : (à compléter à la main si utile)\n' +
        'date    : ' + d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + '\n');
      const cr = spawnSync(process.execPath, [path.join(ICI, 'check-release.mjs'), '--racine', racine, '--ecrire'], { encoding: 'utf8' });
      if (cr.status !== 0) {
        restaurer();
        console.error('resync : check-release --ecrire a échoué ; fichiers remis dans leur état d\'avant.');
        console.error((cr.stdout || '') + (cr.stderr || ''));
        process.exit(1);
      }
    }
    if (plan) {
      for (const p of plan) {
        fs.rmSync(p.dst, { recursive: true, force: true });
        for (const f of p.aSrc) {
          fs.mkdirSync(path.dirname(path.join(p.dst, f)), { recursive: true });
          fs.copyFileSync(path.join(p.src, f), path.join(p.dst, f));
        }
      }
    }
  } catch (e) {
    restaurer();
    console.error('resync : erreur pendant l\'écriture (' + e.message + ') ; fichiers remis dans leur état d\'avant.');
    process.exit(1);
  }
  const versionApres = (fs.readFileSync(rel('kbsite.js'), 'utf8').match(/var VERSION_SITE = '([^']*)'/) || [])[1];
  console.log('');
  console.log('RÉSULTAT : version du site ' + versionAvant + ' -> ' + versionApres + '. Copie des fichiers d\'avant (hors dépôt) : ' + copieAvant);
  finir();
}

function finir() {
  if (avertissements.length) {
    console.log('');
    console.log('AVERTISSEMENTS (' + avertissements.length + ') — points d\'accroche à poser à la main, ils n\'arrêtent pas la fusion :');
    avertissements.forEach((a, i) => console.log('  ' + (i + 1) + '. ' + a));
  }
  console.log('');
  console.log('À FAIRE ENSUITE (rien n\'est commité ni poussé) :');
  console.log('  1. git diff --stat   (relire ce qui a changé)');
  console.log('  2. KINBALL_ONLY=M02,M03,M04,M05,M06 node tests/run.mjs   (NODE_PATH = dossier de playwright)');
  console.log('  3. node tests/run.mjs en tâche de fond (environ 16 minutes), puis node tests/local/kblocal.test.mjs, node sim/simtest.mjs, node outils/check-release.mjs');
  console.log('  4. Les tests et le moteur de simulation de l\'amont se reprennent à part (MIGRATION.md, section 5) ; --tests <dossier> en garde la copie intacte dans amont/.');
  console.log('  5. git add -A && git commit, git fetch origin main, git push origin main (MIGRATION.md, section 3).');
  process.exit(0);
}
