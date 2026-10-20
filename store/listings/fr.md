# French Listing Copy (Français)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts were measured on 2026-10-12, the Firefox Add-ons summary, the two full descriptions, and the 0.3.3 release notes on 2026-10-19, and count Unicode characters.

| Block | Characters |
| --- | --- |
| Optional manifest description | 132 |
| Firefox Add-ons summary | 250 |
| Full description, Chrome and Edge | 12,089 |
| Full description, Firefox | 7,051 |
| What's new in 0.3.3 | 1,396 |

## Name

```text
Bookmark Scout
```

Read from `extName` in `apps/extension/public/_locales/fr/messages.json`. The brand name is not translated.

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

Packaged as `extDescription` (changing it needs a new version). Ships with 0.3.3 (132 characters):

```text
Classez vite vos pages dans le bon dossier : tapez une partie de son nom ou laissez l'IA le suggérer. Recherche et nettoyage inclus.
```

### Firefox Add-ons summary (250 characters maximum, 250 characters on 2026-10-19)

```text
Classez vite vos pages dans le bon dossier : tapez un bout de son nom, appuyez sur ⌥⇧S sur Mac (Alt+Shift+S sous Windows et Linux) pour le plus pertinent ou laissez l'IA facultative en suggérer un. Recherche instantanée, arborescence et gestionnaire.
```

## Search terms (Edge Add-ons)

```text
enregistrer dans un dossier
gestionnaire de favoris
recherche de favoris
favoris en double
liens morts
dossiers de favoris
favoris IA
```

## Full description: Chrome Web Store and Edge Add-ons

The same Edge condition as in `en.md` applies.

```text
Bookmark Scout enregistre chaque page dans le bon dossier en quelques secondes, depuis la barre d'outils ou avec un seul raccourci clavier, puis vous aide à retrouver et à ranger vos favoris sans quitter le navigateur. Gratuit, sans compte et sans publicité.

ENREGISTRER DANS LE BON DOSSIER EN QUELQUES SECONDES
• Cliquez sur le bouton Bookmark Scout, saisissez une partie du nom de n'importe quel dossier, même profondément imbriqué dans l'arborescence, et enregistrez-y la page sans quitter le clavier
• Saisissez un chemin comme ai/llms ; une petite faute de frappe n'empêche pas de trouver le dossier, et les dossiers utilisés récemment apparaissent en premier
• Une page déjà présente dans ce dossier n'est pas enregistrée deux fois
• L'IA facultative suggère le meilleur dossier pour la page, ou un nouveau dossier que vous vérifiez avant sa création
• Menu du clic droit facultatif (désactivé au départ ; activez Menu du clic droit dans les paramètres) pour enregistrer des liens dans les dossiers récents

RACCOURCIS D'ENREGISTREMENT RAPIDE
• Appuyez sur ⌥⇧S sur Mac (Alt+Shift+S sous Windows et Linux) sur n'importe quelle page pour l'enregistrer sans ouvrir Bookmark Scout : par défaut dans le dossier qui correspond le mieux à la page (déterminé sur votre appareil), ou dans le dernier dossier utilisé ou un dossier de votre choix
• Une petite notification dans la page indique où elle a été enregistrée, avec Annuler et d'autres dossiers vers lesquels la déplacer
• Lorsque l'IA est activée, ⌥⇧D sur Mac (Alt+Shift+D sous Windows et Linux) enregistre la page dans le premier dossier suggéré par l'IA
• Modifiez les touches sur la page des raccourcis du navigateur. Vous pouvez aussi y attribuer ⌘D sur Mac (Ctrl+D sous Windows et Linux) à l'enregistrement rapide, qui remplace alors la fenêtre de favoris du navigateur ; les paramètres expliquent comment faire

RETROUVER VOS FAVORIS
• Recherchez dans tous vos favoris pendant la saisie, directement depuis la barre d'outils
• Arborescence de dossiers avec glisser-déposer, Tout développer, Tout réduire et création de dossiers
• Panneau latéral avec la même arborescence, la même recherche et les dossiers correspondants
• Suppression avec confirmation (activée par défaut) et annulation possible pendant 10 secondes

GESTIONNAIRE DE FAVORIS
Bookmark Scout remplace la page Favoris du navigateur par un gestionnaire qui fonctionne comme celui du navigateur, avec en plus un fil d'Ariane, un tableau triable et des recherches enregistrées qui affichent toujours des résultats à jour.
• Menus contextuels sur les favoris, les dossiers et les zones vides : modifier, renommer, couper, copier, coller, ouvrir dans de nouveaux onglets ou de nouvelles fenêtres, afficher dans le dossier et supprimer
• Glisser-déposer pour déplacer des favoris dans des dossiers ou les réorganiser ; les liens déposés depuis d'autres pages deviennent des favoris
• Sélectionnez plusieurs lignes avec Cmd+clic et Shift+clic, et utilisez les raccourcis clavier du gestionnaire de favoris du navigateur : ⌘A, ⌘C, ⌘X, ⌘V, ⌘⌫, ⌘Z pour annuler et ⇧⌘Z pour rétablir sur Mac (Ctrl+clic, Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Delete, Ctrl+Z et Ctrl+Shift+Z sous Windows et Linux)
• Annuler et rétablir s'appliquent aux modifications, aux déplacements, aux tris et aux suppressions, y compris ceux effectués par Demander à l'IA
• Choisissez les commandes affichées dans le menu du clic droit et le menu ⋯, ainsi que leur ordre (Paramètres)

FAIRE LE TRI DANS DES ANNÉES DE FAVORIS
• Nettoyeur de doublons : vérifiez les groupes de doublons avant de supprimer les copies en trop
• Nettoyeur d'URL : prévisualisez et retirez les codes de suivi des adresses Web
• Vérificateur de liens morts : trouvez les liens qui ne fonctionnent plus, puis vérifiez les réparations (supprimer, utiliser la nouvelle adresse, pointer vers une copie archivée ou la modifier), avec annulation possible
• Récupération des métadonnées : suggère des titres de page et n'applique que ceux que vous choisissez
• Analyseur de confidentialité : détecte les informations privées dans vos favoris, comme les adresses e-mail et les codes de connexion présents dans les liens
• Statistiques : sites, dossiers, profondeur et doublons
• Actualiser les icônes de site : récupère l'icône propre à chaque site, sans service d'icônes tiers
• Importation d'un fichier de favoris, avec aperçu, gestion des doublons et annulation possible
• Exportation au format HTML, JSON, Markdown ou CSV, avec une vérification de confidentialité facultative qui peut masquer les informations privées

CE QUE VOTRE NAVIGATEUR VA DEMANDER, ET POURQUOI
À l'installation, le navigateur ne demande qu'une chose : « Accéder à vos favoris et les modifier », pour que Bookmark Scout puisse les enregistrer, y faire des recherches et les ranger. Tout le reste n'est demandé que lorsque vous utilisez la fonctionnalité qui en a besoin, après une courte explication. Si vous refusez, seule cette fonctionnalité reste désactivée.
• « Accéder aux icônes des sites Web que vous consultez » : lorsque vous cliquez sur Afficher les icônes du navigateur dans Actualiser les icônes de site, ou activez Utiliser le cache d'icônes du navigateur, pour afficher à côté de vos favoris les icônes que votre navigateur a déjà enregistrées
• « Lire et modifier vos données sur tous les sites example.com » (ou « sur certains sites Web ») : lorsque vous lancez le vérificateur de liens morts, la récupération des métadonnées ou l'outil Actualiser les icônes de site, uniquement pour les sites concernés par cette exécution. Une exécution portant sur plus de 20 sites, ainsi que le paramètre d'IA Lire le contenu des pages, demandent « Lire et modifier toutes vos données sur tous les sites Web ». Les requêtes sont envoyées sans cookies. Une fois tous les sites Web autorisés, Demander à l'IA peut aussi vérifier si les liens de vos favoris fonctionnent toujours
• « Consulter votre historique de navigation » : uniquement pour enregistrer la page actuelle ou obtenir des suggestions de dossiers depuis le panneau latéral. Le bouton de la barre d'outils et le raccourci d'enregistrement rapide ne nécessitent aucune autorisation, et Bookmark Scout ne lit que le titre et l'adresse de l'onglet ouvert
• « Communiquer avec les applications natives associées » : uniquement lorsque vous activez Agents d'IA locaux (voir Pour les développeurs ci-dessous)
Le menu du clic droit est lui aussi facultatif, mais il ne déclenche aucun avertissement : le navigateur l'ajoute donc sans rien demander.

CONFIDENTIALITÉ
• Aucun compte, aucune mesure d'audience, aucun suivi, aucune publicité
• Vos favoris restent dans votre navigateur ; les étiquettes, les résumés et les recherches enregistrées restent sur cet appareil
• Les paramètres que vous modifiez, vos prompts personnalisés et « À propos de moi » sont synchronisés via votre compte de navigateur lorsque celui-ci le permet

IA FACULTATIVE (DÉSACTIVÉE PAR DÉFAUT)
L'IA est facultative, et tout ce qui précède fonctionne sans elle. Pour l'utiliser, il vous faut un compte auprès d'une entreprise d'IA, qui peut facturer une petite somme à chaque utilisation, ou un programme d'IA gratuit sur votre propre ordinateur. Bookmark Scout n'a pas de service d'IA propre : activez l'IA dans les paramètres et ajoutez le service que vous avez choisi.
• Suggestions de dossiers pour la page actuelle, y compris un nouveau dossier que vous vérifiez d'abord
• Dans Chrome, des suggestions de dossiers gratuites grâce à l'IA intégrée de Chrome, qui fonctionne sur votre ordinateur sans compte ni clé, si l'ordinateur peut l'exécuter
• Suggestions d'étiquettes et courts résumés, que vous vérifiez avant de les enregistrer
• Plans de réorganisation des dossiers, toujours prévisualisés avant toute modification
• Demander à l'IA : discutez de vos favoris. Elle peut les rechercher par mots, dossier, étiquette, site ou date d'ajout, trouver les doublons, suggérer des dossiers et consulter la page actuelle
• Demander à l'IA n'effectue de modifications que si vous le demandez : l'IA enregistre des pages, et propose les déplacements, renommages, suppressions et nouveaux dossiers sous forme d'un plan qui ne modifie rien tant que vous ne l'avez pas approuvé. Chaque modification peut être annulée
• Les réponses peuvent se terminer par des boutons : une question de suivi, des options parmi lesquelles choisir, l'enregistrement de la page dans un dossier suggéré ou l'ouverture d'un favori. Rien ne se passe tant que vous n'avez pas cliqué
• Choisissez ce que Demander à l'IA peut consulter ou modifier (Paramètres > IA)
• Lire le contenu des pages (désactivé par défaut) : envoie le texte lisible de chaque page, et pas seulement son titre et son adresse, pour de meilleures suggestions
• Les étiquettes, les résumés et les noms des nouveaux dossiers sont rédigés dans votre langue, dans celle que vous choisissez ou dans la langue de chaque page (Paramètres > IA)

Lorsque vous utilisez une fonctionnalité d'IA, les données dont elle a besoin sont envoyées directement de votre navigateur au service d'IA que vous avez choisi, selon les conditions de ce service : titres de favoris, adresses, noms de dossiers, dates d'ajout des favoris, ainsi que les étiquettes et résumés enregistrés ; le titre et l'adresse de la page actuelle ; vos messages Demander à l'IA ; le texte « À propos de moi » que vous écrivez, le cas échéant ; le fait que les liens vérifiés par Demander à l'IA fonctionnent encore ou non ; et, uniquement si Lire le contenu des pages est activé, le texte des pages concernées. Rien n'est envoyé à Bookmark Scout. Votre clé API est conservée dans le stockage local des extensions de ce navigateur et n'est pas synchronisée. L'utilisation d'un service d'IA peut être payante.

PARAMÈTRES ET SAUVEGARDE
• Sauvegarder les paramètres, en bas des paramètres, enregistre un fichier contenant les paramètres que vous avez modifiés, les prompts personnalisés, « À propos de moi », les services d'IA (jamais leurs clés), les recherches enregistrées et les colonnes du gestionnaire. Restaurer les paramètres les rétablit
• Seuls les paramètres que vous modifiez sont enregistrés : les valeurs par défaut améliorées des versions suivantes s'appliquent donc toujours à vous

POUR LES DÉVELOPPEURS
• Options de recherche : Respecter la casse, Mot entier et Expression régulière. L'adresse du gestionnaire conserve la recherche et le dossier : un lien peut ainsi l'ouvrir avec une recherche déjà lancée (?q=react), et les boutons Précédent et Suivant restaurent les deux
• Les services d'IA peuvent être des fournisseurs d'IA dans le cloud, n'importe quel point de terminaison compatible OpenAI ou un serveur de modèles sur votre propre ordinateur
• Exportation des favoris sélectionnés au format Markdown ou XML comme contexte pour une discussion avec une IA (fonctionne sans IA et n'envoie rien)
• L'Analyseur de confidentialité signale aussi les paramètres de requête sensibles, les fragments d'URL et les UUID
• Agents d'IA locaux (désactivé par défaut) : permettez aux agents d'IA de votre ordinateur, comme Claude Code, de consulter vos favoris via bookmark-scout-mcp, un programme open source installé à part. Si Autoriser les modifications est aussi activé, ils peuvent enregistrer et réorganiser des favoris, et chaque modification attend votre accord dans une fenêtre Bookmark Scout
• Open source sous licence AGPL-3.0 : https://github.com/isandrel/bookmark-scout

MISE À JOUR DEPUIS UNE VERSION ANTÉRIEURE
La version 0.3.3 enregistre ses données dans un nouveau format et ne convertit pas les anciennes données : les paramètres reviennent à leurs valeurs par défaut, les services d'IA et les clés API doivent être ajoutés à nouveau, et les prompts personnalisés, les recherches enregistrées, les étiquettes, les résumés et les icônes de site enregistrées sont effacés. Vos favoris eux-mêmes ne sont pas modifiés.

Créé par un développeur indépendant : ni entreprise, ni publicité, ni compte. Disponible en 9 langues. Thèmes clair, sombre et système.

Documentation : https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Bookmark Scout enregistre chaque page dans le bon dossier en quelques secondes, depuis la barre d'outils ou avec un seul raccourci clavier, puis vous aide à retrouver et à ranger vos favoris sans quitter le navigateur. Gratuit, sans compte et sans publicité.

ENREGISTRER DANS LE BON DOSSIER EN QUELQUES SECONDES
• Cliquez sur le bouton Bookmark Scout, saisissez une partie du nom de n'importe quel dossier, même profondément imbriqué dans l'arborescence, et enregistrez-y la page sans quitter le clavier
• Saisissez un chemin comme ai/llms ; une petite faute de frappe n'empêche pas de trouver le dossier, et les dossiers utilisés récemment apparaissent en premier
• Une page déjà présente dans ce dossier n'est pas enregistrée deux fois
• L'IA facultative suggère le meilleur dossier pour la page, ou un nouveau dossier que vous vérifiez avant sa création
• Enregistrement de liens dans les dossiers récents depuis le menu du clic droit, une fois Menu du clic droit activé dans les paramètres

RACCOURCIS D'ENREGISTREMENT RAPIDE
• Appuyez sur ⌥⇧S sur Mac (Alt+Shift+S sous Windows et Linux) sur n'importe quelle page pour l'enregistrer sans ouvrir Bookmark Scout : par défaut dans le dossier qui correspond le mieux à la page (déterminé sur votre appareil), ou dans le dernier dossier utilisé ou un dossier de votre choix
• Une petite notification dans la page indique où elle a été enregistrée, avec Annuler et d'autres dossiers vers lesquels la déplacer
• Lorsque l'IA est activée, ⌥⇧D sur Mac (Alt+Shift+D sous Windows et Linux) enregistre la page dans le premier dossier suggéré par l'IA
• Modifiez les touches dans Paramètres > Enregistrement et recherche > Raccourcis clavier

RETROUVER VOS FAVORIS
• Recherchez dans tous vos favoris pendant la saisie, directement depuis la barre d'outils
• Arborescence de dossiers avec glisser-déposer, Tout développer, Tout réduire et création de dossiers
• La même arborescence, la même recherche et les dossiers correspondants dans la barre latérale de Firefox, qui reste ouverte pendant votre navigation
• Suppression avec confirmation (activée par défaut) et annulation possible pendant 10 secondes

GESTIONNAIRE DE FAVORIS
Ouvrir le gestionnaire de favoris, dans la fenêtre pop-up de la barre d'outils ou dans la barre latérale, ouvre un gestionnaire complet dans un nouvel onglet, avec une arborescence de dossiers et un tableau triable.
• Menus contextuels sur les favoris, les dossiers et les zones vides : modifier, renommer, couper, copier, coller, ouvrir, afficher dans le dossier et supprimer
• Glisser-déposer pour déplacer des favoris dans des dossiers ou les réorganiser ; les liens déposés depuis d'autres pages deviennent des favoris
• Sélectionnez plusieurs lignes avec Cmd+clic et Shift+clic, copiez, coupez et collez avec les touches habituelles, et annulez ou rétablissez vos modifications avec ⌘Z et ⇧⌘Z sur Mac (Ctrl+clic, Ctrl+Z et Ctrl+Shift+Z sous Windows et Linux)

CE QUE FIREFOX VA DEMANDER, ET POURQUOI
À l'installation, Firefox ne demande qu'une chose : l'autorisation de lire et de modifier vos favoris. Tout le reste n'est demandé que lorsque vous utilisez la fonctionnalité qui en a besoin, après une courte explication. Si vous refusez, seule cette fonctionnalité reste désactivée.
• L'accès aux onglets du navigateur : uniquement pour enregistrer la page actuelle ou obtenir des suggestions de dossiers depuis la barre latérale. Le bouton de la barre d'outils et le raccourci d'enregistrement rapide ne nécessitent aucune autorisation
• Activation de l'IA : Firefox demande l'autorisation de partager des informations d'authentification, vos favoris et votre activité de navigation (votre clé API, vos favoris et dossiers, ainsi que le titre et l'adresse de la page actuelle). Sa demande indique que le développeur souhaite collecter ces données ; ici, il s'agit du service d'IA que vous avez choisi, qui les reçoit directement depuis votre navigateur. Rien ne parvient à Bookmark Scout
• Lire le contenu des pages : l'accès à vos données pour tous les sites Web, et le partage du contenu des sites Web avec votre service d'IA
• Vérifier le service : l'accès à l'adresse de votre service d'IA, et le partage des informations d'authentification (votre clé API) avec celui-ci

CONFIDENTIALITÉ
• Aucun compte, aucune mesure d'audience, aucun suivi, aucune publicité
• Vos favoris restent dans votre navigateur
• Les paramètres que vous modifiez, vos prompts personnalisés et « À propos de moi » sont synchronisés via Firefox Sync lorsque cette fonction est activée

SUGGESTIONS DE DOSSIERS PAR IA FACULTATIVES (DÉSACTIVÉES PAR DÉFAUT)
L'IA est facultative, et tout ce qui précède fonctionne sans elle. Pour l'utiliser, il vous faut un compte auprès d'une entreprise d'IA, qui peut facturer une petite somme à chaque utilisation, ou un programme d'IA gratuit sur votre propre ordinateur. Activez l'IA dans les paramètres et ajoutez le service que vous avez choisi. Bookmark Scout suggère alors des dossiers pour la page actuelle, dans la fenêtre pop-up ou avec le raccourci d'enregistrement rapide avec l'IA, et peut créer un nouveau dossier après votre vérification.

Lorsque vous demandez des suggestions, le titre et l'adresse de la page actuelle, les noms de vos dossiers et, uniquement si vous activez Lire le contenu des pages, le texte de la page sont envoyés directement de votre navigateur au service d'IA que vous avez choisi, selon les conditions de ce service. Rien n'est envoyé à Bookmark Scout. Votre clé API est conservée dans le stockage local des extensions de ce navigateur et n'est pas synchronisée. L'utilisation d'un service d'IA peut être payante.

PARAMÈTRES ET SAUVEGARDE
• Sauvegarder les paramètres, en bas des paramètres, enregistre un fichier contenant les paramètres que vous avez modifiés, les prompts personnalisés, « À propos de moi », les services d'IA (jamais leurs clés) et les recherches enregistrées. Restaurer les paramètres les rétablit
• Seuls les paramètres que vous modifiez sont enregistrés : les valeurs par défaut améliorées des versions suivantes s'appliquent donc toujours à vous

POUR LES DÉVELOPPEURS
• Options de recherche : Respecter la casse, Mot entier et Expression régulière
• Les services d'IA peuvent être des fournisseurs d'IA dans le cloud, n'importe quel point de terminaison compatible OpenAI ou un serveur de modèles sur votre propre ordinateur
• Open source sous licence AGPL-3.0 : https://github.com/isandrel/bookmark-scout

MISE À JOUR DEPUIS UNE VERSION ANTÉRIEURE
La version 0.3.3 enregistre ses données dans un nouveau format et ne convertit pas les anciennes données : les paramètres reviennent à leurs valeurs par défaut, les services d'IA et les clés API doivent être ajoutés à nouveau, et les prompts personnalisés, les recherches enregistrées, les étiquettes, les résumés et les icônes de site enregistrées sont effacés. Vos favoris eux-mêmes ne sont pas modifiés.

Créé par un développeur indépendant : ni entreprise, ni publicité, ni compte. Disponible en 9 langues. Thèmes clair, sombre et système.
```

## What's new in 0.3.3

Translation of the English release notes; paste into AMO's release notes for 0.3.3.

```text
• Enregistrement rapide : appuyez sur ⌥⇧S sur Mac (Alt+Shift+S sous Windows et Linux) sur n'importe quelle page pour l'enregistrer dans le dossier qui lui correspond le mieux. Une notification dans la page indique où elle a été enregistrée, avec Annuler et d'autres dossiers vers lesquels la déplacer. Lorsque l'IA est activée, ⌥⇧D sur Mac (Alt+Shift+D sous Windows et Linux) enregistre la page dans la première suggestion de l'IA
• Gestionnaire de favoris : menus contextuels, glisser-déposer, couper, copier et coller, sélection de plusieurs lignes, annulation et rétablissement
• Demander à l'IA peut enregistrer des pages et proposer des déplacements, renommages, suppressions et nouveaux dossiers qui ne modifient rien tant que vous ne les avez pas approuvés, et chaque modification peut être annulée. Les réponses peuvent se terminer par des boutons sur lesquels cliquer
• Choisissez les commandes affichées dans les menus du gestionnaire, et ce que Demander à l'IA peut faire
• Exporter, dans les paramètres, enregistre désormais une sauvegarde que vous pouvez importer
• Cette mise à jour réinitialise les données enregistrées de Bookmark Scout : les paramètres reviennent à leurs valeurs par défaut, et les services d'IA et clés API, les prompts personnalisés, les recherches enregistrées, les étiquettes et les résumés doivent être configurés à nouveau. Vos favoris ne sont pas modifiés
```

## Category

Same as `en.md`. Stores set the category once for all locales.

## Support and links

Same as [`en.md`](en.md#support-and-links). Where a store accepts a value per locale, use the French pages:

| Field | Value |
| --- | --- |
| Support URL | https://bookmark-scout.com/fr/support/ |
| Privacy policy URL | https://bookmark-scout.com/fr/privacy/ |
| Support email | support@bookmark-scout.com |
