/* kbsite.js — ajouts propres au site Kin-Ball Stats (chargé APRÈS le script de l'app).
   M03 : demande de stockage persistant, ligne d'état dans l'écran Sauvegarde,
   carte « Archiver les vieux matchs » masquée (ces trois points seulement si la
   façade locale KBLocal est présente et si l'app ne tourne pas dans claude.ai).
   M04 : service worker, mise à jour sur accord, ligne de version, incitation à
   installer (espace de noms window.KBSite).
   M06 : sauvegarde v2, import sans écrasement, identité, premier lancement, rappel.
   M08 : chargement de config.js puis de kbcollect.js (collecte facultative, inerte sans
   adresse ni contact configurés).
   M05 : feuille « FICHIER PRÊT » (second geste du partage de fichiers, voir
   KBLocal.downloads.surSecondGeste dans kblocal.js).
   N'écrit jamais dans S, TEAMS_DB, MATCHES_DB et ne redéfinit aucune fonction de
   l'app. Script classique, sans dépendance réseau. */
(function (global) {
  'use strict';
  var KBSite = global.KBSite = global.KBSite || {};
  var KB = global.KBLocal;
  var stockageActif = !!KB && !global.claude;
  KBSite.local = stockageActif;   // M11 : textes propres au mode local (lus par index.html)

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
  /* M11 : textes de l'accueil et de la carte d'archivage masquée, sans « en ligne » ni « archiver » (mode local seulement). */
  (function () {
    var sub = document.querySelector('[onclick="openBackup()"] .hc-sub');
    if (sub && /archiver/.test(sub.textContent)) sub.textContent = 'Exporter, importer';
    var carte = document.querySelector('.backup-card [onclick^="startArchiveOldMatches("]');
    carte = carte && carte.closest('.backup-card');
    var t = carte && carte.querySelector('.bc-sub');
    if (t && t.firstChild && t.firstChild.nodeType === 3 && /en ligne/.test(t.firstChild.nodeValue)) {
      t.firstChild.nodeValue = 'Cette action exporte d’abord les matchs TERMINÉS de plus de ';
      var fin = t.lastChild;
      if (fin && fin.nodeType === 3) fin.nodeValue = ' jours dans un fichier, puis les retire de cet appareil — ils restent consultables via ce fichier.';
    }
  })();

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
  var VERSION_SITE = '2026-10-04.10';
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
      : 'Installez l’app sur cet appareil : elle s’ouvrira plein écran, même sans réseau.'));
    carte.appendChild(el('div', { 'class': 'kb-carte-texte', style: 'margin-top:6px' },
      'Les données de Safari et celles de l’app installée sont séparées : installez d’abord, saisissez ensuite.'));
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

  /* ================= M06 : sauvegarde v2, import sans écrasement, premier lancement, rappel ================= */
  /* Tout ce bloc n'agit que si la façade locale est là et si l'app ne tourne pas dans
     claude.ai (comme M03). Lit TEAMS_DB, MATCHES_DB, DELETED_MATCHES, S sans jamais y écrire. */
  var RE_IDENTITE = /^u_[0-9A-Za-z-]{8,64}$/;
  var JOUR_MS = 86400000;
  var userApi = null;                     // capacité « user » de la façade (identité tenue en mémoire)
  var dbApi = null;                       // capacité « db » de la façade
  var metaCharge = false;
  var derniereSauv = null;                // {at, termines, ids} ou null (jamais)
  var premierUsage = 0;
  var rappelPlusTard = 0;                 // horodatage jusqu'auquel « Plus tard » tient
  var accueilFerme = false;               // « Plus tard » de la carte de premier lancement
  var sauvegardePrevue = null;            // sauvegarde complète en cours : {ids}
  var baseVideConnue = null;              // null = pas lu ; true / false

  function lsCopies() {
    var n = 0, i, k;
    try {
      for (i = 0; i < global.localStorage.length; i++) {
        k = global.localStorage.key(i);
        if (k && k.indexOf('kinball_backup_') === 0) n++;
      }
    } catch (e) {}
    return n;
  }
  function termines() {
    var ids = [], i, m, L = (typeof MATCHES_DB !== 'undefined' && MATCHES_DB) || [];
    for (i = 0; i < L.length; i++) { m = L[i]; if (m && m.id && m.status === 'completed') ids.push(m.id); }
    return ids;
  }
  function compter(matchs) {
    var c = { matches: 0, deleted: 0, actions: 0 }, i, m;
    for (i = 0; i < matchs.length; i++) {
      m = matchs[i];
      if (!m) continue;
      if (m.deleted) c.deleted++;
      else { c.matches++; c.actions += Array.isArray(m.history) ? m.history.length : 0; }
    }
    return c;
  }

  /* ---------- Lecture de l'état RÉEL de la base par la façade ---------- */
  function lireUneFois(chemin) {
    return new Promise(function (resolve, reject) {
      var off = null, fait = false;
      function fermer() { if (off) { try { off(); } catch (e) {} off = null; } }
      off = dbApi.collection(chemin).onSnapshot(function (snap) {
        if (fait) return;
        fait = true;
        var docs = snap.docs.map(function (d) { return { id: d.id, data: d.data() }; });
        if (off) fermer(); else setTimeout(fermer, 0);
        resolve(docs);
      }, function (e) { if (!fait) { fait = true; fermer(); reject(e); } });
    });
  }
  /* Rend {equipes: [données], matchs: [données]} (corbeille comprise, anciens matchs à plat compris). */
  function lireBase() {
    if (!dbApi) return Promise.reject(new Error('base indisponible'));
    var equipes = [], matchs = [];
    return lireUneFois('teams').then(function (t) {
      equipes = t.map(function (d) { return d.data; });
      return lireUneFois('matches');
    }).then(function (racine) {
      var auteurs = [], ids = {}, moi = userApi && userApi.exportIdentity ? userApi.exportIdentity().id : null;
      racine.forEach(function (d) {
        if (d.data && Array.isArray(d.data.history)) matchs.push(d.data);
        else auteurs.push(d.id);
      });
      if (moi && auteurs.indexOf(moi) < 0) auteurs.push(moi);
      auteurs = auteurs.filter(function (a) { if (ids[a]) return false; ids[a] = 1; return true; });
      return auteurs.reduce(function (suite, a) {
        return suite.then(function () {
          return lireUneFois('matches/' + a + '/items').then(function (items) {
            items.forEach(function (d) { matchs.push(d.data); });
          });
        });
      }, Promise.resolve());
    }).then(function () { return { equipes: equipes, matchs: matchs }; });
  }
  function estVide(etat) { return etat.equipes.length === 0 && etat.matchs.length === 0 && lsCopies() === 0; }

  /* ---------- Sauvegarde v2 ---------- */
  KBSite.sauvegardeV2 = function (payload) {
    if (!stockageActif || !payload || typeof payload !== 'object') return;
    var id = null, nom = '';
    try {
      if (userApi && userApi.exportIdentity) { var x = userApi.exportIdentity(); id = x.id; nom = x.name || ''; }
      else id = global.localStorage.getItem('kinball_install_id');
    } catch (e) {}
    payload.version = 2;
    if (id) payload.identity = { id: id, name: nom };
    payload.site = { version: VERSION_SITE, amont: VERSION_AMONT };
    var c = compter(Array.isArray(payload.matches) ? payload.matches : []);
    payload.counts = { teams: Array.isArray(payload.teams) ? payload.teams.length : 0, matches: c.matches, deleted: c.deleted, actions: c.actions };
    sauvegardePrevue = { ids: termines() };
  };
  /* Une sauvegarde complète n'est « faite » qu'au moment où le fichier est remis. */
  global.addEventListener('kb:fichier', function (ev) {
    var nom = ev && ev.detail && ev.detail.filename;
    if (!sauvegardePrevue || typeof nom !== 'string' || nom.indexOf('kinball_sauvegarde_') !== 0) return;
    var s = { at: Date.now(), termines: sauvegardePrevue.ids.length, ids: sauvegardePrevue.ids };
    sauvegardePrevue = null;
    derniereSauv = s;
    rappelPlusTard = 0;
    try { KB.meta.set('site.derniereSauvegarde', s).then(null, function () {}); } catch (e) {}
    majDerniere();
    majRappel();
  });

  /* ---------- Import sûr ---------- */
  KBSite.continuer = function () { global.location.reload(); };
  function ouvrirRestauree(compteRendu) {
    if (typeof global.openSheet !== 'function') { global.location.reload(); return; }
    global.openSheet(
      '<div id="kbRestauree">' +
      '<div class="sheet-title">Sauvegarde restaurée</div>' +
      '<div class="msg-center" style="font-size:14px; padding:6px 0 14px; line-height:1.45; word-break:break-word">' + echapper(compteRendu) + '</div>' +
      '<button id="kbContinuer" class="choice-btn" style="background:var(--bleu); font-size:15px; width:100%" onclick="KBSite.continuer()">CONTINUER</button>' +
      '</div>', false);
  }
  KBSite.importDebut = function (payload) {
    if (!stockageActif) return Promise.resolve(null);
    var local = { teams: {}, matches: {} }, ignores = 0, vide = false, lu = false;
    var cible = { garder: function () { return false; }, fin: function () {} };
    return lireBase().then(function (etat) {
      etat.equipes.forEach(function (t) { if (t && t.id) local.teams[t.id] = t.updatedAt || 0; });
      etat.matchs.forEach(function (m) { if (m && m.id) local.matches[m.id] = m.updatedAt || 0; });
      vide = estVide(etat);
      lu = true;
      return {
        garder: function (sorte, obj) {
          var table = sorte === 'team' ? local.teams : local.matches, ok = true;
          if (!obj || !obj.id) return false;               // sans identifiant : rien à comparer, rien à écrire (non compté)
          if (Object.prototype.hasOwnProperty.call(table, obj.id) && table[obj.id] >= (obj.updatedAt || 0)) ok = false;
          else if (sorte === 'match' && typeof S !== 'undefined' && S && S.id && S.id === obj.id) ok = false;
          if (!ok) ignores++;
          return ok;
        },
        fin: function (status) { terminerImport(status, payload, ignores, vide); }
      };
    }, function () {
      /* Lecture impossible : on n'écrit rien plutôt que de risquer un écrasement. */
      return {
        garder: function () { return false; },
        fin: function (status) { status.textContent = 'Import impossible : la base de cet appareil n’a pas pu être lue. Rien n’a été modifié.'; }
      };
    });
  };
  function terminerImport(status, payload, ignores, vide) {
    var t = status.textContent || '';
    if (ignores) t += ' ' + ignores + ' ignoré(s) : déjà à jour sur cet appareil.';
    if (payload && payload.version === 2 && payload.counts && typeof payload.counts === 'object') {
      var c = compter(Array.isArray(payload.matches) ? payload.matches : []);
      var n = payload.counts;
      if (n.teams !== (Array.isArray(payload.teams) ? payload.teams.length : 0) || n.matches !== c.matches || n.deleted !== c.deleted || n.actions !== c.actions) {
        t += ' Attention : fichier modifié ou incomplet (ses décomptes ne correspondent pas à son contenu).';
      }
    }
    var ident = payload && payload.identity, locale = null;
    try { locale = userApi && userApi.exportIdentity ? userApi.exportIdentity() : null; } catch (e) {}
    var valide = !!ident && typeof ident === 'object' && RE_IDENTITE.test(String(ident.id || ''));
    if (valide && locale && ident.id !== locale.id) {
      if (vide && !/échec/.test(t)) {
        status.textContent = t;
        userApi.importIdentity({ id: ident.id, name: typeof ident.name === 'string' ? ident.name : '' }).then(function () {
          status.textContent = t + ' Votre identité de preneur de stats a été reprise.';
          ouvrirRestauree(t + ' Votre identité de preneur de stats a été reprise.');
        }, function () {
          status.textContent = t + ' L’identité du fichier n’a pas pu être reprise ; l’identité de cet appareil est conservée.';
        });
        return;
      }
      if (!vide) t += ' Ce fichier vient d’un autre preneur de stats : l’identité de cet appareil est conservée.';
    }
    status.textContent = t;
  }

  /* ---------- Texte de la carte « Importer une sauvegarde » ---------- */
  function texteImport() {
    var champ = document.getElementById('importFileInput');
    var carte = champ && champ.closest ? champ.closest('.backup-card') : null;
    var sous = carte ? carte.querySelector('.bc-sub') : null;
    if (sous) sous.textContent = 'Ajoute au contenu de cet appareil ce que le fichier a de plus récent. Une donnée plus récente ici n’est jamais écrasée.';
  }

  /* ---------- Dernière sauvegarde (écran Sauvegarde) ---------- */
  function majDerniere() {
    var info = document.getElementById('storageInfo');
    if (!info || !info.parentNode) return;
    var ligne = document.getElementById('kbDerniereSauv');
    if (!ligne) {
      ligne = el('div', { id: 'kbDerniereSauv', 'class': 'section-sub', style: 'margin:-4px 0 14px' });
      var ancre = document.getElementById('kbSauvegarde');
      info.parentNode.insertBefore(ligne, ancre || (document.getElementById('kbStorageStatus') || info).nextSibling);
    }
    if (!metaCharge) return;
    if (!derniereSauv) { ligne.textContent = 'Dernière sauvegarde : jamais'; return; }
    var d = new Date(derniereSauv.at), p = function (n) { return String(n).padStart(2, '0'); };
    ligne.textContent = 'Dernière sauvegarde : ' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' à ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------- Cartes de l'accueil : premier lancement et rappel ---------- */
  function carteLancement() {
    var carte = el('div', { 'class': 'kb-carte' });
    carte.appendChild(el('div', { 'class': 'kb-carte-titre' }, 'Nouvel appareil, ou données effacées ?'));
    carte.appendChild(el('div', { 'class': 'kb-carte-texte' }, 'Si vous avez un fichier de sauvegarde, vous pouvez retrouver vos équipes, vos matchs et votre identité.'));
    var act = el('div', { 'class': 'kb-carte-actions' });
    var ok = el('button', { type: 'button', 'class': 'kb-btn kb-principal', id: 'kbImporterBtn' }, 'IMPORTER');
    ok.addEventListener('click', function () {
      /* même geste : l'écran Sauvegarde, puis le sélecteur de fichier */
      try { if (typeof global.navTo === 'function') global.navTo('backup'); } catch (e) {}
      var champ = document.getElementById('importFileInput');
      if (champ) champ.click();
    });
    var plus = el('button', { type: 'button', 'class': 'kb-btn', id: 'kbImporterPlusTard' }, 'Plus tard');
    plus.addEventListener('click', function () {
      accueilFerme = true;
      try { KB.meta.set('site.premierLancementFerme', true).then(null, function () {}); } catch (e) {}
      retirerCarte('kbCarteLancement');
    });
    act.appendChild(ok); act.appendChild(plus);
    carte.appendChild(act);
    return carte;
  }
  function majLancement() {
    if (!stockageActif || !metaCharge || !dbApi || accueilFerme || baseVideConnue === false) { retirerCarte('kbCarteLancement'); return Promise.resolve(); }
    return lireBase().then(function (etat) {
      baseVideConnue = estVide(etat) ? true : false;
      if (baseVideConnue && ecranCourant() === 'home' && !document.getElementById('kbCarteLancement')) poserCarte('kbCarteLancement', 20, carteLancement());
      else if (!baseVideConnue) retirerCarte('kbCarteLancement');
    }, function () {});
  }

  /* Raison du rappel, ou null. Lit les variables de l'app (sans y écrire). */
  function raisonRappel() {
    var now = Date.now();
    if (rappelPlusTard && now < rappelPlusTard) return null;
    var vus = {}, fait = 0, ids = termines(), i;
    if (derniereSauv && Array.isArray(derniereSauv.ids)) { for (i = 0; i < derniereSauv.ids.length; i++) vus[derniereSauv.ids[i]] = 1; }
    for (i = 0; i < ids.length; i++) if (!vus[ids[i]]) fait++;
    if (fait >= 3) return fait + ' matchs terminés depuis ' + (derniereSauv ? 'votre dernière sauvegarde' : 'le début') + '.';
    var ref = derniereSauv ? derniereSauv.at : premierUsage;
    if (!ref || now - ref < 14 * JOUR_MS) return null;
    var change = false, L = [].concat((typeof TEAMS_DB !== 'undefined' && TEAMS_DB) || [], (typeof MATCHES_DB !== 'undefined' && MATCHES_DB) || [], (typeof DELETED_MATCHES !== 'undefined' && DELETED_MATCHES) || []);
    var seuil = derniereSauv ? derniereSauv.at : 0;
    for (i = 0; i < L.length; i++) { if (L[i] && (L[i].updatedAt || L[i].createdAt || 0) > seuil) { change = true; break; } }
    if (!change) return null;
    var jours = Math.floor((now - ref) / JOUR_MS);
    return derniereSauv ? 'Dernière sauvegarde il y a ' + jours + ' jours, et des données ont changé depuis.' : 'Aucune sauvegarde faite, et l’app est utilisée depuis ' + jours + ' jours.';
  }
  function carteRappel(raison) {
    var carte = el('div', { 'class': 'kb-carte' });
    carte.appendChild(el('div', { 'class': 'kb-carte-titre' }, 'Pensez à sauvegarder'));
    carte.appendChild(el('div', { 'class': 'kb-carte-texte' }, raison + ' Un fichier gardé hors de l’app vous protège d’un effacement des données du navigateur.'));
    var act = el('div', { 'class': 'kb-carte-actions' });
    var ok = el('button', { type: 'button', 'class': 'kb-btn kb-principal', id: 'kbSauvegarderBtn' }, 'SAUVEGARDER MAINTENANT');
    ok.addEventListener('click', function () {
      /* appel synchrone dans le geste (feuille de partage) ; la carte disparaît à l'événement kb:fichier */
      try { if (typeof global.exportFullBackup === 'function') global.exportFullBackup(); } catch (e) {}
    });
    var plus = el('button', { type: 'button', 'class': 'kb-btn', id: 'kbRappelPlusTard' }, 'Plus tard');
    plus.addEventListener('click', function () {
      rappelPlusTard = Date.now() + JOUR_MS;
      try { KB.meta.set('site.rappelPlusTard', rappelPlusTard).then(null, function () {}); } catch (e) {}
      retirerCarte('kbCarteRappel');
    });
    act.appendChild(ok); act.appendChild(plus);
    carte.appendChild(act);
    return carte;
  }
  function majRappel() {
    if (!stockageActif || !metaCharge || ecranCourant() !== 'home') { return; }
    var r = raisonRappel();
    if (!r) { retirerCarte('kbCarteRappel'); return; }
    if (!document.getElementById('kbCarteRappel')) poserCarte('kbCarteRappel', 30, carteRappel(r));
  }
  /* Les abonnements de l'app arrivent un peu après le démarrage : on relit un court instant. */
  function majM06() {
    majRappel();
    majLancement();
  }

  function demarrerM06() {
    texteImport();
    KB.use('db').then(function (d) { dbApi = d; }, function () {});
    var pUser = KB.use('user').then(function (u) { userApi = u; }, function () {});
    var lectures = [KB.meta.get('site.derniereSauvegarde'), KB.meta.get('site.premierUsage'), KB.meta.get('site.rappelPlusTard'), KB.meta.get('site.premierLancementFerme')];
    Promise.all(lectures.concat([pUser])).then(function (v) {
      derniereSauv = v[0] && typeof v[0] === 'object' ? v[0] : null;
      premierUsage = typeof v[1] === 'number' ? v[1] : 0;
      rappelPlusTard = typeof v[2] === 'number' ? v[2] : 0;
      accueilFerme = v[3] === true;
      if (!premierUsage) {
        premierUsage = Date.now();
        KB.meta.set('site.premierUsage', premierUsage).then(null, function () {});
      }
      metaCharge = true;
      majDerniere();
      return KB.use('db');
    }).then(function (d) { dbApi = d; majM06(); }, function () {});
  }
  if (stockageActif) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrerM06);
    else demarrerM06();
  }

  /* ================= M11 : copie locale périmée (correctif F1) =================
     checkLocalBackups() de l'app s'exécute à la première émission des documents
     d'auteurs, avant l'arrivée des matchs (items) : une copie périmée passait pour
     « absente de la base » et « Récupérer » écrasait un match plus récent. */
  function enregBase(id) {
    var i, L;
    try { L = (typeof MATCHES_DB !== 'undefined' && MATCHES_DB) || []; for (i = 0; i < L.length; i++) if (L[i] && L[i].id === id) return L[i]; } catch (e) {}
    try { L = (typeof DELETED_MATCHES !== 'undefined' && DELETED_MATCHES) || []; for (i = 0; i < L.length; i++) if (L[i] && L[i].id === id) return L[i]; } catch (e) {}
    return null;
  }
  function nbActions(m) { return m && Array.isArray(m.history) ? m.history.length : 0; }
  /* Vrai tant qu'un abonnement aux matchs d'un auteur n'a pas livré son premier instantané. */
  KBSite.baseIncomplete = function () {
    if (!stockageActif) return false;
    try {
      if (typeof DB === 'undefined' || !DB) return false;          // stockage injoignable : rien à attendre
      var ids = Object.keys(unsubOwnerItems);
      if (!ids.length) return true;
      for (var i = 0; i < ids.length; i++) if (matchesByOwner[ids[i]] === undefined) return true;
    } catch (e) { return false; }
    return false;
  };
  /* Copie plus ancienne que ce qui est déjà à la corbeille : pas de bandeau. */
  KBSite.copieObsolete = function (b) {
    if (!stockageActif) return false;
    var rec = enregBase(b.match.id);
    return !!(rec && rec.deleted && (rec.updatedAt || 0) >= (b.match.updatedAt || 0));
  };
  /* Vrai = récupération refusée. Une copie moins récente ou moins fournie que la base est supprimée. */
  KBSite.copieRefusee = function (b) {
    if (!stockageActif) return false;
    var msg;
    if (KBSite.baseIncomplete()) {
      msg = 'Le stockage de cet appareil est encore en cours de lecture. Réessayez dans un instant.';
    } else {
      var rec = enregBase(b.match.id);
      if (!rec) return false;
      if ((rec.updatedAt || 0) <= (b.match.updatedAt || 0) && nbActions(rec) <= nbActions(b.match)) return false;
      try { markLocalBackupSynced(b.match.id); } catch (e) {}
      msg = 'La version enregistrée sur cet appareil est plus récente que cette copie (' + nbActions(rec) + ' action(s) contre ' + nbActions(b.match) + '). La copie a été supprimée et rien n’a été modifié.';
    }
    try {
      var box = document.getElementById('backupRecovery'); if (box) box.style.display = 'none';
      openSheet('<div class="sheet-title">COPIE NON RÉCUPÉRÉE</div><div class="msg-center" style="font-size:16px; padding:6px 0 12px">' + echapper(msg) + '</div><button class="ghost-btn" style="width:100%" onclick="closeSheet()">Fermer</button>', true);
    } catch (e) {}
    return true;
  };

  /* ================= M08 : collecte facultative (inerte sans configuration) =================
     config.js (racine) porte {collecteUrl, contact}. Les DEUX doivent être non vides pour que
     kbcollect.js soit chargé ; sinon rien : aucune carte, aucune requête. Jamais dans claude.ai.
     Une adresse en http n'est admise que vers 127.0.0.1 / localhost (essais). */
  KBSite.collecteConfig = null;
  function chargerScript(src, fin) {
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = function () { fin(true); };
    s.onerror = function () { fin(false); };
    document.head.appendChild(s);
  }
  function adresseCollecteValide(u) {
    try {
      var x = new URL(u);
      return x.protocol === 'https:' || (x.protocol === 'http:' && (x.hostname === '127.0.0.1' || x.hostname === 'localhost'));
    } catch (e) { return false; }
  }
  function demarrerCollecte() {
    if (!stockageActif) return;
    chargerScript('config.js', function (ok) {
      var c = ok ? global.KB_CONFIG : null;
      if (!c || typeof c !== 'object' || typeof c.collecteUrl !== 'string' || typeof c.contact !== 'string') return;
      var url = c.collecteUrl.trim(), contact = c.contact.trim();
      if (!url || !contact || !adresseCollecteValide(url)) return;
      KBSite.collecteConfig = { collecteUrl: url, contact: contact };
      chargerScript('kbcollect.js', function () {});
    });
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
      if (typeof majM06 === 'function') majM06();
      if (rechercheReportee) verifierMiseAJour({ forcer: rechercheReportee === 'forcee' });
    }
    if (e === 'backup') { ligneVersion(); majDerniere(); }
  }

  function demarrer() {
    poserStyle();
    ligneVersion();
    new MutationObserver(surEcran).observe(document.documentElement, { attributes: true, attributeFilter: ['data-screen'] });
    surEcran();     // navHome() a déjà tourné : lecture initiale
    enregistrer();
    demarrerCollecte();
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
