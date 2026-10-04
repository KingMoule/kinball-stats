/* kbsite.js — ajouts propres au site Kin-Ball Stats (chargé APRÈS le script de l'app).
   M03 : demande de stockage persistant, ligne d'état dans l'écran Sauvegarde,
   carte « Archiver les vieux matchs » masquée.
   Ne fait rien si la façade locale (KBLocal) est absente ou si l'app tourne dans
   claude.ai (window.claude). N'écrit jamais dans S, TEAMS_DB, MATCHES_DB et ne
   redéfinit aucune fonction de l'app. Script classique, sans dépendance réseau. */
(function (global) {
  'use strict';
  if (!global.KBLocal || global.claude) return;
  var KB = global.KBLocal;

  /* ---------- Stockage persistant ---------- */
  var persistDemandeAuLancement = false;
  function demanderPersistance() {
    try { KB.storage.requestPersist().then(rafraichirEtat, function () {}); } catch (e) {}
  }
  demanderPersistance();   // au démarrage
  /* Au premier lancement de match de la session : on écoute le geste (capture,
     sans toucher à startMatch) ; le geste de la personne aide certains navigateurs. */
  document.addEventListener('click', function (ev) {
    if (persistDemandeAuLancement) return;
    var t = ev.target && ev.target.closest ? ev.target.closest('[onclick^="startMatch("]') : null;
    if (!t) return;
    persistDemandeAuLancement = true;
    demanderPersistance();
  }, true);

  /* ---------- Ligne d'état dans l'écran Sauvegarde ---------- */
  function octets(n) {
    if (n < 1024 * 1024) return Math.max(1, Math.round(n / 1024)).toLocaleString('fr-CA') + ' Ko';
    return (n / (1024 * 1024)).toLocaleString('fr-CA', { maximumFractionDigits: 1 }) + ' Mo';
  }
  function ligneEtat() {
    var ligne = document.getElementById('kbStorageStatus');
    if (ligne) return ligne;
    var info = document.getElementById('storageInfo');
    if (!info || !info.parentNode) return null;
    ligne = document.createElement('div');
    ligne.id = 'kbStorageStatus';
    ligne.className = 'section-sub';
    ligne.style.marginBottom = '14px';
    info.parentNode.insertBefore(ligne, info.nextSibling);
    return ligne;
  }
  function rafraichirEtat() {
    var ligne = ligneEtat();
    if (!ligne) return;
    KB.storage.status().then(function (st) {
      var txt = 'Stockage protégé contre l’effacement automatique : '
        + (st.persisted === true ? 'oui' : 'non');
      if (st.usage !== null) txt += ' · espace utilisé : ' + octets(st.usage);
      ligne.textContent = txt;
    }, function () {});
  }

  /* ---------- Carte « Archiver les vieux matchs » ---------- */
  function masquerArchivage() {
    var cartes = document.querySelectorAll('.backup-card');
    for (var i = 0; i < cartes.length; i++) {
      if (cartes[i].querySelector('[onclick^="startArchiveOldMatches("]')) cartes[i].style.display = 'none';
    }
  }
  masquerArchivage();

  /* Rafraîchir à l'entrée dans l'écran (showOnly bascule son style.display). */
  var ecran = document.getElementById('backup');
  if (ecran && global.MutationObserver) {
    var visible = ecran.style.display === 'flex';
    new MutationObserver(function () {
      var v = ecran.style.display === 'flex';
      if (v && !visible) rafraichirEtat();
      visible = v;
    }).observe(ecran, { attributes: true, attributeFilter: ['style'] });
  }
  rafraichirEtat();
})(typeof self !== 'undefined' ? self : this);
