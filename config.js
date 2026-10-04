/* Configuration de la collecte FACULTATIVE des matchs (voir collecte/MODE-D-EMPLOI.md).
   collecteUrl : adresse du script de collecte (se termine par /exec). contact : adresse où joindre
   le responsable (affichée dans confidentialite.html). Les deux vides : la collecte est entièrement
   coupée (aucune carte dans l'app, aucune requête). Après une modification : node outils/check-release.mjs --ecrire. */
window.KB_CONFIG = { collecteUrl: '', contact: '' };
