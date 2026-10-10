/* Résultat du banc d'essai joué par la CI (.github/workflows/banc.yml), en une commande et sans rien lancer ici :
     node outils/ci-banc.mjs                    dernier passage de la branche courante pour le commit courant
     node outils/ci-banc.mjs --branche main     dernier passage d'une autre branche (sans exiger le même commit)
     node outils/ci-banc.mjs --sha <sha>        un commit précis
     node outils/ci-banc.mjs --attendre         attend la fin (jusqu'à 9 min par appel ; relancer si code 2)
   Sortie : le résumé court (total, échecs avec leur message, lien du passage), lu dans les annotations du passage par
   l'API de GitHub (la CI les écrit : tests/resume-ci.mjs --annotations). Les dix premiers échecs y figurent ; le détail
   complet est dans l'artefact « banc-resultat » (resultat.json), qu'on tente de télécharger seulement si les annotations
   manquent : un environnement à sortie restreinte peut refuser ce serveur de stockage.
   Code de sortie : 0 vert, 1 rouge, 2 pas de passage ou encore en cours, 3 impossible de joindre GitHub.
   Demande « gh » configuré (gh auth login). Si GH_TOKEN est présent mais invalide, on réessaie sans lui. */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const argv = process.argv.slice(2);
const val = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const attendre = argv.includes('--attendre');
const DEPOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const sh = (cmd, args, env) => spawnSync(cmd, args, { cwd: DEPOT, encoding: 'utf8', env: env || process.env, maxBuffer: 64 << 20 });

function gh(args) {
  let r = sh('gh', args);
  if (r.status !== 0 && (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) && /token|401|credentials|auth/i.test(r.stderr || '')) {
    const env = { ...process.env }; delete env.GH_TOKEN; delete env.GITHUB_TOKEN;
    r = sh('gh', args, env);
  }
  return r;
}
const fin = (msg, code) => { console.log(msg); process.exit(code); };

const brancheCourante = sh('git', ['rev-parse', '--abbrev-ref', 'HEAD']).stdout.trim();
const branche = val('--branche') || brancheCourante;
const sha = val('--sha') || (val('--branche') ? null : sh('git', ['rev-parse', 'HEAD']).stdout.trim());
const MAX = 540 * 1000, t0 = Date.now();

let run;
for (;;) {
  /* Pas de --workflow banc.yml : gh ne trouve un workflow que sur la branche par défaut, donc pas avant la fusion de la PR qui l'ajoute. */
  const l = gh(['run', 'list', '--branch', branche, '--limit', '40', '--json', 'databaseId,workflowName,status,conclusion,headSha,url,createdAt,event']);
  if (l.status !== 0) fin('Impossible de lire les passages de la CI : ' + (l.stderr || l.stdout).trim().split('\n')[0] + '\n(gh configuré ? « gh auth login »)', 3);
  const runs = JSON.parse(l.stdout || '[]').filter(r => r.workflowName === "Banc d'essai" && (!sha || r.headSha === sha));
  run = runs[0];
  if (!run) {
    if (!attendre || Date.now() - t0 > 90 * 1000) fin(`AUCUN PASSAGE CI pour ${sha ? sha.slice(0, 8) : 'la branche ' + branche} (branche poussée ? changement limité à la documentation, donc ignoré par la CI ?).`, 2);
  } else if (run.status === 'completed') break;
  else if (!attendre) fin(`EN COURS — passage CI ${run.status} depuis ${run.createdAt} : ${run.url}\nRelancer : node outils/ci-banc.mjs --attendre`, 2);
  else if (Date.now() - t0 > MAX) fin(`EN COURS — toujours en cours après 9 min : ${run.url}\nRelancer : node outils/ci-banc.mjs --attendre`, 2);
  sh('sleep', ['20']);
}

const ok = run.conclusion === 'success';
/* Annotations du passage (API de GitHub) : « BANC RÉSUMÉ » (notice) et « BANC FAIL » (error). */
const notes = [];
const jobs = gh(['run', 'view', String(run.databaseId), '--json', 'jobs']);
if (jobs.status === 0) {
  for (const j of JSON.parse(jobs.stdout || '{"jobs":[]}').jobs) {
    const a = gh(['api', `repos/{owner}/{repo}/check-runs/${j.databaseId}/annotations`, '--paginate', '--jq', '.[] | {t: .title, m: .message, l: .annotation_level}']);
    if (a.status === 0) for (const l of a.stdout.split('\n').filter(Boolean)) { try { notes.push(JSON.parse(l)); } catch {} }
  }
}
const resume = notes.find(n => /^BANC (RÉSUMÉ|SANS RÉSULTAT)/.test(n.t || ''));
const echecs = notes.filter(n => n.t === 'BANC FAIL');
if (resume) {
  console.log(`${resume.m}${resume.t === 'BANC RÉSUMÉ' ? ` [CI, commit ${run.headSha.slice(0, 8)}]` : ''}`);
  for (const e of echecs) console.log(`FAIL  ${e.m}`);
  console.log(`Passage : ${run.url}`);
  process.exit(ok ? 0 : 1);
}

/* Pas d'annotation du banc : échec avant le banc, ou passage d'une version antérieure du workflow. */
const autres = notes.filter(n => n.l === 'failure' || n.l === 'error').map(n => n.m).slice(0, 3);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-ci-'));
const d = gh(['run', 'download', String(run.databaseId), '--name', 'banc-resultat', '--dir', tmp]);
const f = path.join(tmp, 'resultat.json');
if (d.status === 0 && fs.existsSync(f)) {
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log(`${r.echecs.length ? 'ÉCHEC' : 'OK'} — ${r.ok}/${r.total} vérifications passées, ${r.echecs.length} échec(s)${r.known.length ? `, ${r.known.length} défaut(s) connu(s)` : ''} en ${r.duree_s} s (CI, commit ${run.headSha.slice(0, 8)}, artefact)`);
  for (const e of r.echecs.slice(0, 20)) console.log(`FAIL  ${e.nom}\n      ${String(e.message).slice(0, 400)}`);
  console.log(`Passage : ${run.url}\nRésultat complet : ${f}`);
  process.exit(r.code ? 1 : 0);
}
console.log(`${ok ? 'OK' : 'ÉCHEC'} — passage CI ${run.conclusion}, sans annotation du banc${autres.length ? ' (' + autres.join(' ; ') + ')' : ''}. Résultat illisible d'ici (artefact : ${(d.stderr || '').trim().split('\n')[0].replace(/\?.*$/, '').slice(0, 120) || 'absent'}). Journal : ${run.url}`);
process.exit(ok ? 0 : 1);
