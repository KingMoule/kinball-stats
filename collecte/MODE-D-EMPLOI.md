# Mettre en place la collecte des matchs (mode d'emploi)

Ce guide explique, pas à pas, comment installer le petit « serveur » qui reçoit les matchs envoyés par l'app Kin-Ball Stats. Il n'y a rien à programmer : on copie deux fichiers dans un classeur Google Sheets et on clique sur quelques boutons. Comptez de 15 à 20 minutes.

La collecte est **facultative** : l'app fonctionne très bien sans elle. Tant que l'adresse n'est pas collée dans l'app, rien n'est envoyé nulle part.

## Ce que le serveur reçoit, et ce qu'il ne reçoit pas

**Il reçoit**, pour chaque match terminé dont la personne a accepté le partage :

- le match lui-même : score, périodes, toutes les actions (qui lance, résultat, zones, fautes, remplacements…), le nom du match et les noms d'équipes tels qu'ils ont été saisis ;
- des identifiants anonymes : un numéro d'appareil tiré au hasard (il ne dit rien sur la personne), et des numéros de joueurs du type `p_k3x9…` qui ne désignent personne ;
- la version de l'app et la date d'envoi.

**Il ne reçoit pas, et refuse même de recevoir :**

- aucun nom de joueur : si un envoi en contient encore un, le serveur le rejette en entier ;
- aucune adresse IP : le script ne la voit pas et ne la note pas (Google, qui héberge le service, a ses propres journaux, comme pour tout site) ;
- aucun nom de la personne qui prend les statistiques, aucune adresse courriel, aucun contact.

Un point d'attention : le serveur ne peut pas deviner si quelqu'un a écrit un vrai nom dans le **nom du match** ou dans un **nom d'équipe**. Il faut donc demander aux utilisateurs de ne pas y mettre de noms de personnes.

**Le serveur ne fait qu'ajouter.** Il n'efface rien, ne remplace rien, ne modifie jamais une ligne ou un fichier déjà écrit. Si un match est envoyé de nouveau avec des changements, il en garde les deux versions.

## 1. Le compte Google

1. Choisissez le compte Google qui possédera les données. Un compte ordinaire suffit. Pour un projet d'équipe, un compte créé exprès (par exemple « statistiques du club ») est préférable à un compte personnel, parce que c'est lui qui verra les données.
2. Connectez-vous à ce compte dans votre navigateur d'ordinateur (c'est plus simple que sur l'iPad pour cette étape).

## 2. Le classeur

1. Allez sur [sheets.google.com](https://sheets.google.com) et créez un classeur vide (« Feuille de calcul vierge »).
2. Donnez-lui un nom, par exemple « Collecte Kin-Ball ». Ce nom ne sert qu'à vous.

## 3. Le code du serveur

1. Dans le classeur, ouvrez le menu **Extensions**, puis **Apps Script**. Un nouvel onglet s'ouvre avec un éditeur.
2. Vous voyez un fichier nommé `Code.gs` qui contient quelques lignes. Sélectionnez tout son contenu (Ctrl+A, ou Cmd+A sur Mac) et effacez-le.
3. Ouvrez le fichier `collecte/Code.gs` du projet, copiez tout son contenu et collez-le dans l'éditeur.
4. À gauche, à côté de « Fichiers », cliquez sur le bouton **+**, puis **Script**. Nommez-le `Logique` (l'éditeur ajoute `.gs` tout seul).
5. Ouvrez le fichier `collecte/Logique.gs` du projet, copiez tout son contenu et collez-le dans ce deuxième fichier.
6. Cliquez sur l'icône de disquette (**Enregistrer le projet**). Donnez un nom au projet si on vous le demande (par exemple « Collecte Kin-Ball »).

Les deux fichiers sont nécessaires : `Code.gs` seul ne fonctionne pas.

## 4. L'installation (une seule fois)

1. Dans la barre du haut de l'éditeur, repérez la liste déroulante des fonctions, à côté des boutons **Exécuter** et **Déboguer**. Choisissez **installer**.
2. Cliquez sur **Exécuter**.
3. Google demande une autorisation. Cliquez sur **Examiner les autorisations**, choisissez votre compte.
4. Un écran dit « Google n'a pas validé cette application ». C'est normal : le script est le vôtre. Cliquez sur **Paramètres avancés**, puis sur **Accéder à Collecte Kin-Ball (non sécurisé)**, puis sur **Autoriser**.
5. Attendez la fin. En bas, le journal d'exécution affiche « Installation terminée ».

Ce qui vient d'être créé : dans le classeur, deux onglets **versions** et **retraits** avec leurs en-têtes, et dans votre Google Drive un dossier **kinball-collecte-json**. Vous pouvez relancer `installer` sans risque : elle ne casse rien.

## 5. Le déploiement

1. Toujours dans l'éditeur, cliquez sur **Déployer** (en haut à droite), puis **Nouveau déploiement**.
2. À côté de « Sélectionner le type », cliquez sur la roue dentée et choisissez **Application Web**.
3. Remplissez :
   - **Description** : « Collecte » (ou ce que vous voulez) ;
   - **Exécuter en tant que** : **Moi** (votre compte) ;
   - **Qui a accès** : **Tout le monde**.
4. Cliquez sur **Déployer** et acceptez les autorisations si on vous les redemande.
5. Google affiche une **URL de l'application Web**, qui commence par `https://script.google.com/macros/s/` et finit par `/exec`. Cliquez sur **Copier**.

« Tout le monde » veut dire que l'adresse n'exige pas de connexion Google : c'est nécessaire pour que l'app puisse y envoyer des matchs. Cela ne donne **aucun accès à vos données** : personne ne peut lire le classeur ni le dossier avec cette adresse. On peut seulement y *envoyer* des matchs, et le serveur refuse tout ce qui est mal formé, trop gros, ou qui contient un nom de joueur. Il limite aussi le nombre d'envois par jour (200 par appareil, 2 000 au total).

## 6. Donner l'adresse à l'app

1. Dans le projet de l'app, ouvrez le fichier `config.js` (fourni avec l'étape « collecte côté app » de la migration).
2. Collez l'adresse copiée entre les guillemets de la ligne `collecteUrl`. Elle aura cette forme (l'identifiant ci-dessous est un exemple inventé) :
   `collecteUrl: 'https://script.google.com/macros/s/IDENTIFIANT_LONG_ICI/exec'`
3. Publiez le site comme d'habitude. Tant que cette ligne est vide, l'app n'affiche aucune option de collecte et n'envoie rien.

L'adresse sera visible dans le dépôt public : c'est prévu et sans danger, voir plus haut.

## 7. Vérifier que ça marche

1. Collez l'adresse dans la barre d'adresse d'un navigateur et appuyez sur Entrée.
2. Vous devez voir exactement ceci : `{"ok":true,"service":"kinball-collecte","schema":1}`.
3. Si vous voyez plutôt une page Google avec une erreur, ou une demande de connexion, revenez à l'étape 5 et vérifiez « Exécuter en tant que : Moi » et « Qui a accès : Tout le monde ».

Ce test ne vérifie que l'accueil du service. Le vrai test se fait avec l'app : une fois la collecte activée dans l'app avec un match terminé, une ligne doit apparaître dans l'onglet **versions** du classeur et un fichier dans le dossier Drive.

## 8. Mettre le script à jour sans changer d'adresse

Si on vous livre une nouvelle version de `Code.gs` ou `Logique.gs` :

1. Ouvrez le classeur, **Extensions**, **Apps Script**.
2. Remplacez le contenu des deux fichiers par les nouveaux, puis **Enregistrer**.
3. **Déployer**, puis **Gérer les déploiements**. Cliquez sur le crayon à côté de votre déploiement actif.
4. Dans **Version**, choisissez **Nouvelle version**, puis **Déployer**.

L'adresse reste la même. **N'utilisez pas « Nouveau déploiement »** pour une mise à jour : ça crée une adresse différente, et l'app continuerait d'utiliser l'ancienne.

## 9. Lire les données

- **L'index** : l'onglet **versions** du classeur contient une ligne par envoi accepté : date de réception, sorte (`version` ou `suppression`), numéro d'appareil, numéro du match, empreinte, nombre d'actions, format, version de l'app, date d'envoi, taille, identifiant du fichier.
- **Le détail** : le dossier Drive **kinball-collecte-json** contient un fichier `.json` par version, nommé `<numéro du match>__<début de l'empreinte>.json`. Il contient le match complet, tel que reçu.
- Un même match peut avoir plusieurs lignes : une par version reçue. La plus récente est celle dont la date d'envoi est la plus tardive. Une ligne de sorte `suppression` signifie que la personne a supprimé ce match dans son app : c'est à vous de décider quoi en faire (rien n'est effacé automatiquement).
- Pour analyser : dans le classeur, **Fichier**, **Télécharger**, **Valeurs séparées par des virgules (.csv)** donne l'index ; les fichiers `.json` se téléchargent depuis Drive.

Ne modifiez pas les lignes de l'onglet **versions** à la main (sauf pour un retrait, voir plus bas) : le serveur s'en sert pour savoir ce qu'il a déjà reçu.

## 10. Traiter une demande de retrait

Quand quelqu'un arrête de partager et demande l'effacement, l'app envoie un « retrait ». Le serveur le note, **sans rien effacer lui-même**. Vous devez faire le ménage à la main :

1. Ouvrez l'onglet **retraits**. Chaque ligne est une demande : date, numéro d'appareil (colonne **installId**), date d'envoi, et une colonne **traité** vide.
2. Copiez le numéro d'appareil de la ligne.
3. Dans l'onglet **versions**, utilisez **Données**, **Créer un filtre**, puis filtrez la colonne **installId** sur cette valeur. Notez le **numéro du match** (colonne `matchId`) de chaque ligne affichée.
4. Dans le dossier Drive **kinball-collecte-json**, cherchez les fichiers dont le nom commence par chacun de ces numéros de match et mettez-les à la corbeille (puis videz la corbeille de Drive si vous voulez les effacer pour de bon).
5. Dans l'onglet **versions**, supprimez les lignes filtrées (clic droit sur les numéros de ligne, **Supprimer les lignes**), puis désactivez le filtre.
6. Dans l'onglet **retraits**, écrivez `oui` dans la colonne **traité** de la demande.

Faites ce traitement dans un délai raisonnable (par exemple dans les 30 jours) : la page de confidentialité de l'app doit annoncer ce délai.

## 11. Tout arrêter

- **Arrêter de recevoir** : dans l'éditeur Apps Script, **Déployer**, **Gérer les déploiements**, puis **Archiver** à côté du déploiement. L'adresse cesse de répondre. Les apps déjà installées garderont leurs envois en attente sans rien casser.
- **Effacer les données** : mettez le dossier **kinball-collecte-json** à la corbeille et supprimez le classeur (puis videz la corbeille de Drive).
- Pensez aussi à vider la ligne `collecteUrl` de `config.js` pour que l'app n'affiche plus l'option.

## Si ça ne va pas

- L'app dit qu'un envoi est « en attente » : le serveur était occupé ou la limite du jour est atteinte. L'app réessaie plus tard toute seule.
- Rien n'arrive dans le classeur : ouvrez l'adresse (étape 7). Si le message d'état s'affiche, le serveur est en ordre ; vérifiez dans l'app que la collecte est bien activée et que le match est terminé.
- Dans l'éditeur, le menu de gauche **Exécutions** montre les erreurs éventuelles du script.
