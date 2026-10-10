/* Banc rapide : seulement les suites que le changement en cours peut casser, sur la tablette.
     node tests/rapide.mjs                    fichiers modifiés depuis origin/main (et non suivis) → suites → passage
     node tests/rapide.mjs --liste            affiche le plan sans rien lancer
     node tests/rapide.mjs --suites C21,C26   suites choisies (smoke et undo sont toujours jouées)
     node tests/rapide.mjs --base <ref>       autre base de comparaison (défaut : origin/main, sinon main, sinon HEAD)
     node tests/rapide.mjs --tel | --tous     gabarit téléphone, ou les deux (défaut : tablette)
     node tests/rapide.mjs --fond             lance en arrière-plan ; attendre ensuite avec « node tests/attendre.mjs »
   La table fichier / section → suites est dans tests/rapide.json. Elle est indicative : un passage rapide vert ne
   remplace PAS le banc complet, qui tourne en CI (.github/workflows/banc.yml) et fait foi.
   Une section de index.html se déduit des lignes modifiées (git diff) et de `node outils/carte.mjs`.
   Sortie : le plan en quelques lignes, puis le résumé du banc (les FAIL seulement), puis les commandes annexes en bref. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const dir = path.dirname(fileURLToPath(import.meta.url));
const DEPOT = path.resolve(dir, '..');
const T = JSON.parse(fs.readFileSync(path.join(dir, 'rapide.json'), 'utf8'));
const argv = process.argv.slice(2);
const drap = n => argv.includes(n);
const val = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const sh = (cmd, args) => spawnSync(cmd, args, { cwd: DEPOT, encoding: 'utf8', maxBuffer: 64 << 20 });

/* Suites qui existent vraiment (un identifiant inconnu de la table est signalé, jamais passé à run.mjs). */
const existantes = new Set(['smoke', 'undo', 'fuzz']);
try { fs.readdirSync(path.join(dir, 'scenarios')).filter(f => f.endsWith('.mjs')).forEach(f => existantes.add(f.replace(/\.mjs$/, ''))); } catch {}

const suites = new Set(T.toujours), commandes = new Set(), notes = [], vus = [];
let gabarit = drap('--tous') ? 'tous' : drap('--tel') ? 'telephone' : 'tablette';
const elargir = g => { if (g === 'tous' && gabarit === 'tablette') gabarit = 'tous'; };

if (val('--suites')) {
  val('--suites').split(',').filter(Boolean).forEach(s => suites.add(s));
} else {
  /* ---- fichiers modifiés : committés depuis la base, ou en cours, ou nouveaux ---- */
  let base = val('--base');
  if (!base) for (const b of ['origin/main', 'main', 'HEAD']) if (sh('git', ['rev-parse', '--verify', '--quiet', b]).status === 0) { base = b; break; }
  const d = sh('git', ['diff', '--name-only', base]);
  if (d.status !== 0) { console.log('git diff a échoué (' + (d.stderr || '').trim().split('\n')[0] + ') : utiliser --suites <ids>.'); process.exit(2); }
  const fichiers = new Set(d.stdout.split('\n').filter(Boolean));
  sh('git', ['ls-files', '--others', '--exclude-standard']).stdout.split('\n').filter(Boolean).forEach(f => fichiers.add(f));
  vus.push(`${fichiers.size} fichier(s) modifié(s) depuis ${base}`);

  /* ---- lignes modifiées de index.html → sections de carte.mjs ---- */
  const sections = [];
  const carte = sh(process.execPath, [path.join(DEPOT, 'outils', 'carte.mjs')]);
  let fichierCarte = null;
  for (const l of (carte.stdout || '').split('\n')) {
    const f = l.match(/^# (.+)$/); if (f) { fichierCarte = f[1]; continue; }
    const s = l.match(/^== (.+) \((\d+)\)$/); if (s && fichierCarte === 'index.html') sections.push({ titre: s[1], ligne: Number(s[2]) });
  }
  const sectionDe = n => { let s = null; for (const x of sections) if (x.ligne <= n) s = x; return s; };
  const lignesModifiees = () => {
    const out = sh('git', ['diff', '-U0', base, '--', 'index.html']).stdout, ls = [];
    for (const m of out.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) { const a = Number(m[1]), n = m[2] === undefined ? 1 : Number(m[2]); for (let i = 0; i < Math.max(n, 1); i++) ls.push(a + i); }
    return ls;
  };

  const regles = T.fichiers.map(r => ({ ...r, re: new RegExp(r.motif) }));
  for (const f of [...fichiers].sort()) {
    if (f === 'index.html') {
      const titres = new Set(); let avant = false;
      for (const n of lignesModifiees()) { const s = sectionDe(n); if (s) titres.add(s.titre); else avant = true; }
      if (avant) { T.avant_les_sections.suites.forEach(s => suites.add(s)); elargir(T.avant_les_sections.gabarit); notes.push('index.html : ' + T.avant_les_sections.note); }
      for (const t of titres) {
        const rs = T.sections.filter(r => new RegExp(r.motif, 'i').test(t));
        if (!rs.length) { T.section_inconnue.suites.forEach(s => suites.add(s)); notes.push(`section « ${t} » : ${T.section_inconnue.note}`); }
        for (const r of rs) { r.suites.forEach(s => suites.add(s)); elargir(r.gabarit); }
      }
      vus.push(`index.html : ${titres.size} section(s) touchée(s)${avant ? ' + zone avant les sections' : ''}`);
      continue;
    }
    const r = regles.find(x => x.re.test(f));
    if (!r) { notes.push(`${f} : fichier absent de tests/rapide.json (aucune suite ajoutée)`); continue; }
    r.suites.forEach(s => { const id = s.startsWith('$') ? (f.match(r.re) || [])[Number(s.slice(1))] : s; if (id) suites.add(id); });
    (r.commandes || []).forEach(c => commandes.add(c));
    if (r.complet_requis) notes.push(`${f} : ${r.complet_requis} → le banc complet (CI) est nécessaire`);
  }
}

const inconnues = [...suites].filter(s => !existantes.has(s));
inconnues.forEach(s => suites.delete(s));
if (inconnues.length) notes.push('suites inconnues ignorées : ' + inconnues.join(', '));

/* ---- durée estimée : dernières durées mesurées (cache du banc), sinon la table ---- */
let mesures = {};
try { mesures = JSON.parse(fs.readFileSync(path.join(process.env.KINBALL_CACHE_DIR || path.join(os.homedir(), '.cache', 'kinball-banc'), 'durees.json'), 'utf8')); } catch {}
const gabs = gabarit === 'tous' ? ['tablette', 'telephone'] : [gabarit];
const poids = (g, id) => (mesures[g] && mesures[g][id]) || T.poids_s[id] || 30;
const estimation = Math.max(...gabs.map(g => [...suites].reduce((n, id) => n + poids(g, id), 0)));   // un processus par gabarit

const liste = [...suites];
console.log(`Banc rapide : ${vus.join(' ; ') || 'suites choisies'}`);
console.log(`  suites (${liste.length}) : ${liste.join(', ')} — gabarit ${gabarit}, environ ${Math.round(estimation / 60 * 10) / 10} min`);
if (commandes.size) console.log('  commandes annexes : ' + [...commandes].join(' ; '));
notes.forEach(n => console.log('  ! ' + n));
console.log('  Un passage rapide vert ne remplace pas le banc complet : la CI fait foi.');
if (drap('--liste')) process.exit(0);

/* ---- un seul banc à la fois (le hook garde-banc ne voit pas ce script) ---- */
const actif = () => { try { return fs.readdirSync('/proc').filter(p => /^\d+$/.test(p) && Number(p) !== process.pid).some(p => { try { const c = fs.readFileSync(`/proc/${p}/cmdline`, 'utf8'); return /(^|\0|\/)run\.mjs(\0|$)/.test(c) && c.includes('node') && !fs.readFileSync(`/proc/${p}/environ`, 'utf8').includes('KINBALL_CHILD=1'); } catch { return false; } }); } catch { return false; } };
if (actif()) { console.log('Refusé : un passage du banc tourne déjà. Un seul banc à la fois : « node tests/attendre.mjs ».'); process.exit(2); }

const env = { ...process.env, KINBALL_ONLY: liste.join(',') };
if (gabarit === 'tous') delete env.KINBALL_GABARIT; else env.KINBALL_GABARIT = gabarit;
const run = path.join(dir, 'run.mjs');

if (drap('--fond')) {
  const sortie = process.env.KINBALL_SORTIE || path.join(os.tmpdir(), 'kinball-sortie');
  fs.mkdirSync(sortie, { recursive: true });
  const journal = path.join(sortie, 'rapide.log'), fd = fs.openSync(journal, 'w');
  const p = spawn(process.execPath, [run], { cwd: DEPOT, env, detached: true, stdio: ['ignore', fd, fd] });
  p.unref();
  console.log(`Lancé en arrière-plan (pid ${p.pid}). Attendre : node tests/attendre.mjs`);
  if (commandes.size) console.log('Commandes annexes à jouer ensuite : ' + [...commandes].join(' ; '));
  process.exit(0);
}
if (estimation > 480) console.log('  ! plus de 8 min : si la commande est limitée à 10 min, relancer avec --fond puis « node tests/attendre.mjs ».');

const banc = spawnSync(process.execPath, [run], { cwd: DEPOT, env, stdio: 'inherit' });
let code = banc.status === null ? 1 : banc.status;

for (const c of commandes) {
  const [cmd, ...args] = c.split(' ');
  const r = spawnSync(cmd === 'node' ? process.execPath : cmd, args, { cwd: DEPOT, env: process.env, encoding: 'utf8', maxBuffer: 64 << 20 });
  const fin = (r.stdout + r.stderr).trim().split('\n').slice(-3).join(' ⏎ ');
  console.log(`${r.status === 0 ? 'OK   ' : 'ÉCHEC'} ${c}${r.status === 0 ? '' : ' (code ' + r.status + ') : ' + fin}`);
  if (r.status !== 0) code = 1;
}
process.exit(code);
