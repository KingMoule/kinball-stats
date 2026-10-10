/* Résumé Markdown du dernier resultat.json, pour l'onglet « Summary » d'une exécution GitHub Actions :
   node tests/resume-ci.mjs >> "$GITHUB_STEP_SUMMARY"
   Lit KINBALL_SORTIE (même défaut que le banc). Ne lance rien et ne lit que ce fichier. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const SORTIE = process.env.KINBALL_SORTIE || path.join(os.tmpdir(), 'kinball-sortie');
let r;
try { r = JSON.parse(fs.readFileSync(path.join(SORTIE, 'resultat.json'), 'utf8')); }
catch {
  console.log('## Banc d’essai : aucun résultat\n\nLe banc n’a pas écrit de `resultat.json` (installation, empreinte ou lancement en échec : voir le journal de l’étape « Banc d’essai »).');
  process.exit(0);
}

const nette = (s, n) => String(s).replace(/\r?\n+/g, ' ⏎ ').replace(/`/g, "'").replace(/\|/g, '/').slice(0, n);
const lignes = [];
lignes.push(`## Banc d’essai : ${r.echecs.length ? '❌ ÉCHEC' : '✅ OK'}`);
lignes.push('');
lignes.push(`**${r.ok}/${r.total}** vérifications passées, **${r.echecs.length}** échec(s)${r.known.length ? `, ${r.known.length} défaut(s) connu(s)` : ''}, en ${r.duree_s} s.`);
lignes.push('');
lignes.push(`- Passage ${r.complet ? 'complet' : '**partiel** (suites ou gabarit choisis)'}${r.depuis_cache ? ', **relu depuis le cache** (même empreinte, rien n’a été rejoué)' : ''}.`);
lignes.push(`- Empreinte : \`${r.empreinte}\``);
if (r.interrompus && r.interrompus.length) lignes.push(`- Processus interrompus sans résultat : ${r.interrompus.join(', ')}`);
if (r.echecs.length) {
  lignes.push('', '### Échecs', '');
  for (const e of r.echecs.slice(0, 25)) lignes.push(`- \`${nette(e.nom, 140)}\` : ${nette(e.message, 300)}`);
  if (r.echecs.length > 25) lignes.push(`- … et ${r.echecs.length - 25} autre(s) : voir \`resultat.json\` dans l’artefact **banc-resultat**.`);
}
const suites = Object.entries(r.suites || {}).map(([id, e]) => [id, Math.max(e.tablette || 0, e.telephone || 0)]).sort((a, b) => b[1] - a[1]).slice(0, 5);
if (suites.length) lignes.push('', `Suites les plus longues : ${suites.map(([id, s]) => `${id} ${Math.round(s)} s`).join(', ')}.`);
console.log(lignes.join('\n'));
