#!/usr/bin/env node
/* check-release.mjs — vérifie (et au besoin écrit) la version du site, son empreinte et
   la liste de précache du service worker. Node seul, aucune dépendance.

   Usage : node outils/check-release.mjs [--racine <dossier>] [--ecrire]

   « Fichiers du site » = fichiers suivis par git sous la racine (hors dépôt git : parcours
   du dossier), moins tests/, amont/, outils/, sim/, collecte/, .github/, les fichiers dont
   le nom commence par un point, *.md, *.txt, et sw.js lui-même.
   Vérifie : chaque entrée du précache existe ; chaque fichier du site est dans le précache ;
   l'empreinte globale (sha256 de la liste triée « chemin + sha256 du fichier ») est celle
   de sw.js ; VERSION de sw.js = version de kbsite.js ; « amont » de kbsite.js = sha256 réel
   d'amont/kinball.amont.html (8 premiers caractères). Écart : code de sortie 1.
   --ecrire : si quelque chose a changé, nouvelle version (date du jour ; rang + 1 si la
   date est la même, sinon 1) écrite d'abord dans kbsite.js, puis l'empreinte recalculée
   et écrite dans sw.js. Rien n'a changé : n'écrit rien. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const ecrire = args.includes('--ecrire');
const iR = args.indexOf('--racine');
const racine = path.resolve(iR >= 0 ? args[iR + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const EXCLUS_DOSSIERS = ['tests/', 'amont/', 'outils/', 'sim/', 'collecte/', '.github/'];

function estExclu(rel) {
  if (EXCLUS_DOSSIERS.some(d => rel.startsWith(d))) return true;
  const nom = rel.split('/').pop();
  if (nom.startsWith('.')) return true;
  if (/\.(md|txt)$/i.test(nom)) return true;
  return rel === 'sw.js';
}
function parcourir(dir, base = '') {
  const sortie = [];
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const rel = base ? base + '/' + e.name : e.name;
    if (e.isDirectory()) sortie.push(...parcourir(dir, rel));
    else if (e.isFile()) sortie.push(rel);
  }
  return sortie;
}
function fichiersSuivis() {
  if (fs.existsSync(path.join(racine, '.git'))) {
    const out = execFileSync('git', ['ls-files', '-z'], { cwd: racine, maxBuffer: 1 << 26 }).toString('utf8');
    return out.split('\0').filter(Boolean).filter(f => fs.existsSync(path.join(racine, f)));
  }
  return parcourir(racine);
}
const fichiersSite = () => fichiersSuivis().filter(f => !estExclu(f)).sort();

function empreinteGlobale(liste) {
  const lignes = liste.map(f => f + '\t' + sha(fs.readFileSync(path.join(racine, f))));
  return sha(lignes.join('\n'));
}

const cheminSW = path.join(racine, 'sw.js');
const cheminKB = path.join(racine, 'kbsite.js');
const cheminAmont = path.join(racine, 'amont', 'kinball.amont.html');
const lire = (p) => fs.readFileSync(p, 'utf8');

const RE_PRECACHE = /\/\* PRECACHE:DEBUT \*\/([\s\S]*?)\/\* PRECACHE:FIN \*\//;
const RE_VER_SW = /(const VERSION = ')([^']*)(';)/;
const RE_EMP_SW = /(const EMPREINTE = ')([^']*)(';)/;
const RE_VER_KB = /(var VERSION_SITE = ')([^']*)(';)/;
const RE_AMONT_KB = /(var VERSION_AMONT = ')([^']*)(';)/;

function lirePrecache(src) {
  const m = src.match(RE_PRECACHE);
  if (!m) throw new Error('marqueurs PRECACHE:DEBUT / PRECACHE:FIN introuvables dans sw.js');
  const corps = m[1];
  const a = corps.indexOf('['), b = corps.lastIndexOf(']');
  if (a < 0 || b < a) throw new Error('tableau de précache introuvable entre les marqueurs');
  const liste = JSON.parse(corps.slice(a, b + 1));
  if (!Array.isArray(liste) || liste.some(x => typeof x !== 'string')) throw new Error('le précache doit être un tableau de chaînes');
  return liste;
}
const versPrecache = (url) => (url === './' ? null : url.replace(/^\.\//, ''));

/* Instantané de l'état courant : liste des écarts. */
function examiner() {
  const ecarts = [];
  let sw, kb, precache;
  try { sw = lire(cheminSW); } catch { ecarts.push('sw.js introuvable'); return { ecarts }; }
  try { kb = lire(cheminKB); } catch { ecarts.push('kbsite.js introuvable'); return { ecarts }; }
  try { precache = lirePrecache(sw); } catch (e) { ecarts.push(e.message); return { ecarts }; }
  const site = fichiersSite();
  for (const u of precache) {
    const f = versPrecache(u);
    if (f === null) continue;           // './' = la racine, servie par index.html
    if (!fs.existsSync(path.join(racine, f))) ecarts.push('entrée de précache inexistante : ' + u);
  }
  const dansListe = new Set(precache.map(versPrecache).filter(Boolean));
  for (const f of site) if (!dansListe.has(f)) ecarts.push('oublié : ' + f);
  for (const f of dansListe) if (!site.includes(f) && fs.existsSync(path.join(racine, f))) ecarts.push('précache hors « fichiers du site » (exclu ou non suivi) : ' + f);
  const listeOk = ecarts.length === 0;
  const empreinte = empreinteGlobale(site);
  const mV = sw.match(RE_VER_SW), mE = sw.match(RE_EMP_SW), mK = kb.match(RE_VER_KB), mA = kb.match(RE_AMONT_KB);
  if (!mV || !mE) ecarts.push('VERSION ou EMPREINTE introuvable dans sw.js');
  if (!mK || !mA) ecarts.push('constantes VERSION:DEBUT/FIN introuvables dans kbsite.js');
  let amontReel = null;
  try { amontReel = sha(fs.readFileSync(cheminAmont)).slice(0, 8); } catch { ecarts.push('amont/kinball.amont.html introuvable'); }
  const etat = { ecarts, listeOk, empreinte, sw, kb, mV, mE, mK, mA, amontReel, precache, site };
  if (mV && mE && mK && mA) {
    if (mE[2] !== empreinte) ecarts.push('empreinte différente : sw.js ' + mE[2].slice(0, 12) + '… ≠ calculée ' + empreinte.slice(0, 12) + '…');
    if (mV[2] !== mK[2]) ecarts.push('VERSION de sw.js (' + mV[2] + ') ≠ version de kbsite.js (' + mK[2] + ')');
    if (amontReel && mA[2] !== amontReel) ecarts.push('« amont » de kbsite.js (' + mA[2] + ') ≠ sha256 réel d\'amont/ (' + amontReel + ')');
  }
  return etat;
}

function dateDuJour() {
  const d = new Date(), z = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
}

let etat = examiner();
if (ecrire) {
  if (!etat.listeOk || !etat.mV || !etat.mK || !etat.amontReel) {
    console.error('Impossible d\'écrire : corriger d\'abord la liste de précache et les fichiers.');
    for (const e of etat.ecarts) console.error('  - ' + e);
    process.exit(1);
  }
  if (etat.ecarts.length === 0) {
    console.log('Rien n\'a changé : version ' + etat.mK[2] + ', rien d\'écrit.');
    process.exit(0);
  }
  const avant = etat.mK[2];
  const m = avant.match(/^(\d{4}-\d{2}-\d{2})\.(\d+)$/);
  const jour = dateDuJour();
  const rang = (m && m[1] === jour) ? Number(m[2]) + 1 : 1;
  const version = jour + '.' + rang;
  /* 1) kbsite.js : version et amont */
  let kb = etat.kb.replace(RE_VER_KB, (_, a, __, c) => a + version + c).replace(RE_AMONT_KB, (_, a, __, c) => a + etat.amontReel + c);
  fs.writeFileSync(cheminKB, kb);
  /* 2) empreinte recalculée (kbsite.js fait partie des fichiers du site), puis sw.js */
  const empreinte = empreinteGlobale(fichiersSite());
  let sw = etat.sw.replace(RE_VER_SW, (_, a, __, c) => a + version + c).replace(RE_EMP_SW, (_, a, __, c) => a + empreinte + c);
  fs.writeFileSync(cheminSW, sw);
  console.log('Nouvelle version ' + version + ' (avant : ' + avant + ') ; empreinte ' + empreinte.slice(0, 12) + '…');
  etat = examiner();
}

if (etat.ecarts.length) {
  console.error('check-release : ÉCART');
  for (const e of etat.ecarts) console.error('  - ' + e);
  process.exit(1);
}
console.log('check-release : OK — version ' + etat.mK[2] + ', amont ' + etat.mA[2] + ', ' + etat.precache.length + ' entrées de précache, empreinte ' + etat.empreinte.slice(0, 12) + '…');
