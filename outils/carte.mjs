/* Carte « fonction → ligne » du code de l'app, pour aller lire le bon endroit sans parcourir index.html.
   node outils/carte.mjs            : tout (index.html, puis kbsite.js, kblocal.js, kbcollect.js)
   node outils/carte.mjs <regex>    : seulement les fonctions dont le nom, ou le titre de la section, correspond
                                      (sans distinction de casse), ex. : saisie | wp | radial | ^undo | export
   Sortie : « == SECTION (ligne) » puis « ligne nom » groupés sur des lignes de 110 caractères au plus. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const filtre = process.argv[2] ? new RegExp(process.argv[2], 'i') : null;
const FICHIERS = ['index.html', 'kbsite.js', 'kblocal.js', 'kbcollect.js'];

function carte(fichier) {
  const lignes = fs.readFileSync(path.join(DEPOT, fichier), 'utf8').split('\n');
  const html = fichier.endsWith('.html');
  let dansScript = !html, section = '(début)', sectionLigne = 1;
  const groupes = [];   // { titre, ligne, fns: [[ligne, nom]] }
  let g = { titre: section, ligne: 1, fns: [] }; groupes.push(g);
  const nouvelle = (titre, n) => { g = { titre, ligne: n, fns: [] }; groupes.push(g); };
  lignes.forEach((l, i) => {
    const n = i + 1;
    if (html && /<script(\s|>)/.test(l) && !/src=/.test(l)) dansScript = true;
    if (html && /<\/script>/.test(l)) dansScript = false;
    if (!dansScript) return;
    let m;
    if ((m = l.match(/^\s*\/\* -{4,}\s*(.+?)\s*-{4,}/))) return nouvelle(m[1], n);
    if (/^\s*\/\* ={5,}\s*$/.test(l) && lignes[i + 1]) { const t = lignes[i + 1].trim().replace(/\s*[-—:].*$/, '').slice(0, 60); if (t && !/^=+$/.test(t)) return nouvelle(t, n); }
    if ((m = l.match(/^\s{0,4}(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/))) g.fns.push([n, m[1]]);
    else if ((m = l.match(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/))) g.fns.push([n, m[1]]);
    else if ((m = l.match(/^\s*(KB[A-Za-z]+(?:\.[A-Za-z_$][\w$]*)+)\s*=\s*(?:async\s+)?function\b/))) g.fns.push([n, m[1]]);
  });
  return groupes.map(x => ({ ...x, fns: filtre && !filtre.test(x.titre) ? x.fns.filter(([, nom]) => filtre.test(nom)) : x.fns })).filter(x => x.fns.length);
}

const sortie = [];
for (const f of FICHIERS) {
  if (!fs.existsSync(path.join(DEPOT, f))) continue;
  const gs = carte(f);
  if (!gs.length) continue;
  sortie.push(`# ${f}`);
  for (const x of gs) {
    sortie.push(`== ${x.titre} (${x.ligne})`);
    let ligne = '';
    for (const [n, nom] of x.fns) {
      const t = `${n} ${nom}`;
      if (ligne && ligne.length + t.length + 3 > 110) { sortie.push('  ' + ligne); ligne = ''; }
      ligne += (ligne ? ' · ' : '') + t;
    }
    if (ligne) sortie.push('  ' + ligne);
  }
}
console.log(sortie.length ? sortie.join('\n') : 'Aucune fonction ne correspond.');
