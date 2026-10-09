/* Empreinte d'un passage du banc : tout ce qui peut changer son résultat.
   - sha256 de chaque fichier du dépôt (site, tests/**, sim/, outils/, amont/…), sauf la documentation pure
     (docs/, .claude/, tests/docs/, tests/README.md, CLAUDE.md) et .git ;
   - KINBALL_HTML (copie testée, hors dépôt) et le contenu de KINBALL_AVANT (versions d'avant présentes) ;
   - versions de Playwright et de Chromium (chemin de l'exécutable, qui porte la révision) ;
   - les variables qui changent le passage (KINBALL_ANIM, KINBALL_TIMESCALE, KINBALL_SAISIE, KINBALL_ONLY, KINBALL_GABARIT,
     KINBALL_BAIL, <ID>_ONLY…). KINBALL_PARTS, KINBALL_SORTIE, KINBALL_VERBEUX, KINBALL_CACHE n'en font pas partie. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { DEPOT, HTML, AVANT_DIR, OUTIL } from './lib.mjs';

const EXCLUS_DOSSIERS = new Set(['.git', 'node_modules', 'docs', '.claude', path.join('tests', 'docs')]);
const EXCLUS_FICHIERS = new Set(['CLAUDE.md', path.join('tests', 'README.md')]);
const SANS_EFFET = new Set(['KINBALL_PARTS', 'KINBALL_SORTIE', 'KINBALL_VERBEUX', 'KINBALL_CACHE', 'KINBALL_CHILD', 'KINBALL_PHASE', 'KINBALL_LISTE', 'KINBALL_ATTENTE', 'KINBALL_CALME']);

export const CACHE = process.env.KINBALL_CACHE_DIR || path.join(os.homedir(), '.cache', 'kinball-banc');

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
function fichiers(dir, rel = '') {
  const out = [];
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const r = path.join(rel, e.name);
    if (e.isDirectory()) { if (!EXCLUS_DOSSIERS.has(r)) out.push(...fichiers(dir, r)); }
    else if (e.isFile() && !EXCLUS_FICHIERS.has(r)) out.push(r);
  }
  return out;
}

export function variables(env = process.env) {
  const v = {};
  for (const k of Object.keys(env).sort()) if ((/^KINBALL_/.test(k) || /^[A-Z0-9]+_ONLY$/.test(k)) && !SANS_EFFET.has(k)) v[k] = env[k];
  return v;
}

/* Passage « complet » : tous les gabarits, toutes les suites, sans arrêt au premier échec ni filtre de vérifications. */
export function complet(env = process.env) {
  return !env.KINBALL_ONLY && !env.KINBALL_GABARIT && !env.KINBALL_BAIL && !Object.keys(env).some(k => /^[A-Z0-9]+_ONLY$/.test(k) && env[k]);
}

export function empreinte(env = process.env) {
  const h = crypto.createHash('sha256');
  const liste = fichiers(DEPOT);
  for (const f of liste) h.update(f + '\0' + sha(fs.readFileSync(path.join(DEPOT, f))) + '\n');
  if (env.KINBALL_HTML) h.update('HTML\0' + sha(fs.readFileSync(HTML)) + '\n');
  let avant = [];
  try { avant = fs.readdirSync(AVANT_DIR).filter(n => fs.statSync(path.join(AVANT_DIR, n)).isFile()).sort(); } catch {}
  for (const n of avant) h.update('AVANT\0' + n + '\0' + sha(fs.readFileSync(path.join(AVANT_DIR, n))) + '\n');
  const outil = { playwright: OUTIL.playwright, chromium: OUTIL.chromium };
  const vars = variables(env);
  h.update(JSON.stringify(outil) + JSON.stringify(vars));
  return { hash: h.digest('hex').slice(0, 24), fichiers: liste.length, avant, outil, variables: vars };
}
