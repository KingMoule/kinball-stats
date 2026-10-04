/* Suite autonome du serveur de collecte (collecte/Logique.gs + collecte/Code.gs), SOUS NODE,
   avec de faux services Google qui notent chaque appel. Aucun accès réseau externe, aucun compte Google.
   Commande : node tests/local/collecte.test.mjs   (PASS / FAIL par cas ; code de sortie 1 au moindre échec) */
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { creerMonde, METHODES_INTERDITES } from '../../collecte/faux-google.mjs';
import { demarrer } from '../../collecte/faux-serveur.mjs';

const DEPOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
let echecs = 0, total = 0;
const tousLesMondes = [];
async function cas(nom, f) {
  total++;
  try { await f(); console.log('PASS  ' + nom); }
  catch (e) { echecs++; console.log('FAIL  ' + nom + '\n      ' + (e && e.message)); }
}
function egal(a, b, msg) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'différent') + ' : obtenu ' + JSON.stringify(a) + ', attendu ' + JSON.stringify(b)); }
function vrai(c, msg) { if (!c) throw new Error(msg || 'faux'); }

/* ---------- Matériel ---------- */
const INSTALL = 'u_123e4567-e89b-12d3-a456-426614174000';
function matchRef(extra = {}) {
  return Object.assign({
    id: 'match_mgx1abc12', status: 'completed', matchName: 'Finale éàç — Québec', createdAt: 1760000000000, updatedAt: 1760000900000,
    names: { Bleu: 'Équipe Bleue', Gris: 'Gris', Noir: 'Noir' }, authorId: 'u_auteur',
    rosters: { Bleu: [{ id: 'p_1', name: '' }, { id: 'p_2' }], Gris: [], Noir: [] },
    format: { id: '9_11', label: '9 / 11', teams: 3 },
    history: [
      { type: 'lancer', before: { scores: { Bleu: 0 } }, details: { attacker: 'Bleu', target: 'Gris', result: 'attrapé', attacker_player_id: 'p_1', attacker_player_name: '' } },
      { type: 'faute', before: { scores: { Bleu: 0 } }, details: { team: 'Noir', team_name: 'Noir' } }
    ]
  }, extra);
}
function env(match, sur = {}) {
  return JSON.stringify(Object.assign({ schema: 1, appVersion: '2026-10-04.6', installId: INSTALL, sentAt: 1760000999000, consent: true, match }, sur));
}
function neuf(opts) { const m = creerMonde(opts); m.installer(); tousLesMondes.push(m); return m; }
const nFichiers = (m) => m.etat.fichiers.length;
const nVersions = (m) => m.lignes('versions').length - 1;     // sans l'en-tête

/* ---------- 1 à 12 ---------- */
await cas('01 version nouvelle : recu, une ligne, un fichier ; 3 répétitions : deja_recu, toujours une ligne et un fichier', () => {
  const m = neuf();
  const r = m.envoyer(env(matchRef()));
  egal([r.ok, r.statut, r.raison], [true, 'recu', null]);
  egal([nVersions(m), nFichiers(m)], [1, 1]);
  for (let i = 0; i < 3; i++) { const x = m.envoyer(env(matchRef())); egal([x.ok, x.statut], [true, 'deja_recu']); }
  egal([nVersions(m), nFichiers(m)], [1, 1]);
  const ligne = m.lignes('versions')[1];
  egal(ligne[1], 'version'); egal(ligne[2], INSTALL); egal(ligne[3], 'match_mgx1abc12'); egal(ligne[5], 2); egal(ligne[6], '9_11');
  egal(m.etat.fichiers[0].nom, 'match_mgx1abc12__' + ligne[4].slice(0, 12) + '.json');
  egal(m.etat.fichiers[0].contenu, JSON.stringify(matchRef()), 'contenu brut du fichier');
  egal(ligne[10], m.etat.fichiers[0].id, 'identifiant du fichier dans la ligne');
});

await cas('02 même match.id, contenu différent : seconde ligne, second fichier, premier intact', () => {
  const m = neuf();
  m.envoyer(env(matchRef()));
  const avant = JSON.stringify([m.lignes('versions')[1], m.etat.fichiers[0]]);
  const r = m.envoyer(env(matchRef({ updatedAt: 1760001000000 })));
  egal(r.statut, 'recu');
  egal([nVersions(m), nFichiers(m)], [2, 2]);
  egal(JSON.stringify([m.lignes('versions')[1], m.etat.fichiers[0]]), avant, 'première version intacte');
  vrai(m.lignes('versions')[1][4] !== m.lignes('versions')[2][4], 'empreintes différentes');
});

await cas('03 deux envois simultanés de la même version (verrou) : une seule ligne', () => {
  const m = neuf();
  let nested = null;
  m.etat.avantEcriture = () => { nested = m.envoyer(env(matchRef())); };   // 2e envoi pendant que le 1er tient le verrou, avant qu'il n'écrive
  const premier = m.envoyer(env(matchRef()));
  egal(premier.statut, 'recu');
  egal([nested.statut, nested.raison], ['refuse', 'occupe']);
  egal([nVersions(m), nFichiers(m)], [1, 1]);
  egal(m.envoyer(env(matchRef())).statut, 'deja_recu');       // le réessai de l'app
  egal(m.etat.verrouPris, false, 'verrou relâché');
});

await cas('04 verrou non obtenu : refuse / occupe, rien d\'écrit', () => {
  const m = neuf();
  m.etat.verrouPris = true;
  const avant = m.journal.length;
  const r = m.envoyer(env(matchRef()));
  egal([r.ok, r.statut, r.raison], [false, 'refuse', 'occupe']);
  egal([nVersions(m), nFichiers(m)], [0, 0]);
  vrai(!m.journal.slice(avant).some(j => j.methode === 'appendRow' || j.methode === 'createFile'), 'aucune écriture tentée');
  m.etat.verrouPris = false;
  egal(m.envoyer(env(matchRef())).statut, 'recu');
});

await cas('05 refus : JSON, schema 2, installId absent, consent:false + match, id absent, non terminé, 2 Mo + 1, noms (rosters, details), rien d\'écrit', () => {
  const m = neuf();
  const attendu = (corps, raison, titre) => {
    const r = m.envoyer(corps);
    egal([r.ok, r.statut, r.raison], [false, 'refuse', raison], titre);
  };
  attendu('{pas du json', 'json', 'json invalide');
  attendu('[1,2]', 'json', 'json non objet');
  attendu(env(matchRef(), { schema: 2 }), 'schema', 'schema 2');
  const sans = JSON.parse(env(matchRef())); delete sans.installId;
  attendu(JSON.stringify(sans), 'champ:installId', 'installId absent');
  attendu(env(matchRef(), { installId: '=IMPORTXML("x")' }), 'champ:installId', 'installId piégé');
  attendu(env(matchRef(), { installId: 'a'.repeat(81) }), 'champ:installId', 'installId trop long');
  attendu(env(matchRef(), { consent: 'oui' }), 'champ:consent', 'consent non booléen');
  attendu(env(matchRef(), { consent: false }), 'consentement', 'consent:false avec un match');
  attendu(env(matchRef(), { extra: 1 }), 'champ:extra', 'champ inconnu');
  const sansId = matchRef(); delete sansId.id;
  attendu(env(sansId), 'champ:match.id', 'match sans id');
  attendu(env(matchRef({ id: '../etc' })), 'champ:match.id', 'id piégé');
  attendu(env(matchRef({ status: 'in_progress' })), 'champ:match.status', 'non terminé');
  attendu(env(matchRef({ history: 'x' })), 'champ:match.history', 'history non tableau');
  attendu(env(null), 'champ:match', 'consent:true sans match');
  attendu(env(matchRef({ rosters: { Bleu: [{ id: 'p_1', name: 'Prénom Nom' }] } })), 'noms', 'nom dans rosters');
  attendu(env(matchRef({ rosters: { Bleu: ['Prénom'] } })), 'noms', 'nom brut dans rosters');
  for (const cle of ['attacker_player_name', 'player_out_name', 'player_in_name', 'lineup_names']) {
    attendu(env(matchRef({ history: [{ type: 'x', before: {}, details: { [cle]: 'Prénom|Autre' } }] })), 'noms', 'nom dans details.' + cle);
  }
  attendu(env(matchRef({ history: [{ type: 'x', before: {}, details: { imbriqué: { a_name: 'X' } } }] })), 'noms', 'nom imbriqué');
  // limite de taille : corps de 2 Mo exactement accepté par la taille (refusé ensuite pour autre chose), 2 Mo + 1 octet refusé « taille »
  const MAX = 2 * 1024 * 1024;
  const base = '{"schema":1,"pad":"';
  attendu(base + 'a'.repeat(MAX - base.length - 2 + 1) + '"}', 'taille', '2 Mo + 1 octet');
  const juste = base + 'a'.repeat(MAX - base.length - 2) + '"}';
  vrai(Buffer.byteLength(juste) === MAX, 'corps de 2 Mo pile');
  attendu(juste, 'champ:pad', '2 Mo pile passe la taille');
  attendu('é'.repeat(MAX / 2 + 1), 'taille', 'taille comptée en octets UTF-8');
  egal([nVersions(m), nFichiers(m), m.lignes('retraits').length], [0, 0, 1]);
});

await cas('05b noms vides ou nom d\'équipe : permis (team_name, name:"", lineup_names "||")', () => {
  const m = neuf();
  const r = m.envoyer(env(matchRef({ history: [{ type: 'x', before: {}, details: { team_name: 'Les Bleus', lineup_names: '||', attacker_player_name: '', player_in_name: null } }] })));
  egal(r.statut, 'recu');
});

await cas('06 marque de suppression : suppression_notee, ligne « suppression », aucun fichier créé ni retiré ni ligne retirée', () => {
  const m = neuf();
  m.envoyer(env(matchRef()));
  const avantLignes = JSON.stringify(m.lignes('versions')), avantFichiers = JSON.stringify(m.etat.fichiers);
  const del = { id: 'match_mgx1abc12', deleted: true, deletedAt: 1760002000000 };
  const r = m.envoyer(env(del));
  egal([r.ok, r.statut], [true, 'suppression_notee']);
  egal(JSON.stringify(m.etat.fichiers), avantFichiers, 'fichiers inchangés');
  const l = m.lignes('versions');
  egal(l.length, 3); egal(JSON.stringify(l.slice(0, 2)), JSON.stringify(JSON.parse(avantLignes)), 'lignes précédentes inchangées');
  egal(l[2][1], 'suppression'); egal(l[2][3], 'match_mgx1abc12'); egal(l[2][10], '');
  egal(m.envoyer(env(del)).statut, 'deja_recu');                     // répétée : une seule ligne
  egal(m.lignes('versions').length, 3);
  egal(m.envoyer(env({ id: 'match_mgx1abc12', deleted: true, deletedAt: 1, matchName: 'x' })).raison, 'champ:match.matchName');
  egal(m.envoyer(env({ id: 'match_mgx1abc12', deleted: true })).raison, 'champ:match.deletedAt');
});

await cas('07 retrait : retrait_note, une ligne dans « retraits », rien d\'autre ne bouge', () => {
  const m = neuf();
  m.envoyer(env(matchRef()));
  const avantV = JSON.stringify(m.lignes('versions')), avantF = JSON.stringify(m.etat.fichiers);
  const r = m.envoyer(env(null, { consent: false }));
  egal([r.ok, r.statut, r.raison], [true, 'retrait_note', null]);
  const l = m.lignes('retraits');
  egal(l.length, 2); egal([l[1][1], l[1][2], l[1][3]], [INSTALL, 1760000999000, '']);
  egal(JSON.stringify(m.lignes('versions')), avantV); egal(JSON.stringify(m.etat.fichiers), avantF);
  egal(m.envoyer(env(null, { consent: false })).statut, 'deja_recu');   // retrait déjà en attente
  egal(m.lignes('retraits').length, 2);
});

await cas('08 plafonds : le 201e envoi du jour d\'un même installId -> refuse / quota ; autre appareil et lendemain passent', () => {
  let t = Date.parse('2026-10-04T12:00:00Z');
  const m = neuf({ maintenant: () => new Date(t) });
  for (let i = 0; i < 200; i++) egal(m.envoyer(env(matchRef({ id: 'match_n' + i }))).statut, 'recu', 'envoi ' + (i + 1));
  const r = m.envoyer(env(matchRef({ id: 'match_n200' })));
  egal([r.ok, r.statut, r.raison], [false, 'refuse', 'quota']);
  egal(nVersions(m), 200);
  egal(m.envoyer(env(matchRef({ id: 'match_n5' }))).statut, 'deja_recu', 'un doublon ne coûte pas de quota');
  egal(m.envoyer(env(matchRef({ id: 'match_n200' }), { installId: 'u_autre' })).statut, 'recu');
  t += 24 * 3600 * 1000;
  egal(m.envoyer(env(matchRef({ id: 'match_n201' }))).statut, 'recu', 'lendemain');
});

await cas('08b plafonds : total du jour (2 000), volume du jour, retraits', () => {
  const t = Date.parse('2026-10-04T12:00:00Z');
  const m = neuf({ maintenant: () => new Date(t) });
  const jour = new Date(t).toISOString();
  const feuille = m.etat.feuilles['versions'];
  for (let i = 0; i < 1999; i++) feuille.lignes.push([jour, 'version', 'u_x' + i, 'match_s' + i, 'e'.repeat(64), 1, '9_11', 'v', 1, 100, 'F']);
  egal(m.envoyer(env(matchRef())).statut, 'recu');
  egal(m.envoyer(env(matchRef({ id: 'match_zz' }), { installId: 'u_neuf' })).raison, 'quota');
  const m2 = neuf({ maintenant: () => new Date(t) });
  m2.etat.feuilles['versions'].lignes.push([jour, 'version', 'u_y', 'match_gros', 'f'.repeat(64), 1, '9_11', 'v', 1, 300 * 1024 * 1024 - 10, 'F']);
  egal(m2.envoyer(env(matchRef())).raison, 'quota');
  const m3 = neuf({ maintenant: () => new Date(t) });
  for (let i = 0; i < 5; i++) egal(m3.envoyer(env(null, { consent: false, installId: 'u_r' })).statut, i === 0 ? 'retrait_note' : 'deja_recu');
  m3.etat.feuilles['retraits'].lignes[1][3] = 'oui';                                    // le retrait est traité à la main
  for (let i = 0; i < 4; i++) m3.etat.feuilles['retraits'].lignes.push([jour, 'u_r', 1, 'oui']);   // 5 retraits traités le même jour
  egal(m3.envoyer(env(null, { consent: false, installId: 'u_r' })).raison, 'quota');
});

await cas('09 aucun appel d\'effacement ni de remplacement sur toute la suite', () => {
  vrai(tousLesMondes.length >= 5, 'des mondes ont servi');
  let appels = 0;
  for (const m of tousLesMondes) {
    appels += m.journal.length;
    egal(m.appelsInterdits(), [], 'appels interdits');
    for (const j of m.journal) vrai(!METHODES_INTERDITES.includes(j.methode), 'méthode interdite ' + j.methode);
  }
  vrai(appels > 100, 'le journal est bien alimenté (' + appels + ' appels)');
  // contrôle croisé du source : aucun mot interdit dans Code.gs
  const code = fs.readFileSync(path.join(DEPOT, 'collecte', 'Code.gs'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  for (const mot of METHODES_INTERDITES) vrai(!new RegExp('\\.' + mot + '\\s*\\(').test(code), 'Code.gs appelle .' + mot);
  // le faux monde sait bien refuser : un appel interdit est noté et échoue
  const essai = creerMonde(); essai.installer();
  let leve = false; try { essai.ctx.SpreadsheetApp.getActiveSpreadsheet().getSheetByName('versions').getRange(1, 1).clear(); } catch { leve = true; }
  vrai(leve && essai.appelsInterdits().length === 1, 'le garde-fou fonctionne');
});

await cas('10 empreinte : même sha256 que Node sur JSON.stringify(match) en UTF-8, accents compris', () => {
  const m = neuf();
  const match = matchRef({ matchName: 'Étoiles ☆ « Québec » 𝄞 日本', note: 'çá 😀 \\ "' });
  const attendu = crypto.createHash('sha256').update(JSON.stringify(match), 'utf8').digest('hex');
  m.envoyer(env(match));
  egal(m.lignes('versions')[1][4], attendu);
  const { sha256Hex, longueurUtf8, octetsUtf8 } = m.ctx;
  for (const t of ['', 'abc', 'é', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'é'.repeat(1000), '\ud800seul', '😀'.repeat(30)]) {
    egal(sha256Hex(t), crypto.createHash('sha256').update(t, 'utf8').digest('hex'), 'sha256 de ' + JSON.stringify(t.slice(0, 10)));
    egal(longueurUtf8(t), Buffer.byteLength(t, 'utf8'), 'longueur');
    egal(Buffer.from(octetsUtf8(t)).equals(new TextEncoder().encode(t)), true, 'octets');
  }
  const gros = 'x'.repeat(2 * 1024 * 1024);
  egal(sha256Hex(gros), crypto.createHash('sha256').update(gros).digest('hex'), 'sha256 de 2 Mo');
});

await cas('11 installer() lancée deux fois : mêmes feuilles, mêmes en-têtes, un seul dossier', () => {
  const m = creerMonde(); tousLesMondes.push(m);
  m.installer();
  const etat1 = JSON.stringify([m.lignes('versions'), m.lignes('retraits'), m.etat.dossiers, m.etat.proprietes]);
  m.installer(); m.installer();
  egal(JSON.stringify([m.lignes('versions'), m.lignes('retraits'), m.etat.dossiers, m.etat.proprietes]), etat1);
  egal(m.etat.dossiers.length, 1);
  egal(m.lignes('versions')[0], m.ctx.EN_TETES_VERSIONS);
  egal(m.lignes('versions')[0].length, 11);
  egal(m.lignes('retraits')[0], ['reçu le', 'installId', 'sentAt', 'traité']);
  egal(m.envoyer('{}').raison, 'schema');
});

await cas('11b sans installer() : réponse JSON refuse / occupe, jamais d\'exception ; GET d\'état', () => {
  const m = creerMonde(); tousLesMondes.push(m);
  const r = m.envoyer(env(matchRef()));
  egal([r.ok, r.statut, r.raison], [false, 'refuse', 'occupe']);
  egal(m.etat.verrouPris, false, 'verrou relâché malgré l\'exception');
  egal(m.doGet(), { ok: true, service: 'kinball-collecte', schema: 1 });
  const r2 = m.ctx.doPost(undefined); egal(JSON.parse(r2.getContent()).raison, 'json');
});

await cas('11c lignes de la feuille relues sous forme de dates (comportement possible de Sheets) : doublon et quotas toujours corrects', () => {
  const t = Date.parse('2026-10-04T12:00:00Z');
  const m = neuf({ maintenant: () => new Date(t) });
  m.envoyer(env(matchRef()));
  const f = m.etat.feuilles['versions'];
  f.lignes[1][0] = new Date(f.lignes[1][0]);       // la feuille rend une Date au lieu d'un texte
  f.lignes[1][5] = '2'; f.lignes[1][9] = String(f.lignes[1][9]);
  egal(m.envoyer(env(matchRef())).statut, 'deja_recu');
  egal(m.ctx.jourDe(f.lignes[1][0]), '2026-10-04');
});

/* ---------- 12 : faux serveur HTTP ---------- */
for (const redirection of [false, true]) {
  await cas('12 faux serveur http' + (redirection ? ' avec --redirection' : '') + ' : cas 1, 2, 5, 6, 7', async () => {
    const s = await demarrer({ redirection });
    try {
      const poster = async (corps) => {
        const rep = await fetch(s.url, { method: 'POST', body: corps, headers: { 'content-type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
        return { rep, json: await rep.json() };
      };
      const g = await fetch(s.url); egal(await g.json(), { ok: true, service: 'kinball-collecte', schema: 1 });
      const a = await poster(env(matchRef()));
      egal(a.json.statut, 'recu'); egal(a.rep.headers.get('access-control-allow-origin'), '*');
      if (redirection) vrai(a.rep.redirected && /\/echo\//.test(a.rep.url), 'redirection suivie');
      for (let i = 0; i < 3; i++) egal((await poster(env(matchRef()))).json.statut, 'deja_recu');
      egal(s.recus().versions.length - 1, 1); egal(s.recus().fichiers.length, 1);
      egal((await poster(env(matchRef({ updatedAt: 1760001000000 })))).json.statut, 'recu');
      egal([s.recus().versions.length - 1, s.recus().fichiers.length], [2, 2]);
      egal((await poster('{nul')).json.raison, 'json');
      egal((await poster(env(matchRef({ rosters: { Bleu: [{ id: 'p', name: 'Un Nom' }] } })))).json.raison, 'noms');
      egal((await poster(env(matchRef(), { schema: 2 }))).json.raison, 'schema');
      egal((await poster(env({ id: 'match_mgx1abc12', deleted: true, deletedAt: 5 }))).json.statut, 'suppression_notee');
      egal(s.recus().fichiers.length, 2);
      egal((await poster(env(null, { consent: false }))).json.statut, 'retrait_note');
      egal(s.recus().retraits.length - 1, 1);
      const pre = await fetch(s.url, { method: 'OPTIONS' }); egal(pre.status, 204);
      vrai(s.posts.length >= 10, 'liste des envois exposée');
    } finally { await s.arreter(); }
  });
}

await cas('12b faux serveur : options --panne (500 et refus) et --lent', async () => {
  const s500 = await demarrer({ panne: '500' });
  try { const r = await fetch(s500.url, { method: 'POST', body: env(matchRef()) }); egal(r.status, 500); egal(s500.recus().versions.length, 1); } finally { await s500.arreter(); }
  const sr = await demarrer({ panne: 'refus' });
  let echec = false; try { await fetch(sr.url, { method: 'POST', body: '{}' }); } catch { echec = true; } finally { await sr.arreter(); }
  vrai(echec, 'connexion coupée');
  const sl = await demarrer({ lent: 400 });
  try { const t0 = Date.now(); const r = await fetch(sl.url, { method: 'POST', body: env(matchRef()) }); vrai(Date.now() - t0 >= 380, 'lent'); egal((await r.json()).statut, 'recu'); } finally { await sl.arreter(); }
});

console.log('\n' + (total - echecs) + ' / ' + total + ' cas réussis');
process.exit(echecs ? 1 : 0);
