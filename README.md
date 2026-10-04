# Kin-Ball Stats

Site statique (PWA) de prise de statistiques de kin-ball, pensé pour l'iPad : saisie en direct, stockage sur l'appareil, exports CSV / XLSX / JSON.
Adresse prévue : https://kingmoule.github.io/kinball-stats/ (GitHub Pages, servi depuis la racine de ce dépôt).
L'app est `index.html` (fichier unique). `amont/kinball.amont.html` est la copie de référence de la dernière version amont intégrée (octets identiques).
`tests/` contient le banc d'essai (Playwright, Chromium) et `sim/` le moteur de simulation des chances de victoire.
Lancer le banc (environ 16 minutes) : `NODE_PATH=<dossier global de playwright> node tests/run.mjs` ; une suite : `KINBALL_ONLY=C19`.
Moteur de simulation : `node sim/simtest.mjs` (doit afficher « TOUT PASSE »).
Mesures et captures du banc : `KINBALL_SORTIE=<dossier>` (hors dépôt) ; sauvegardes « d'avant » : `KINBALL_AVANT=<dossier>`.
Détails : `tests/README.md`.
