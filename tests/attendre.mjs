/* Attente d'un passage du banc, en UNE commande : node tests/attendre.mjs [--max 540] [--tout]
   Bloque jusqu'à la fin du passage en cours (ou --max secondes, défaut 540 : sous la limite de 10 min d'une commande),
   puis affiche le résumé court (total, échecs avec leur message, chemin de resultat.json).
   Code de sortie : 0 vert, 1 rouge (ou passage interrompu, ou aucun résultat), 2 encore en cours au bout de --max.
   Lit KINBALL_SORTIE (même défaut que le banc) : en-cours.json pendant le passage, resultat.json à la fin.
   --tout : liste aussi les KNOWN. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const MAX = Number(arg('--max', 540)) * 1000;
const tout = process.argv.includes('--tout');
const SORTIE = process.env.KINBALL_SORTIE || path.join(os.tmpdir(), 'kinball-sortie');
const F_COURS = path.join(SORTIE, 'en-cours.json'), F_RES = path.join(SORTIE, 'resultat.json');
const lire = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const vivant = pid => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
const dort = ms => new Promise(r => setTimeout(r, ms));
const lanceurActif = () => { try { return fs.readdirSync('/proc').some(p => /^\d+$/.test(p) && Number(p) !== process.pid && (() => { try { const c = fs.readFileSync(`/proc/${p}/cmdline`, 'utf8'); return c.includes('tests/run.mjs') && !fs.readFileSync(`/proc/${p}/environ`, 'utf8').includes('KINBALL_CHILD=1'); } catch { return false; } })()); } catch { return false; } };

const t0 = Date.now();
let cours = lire(F_COURS);
/* Juste après le lancement, en-cours.json peut ne pas encore exister : on le laisse apparaître (15 s au plus). */
while ((!cours || !vivant(cours.pid)) && lanceurActif() && Date.now() - t0 < 15000) { await dort(500); cours = lire(F_COURS); }

if (cours && vivant(cours.pid)) {
  while (vivant(cours.pid) && Date.now() - t0 < MAX) { await dort(3000); cours = lire(F_COURS) || cours; }
  if (vivant(cours.pid)) {
    const s = Math.round((Date.now() - Date.parse(cours.debut)) / 1000);
    console.log(`EN COURS — ${cours.faites}/${cours.suites} suites terminées, ${cours.echecs} échec(s) jusqu'ici, depuis ${s} s (pid ${cours.pid}). Relancer : node tests/attendre.mjs`);
    process.exit(2);
  }
}

const r = lire(F_RES);
if (cours && (!r || Date.parse(r.debut) < Date.parse(cours.debut))) {
  console.log(`INTERROMPU — le passage du ${cours.debut} (pid ${cours.pid}) s'est arrêté sans écrire de résultat.`);
  if (cours.journal) { try { console.log('Fin du journal ' + cours.journal + ' :\n' + fs.readFileSync(cours.journal, 'utf8').trimEnd().split('\n').slice(-12).join('\n')); } catch {} }
  process.exit(1);
}
if (!r) { console.log(`AUCUN RÉSULTAT — ni passage en cours ni ${F_RES}.`); process.exit(1); }

console.log(`${r.echecs.length ? 'ÉCHEC' : 'OK'} — ${r.ok}/${r.total} vérifications passées, ${r.echecs.length} échec(s)${r.known.length ? `, ${r.known.length} défaut(s) connu(s)` : ''} en ${r.duree_s} s (fini ${r.fin}${r.depuis_cache ? ', depuis le cache' : ''}${r.complet ? ', passage complet' : ', passage partiel'})`);
for (const e of r.echecs.slice(0, 20)) console.log(`FAIL  ${e.nom}\n      ${String(e.message).slice(0, 400)}`);
if (r.echecs.length > 20) console.log(`… et ${r.echecs.length - 20} autre(s) : voir le fichier.`);
if (tout) for (const k of r.known) console.log(`KNOWN ${k.nom} — ${k.message}`);
console.log('Résultat : ' + F_RES);
process.exit(r.code ? 1 : 0);
