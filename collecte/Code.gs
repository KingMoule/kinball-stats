/* Code.gs — serveur de collecte Kin-Ball Stats (Google Apps Script, application web).
   Seul fichier qui parle à Google ; toute la logique de décision est dans Logique.gs.

   RÈGLE ABSOLUE : AJOUT SEUL. Ce script n'appelle jamais rien qui efface, vide, remplace
   ou met à la corbeille (ni deleteRow, ni clear, ni setTrashed, ni setContent, ni setValue(s)
   sur du contenu existant). Il ajoute des lignes (appendRow) et crée des fichiers (createFile).

   Mise en place : voir MODE-D-EMPLOI.md (coller Logique.gs et Code.gs, lancer installer()
   une fois, déployer en application web). */

var NOM_FEUILLE_VERSIONS = 'versions';
var NOM_FEUILLE_RETRAITS = 'retraits';
var NOM_DOSSIER = 'kinball-collecte-json';
var PROP_CLASSEUR = 'CLASSEUR_ID';
var PROP_DOSSIER = 'DOSSIER_ID';
var ATTENTE_VERROU_MS = 20000;
var LIGNES_RELUES_PAR_JOUR = 2100;     // > plafond quotidien : les envois du jour sont toujours parmi les dernières lignes

/* ---------- Mise en place (à lancer une fois, à la main ; sans danger si relancée) ---------- */
function installer() {
  var props = PropertiesService.getScriptProperties();
  var ss = null;
  var idClasseur = props.getProperty(PROP_CLASSEUR);
  if (idClasseur) { try { ss = SpreadsheetApp.openById(idClasseur); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) throw new Error('Ce script doit être créé depuis un classeur (Extensions > Apps Script).');
    props.setProperty(PROP_CLASSEUR, ss.getId());
  }
  preparerFeuille_(ss, NOM_FEUILLE_VERSIONS, EN_TETES_VERSIONS);
  preparerFeuille_(ss, NOM_FEUILLE_RETRAITS, EN_TETES_RETRAITS);

  var dossier = null;
  var idDossier = props.getProperty(PROP_DOSSIER);
  if (idDossier) { try { dossier = DriveApp.getFolderById(idDossier); } catch (e) { dossier = null; } }
  if (!dossier) {
    dossier = DriveApp.createFolder(NOM_DOSSIER);
    props.setProperty(PROP_DOSSIER, dossier.getId());
  }
  return 'Installation terminée. Classeur : ' + ss.getId() + ' ; dossier : ' + dossier.getId();
}

function preparerFeuille_(ss, nom, enTetes) {
  var feuille = ss.getSheetByName(nom);
  if (!feuille) feuille = ss.insertSheet(nom);
  if (feuille.getLastRow() === 0) feuille.appendRow(enTetes);     // en-têtes seulement si la feuille est vide
  // Colonnes en texte brut : une date, un identifiant ou une empreinte ne sont jamais « interprétés » par la feuille.
  feuille.getRange(1, 1, feuille.getMaxRows(), enTetes.length).setNumberFormat('@');
  return feuille;
}

/* ---------- Points d'entrée de l'application web ---------- */
function doGet(e) {
  return sortieJson_({ ok: true, service: 'kinball-collecte', schema: SCHEMA });
}

function doPost(e) {
  try {
    var brut = (e && e.postData && typeof e.postData.contents === 'string') ? e.postData.contents : null;
    var a = analyserEnvoi(brut);
    if (!a.ok) return sortieJson_(fabriquerReponse('refuse', a.raison));

    var verrou = LockService.getScriptLock();
    if (!verrou.tryLock(ATTENTE_VERROU_MS)) return sortieJson_(fabriquerReponse('refuse', 'occupe'));
    var reponse;
    try {
      reponse = traiterEnvoi_(a);
    } finally {
      try { verrou.releaseLock(); } catch (e2) { /* le verrou expire de lui-même */ }
    }
    return sortieJson_(reponse);
  } catch (err) {
    return sortieJson_(fabriquerReponse('refuse', 'occupe'));    // jamais de page d'erreur HTML
  }
}

function sortieJson_(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- Traitement d'un envoi (toujours sous verrou) ---------- */
function maintenant_() { return new Date(); }

function traiterEnvoi_(a) {
  var props = PropertiesService.getScriptProperties();
  var ss = SpreadsheetApp.openById(props.getProperty(PROP_CLASSEUR));
  var feuilleV = ss.getSheetByName(NOM_FEUILLE_VERSIONS);
  var feuilleR = ss.getSheetByName(NOM_FEUILLE_RETRAITS);
  if (!feuilleV || !feuilleR) throw new Error('installer() n\'a pas été lancée');
  var maintenant = maintenant_();
  var recuLe = maintenant.toISOString();
  var jour = recuLe.slice(0, 10);

  var etat = lireEtat_(feuilleV, feuilleR, a, jour);
  var decision = decider(a, etat);
  if (!decision.ecrire) return fabriquerReponse(decision.statut, decision.raison);

  if (a.sorte === 'retrait') {
    feuilleR.appendRow(fabriquerLigneRetrait(a, recuLe));
    return fabriquerReponse(decision.statut, null);
  }
  var fichierId = '';
  if (a.sorte === 'version') {
    var dossier = DriveApp.getFolderById(props.getProperty(PROP_DOSSIER));
    var nom = nomFichier(a.matchId, a.empreinte);
    var existants = dossier.getFilesByName(nom);          // reprise après une panne entre fichier et ligne : on ne crée pas de doublon
    fichierId = existants.hasNext() ? existants.next().getId() : dossier.createFile(nom, a.matchTexte, 'application/json').getId();
  }
  feuilleV.appendRow(fabriquerLigneVersion(a, recuLe, fichierId));   // la ligne est l'acte qui « valide » l'envoi
  return fabriquerReponse(decision.statut, null);
}

/* Lit les feuilles (sans rien modifier) et rassemble ce dont decider() a besoin. */
function lireEtat_(feuilleV, feuilleR, a, jour) {
  var etat = { cleExiste: false, retraitEnAttente: false, installJour: 0, totalJour: 0, octetsJour: 0, retraitsInstallJour: 0, retraitsTotalJour: 0 };

  if (a.sorte === 'retrait') {
    var nR = feuilleR.getLastRow() - 1;
    if (nR > 0) {
      var debutR = Math.max(2, feuilleR.getLastRow() - 999);
      var lignesR = feuilleR.getRange(debutR, 1, feuilleR.getLastRow() - debutR + 1, 4).getValues();
      for (var i = 0; i < lignesR.length; i++) {
        var l = lignesR[i];
        if (String(l[1]) === a.installId && String(l[3]).trim() === '') etat.retraitEnAttente = true;
        if (jourDe(l[0]) === jour) { etat.retraitsTotalJour++; if (String(l[1]) === a.installId) etat.retraitsInstallJour++; }
      }
    }
    return etat;
  }

  var n = feuilleV.getLastRow() - 1;                       // lignes de données (hors en-têtes)
  if (n <= 0) return etat;
  var cle = cleVersion(a.matchId, a.empreinte);
  var cles = feuilleV.getRange(2, 4, n, 2).getValues();    // colonnes D (matchId) et E (empreinte)
  for (var j = 0; j < cles.length; j++) {
    if (cleVersion(String(cles[j][0]), String(cles[j][1])) === cle) { etat.cleExiste = true; return etat; }
  }
  var debut = Math.max(2, feuilleV.getLastRow() - LIGNES_RELUES_PAR_JOUR + 1);
  var recentes = feuilleV.getRange(debut, 1, feuilleV.getLastRow() - debut + 1, 10).getValues();
  for (var k = 0; k < recentes.length; k++) {
    var r = recentes[k];
    if (jourDe(r[0]) !== jour) continue;
    etat.totalJour++;
    etat.octetsJour += Number(r[9]) || 0;
    if (String(r[2]) === a.installId) etat.installJour++;
  }
  return etat;
}
