/* kbsite.js — ajouts propres au site Kin-Ball Stats (chargé APRÈS le script de l'app).
   M03 : demande de stockage persistant, ligne d'état dans l'écran Sauvegarde,
   carte « Archiver les vieux matchs » masquée (ces trois points seulement si la
   façade locale KBLocal est présente et si l'app ne tourne pas dans claude.ai).
   M04 : service worker, mise à jour sur accord, ligne de version, incitation à
   installer (espace de noms window.KBSite).
   M05 : feuille « FICHIER PRÊT » (second geste du partage de fichiers, voir
   KBLocal.downloads.surSecondGeste dans kblocal.js).
   N'écrit jamais dans S, TEAMS_DB, MATCHES_DB et ne redéfinit aucune fonction de
   l'app. Script classique, sans dépendance réseau. */
(function (global) {
  'use strict';
  var KBSite = global.KBSite = global.KBSite || {};
  var KB = global.KBLocal;
  var stockageActif = !!KB && !global.claude;

  /* ================= M03 : stockage ================= */
  function initStockage() {

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
  }
  if (stockageActif) initStockage();

  /* ================= M04 : version, service worker, cartes ================= */
  /* Écrites par outils/check-release.mjs --ecrire ; ne pas modifier à la main. */
  /* VERSION:DEBUT */
  var VERSION_SITE = '2026-10-04.3';
  var VERSION_AMONT = 'cce95ad2';
  /* VERSION:FIN */
  KBSite.version = { site: VERSION_SITE, amont: VERSION_AMONT };

  function ecranCourant() { return document.documentElement.dataset.screen || ''; }
  function sansTravailNonEnregistre() {
    /* hasUnsavedWork est une fonction de l'app (globale de premier niveau) */
    try { return !(typeof hasUnsavedWork === 'function' && hasUnsavedWork()); } catch (e) { return true; }
  }
  function el(tag, attrs, texte) {
    var n = document.createElement(tag), k;
    for (k in (attrs || {})) n.setAttribute(k, attrs[k]);
    if (texte != null) n.textContent = texte;
    return n;
  }

  /* ---------- Styles (une seule balise) ---------- */
  function poserStyle() {
    if (document.getElementById('kbsite-style')) return;
    var st = el('style', { id: 'kbsite-style' });
    st.textContent =
      '#kbAccueil{width:min(880px,94vw);display:flex;flex-direction:column;gap:12px;margin-bottom:14px;text-align:left}' +
      '#kbAccueil:empty{display:none}' +
      '.kb-carte{background:var(--surface2);border:1px solid var(--bleu);border-radius:14px;padding:14px 16px}' +
      '.kb-carte-titre{font-size:15px;font-weight:700;color:var(--bleu-ink);margin-bottom:4px}' +
      '.kb-carte-texte{font-size:13px;color:var(--dim);line-height:1.45}' +
      '.kb-carte-msg{font-size:13px;color:var(--red);margin-top:8px}' +
      '.kb-carte-actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}' +
      '.kb-btn{min-height:44px;padding:0 18px;border-radius:10px;border:1px solid var(--line);background:var(--surface);color:var(--ink);font:inherit;font-size:14px;font-weight:700;letter-spacing:.04em;cursor:pointer}' +
      '.kb-btn.kb-principal{background:var(--bleu);border-color:var(--bleu);color:#fff}' +
      '#kbSauvegarde{margin:-4px 0 14px}' +
      '.phone #kbAccueil{width:100%}' +
      '.phone .kb-carte{padding:10px 12px}' +
      '.phone .kb-carte-texte{font-size:12px;line-height:1.35}' +
      '.phone .kb-carte-actions{margin-top:8px}' +
      '.phone .kb-btn{min-height:44px;padding:0 14px;font-size:13px}';
    document.head.appendChild(st);
  }

  /* ---------- Conteneurs ---------- */
  function conteneurAccueil() {
    var c = document.getElementById('kbAccueil');
    if (c) return c;
    var wrap = document.querySelector('#home .home-wrap');
    if (!wrap || !wrap.parentNode) return null;
    c = el('div', { id: 'kbAccueil' });
    wrap.parentNode.insertBefore(c, wrap);
    return c;
  }
  function conteneurSauvegarde() {
    var c = document.getElementById('kbSauvegarde');
    if (c) return c;
    var info = document.getElementById('storageInfo');
    if (!info || !info.parentNode) return null;
    c = el('div', { id: 'kbSauvegarde' });
    /* après la ligne d'état du stockage (M03) si elle existe, sinon après #storageInfo */
    var apres = document.getElementById('kbStorageStatus') || info;
    apres.parentNode.insertBefore(c, apres.nextSibling);
    return c;
  }
  /* Pose (ou remplace) la carte d'identifiant `id` ; `ordre` plus petit = plus haut. */
  function poserCarte(id, ordre, noeud) {
    var c = conteneurAccueil();
    if (!c) return;
    retirerCarte(id);
    noeud.id = id;
    noeud.setAttribute('data-ordre', String(ordre));
    var suiv = null, i, f = c.children;
    for (i = 0; i < f.length; i++) { if (Number(f[i].getAttribute('data-ordre')) > ordre) { suiv = f[i]; break; } }
    c.insertBefore(noeud, suiv);
  }
  function retirerCarte(id) {
    var n = document.getElementById(id);
    if (n && n.parentNode) n.parentNode.removeChild(n);
  }
  KBSite.poserCarte = poserCarte;       // pour les chantiers suivants
  KBSite.retirerCarte = retirerCarte;

  /* ---------- Ligne de version (dans tous les modes, file:// compris) ---------- */
  function ligneVersion() {
    var c = conteneurSauvegarde();
    if (!c) return;
    c.className = 'section-sub';
    c.textContent = 'Version ' + VERSION_SITE + ' · app amont ' + VERSION_AMONT;
  }

  /* ---------- Service worker ---------- */
  var h = global.location ? global.location.hostname : '';
  var peutEnregistrer = !!(global.navigator && 'serviceWorker' in global.navigator && !global.claude
    && (global.location.protocol === 'https:' || (global.location.protocol === 'http:' && (h === 'localhost' || h === '127.0.0.1'))));
  KBSite.peutEnregistrer = peutEnregistrer;

  var registration = null;
  var avaitControleur = !!(peutEnregistrer && navigator.serviceWorker.controller);
  var derniereRecherche = 0;           // horodatage de la dernière recherche partie
  var rechercheReportee = null;        // recherche demandée pendant un match : null, 'normale' ou 'forcee'
  var majPlusTard = false;             // « Plus tard » : rien jusqu'au prochain lancement
  var ordreDonne = false;              // CETTE page a demandé l'activation
  var rechargee = false;

  function verifierMiseAJour(opts) {
    var forcer = !!(opts && opts.forcer);
    if (!registration) return Promise.resolve(false);
    if (ecranCourant() === 'match') { if (forcer || !rechercheReportee) rechercheReportee = forcer ? 'forcee' : 'normale'; return Promise.resolve(false); }
    var now = Date.now();
    if (!forcer && derniereRecherche && now - derniereRecherche < 3600000) return Promise.resolve(false);
    derniereRecherche = now;
    rechercheReportee = null;
    return registration.update().then(function () { return true; }, function () { return false; });
  }
  KBSite.verifierMiseAJour = verifierMiseAJour;

  function carteMiseAJour() {
    var carte = el('div', { 'class': 'kb-carte' });
    carte.appendChild(el('div', { 'class': 'kb-carte-titre' }, 'Mise à jour prête'));
    carte.appendChild(el('div', { 'class': 'kb-carte-texte' }, 'Une nouvelle version de l’app est prête. L’app se rechargera ; vos matchs sont conservés.'));
    var msg = el('div', { 'class': 'kb-carte-msg', id: 'kbMajMsg', role: 'status' });
    carte.appendChild(msg);
    var act = el('div', { 'class': 'kb-carte-actions' });
    var ok = el('button', { type: 'button', 'class': 'kb-btn kb-principal', id: 'kbMajBtn' }, 'METTRE À JOUR');
    ok.addEventListener('click', function () {
      if (!sansTravailNonEnregistre()) { msg.textContent = 'Enregistrement en cours, réessayez dans un instant.'; return; }
      if (ecranCourant() === 'match') return;   // jamais d'activation pendant un match
      var w = registration && registration.waiting;
      if (!w) { retirerCarte('kbCarteMaj'); return; }
      msg.textContent = '';
      ordreDonne = true;
      w.postMessage({ type: 'ACTIVER' });
    });
    var plus = el('button', { type: 'button', 'class': 'kb-btn', id: 'kbMajPlusTard' }, 'Plus tard');
    plus.addEventListener('click', function () { majPlusTard = true; retirerCarte('kbCarteMaj'); });
    act.appendChild(ok); act.appendChild(plus);
    carte.appendChild(act);
    return carte;
  }
  function afficherMiseAJour() {
    if (majPlusTard || !avaitControleur) return;
    if (!registration || !registration.waiting) return;
    if (!document.getElementById('kbCarteMaj')) poserCarte('kbCarteMaj', 10, carteMiseAJour());
  }
  function surveiller(reg) {
    afficherMiseAJour();
    reg.addEventListener('updatefound', function () {
      var w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', function () {
        if (w.state === 'installed' && navigator.serviceWorker.controller) afficherMiseAJour();
      });
    });
  }
  function enregistrer() {
    if (!peutEnregistrer) return;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      /* un seul rechargement, seulement dans la page qui l'a demandé, jamais pendant un match */
      if (!ordreDonne || !avaitControleur || rechargee || ecranCourant() === 'match') return;
      rechargee = true;
      global.location.reload();
    });
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(function (reg) {
      registration = reg;
      surveiller(reg);
      verifierMiseAJour();   // au lancement
    }, function () {});
  }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') verifierMiseAJour();
  });

  /* ---------- Incitation à installer ---------- */
  var installRefusee = null;            // null = pas encore lu
  var invite = null;                    // événement beforeinstallprompt retenu
  function modeInstalle() {
    try {
      if (global.matchMedia && global.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (e) {}
    return global.navigator.standalone === true;
  }
  function majInstallation() {
    if (!peutEnregistrer || installRefusee !== false || modeInstalle()) { retirerCarte('kbCarteInstall'); return; }
    var ios = 'standalone' in global.navigator;
    if (!ios && !invite) { retirerCarte('kbCarteInstall'); return; }
    if (document.getElementById('kbCarteInstall')) return;
    var carte = el('div', { 'class': 'kb-carte' });
    carte.appendChild(el('div', { 'class': 'kb-carte-titre' }, 'Installer l’app'));
    carte.appendChild(el('div', { 'class': 'kb-carte-texte' }, ios
      ? 'Pour l’installer : Partager → Sur l’écran d’accueil. Elle s’ouvrira alors plein écran, même sans réseau.'
      : 'Installe l’app sur cet appareil : elle s’ouvrira plein écran, même sans réseau.'));
    carte.appendChild(el('div', { 'class': 'kb-carte-texte', style: 'margin-top:6px' },
      'Les données de Safari et celles de l’app installée sont séparées : installe d’abord, saisis ensuite.'));
    var act = el('div', { 'class': 'kb-carte-actions' });
    if (!ios) {
      var b = el('button', { type: 'button', 'class': 'kb-btn kb-principal', id: 'kbInstallBtn' }, 'INSTALLER');
      b.addEventListener('click', function () {
        var ev = invite;
        if (!ev) return;
        invite = null;
        try { ev.prompt(); } catch (e) {}
        retirerCarte('kbCarteInstall');
      });
      act.appendChild(b);
    }
    var f = el('button', { type: 'button', 'class': 'kb-btn', id: 'kbInstallFermer' }, 'Fermer');
    f.addEventListener('click', function () {
      installRefusee = true;
      try { if (KB && KB.meta) KB.meta.set('site.installRefusee', true).then(null, function () {}); } catch (e) {}
      retirerCarte('kbCarteInstall');
    });
    act.appendChild(f);
    carte.appendChild(act);
    poserCarte('kbCarteInstall', 90, carte);
  }
  global.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();
    invite = ev;
    majInstallation();
  });
  global.addEventListener('appinstalled', function () { invite = null; retirerCarte('kbCarteInstall'); });

  /* ================= M05 : feuille « FICHIER PRÊT » ================= */
  /* La façade (kblocal.js) appelle fn({filename, relancer}) quand iOS a refusé le
     partage faute de geste récent. On ouvre la feuille de l'app (NON fermable par
     un appui à côté : la promesse doit toujours aboutir) ; l'appui sur le bouton
     est le nouveau geste, dans lequel relancer() refait le partage.
     Promesse rendue : résolue = fichier remis ; rejetée {code:'declined'} = ANNULER ;
     rejetée autrement = la façade passe au lien de téléchargement. */
  var fichierPret = null;      // {ctx, resolve, reject, enCours, veille}
  function echapper(t) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(t);
    return String(t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function finFichierPret() {
    var f = fichierPret;
    fichierPret = null;
    if (f && f.veille) { try { f.veille.disconnect(); } catch (e) {} }
    return f;
  }
  KBSite.fichierPartager = function () {
    var f = fichierPret;
    if (!f || f.enCours) return;
    f.enCours = true;
    var b = document.getElementById('kbFichierPartager');
    if (b) b.disabled = true;
    var p;
    /* relancer() est appelé ICI, de façon synchrone : c'est le geste de la personne. */
    try { p = f.ctx.relancer(); } catch (e) { p = Promise.reject(e); }
    Promise.resolve(p).then(function () {
      finFichierPret(); try { closeSheet(); } catch (e) {} f.resolve();
    }, function (e) {
      finFichierPret(); try { closeSheet(); } catch (e2) {} f.reject(e);
    });
  };
  KBSite.fichierAnnuler = function () {
    var f = fichierPret;
    if (!f || f.enCours) return;
    finFichierPret();
    try { closeSheet(); } catch (e) {}
    var e = new Error('Enregistrement annulé');
    e.code = 'declined';
    f.reject(e);
  };
  function feuilleFichierPret(ctx) {
    if (typeof global.openSheet !== 'function') return Promise.reject(new Error('feuille indisponible'));
    if (fichierPret) return Promise.reject(new Error('feuille déjà ouverte'));
    return new Promise(function (resolve, reject) {
      var f = fichierPret = { ctx: ctx, resolve: resolve, reject: reject, enCours: false, veille: null };
      global.openSheet(
        '<div id="kbFichierPret">' +
        '<div class="sheet-title">FICHIER PRÊT</div>' +
        '<div class="msg-center" style="font-size:15px; padding:6px 0 14px; word-break:break-word">' + echapper(ctx.filename) + '</div>' +
        '<button id="kbFichierPartager" class="choice-btn" style="background:var(--bleu); font-size:15px; width:100%" onclick="KBSite.fichierPartager()">ENREGISTRER / PARTAGER</button>' +
        '<button class="ghost-btn" style="width:100%; margin-top:8px" onclick="KBSite.fichierAnnuler()">ANNULER</button>' +
        '</div>', false);
      /* Si un autre code remplace la feuille, on ne laisse pas l'export en suspens :
         issue autre que « declined » -> la façade livre le fichier par téléchargement. */
      var feuille = document.getElementById('sheet');
      if (feuille && global.MutationObserver) {
        f.veille = new MutationObserver(function () {
          if (fichierPret === f && !document.getElementById('kbFichierPret')) {
            finFichierPret();
            reject(new Error('feuille remplacée'));
          }
        });
        f.veille.observe(feuille, { childList: true });
      }
    });
  }
  if (KB && KB.downloads && typeof KB.downloads.surSecondGeste === 'function' && !global.claude) {
    KB.downloads.surSecondGeste(feuilleFichierPret);
  }

  /* ---------- Suivi de l'écran (sans rien envelopper dans l'app) ---------- */
  var ecranPrecedent = null;
  function surEcran() {
    var e = ecranCourant();
    if (e === ecranPrecedent) return;
    ecranPrecedent = e;
    if (e === 'home') {
      majInstallation();
      afficherMiseAJour();
      if (rechercheReportee) verifierMiseAJour({ forcer: rechercheReportee === 'forcee' });
    }
    if (e === 'backup') { ligneVersion(); }
  }

  function demarrer() {
    poserStyle();
    ligneVersion();
    new MutationObserver(surEcran).observe(document.documentElement, { attributes: true, attributeFilter: ['data-screen'] });
    surEcran();     // navHome() a déjà tourné : lecture initiale
    enregistrer();
    if (peutEnregistrer) {
      var lu = false;
      var fin = function (v) { if (lu) return; lu = true; installRefusee = v === true; majInstallation(); };
      try { if (KB && KB.meta) KB.meta.get('site.installRefusee').then(fin, function () { fin(false); }); else fin(false); }
      catch (e) { fin(false); }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})(typeof self !== 'undefined' ? self : this);
