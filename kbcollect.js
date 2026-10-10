/* kbcollect.js — M08 : collecte FACULTATIVE des matchs terminés (consentement, boîte d'envoi, retrait).
   Chargé par kbsite.js SEULEMENT si config.js donne une adresse de collecte ET un contact, et
   jamais dans claude.ai. Sans cela ce fichier n'est pas lu : aucune carte, aucune requête.

   Principes (voir collecte/MODE-D-EMPLOI.md et le rapport M07 pour le contrat du serveur) :
   - désactivé par défaut ; l'accord est rangé par KBLocal.meta, valable pour CETTE identité seulement,
     jamais déduit, jamais repris d'une sauvegarde ;
   - seuls MES matchs (espace matches/<identité>/items), TERMINÉS, non supprimés, partent, une fois par
     version, après la fin du match (jamais pendant que l'écran courant est « match ») ;
   - jamais un nom de joueur sur le réseau : copie profonde épurée (rosters[*].name vidé, valeurs des clés
     *_name / *_names mises à '', sauf team_name qui est un nom d'ÉQUIPE) ; la donnée locale n'est jamais modifiée ;
   - boîte d'envoi persistante (reprise après coupure, délais 1 min / 5 min / 30 min, puis au lancement) ;
   - n'écrit jamais dans S, TEAMS_DB, MATCHES_DB ; un échec de collecte ne touche ni au badge de
     synchronisation ni aux messages de sauvegarde. */
(function (global) {
  'use strict';
  var KBSite = global.KBSite, KB = global.KBLocal;
  var cfg = KBSite && KBSite.collecteConfig;
  if (!KBSite || !KB || !cfg || global.claude || KBSite.collecte) return;

  var CLE_ACCORD = 'site.collecte.accord';        // {accorde, at, id}
  var CLE_FILE = 'site.collecte.file';            // matchId -> entrée de la boîte d'envoi
  var CLE_EFFACEMENT = 'site.collecte.effacement'; // {at}
  var DELAIS = [60000, 300000, 1800000];           // 1 min, 5 min, 30 min, puis au lancement suivant
  var DELAI_REQUETE = 30000;
  var DELAI_TRAITEMENT = '30 jours';

  var userApi = null, dbApi = null, monId = null;
  var accord = false;              // accord donné POUR CETTE identité
  var file = {};                   // matchId -> {empreinte, etat:'attente'|'partage'|'refuse', essais, dernier, prochain, raison, dejaPartage, suppr}
  var effacement = null;           // {at} : dernière demande d'effacement envoyée
  var instantane = null;           // dernier instantané des matchs de mon espace (null = pas encore lu)
  var desabonner = null;
  var generation = 0;              // change à chaque retrait de l'accord : un envoi en cours n'écrit plus rien
  var controleur = null;           // AbortController de la requête en cours
  var enCours = false, encore = null;
  var bloques = {};                // clé -> 'quota' | 'essais' : plus d'essai avant le lancement suivant ('essais' aussi levé par le retour du réseau)
  var minuterie = null;
  var ecritures = Promise.resolve();
  var empreintes = typeof WeakMap === 'function' ? new WeakMap() : null;

  function el(tag, attrs, texte) {
    var n = document.createElement(tag), k;
    for (k in (attrs || {})) n.setAttribute(k, attrs[k]);
    if (texte != null) n.textContent = texte;
    return n;
  }
  function ecran() { return document.documentElement.dataset.screen || ''; }
  function actif() { return !!(accord && monId && instantane); }

  /* ---------- Épuration : jamais un nom de joueur ---------- */
  function viderNoms(v) {            // sous « rosters » : tout « name » vidé, tout texte seul vidé
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) {
        if (typeof v[i] === 'string') v[i] = '';
        else viderNoms(v[i]);
      }
    } else if (v && typeof v === 'object') {
      Object.keys(v).forEach(function (k) {
        if (k === 'name') v[k] = '';
        else viderNoms(v[k]);
      });
    }
  }
  function nettoyer(v) {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) nettoyer(v[i]); return; }
    Object.keys(v).forEach(function (k) {
      if (k !== 'team_name' && /_names?$/.test(k)) { v[k] = ''; return; }   // clé gardée, valeur vidée ; team_name = nom d'équipe : permis par le serveur
      if (k === 'rosters') viderNoms(v[k]);
      else nettoyer(v[k]);
    });
  }
  /* Copie profonde épurée : la donnée locale (figée) n'est jamais touchée. */
  function epurer(m) {
    var c = JSON.parse(JSON.stringify(m));
    nettoyer(c);
    /* C28 : l'heure des événements (`at`, ajoutée aux nouveaux événements) ne part pas : le contenu de l'envoi, son empreinte et la page de confidentialité restent ce qu'ils étaient. */
    if (Array.isArray(c.history)) c.history.forEach(function (e) { if (e && typeof e === 'object') delete e.at; });
    return c;
  }
  function sha256(texte) {
    var sub = global.crypto && global.crypto.subtle;
    if (!sub || typeof TextEncoder !== 'function') return Promise.reject(new Error('sha-256 indisponible'));
    return sub.digest('SHA-256', new TextEncoder().encode(texte)).then(function (buf) {
      var b = new Uint8Array(buf), h = '', i;
      for (i = 0; i < b.length; i++) h += (b[i] < 16 ? '0' : '') + b[i].toString(16);
      return h;
    });
  }
  /* Empreinte (et verdict de taille) d'une version, mise en cache par objet de la façade. */
  function empreinteDe(m) {
    var c = empreintes && empreintes.get(m);
    if (c) return Promise.resolve(c);
    var texte = JSON.stringify(epurer(m));
    var trop = texte.length > 600000 && new TextEncoder().encode(texte).length > 2 * 1024 * 1024;
    if (!trop && Array.isArray(m.history) && m.history.length > 100000) trop = true;
    return sha256(texte).then(function (h) {
      var r = { emp: h, trop: trop };
      if (empreintes) empreintes.set(m, r);
      return r;
    });
  }

  /* ---------- Rangement (KBLocal.meta), écritures mises en file ---------- */
  function ecrire(cle, valeur) {
    var v = JSON.parse(JSON.stringify(valeur));
    ecritures = ecritures.then(function () { return KB.meta.set(cle, v); }).then(null, function () {});
    return ecritures;
  }
  function sauverFile() { return ecrire(CLE_FILE, file); }

  /* ---------- Requête : la seule destination, la seule forme ---------- */
  function poster(consent, match) {
    var env = { schema: 1, appVersion: KBSite.version.site, installId: monId, sentAt: Date.now(), consent: consent, match: match };
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    controleur = ctl;
    var minut = ctl ? setTimeout(function () { try { ctl.abort(); } catch (e) {} }, DELAI_REQUETE) : null;
    var opts = { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(env), redirect: 'follow', credentials: 'omit' };
    if (ctl) opts.signal = ctl.signal;
    return fetch(cfg.collecteUrl, opts).then(function (rep) {
      if (!rep.ok) return { type: 'reseau', detail: 'HTTP ' + rep.status };
      return rep.text().then(function (t) {
        var j = null;
        try { j = JSON.parse(t); } catch (e) { j = null; }
        if (!j || typeof j !== 'object' || typeof j.ok !== 'boolean' || typeof j.statut !== 'string') return { type: 'illisible' };
        return { type: j.ok ? 'ok' : 'refus', statut: j.statut, raison: typeof j.raison === 'string' ? j.raison : '' };
      });
    }, function () { return { type: 'reseau', detail: 'réseau' }; }).then(function (r) {
      if (minut) clearTimeout(minut);
      if (controleur === ctl) controleur = null;
      return r;
    });
  }

  /* ---------- Boîte d'envoi ---------- */
  function nouvelleEntree(emp, trop, ancienne) {
    var e = { empreinte: emp, etat: 'attente', essais: 0, dernier: 0, prochain: 0, dejaPartage: !!(ancienne && ancienne.dejaPartage), suppr: null };
    if (trop) { e.etat = 'refuse'; e.raison = 'taille'; }
    return e;
  }
  /* Le match n'est plus à partager (corbeille ou effacé) : marque de suppression seulement s'il a déjà été partagé. */
  function marquerSuppression(id, deletedAt) {
    var e = file[id];
    if (!e || e.suppr) return false;
    if (!e.dejaPartage && e.etat !== 'partage') { delete file[id]; return true; }
    e.suppr = { etat: 'attente', essais: 0, dernier: 0, prochain: 0, deletedAt: (typeof deletedAt === 'number' && deletedAt >= 0) ? deletedAt : Date.now() };
    return true;
  }
  /* Met la boîte d'envoi d'accord avec l'instantané. Rend false si on doit s'arrêter (écran de match). */
  function reconcilier() {
    var docs = instantane ? instantane.docs : [], vus = {}, change = false, i = 0;
    function suite() {
      for (; i < docs.length; i++) {
        if (ecran() === 'match') return Promise.resolve(false);          // ni calcul d'empreinte, ni requête
        var m = docs[i].data();
        if (!m || typeof m.id !== 'string') continue;
        vus[m.id] = 1;
        if (m.deleted) { if (marquerSuppression(m.id, m.deletedAt)) change = true; continue; }
        if (m.status !== 'completed') continue;                           // en cours : jamais
        if (typeof m.authorId !== 'string' || !m.authorId) {              // sans auteur (importé) : jamais « le mien », jamais partagé (C25 · R22)
          var sa = file[m.id];
          if (sa && !sa.dejaPartage && sa.etat !== 'partage') { delete file[m.id]; change = true; }
          continue;
        }
        var e = file[m.id];
        if (e && e.suppr) { e.suppr = null; change = true; }              // rendu avant l'envoi de la marque
        var courant = m;
        return empreinteDe(courant).then(function (r) {
          var cur = file[courant.id];
          if (!cur || cur.empreinte !== r.emp) { file[courant.id] = nouvelleEntree(r.emp, r.trop, cur); change = true; }
          i++;
          return suite();
        });
      }
      Object.keys(file).forEach(function (id) { if (!vus[id] && marquerSuppression(id, null)) change = true; });   // effacé pour de bon
      return (change ? sauverFile() : Promise.resolve()).then(function () { return true; });
    }
    return suite();
  }
  function trouver(id) {
    var docs = instantane ? instantane.docs : [], i, m;
    for (i = 0; i < docs.length; i++) { m = docs[i].data(); if (m && m.id === id) return m; }
    return null;
  }
  function echec(x, cle) {
    x.essais = (x.essais || 0) + 1;
    x.dernier = Date.now();
    if (x.essais <= DELAIS.length) x.prochain = Date.now() + DELAIS[x.essais - 1];
    else { x.prochain = 0; bloques[cle] = 'essais'; }
  }
  /* Applique la réponse. Rend 'ok', 'fin' (refus définitif) ou 'stop' (à réessayer plus tard : on arrête le cycle). */
  function appliquer(x, cle, rep, attendus) {
    var reussi = rep.type === 'ok' && attendus.indexOf(rep.statut) >= 0;
    if (reussi) return 'ok';
    if (rep.type === 'refus') {
      if (rep.raison === 'quota') { bloques[cle] = 'quota'; x.dernier = Date.now(); return 'stop'; }
      if (rep.raison === 'occupe' || !rep.raison) { echec(x, cle); return 'stop'; }
      return 'fin';
    }
    echec(x, cle);   // réseau, HTTP, réponse illisible ou inattendue : reste en attente
    return 'stop';
  }
  function pret(x, cle, forcer) { return !bloques[cle] && (forcer || (x.prochain || 0) <= Date.now()); }

  function envoyerVersion(id, forcer) {
    var e = file[id], g = generation;
    var m = trouver(id);
    if (!m || m.deleted || m.status !== 'completed' || !m.authorId) return Promise.resolve('saute');
    var clean = epurer(m);
    return sha256(JSON.stringify(clean)).then(function (h) {
      if (h !== e.empreinte) { encore = encore || 'accueil'; return 'saute'; }   // changé entre-temps : la prochaine passe recalcule
      if (g !== generation || !accord || ecran() === 'match') return 'stop';
      return poster(true, clean).then(function (rep) {
        if (g !== generation || file[id] !== e) return 'stop';
        var r = appliquer(e, id, rep, ['recu', 'deja_recu']);
        if (r === 'ok') { e.etat = 'partage'; e.dejaPartage = true; e.essais = 0; e.prochain = 0; delete e.raison; }
        else if (r === 'fin') { e.etat = 'refuse'; e.raison = rep.raison; }
        majCarte();
        return sauverFile().then(function () { return r; });
      });
    });
  }
  function envoyerSuppression(id) {
    var e = file[id], s = e && e.suppr, g = generation;
    if (!s) return Promise.resolve('saute');
    var cle = id + '#s';
    return poster(true, { id: id, deleted: true, deletedAt: s.deletedAt }).then(function (rep) {
      if (g !== generation || file[id] !== e || e.suppr !== s) return 'stop';
      var r = appliquer(s, cle, rep, ['suppression_notee', 'deja_recu']);
      if (r === 'ok' || r === 'fin') delete file[id];   // une marque envoyée (ou refusée pour de bon) ne se renvoie pas
      majCarte();
      return sauverFile().then(function () { return r; });
    });
  }

  function cycle(mode) {
    if (!actif() || ecran() === 'match') return Promise.resolve();
    if (enCours) { if (!encore || mode !== 'minuterie') encore = mode; return Promise.resolve(); }
    enCours = true;
    var forcer = mode !== 'minuterie';   // seule la minuterie respecte les délais ; lancement, accueil, retour du réseau, accord les ignorent
    var g = generation;
    return reconcilier().then(function (ok) {
      majCarte();
      if (!ok) return;
      var ids = Object.keys(file), k = 0;
      function suivant() {
        if (k >= ids.length || g !== generation || !actif() || ecran() === 'match') return Promise.resolve();
        var id = ids[k++], e = file[id];
        if (!e) return suivant();
        var p = Promise.resolve('saute');
        if (e.etat === 'attente' && pret(e, id, forcer)) p = envoyerVersion(id, forcer);
        else if (e.suppr && e.suppr.etat === 'attente' && pret(e.suppr, id + '#s', forcer)) p = envoyerSuppression(id);
        return p.then(function (r) { return r === 'stop' ? undefined : suivant(); });
      }
      return suivant();
    }).then(null, function () { /* sha-256 ou rangement indisponible : rien n'est envoyé, rien ne s'affiche */ }).then(function () {
      enCours = false;
      majCarte();
      programmer();
      var suite = encore; encore = null;
      if (suite && g === generation) return cycle(suite);
    });
  }
  /* Une seule minuterie : le plus proche des prochains essais (jamais pendant un match : cycle() le refuse). */
  function programmer() {
    if (minuterie) { clearTimeout(minuterie); minuterie = null; }
    if (!actif()) return;
    var prochain = 0, maintenant = Date.now();
    Object.keys(file).forEach(function (id) {
      var e = file[id];
      [[e, id, e.etat === 'attente'], [e.suppr, id + '#s', !!(e.suppr && e.suppr.etat === 'attente')]].forEach(function (t) {
        if (!t[2] || bloques[t[1]] || !t[0].prochain || t[0].prochain <= maintenant) return;
        if (!prochain || t[0].prochain < prochain) prochain = t[0].prochain;
      });
    });
    if (prochain) minuterie = setTimeout(function () { minuterie = null; cycle('minuterie'); }, Math.min(prochain - maintenant + 50, 2147483000));
  }

  /* ---------- Accord, retrait, effacement ---------- */
  function abonner(modePremier) {
    if (desabonner || !dbApi || !monId) return;
    var premier = true, g = generation, arret = false;
    var off = dbApi.collection('matches/' + monId + '/items').onSnapshot(function (snap) {
      if (arret || g !== generation) return;
      instantane = snap;
      if (premier) { premier = false; cycle(modePremier); }
      else if (ecran() === 'home') planifierAccueil();
    }, function () {});
    desabonner = function () { arret = true; try { off(); } catch (e) {} };
  }
  var delaiAccueil = null;
  function planifierAccueil() {
    if (delaiAccueil) clearTimeout(delaiAccueil);
    delaiAccueil = setTimeout(function () { delaiAccueil = null; cycle('accueil'); }, 700);
  }
  function donnerAccord() {
    if (accord || !monId) return Promise.resolve();
    accord = true;
    generation++;
    file = {}; bloques = {}; instantane = null;
    majCarte();
    return ecrire(CLE_ACCORD, { accorde: true, at: Date.now(), id: monId }).then(function () {
      return sauverFile();
    }).then(function () { abonner('accord'); });
  }
  function retirerAccord() {
    if (!accord) return Promise.resolve();
    accord = false;
    generation++;
    if (controleur) { try { controleur.abort(); } catch (e) {} controleur = null; }
    if (desabonner) { desabonner(); desabonner = null; }
    if (minuterie) { clearTimeout(minuterie); minuterie = null; }
    if (delaiAccueil) { clearTimeout(delaiAccueil); delaiAccueil = null; }
    instantane = null; file = {}; bloques = {}; encore = null;
    majCarte();
    return ecrire(CLE_ACCORD, { accorde: false, at: Date.now(), id: monId }).then(function () { return sauverFile(); });
  }

  /* ---------- Carte de l'écran Sauvegarde ---------- */
  function compter() {
    var c = { partages: 0, attente: 0, refuses: 0 };
    Object.keys(file).forEach(function (id) {
      var e = file[id];
      if (e.etat === 'partage') c.partages++;
      else if (e.etat === 'refuse') c.refuses++;
      else c.attente++;
    });
    return c;
  }
  function textEtat() {
    if (!accord) return 'Le partage est désactivé : rien n’est envoyé.';
    var c = compter();
    var t = c.partages + (c.partages > 1 ? ' partagés' : ' partagé') + ', ' + c.attente + ' en attente';
    if (c.refuses) t += ', ' + c.refuses + (c.refuses > 1 ? ' refusés' : ' refusé');
    return t;
  }
  function majCarte() {
    var sw = document.getElementById('kbCollecteInterrupteur');
    if (!sw) return;
    sw.setAttribute('aria-checked', accord ? 'true' : 'false');
    document.getElementById('kbCollecteLibelle').textContent = accord ? 'Partage activé' : 'Partage désactivé';
    document.getElementById('kbCollecteEtat').textContent = textEtat();
    var ef = document.getElementById('kbCollecteEffacement');
    if (ef) {
      var d = effacement && new Date(effacement.at), p = function (n) { return String(n).padStart(2, '0'); };
      ef.textContent = d ? 'Dernière demande d’effacement envoyée le ' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.' : '';
    }
  }
  function message(texte) {
    var m = document.getElementById('kbCollecteMsg');
    if (m) m.textContent = texte || '';
  }
  function poserStyle() {
    if (document.getElementById('kbcollecte-style')) return;
    var st = el('style', { id: 'kbcollecte-style' });
    st.textContent =
      '#kbCollecte .kbc-sw{display:flex;align-items:center;gap:12px;width:100%;min-height:48px;padding:0;background:none;color:var(--ink);font:inherit;font-size:15px;font-weight:700;text-align:left}' +
      '#kbCollecte .kbc-piste{flex:0 0 auto;width:52px;height:30px;border-radius:15px;background:var(--surface2);border:1px solid var(--line);position:relative;transition:background .15s}' +
      '#kbCollecte .kbc-piste::after{content:"";position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:var(--dim);transition:transform .15s,background .15s}' +
      '#kbCollecte .kbc-sw[aria-checked="true"] .kbc-piste{background:var(--bleu);border-color:var(--bleu)}' +
      '#kbCollecte .kbc-sw[aria-checked="true"] .kbc-piste::after{transform:translateX(22px);background:#fff}' +
      '#kbCollecte .kbc-etat{font-size:13px;color:var(--dim);margin:6px 0 14px}' +
      '#kbCollecte .kbc-lien{color:var(--bleu-ink);font-size:13px;font-weight:600;margin-bottom:12px}' +
      '#kbCollecte .kbc-msg{font-size:13px;color:var(--ink);margin-top:10px;line-height:1.45;word-break:break-word}' +
      '#kbCollecte .kbc-fin{font-size:12px;color:var(--dim);margin-top:8px}';
    document.head.appendChild(st);
  }
  function construireCarte() {
    if (document.getElementById('kbCollecte')) return;
    var grille = document.querySelector('#backup .backup-grid');
    if (!grille) return;
    poserStyle();
    var c = el('div', { id: 'kbCollecte', 'class': 'backup-card' });
    c.appendChild(el('div', { 'class': 'bc-title' }, 'Partager mes matchs pour l’analyse'));
    c.appendChild(el('div', { 'class': 'bc-sub', style: 'margin-bottom:10px' },
      'Facultatif. Si vous acceptez, chaque match que vous terminez sur cet appareil est envoyé une fois, après coup, au responsable du projet pour l’analyse des statistiques. '
      + 'Ce qui part : les actions, les pointages, les positions, les noms des équipes et du match. '
      + 'Ce qui ne part jamais : les noms des joueurs, vos équipes enregistrées, les matchs en cours, les matchs des autres.'));
    var lien = el('a', { href: 'confidentialite.html', target: '_blank', rel: 'noopener', 'class': 'kbc-lien', id: 'kbCollecteLien' }, 'Lire la page de confidentialité');
    lien.style.display = 'inline-block';
    c.appendChild(lien);
    var sw = el('button', { type: 'button', role: 'switch', 'aria-checked': 'false', id: 'kbCollecteInterrupteur', 'class': 'kbc-sw' });
    sw.appendChild(el('span', { 'class': 'kbc-piste' }));
    sw.appendChild(el('span', { id: 'kbCollecteLibelle' }, 'Partage désactivé'));
    sw.addEventListener('click', function () {
      message('');
      if (accord) {
        var avaitPartage = compter().partages > 0;
        retirerAccord();
        message('Partage arrêté. Ce que vous avez déjà partagé reste chez le responsable du projet jusqu’à une demande d’effacement.');
        if (avaitPartage) ouvrirConfirmation(true);   // retrait de l'accord : on propose aussi l'effacement
      } else {
        donnerAccord();
      }
    });
    c.appendChild(sw);
    c.appendChild(el('div', { 'class': 'kbc-etat', id: 'kbCollecteEtat', role: 'status' }));
    var ef = el('button', { type: 'button', 'class': 'primary-btn', id: 'kbCollecteEffacer', style: 'margin-top:0;height:48px;font-size:15px;background:var(--surface2)' }, 'Demander l’effacement de ce que j’ai partagé');
    ef.addEventListener('click', function () { ouvrirConfirmation(false); });
    c.appendChild(ef);
    c.appendChild(el('div', { 'class': 'kbc-msg', id: 'kbCollecteMsg', role: 'status' }));
    c.appendChild(el('div', { 'class': 'kbc-fin', id: 'kbCollecteEffacement' }));
    grille.appendChild(c);
    majCarte();
  }

  function ouvrirConfirmation(apresRetrait) {
    if (typeof global.openSheet !== 'function') return;
    apresRetrait = apresRetrait === true;
    global.openSheet(
      '<div id="kbEffacementConfirme">' +
      '<div class="sheet-title">' + (apresRetrait ? 'PARTAGE ARRÊTÉ' : 'DEMANDER L’EFFACEMENT') + '</div>' +
      (apresRetrait ? '<div class="msg-center" style="font-size:15px; font-weight:600; padding:6px 0 4px; line-height:1.45">Plus rien n’est envoyé. Voulez-vous aussi faire effacer ce que cet appareil a déjà partagé ?</div>' : '') +
      '<div class="msg-center" style="font-size:15px; font-weight:600; padding:6px 0 14px; line-height:1.45">Une demande est envoyée au responsable du projet pour qu’il efface ce que cet appareil a partagé (délai de traitement : ' + DELAI_TRAITEMENT + '). Vos matchs sur cet appareil ne sont pas touchés.</div>' +
      '<button id="kbEffacementOui" class="choice-btn" style="background:var(--red-d); font-size:15px; width:100%" onclick="KBSite.collecte.effacer()">DEMANDER L’EFFACEMENT</button>' +
      '<button id="kbEffacementNon" class="ghost-btn" style="width:100%; margin-top:8px" onclick="closeSheet()">' + (apresRetrait ? 'NON, SEULEMENT ARRÊTER' : 'ANNULER') + '</button>' +
      '</div>', true);
  }
  var effacementEnCours = false;
  function effacer() {
    if (effacementEnCours || !monId) return Promise.resolve();
    effacementEnCours = true;
    try { global.closeSheet(); } catch (e) {}
    message('Envoi de la demande…');
    return poster(false, null).then(function (rep) {
      effacementEnCours = false;
      if (rep.type === 'ok' && (rep.statut === 'retrait_note' || rep.statut === 'deja_recu')) {
        effacement = { at: Date.now() };
        ecrire(CLE_EFFACEMENT, effacement);
        message('Votre demande a été envoyée. Elle sera traitée sous ' + DELAI_TRAITEMENT + '. Pour toute question : ' + cfg.contact + (accord ? ' Pour arrêter aussi les envois futurs, éteignez l’interrupteur.' : ''));
      } else {
        message('La demande n’a pas pu être envoyée pour l’instant. Réessayez plus tard, ou écrivez à : ' + cfg.contact);
      }
      majCarte();
    });
  }

  KBSite.collecte = {
    config: cfg,
    cycle: cycle,
    effacer: effacer,
    pret: null,
    etat: function () { return { accord: accord, id: monId, lu: !!instantane, enCours: enCours, file: JSON.parse(JSON.stringify(file)), compte: compter() }; }
  };

  /* ---------- Démarrage ---------- */
  function demarrer() {
    construireCarte();
    new MutationObserver(function () { if (ecran() === 'home') cycle('accueil'); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-screen'] });
    global.addEventListener('online', function () {
      Object.keys(bloques).forEach(function (k) { if (bloques[k] === 'essais') delete bloques[k]; });   // le réseau est revenu : on réessaie
      cycle('online');
    });
    KBSite.collecte.pret = Promise.all([KB.use('user'), KB.use('db')]).then(function (r) {
      userApi = r[0]; dbApi = r[1];
      monId = userApi.exportIdentity().id;
      return Promise.all([KB.meta.get(CLE_ACCORD), KB.meta.get(CLE_FILE), KB.meta.get(CLE_EFFACEMENT)]);
    }).then(function (v) {
      var a = v[0];
      accord = !!(a && a.accorde === true && a.id === monId);       // l'accord d'une autre identité ne vaut pas pour celle-ci
      file = (accord && v[1] && typeof v[1] === 'object') ? JSON.parse(JSON.stringify(v[1])) : {};
      effacement = v[2] && typeof v[2] === 'object' ? v[2] : null;
      majCarte();
      if (accord) abonner('lancement');
    }).then(null, function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer);
  else demarrer();
})(typeof self !== 'undefined' ? self : this);
