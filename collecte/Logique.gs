/* Logique.gs — logique PURE du serveur de collecte Kin-Ball Stats.
   Aucun appel Google ici : tout ce fichier se charge et se teste sous Node.
   Dans Apps Script, ce fichier et Code.gs partagent le même espace de noms
   (les noms ci-dessous ne doivent donc pas être réutilisés dans Code.gs).

   Contrat (schéma 1) : voir collecte/MODE-D-EMPLOI.md et le rapport M07.
   Enveloppe : {schema:1, appVersion, installId, sentAt, consent, match}
     - version d'un match : consent:true, match = match complet SANS noms de joueurs
     - marque de suppression : consent:true, match = {id, deleted:true, deletedAt}
     - retrait : consent:false, match:null
   Réponse : {ok, statut, raison}. */

var SCHEMA = 1;
var TAILLE_MAX_OCTETS = 2 * 1024 * 1024;          // corps de la requête : 2 Mo au plus
var PLAFONDS = {
  versionsParInstallParJour: 200,                   // envois acceptés par installId et par jour
  versionsTotalParJour: 2000,                       // envois acceptés par jour, tous appareils
  octetsParJour: 300 * 1024 * 1024,                 // volume accepté par jour (Drive)
  retraitsParInstallParJour: 5,
  retraitsTotalParJour: 200
};
var REPONSES_OK = { recu: 1, deja_recu: 1, suppression_notee: 1, retrait_note: 1 };

/* ---------- Texte, octets, empreinte ---------- */

/* Longueur UTF-8 sans rien allouer (une moitié de paire de substitution seule vaut U+FFFD : 3 octets). */
function longueurUtf8(t) {
  var n = 0;
  for (var i = 0; i < t.length; i++) {
    var c = t.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < t.length && t.charCodeAt(i + 1) >= 0xDC00 && t.charCodeAt(i + 1) <= 0xDFFF) { n += 4; i++; }
    else n += 3;
  }
  return n;
}

/* Texte -> octets UTF-8 (même résultat que TextEncoder : substitut isolé -> U+FFFD). */
function octetsUtf8(t) {
  var sortie = new Uint8Array(longueurUtf8(t));
  var p = 0;
  for (var i = 0; i < t.length; i++) {
    var c = t.charCodeAt(i);
    if (c >= 0xD800 && c <= 0xDBFF && i + 1 < t.length && t.charCodeAt(i + 1) >= 0xDC00 && t.charCodeAt(i + 1) <= 0xDFFF) {
      c = 0x10000 + ((c - 0xD800) << 10) + (t.charCodeAt(i + 1) - 0xDC00); i++;
    } else if (c >= 0xD800 && c <= 0xDFFF) { c = 0xFFFD; }
    if (c < 0x80) sortie[p++] = c;
    else if (c < 0x800) { sortie[p++] = 0xC0 | (c >> 6); sortie[p++] = 0x80 | (c & 63); }
    else if (c < 0x10000) { sortie[p++] = 0xE0 | (c >> 12); sortie[p++] = 0x80 | ((c >> 6) & 63); sortie[p++] = 0x80 | (c & 63); }
    else { sortie[p++] = 0xF0 | (c >> 18); sortie[p++] = 0x80 | ((c >> 12) & 63); sortie[p++] = 0x80 | ((c >> 6) & 63); sortie[p++] = 0x80 | (c & 63); }
  }
  return sortie;
}

var K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

/* SHA-256 d'un texte (UTF-8), en hexadécimal minuscule. Écrit à la main pour ne dépendre d'aucun service. */
function sha256Hex(texte) {
  var oct = octetsUtf8(texte);
  var l = oct.length;
  var total = ((l + 9 + 63) >> 6) << 6;
  var m = new Uint8Array(total);
  m.set(oct);
  m[l] = 0x80;
  var bitsHaut = Math.floor(l / 0x20000000), bitsBas = (l << 3) >>> 0;
  m[total - 8] = (bitsHaut >>> 24) & 255; m[total - 7] = (bitsHaut >>> 16) & 255; m[total - 6] = (bitsHaut >>> 8) & 255; m[total - 5] = bitsHaut & 255;
  m[total - 4] = (bitsBas >>> 24) & 255; m[total - 3] = (bitsBas >>> 16) & 255; m[total - 2] = (bitsBas >>> 8) & 255; m[total - 1] = bitsBas & 255;
  var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  var w = new Uint32Array(64);
  for (var off = 0; off < total; off += 64) {
    for (var i = 0; i < 16; i++) w[i] = ((m[off + 4 * i] << 24) | (m[off + 4 * i + 1] << 16) | (m[off + 4 * i + 2] << 8) | m[off + 4 * i + 3]) >>> 0;
    for (i = 16; i < 64; i++) {
      var x = w[i - 15], y = w[i - 2];
      var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
      var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
    for (i = 0; i < 64; i++) {
      var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      var ch = (e & f) ^ (~e & g);
      var t1 = (hh + S1 + ch + K256[i] + w[i]) >>> 0;
      var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      var maj = (a & b) ^ (a & c) ^ (b & c);
      var t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  var hex = '';
  for (i = 0; i < 8; i++) hex += ('00000000' + h[i].toString(16)).slice(-8);
  return hex;
}

/* ---------- Réponses ---------- */

function fabriquerReponse(statut, raison) {
  return { ok: REPONSES_OK[statut] === 1, statut: statut, raison: statut === 'refuse' ? (raison || 'occupe') : null };
}

/* ---------- Noms de joueurs ---------- */

/* Vrai si la valeur contient autre chose que du vide (espaces, « | » de séparation). */
function valeurNonVide(v) {
  if (v === null || v === undefined || v === false) return false;
  if (typeof v === 'string') return v.replace(/[\s|]/g, '') !== '';
  if (Array.isArray(v)) return v.some(valeurNonVide);
  if (typeof v === 'object') return Object.keys(v).some(function (k) { return valeurNonVide(v[k]); });
  return true;
}

/* « team_name » est le nom d'une ÉQUIPE (pas d'un joueur) : il est permis. */
function cleEstNomDeJoueur(cle) {
  if (cle === 'team_name') return false;
  return /_names?$/.test(cle);
}

/* Parcours itératif (pas de récursion) de tout le match.
   Renvoie 'noms' si un nom de joueur est présent, 'champ:match' si l'imbrication dépasse 40 niveaux, sinon null. */
function controlerNoms(match) {
  var pile = [{ v: match, prof: 0, roster: false, elem: false }];
  while (pile.length) {
    var it = pile.pop();
    var v = it.v;
    if (v === null || typeof v !== 'object') {
      if (it.elem && typeof v === 'string' && v.trim() !== '') return 'noms';   // entrée d'alignement réduite à un texte (un nom brut)
      continue;
    }
    if (it.prof > 40) return 'champ:match';
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) pile.push({ v: v[i], prof: it.prof + 1, roster: it.roster, elem: it.roster });
      continue;
    }
    var cles = Object.keys(v);
    for (var j = 0; j < cles.length; j++) {
      var k = cles[j], val = v[k];
      if (cleEstNomDeJoueur(k) && valeurNonVide(val)) return 'noms';
      if (it.roster && k === 'name' && valeurNonVide(val)) return 'noms';
      pile.push({ v: val, prof: it.prof + 1, roster: it.roster || k === 'rosters', elem: false });
    }
  }
  return null;
}

/* ---------- Lecture et contrôle de l'enveloppe ---------- */

var RE_INSTALL = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,79}$/;     // 80 caractères au plus, commence par une lettre/chiffre/_
var RE_MATCH_ID = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}$/;     // sert aussi de nom de fichier : rien d'autre qu'un identifiant simple
var RE_VERSION = /^[A-Za-z0-9_][A-Za-z0-9_.+ -]{0,39}$/;
var RE_DATE = /^[0-9][0-9TZ:.+ -]{0,39}$/;
var RE_FORMAT = /^[A-Za-z0-9_-]{1,30}$/;
var CLES_ENVELOPPE = { schema: 1, appVersion: 1, installId: 1, sentAt: 1, consent: 1, match: 1 };
var MAX_ACTIONS = 100000;

function refus(raison) { return { ok: false, raison: raison }; }
function estObjetSimple(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

/* Contrôle COMPLET d'un envoi brut (texte du corps).
   Succès : {ok:true, sorte:'version'|'suppression'|'retrait', installId, appVersion, sentAt,
             matchId, matchTexte, empreinte, taille, nbActions, format}
   Échec : {ok:false, raison}. Ne touche à aucun service. */
function analyserEnvoi(brut) {
  if (typeof brut !== 'string') return refus('json');
  if (longueurUtf8(brut) > TAILLE_MAX_OCTETS) return refus('taille');
  var env;
  try { env = JSON.parse(brut); } catch (e) { return refus('json'); }
  if (!estObjetSimple(env)) return refus('json');
  if (env.schema !== SCHEMA) return refus('schema');
  var cles = Object.keys(env);
  for (var i = 0; i < cles.length; i++) if (!CLES_ENVELOPPE[cles[i]]) return refus('champ:' + cles[i].slice(0, 30).replace(/[^A-Za-z0-9_]/g, '?'));
  if (typeof env.installId !== 'string' || !RE_INSTALL.test(env.installId)) return refus('champ:installId');
  if (typeof env.appVersion !== 'string' || !RE_VERSION.test(env.appVersion)) return refus('champ:appVersion');
  var sa = env.sentAt;
  if (!((typeof sa === 'number' && isFinite(sa) && sa >= 0) || (typeof sa === 'string' && RE_DATE.test(sa)))) return refus('champ:sentAt');
  if (typeof env.consent !== 'boolean') return refus('champ:consent');

  var base = { ok: true, installId: env.installId, appVersion: env.appVersion, sentAt: sa };

  if (env.consent === false) {                       // retrait : aucun match permis
    if (env.match !== null) return refus('consentement');
    base.sorte = 'retrait'; base.matchId = ''; base.matchTexte = ''; base.empreinte = ''; base.taille = 0; base.nbActions = 0; base.format = '';
    return base;
  }
  var m = env.match;
  if (!estObjetSimple(m)) return refus('champ:match');
  if (typeof m.id !== 'string' || !RE_MATCH_ID.test(m.id)) return refus('champ:match.id');

  if (m.deleted === true) {                          // marque de suppression : trois champs, pas un de plus
    var ck = Object.keys(m);
    for (var j = 0; j < ck.length; j++) if (ck[j] !== 'id' && ck[j] !== 'deleted' && ck[j] !== 'deletedAt') return refus('champ:match.' + ck[j].slice(0, 30).replace(/[^A-Za-z0-9_]/g, '?'));
    if (!(typeof m.deletedAt === 'number' && isFinite(m.deletedAt) && m.deletedAt >= 0)) return refus('champ:match.deletedAt');
    base.sorte = 'suppression'; base.nbActions = 0; base.format = '';
  } else {
    if (m.status !== 'completed') return refus('champ:match.status');
    if (!Array.isArray(m.history)) return refus('champ:match.history');
    if (m.history.length > MAX_ACTIONS) return refus('champ:match.history');
    var noms = controlerNoms(m);
    if (noms) return refus(noms);
    base.sorte = 'version'; base.nbActions = m.history.length;
    var f = m.format && typeof m.format === 'object' ? m.format.id : '';
    base.format = (typeof f === 'string' && RE_FORMAT.test(f)) ? f : '';
  }
  base.matchId = m.id;
  base.matchTexte = JSON.stringify(m);
  base.empreinte = sha256Hex(base.matchTexte);
  base.taille = longueurUtf8(base.matchTexte);
  return base;
}

/* ---------- Clés, noms, lignes ---------- */

function cleVersion(matchId, empreinte) { return matchId + '|' + empreinte; }
function nomFichier(matchId, empreinte) { return matchId + '__' + empreinte.slice(0, 12) + '.json'; }

/* « AAAA-MM-JJ » (UTC) d'une cellule : texte ISO ou objet Date selon ce que la feuille a rendu. */
function jourDe(v) {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

var EN_TETES_VERSIONS = ['reçu le', 'sorte', 'installId', 'matchId', 'empreinte', 'nombre d\'actions', 'format', 'appVersion', 'sentAt', 'taille', 'fichier Drive'];
var EN_TETES_RETRAITS = ['reçu le', 'installId', 'sentAt', 'traité'];

function fabriquerLigneVersion(a, recuLeIso, fichierId) {
  return [recuLeIso, a.sorte, a.installId, a.matchId, a.empreinte, a.nbActions, a.format, a.appVersion, a.sentAt, a.taille, fichierId || ''];
}
function fabriquerLigneRetrait(a, recuLeIso) { return [recuLeIso, a.installId, a.sentAt, '']; }

/* ---------- Décision ----------
   etat (rassemblé par Code.gs, sous verrou) :
     cleExiste : cette version (id + empreinte) est déjà dans la feuille « versions »
     retraitEnAttente : cet installId a déjà un retrait non traité
     installJour, totalJour, octetsJour : envois acceptés aujourd'hui (versions + suppressions)
     retraitsInstallJour, retraitsTotalJour : retraits notés aujourd'hui
   Résultat : {statut, raison, ecrire}. */
function decider(a, etat) {
  if (a.sorte === 'retrait') {
    if (etat.retraitEnAttente) return { statut: 'deja_recu', raison: null, ecrire: false };
    if (etat.retraitsInstallJour >= PLAFONDS.retraitsParInstallParJour || etat.retraitsTotalJour >= PLAFONDS.retraitsTotalParJour) return { statut: 'refuse', raison: 'quota', ecrire: false };
    return { statut: 'retrait_note', raison: null, ecrire: true };
  }
  if (etat.cleExiste) return { statut: 'deja_recu', raison: null, ecrire: false };
  if (etat.installJour >= PLAFONDS.versionsParInstallParJour || etat.totalJour >= PLAFONDS.versionsTotalParJour || etat.octetsJour + a.taille > PLAFONDS.octetsParJour) {
    return { statut: 'refuse', raison: 'quota', ecrire: false };
  }
  return { statut: a.sorte === 'suppression' ? 'suppression_notee' : 'recu', raison: null, ecrire: true };
}

if (typeof module !== 'undefined') {
  module.exports = {
    SCHEMA: SCHEMA, TAILLE_MAX_OCTETS: TAILLE_MAX_OCTETS, PLAFONDS: PLAFONDS, longueurUtf8: longueurUtf8, octetsUtf8: octetsUtf8,
    sha256Hex: sha256Hex, fabriquerReponse: fabriquerReponse, valeurNonVide: valeurNonVide, controlerNoms: controlerNoms,
    analyserEnvoi: analyserEnvoi, cleVersion: cleVersion, nomFichier: nomFichier, jourDe: jourDe,
    EN_TETES_VERSIONS: EN_TETES_VERSIONS, EN_TETES_RETRAITS: EN_TETES_RETRAITS,
    fabriquerLigneVersion: fabriquerLigneVersion, fabriquerLigneRetrait: fabriquerLigneRetrait, decider: decider
  };
}
