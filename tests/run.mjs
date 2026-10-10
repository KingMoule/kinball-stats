/* Banc d'essai Kin-Ball Stats : node tests/run.mjs   (mode d'emploi : tests/README.md)
   Le processus lancé est le PARENT : il répartit les suites entre KINBALL_PARTS processus fils par gabarit (défaut 1,
   soit 2 processus), affiche au fil de l'eau les FAIL et KNOWN (KINBALL_VERBEUX=1 : tout), joue ensuite les
   vérifications de durée réelle seules (phase « au calme »), écrit resultat.json dans KINBALL_SORTIE et range les
   passages complets dans le cache par empreinte (KINBALL_CACHE=1 : réutiliser un résultat de même empreinte). */
import fs from 'node:fs';
import { readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Reporter, GABARITS, HTML, SORTIE } from './lib.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const only = (process.env.KINBALL_ONLY || '').split(',').filter(Boolean);
const gabs = (process.env.KINBALL_GABARIT || Object.keys(GABARITS).join(',')).split(',');

const suites = ['smoke', 'undo', 'fuzz'].map(n => ({ id: n, file: path.join(dir, n + '.mjs') }));
try {
  readdirSync(path.join(dir, 'scenarios')).filter(f => f.endsWith('.mjs')).sort()
    .forEach(f => suites.push({ id: f.replace(/\.mjs$/, ''), file: path.join(dir, 'scenarios', f) }));
} catch {}

/* ------------------------------------------------------------------ processus fils */
if (process.env.KINBALL_CHILD) {
  const rep = new Reporter({ bail: !!process.env.KINBALL_BAIL });
  const check = rep.check.bind(rep);
  const liste = process.env.KINBALL_LISTE ? process.env.KINBALL_LISTE.split(',') : null;
  const g = gabs[0];
  try {
    for (const s of suites) {
      if (only.length && !only.includes(s.id)) continue;
      if (liste && !liste.includes(s.id)) continue;
      const mod = await import(pathToFileURL(s.file).href);
      if (mod.gabarits && !mod.gabarits.includes(g)) continue;
      console.log('@@DEBUT ' + JSON.stringify({ g, id: s.id }));
      const t0 = Date.now(), n0 = rep.rows.length;
      try { await (mod.default || mod.run)({ gabarit: g, check, GABARITS }); }
      catch (e) {
        if (e.bail) throw e;
        await check(`[${g}] ${s.id} · exécution de la suite`, async () => { throw e; });   // erreur inattendue = échec nommé
      }
      console.log('@@SUITE ' + JSON.stringify({ g, id: s.id, ms: Date.now() - t0, checks: rep.rows.length - n0 }));
    }
  } catch (e) { if (!e.bail) throw e; console.log('Arrêt au premier échec (KINBALL_BAIL).'); }
  console.log('@@RESULT ' + JSON.stringify({ total: rep.rows.length, fails: rep.fails, known: rep.known }));
  process.exit(rep.fails ? 1 : 0);
}

/* ------------------------------------------------------------------ parent */
const { empreinte, complet, CACHE } = await import('./empreinte.mjs');
const verbeux = !!process.env.KINBALL_VERBEUX;
const t0 = Date.now();
const emp = empreinte();
const estComplet = complet();
fs.mkdirSync(SORTIE, { recursive: true });
const F_RES = path.join(SORTIE, 'resultat.json'), F_VERIF = path.join(SORTIE, 'verifications.json'), F_COURS = path.join(SORTIE, 'en-cours.json');

function resume(r, { cache } = {}) {
  const lignes = [`${r.echecs.length ? 'ÉCHEC' : 'OK'} — ${r.ok}/${r.total} vérifications passées, ${r.echecs.length} échec(s)${r.known.length ? `, ${r.known.length} défaut(s) connu(s)` : ''} en ${r.duree_s} s${cache ? ` (résultat en cache du ${r.fin}, empreinte ${r.empreinte})` : ''}`];
  if (r.interrompus && r.interrompus.length) lignes.push('Processus interrompus sans résultat : ' + r.interrompus.join(', '));
  return lignes.join('\n');
}

/* KINBALL_CACHE=1 : même empreinte déjà jouée → on relit son résultat, rien n'est lancé. */
if (process.env.KINBALL_CACHE === '1') {
  const f = path.join(CACHE, emp.hash + '.json');
  if (fs.existsSync(f)) {
    const r = JSON.parse(fs.readFileSync(f, 'utf8'));
    for (const e of r.echecs) console.log(`FAIL  ${e.nom}\n      ${e.message}`);
    if (verbeux) for (const k of r.known) console.log(`KNOWN ${k.nom} — défaut connu : ${k.message}`);
    console.log('\n' + resume(r, { cache: true }));
    fs.writeFileSync(F_RES, JSON.stringify({ ...r, depuis_cache: f }, null, 1));
    console.log('Résultat : ' + f);
    process.exit(r.code);
  }
}

/* Durées de référence (secondes, par gabarit) pour répartir les suites : dernier passage complet, sinon cette table. */
const POIDS = { smoke: [5, 5], undo: [26, 27], fuzz: [75, 83], C13B: [135, 135], C14: [13, 13], C15: [12, 13], C16: [16, 17], C17: [8, 8], C18: [7, 8], C19: [10, 12], C20: [8, 8], C21: [155, 160], C22: [96, 161], C23: [138, 141], C24: [10, 11], M02: [2, 2], M03: [21, 23], M04: [33, 5], M05: [18, 13], M06: [18, 18], M08: [37, 35], M11: [16, 16] };
let durees = {};
try { durees = JSON.parse(fs.readFileSync(path.join(CACHE, 'durees.json'), 'utf8')); } catch {}
const poids = (g, id) => (durees[g] && durees[g][id]) || (POIDS[id] ? POIDS[id][g === 'telephone' ? 1 : 0] : 30);

/* KINBALL_PARTS : processus par gabarit. Défaut 1 (2 processus en tout) : à 4 processus, les 2 cœurs sont saturés
   (86 % en moyenne mesurés) et des vérifications sensibles au temps hors phase au calme (C22·4, M08·8) ont échoué. */
const parts = Math.max(1, Number(process.env.KINBALL_PARTS || 1));
const choisies = suites.filter(s => !only.length || only.includes(s.id)).map(s => s.id);
const jobs = [];
for (const g of gabs) {
  const n = Math.min(parts, Math.max(1, choisies.length));
  const charge = Array(n).fill(0), lots = Array.from({ length: n }, () => []);
  [...choisies].sort((a, b) => poids(g, b) - poids(g, a)).forEach(id => { const i = charge.indexOf(Math.min(...charge)); lots[i].push(id); charge[i] += poids(g, id); });
  lots.forEach((l, k) => { if (l.length) jobs.push({ g, liste: l, nom: n > 1 ? `${g}#${k + 1}` : g }); });
}
const parallele = jobs.length > 1 && process.env.KINBALL_CALME !== '0';   // KINBALL_CALME=0 : pas de phase au calme (essais de robustesse sous charge)

let journal = null;
try { const j = fs.realpathSync('/proc/self/fd/1'); if (fs.existsSync(j) && fs.statSync(j).isFile()) journal = j; } catch {}
const debut = new Date(t0).toISOString();
const cours = { pid: process.pid, debut, journal, suites: jobs.reduce((n, j) => n + j.liste.length, 0), faites: 0, echecs: 0, sortie: SORTIE };
const ecrireCours = () => { try { fs.writeFileSync(F_COURS, JSON.stringify(cours)); } catch {} };
ecrireCours();
console.log(`Banc d'essai Kin-Ball — ${HTML} — ${jobs.length} processus${parallele ? ' + phase au calme' : ''}, empreinte ${emp.hash}`);

const checks = [], suitesMs = [], interrompus = [], calme = {};
/* Arrêt du parent (kill <pid>, Ctrl-C) : on tue aussi les groupes des processus fils (fils + navigateurs) ; en-cours.json reste
   (attendre.mjs y lira « interrompu »). */
const fils = new Set();
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { for (const p of fils) { try { process.kill(-p.pid, 'SIGKILL'); } catch { try { p.kill('SIGKILL'); } catch {} } } console.log(`Arrêt demandé (${sig}).`); process.exit(130); });
function lancer(job, phase) {
  return new Promise(res => {
    const env = { ...process.env, KINBALL_GABARIT: job.g, KINBALL_CHILD: '1', KINBALL_LISTE: job.liste.join(',') };
    if (phase) env.KINBALL_PHASE = phase; else delete env.KINBALL_PHASE;
    const p = spawn(process.execPath, [fileURLToPath(import.meta.url)], { env, detached: true });   // groupe de processus propre : l'arrêt du parent emporte le fils et ses navigateurs
    fils.add(p);
    let reste = '', courante = null, fin = false; const queue = [];
    const ligne = (l) => {
      if (l.startsWith('@@CHECK ')) {
        const c = JSON.parse(l.slice(8)); c.gabarit = job.g; c.suite = courante; checks.push(c);
        if (c.etat === 'fail') { cours.echecs++; console.log(`FAIL  ${c.nom}\n      ${c.msg}`); }
        else if (c.etat === 'known') console.log(`KNOWN ${c.nom} — défaut connu : ${c.msg}`);
        else if (verbeux) console.log(`PASS  ${c.nom}  (${c.ms} ms)`);
      } else if (l.startsWith('@@DEBUT ')) courante = JSON.parse(l.slice(8)).id;
      else if (l.startsWith('@@SUITE ')) { const s = JSON.parse(l.slice(8)); suitesMs.push({ ...s, phase: phase || 'unique' }); if (phase !== 'calme') { cours.faites++; ecrireCours(); } }
      else if (l.startsWith('@@CALME ')) (calme[job.g] = calme[job.g] || new Set()).add(courante);
      else if (l.startsWith('@@RESULT ')) fin = true;
      else if (l.trim()) { queue.push(l); if (queue.length > 15) queue.shift(); if (verbeux) console.log(`[${job.nom}] ${l}`); }
    };
    const lire = d => { reste += d; let i; while ((i = reste.indexOf('\n')) >= 0) { ligne(reste.slice(0, i)); reste = reste.slice(i + 1); } };
    p.stdout.on('data', lire); p.stderr.on('data', lire);
    p.on('close', code => {
      fils.delete(p);
      if (reste) ligne(reste);
      if (!fin) {
        interrompus.push(`${job.nom}${phase === 'calme' ? ' (calme)' : ''}`);
        checks.push({ nom: `[${job.g}] processus ${job.nom} interrompu (aucun résultat)`, etat: 'fail', ms: 0, msg: queue.slice(-8).join(' ⏎ ').slice(0, 1500), gabarit: job.g, suite: courante });
        console.log(`FAIL  processus ${job.nom} interrompu (aucun résultat) :\n` + queue.slice(-8).map(x => '      ' + x).join('\n'));
      }
      res(code);
    });
  });
}

await Promise.all(jobs.map(j => lancer(j, parallele ? 'parallele' : null)));
/* Phase au calme : les vérifications de durée réelle, un seul processus à la fois. */
for (const g of gabs) if (calme[g] && calme[g].size) await lancer({ g, liste: [...calme[g]], nom: `${g} calme` }, 'calme');

/* ------------------------------------------------------------------ résultat */
const fin = new Date();
const echecs = checks.filter(c => c.etat === 'fail').map(c => ({ nom: c.nom, message: c.msg }));
const known = checks.filter(c => c.etat === 'known').map(c => ({ nom: c.nom, message: c.msg }));
const parSuite = {}, parGab = {};
for (const s of suitesMs) {
  const e = parSuite[s.id] = parSuite[s.id] || { verifications: 0 };
  e[s.g] = Math.round(((e[s.g] || 0) * 1000 + s.ms) / 100) / 10; e.verifications += s.checks;
  parGab[s.g] = Math.round(((parGab[s.g] || 0) * 1000 + s.ms) / 100) / 10;
}
const r = {
  version: 1, empreinte: emp.hash, complet: estComplet, debut, fin: fin.toISOString(), duree_s: Math.round((fin - t0) / 1000),
  code: echecs.length ? 1 : 0, total: checks.length, ok: checks.length - echecs.length, echecs, known,
  processus: jobs.length, phase_calme: Object.values(calme).reduce((n, s) => n + s.size, 0),
  suites: parSuite, gabarits: parGab, interrompus, html: HTML, journal, outil: emp.outil, variables: emp.variables,
};
fs.writeFileSync(F_RES, JSON.stringify(r, null, 1));
fs.writeFileSync(F_VERIF, JSON.stringify(checks.map(({ nom, etat, ms, msg, gabarit, suite }) => ({ nom, etat, ms, gabarit, suite, ...(msg ? { msg } : {}) }))));
if (estComplet) {
  try {
    fs.mkdirSync(CACHE, { recursive: true });
    fs.writeFileSync(path.join(CACHE, emp.hash + '.json'), JSON.stringify(r, null, 1));
    const d = {}; for (const s of suitesMs) if (s.phase !== 'calme') (d[s.g] = d[s.g] || {})[s.id] = Math.round(s.ms / 1000);
    fs.writeFileSync(path.join(CACHE, 'durees.json'), JSON.stringify(d));
  } catch (e) { console.log('(cache non écrit : ' + e.message + ')'); }
}
try { fs.unlinkSync(F_COURS); } catch {}
const lentes = Object.entries(parSuite).map(([id, e]) => [id, Math.max(...Object.keys(GABARITS).map(g => e[g] || 0))]).sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log('\n' + resume(r));
console.log('Suites les plus longues : ' + lentes.map(([id, s]) => `${id} ${Math.round(s)} s`).join(', '));
console.log('Résultat : ' + F_RES);
process.exit(r.code);
