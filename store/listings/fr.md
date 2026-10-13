# French Listing Copy (Français)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts were measured on 2026-10-12 and count Unicode characters.

| Block | Characters |
| --- | --- |
| Optional manifest description | 132 |
| Firefox Add-ons summary | 242 |
| Full description, Chrome and Edge | 9,517 |
| Full description, Firefox | 5,084 |
| What's new in 0.3.3 | 1,324 |

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

### Firefox Add-ons summary (250 characters maximum, 242 characters)

```text
Classez vite vos pages dans le bon dossier : tapez une partie de son nom, appuyez sur Alt+Shift+S pour enregistrer dans le plus pertinent ou laissez l'IA facultative en suggérer un. Recherche instantanée, arborescence et gestionnaire complet.
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
Bookmark Scout enregistre chaque page dans le bon dossier en quelques secondes, depuis la barre d'outils ou avec un seul raccourci clavier, puis vous aide à retrouver et à ranger vos favoris sans quitter le navigateur.

ENREGISTRER DANS LE BON DOSSIER EN QUELQUES SECONDES
• Saisissez une partie du nom de n'importe quel dossier, même profondément imbriqué dans l'arborescence, et enregistrez-y la page actuelle sans quitter le clavier
• Saisissez un chemin comme work/react ; une petite faute de frappe n'empêche pas de trouver le dossier, et les dossiers utilisés récemment apparaissent en premier
• Une page déjà présente dans ce dossier n'est pas enregistrée deux fois
• L'IA facultative suggère le meilleur dossier pour la page, ou un nouveau chemin de dossiers que vous vérifiez avant sa création
• Menu contextuel facultatif (activez Menu contextuel dans les paramètres) pour enregistrer des liens dans les dossiers récents

RACCOURCIS D'ENREGISTREMENT RAPIDE
• Appuyez sur Alt+Shift+S sur n'importe quelle page pour l'enregistrer sans ouvrir Bookmark Scout : par défaut dans le dossier qui correspond le mieux à la page (classement calculé sur votre appareil), ou dans le dernier dossier utilisé ou un dossier de votre choix
• Une petite notification dans la page indique où elle a été enregistrée, avec Annuler et d'autres dossiers vers lesquels la déplacer
• Lorsque l'IA est activée, Alt+Shift+D enregistre la page dans le premier dossier suggéré par l'IA
• Modifiez les touches sur la page des raccourcis du navigateur. Vous pouvez aussi y attribuer Ctrl+D (⌘D sur Mac) à l'enregistrement rapide, qui remplace alors la fenêtre de favoris du navigateur ; les paramètres expliquent comment faire

RECHERCHER DEPUIS LA BARRE D'OUTILS
• Recherche instantanée dans tous les favoris, avec les options Respecter la casse, Mot entier et Expression régulière
• Arborescence de dossiers avec glisser-déposer, Tout développer, Tout réduire et création de dossiers
• Panneau latéral avec la même arborescence, la même recherche et les dossiers correspondants
• Suppression avec boîte de dialogue de confirmation (activée par défaut) et annulation possible pendant 10 secondes

GESTIONNAIRE DE FAVORIS
Bookmark Scout remplace la page Favoris du navigateur par un gestionnaire qui fonctionne comme celui du navigateur, avec en plus un fil d'Ariane, un tableau triable et filtrable, des colonnes redimensionnables et des recherches enregistrées (des vues intelligentes qui ne stockent que vos filtres et affichent toujours des résultats à jour).
• Menus contextuels sur les favoris, les dossiers et les zones vides : modifier, renommer, couper, copier, coller, ouvrir dans de nouveaux onglets ou de nouvelles fenêtres, afficher dans le dossier et supprimer
• Glisser-déposer pour déplacer des favoris dans des dossiers ou les réorganiser ; les liens déposés depuis d'autres pages deviennent des favoris
• Sélectionnez plusieurs lignes avec Ctrl+clic et Shift+clic, et utilisez les raccourcis clavier du gestionnaire de favoris du navigateur (Cmd sur Mac) : Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Delete, Ctrl+Z pour annuler et Ctrl+Y pour rétablir
• Annuler et rétablir s'appliquent aux modifications, aux déplacements, aux tris et aux suppressions, y compris ceux effectués par Demander à l'IA
• L'adresse conserve la recherche et le dossier : un lien peut ainsi ouvrir le gestionnaire avec une recherche déjà lancée (?q=react) ou dans un dossier, et les boutons Précédent et Suivant restaurent les deux
• Choisissez les commandes affichées dans le menu contextuel et le menu ⋯, ainsi que leur ordre (Paramètres > Comportement)

OUTILS DE MAINTENANCE
• Nettoyeur de doublons : vérifiez les groupes de doublons avant de supprimer les copies en trop
• Nettoyeur d'URL : prévisualisez et supprimez les paramètres de suivi
• Vérificateur de liens morts : trouvez les liens inaccessibles, puis vérifiez les réparations (supprimer, utiliser la cible de la redirection, pointer vers une copie archivée ou modifier l'URL), avec annulation possible
• Récupération des métadonnées : suggère des titres de page et n'applique que ceux que vous sélectionnez
• Analyseur de confidentialité : détecte les paramètres de requête sensibles, les fragments d'URL, les adresses e-mail et les UUID dans les favoris
• Statistiques : domaines, dossiers, profondeur et doublons
• Actualiser les icônes de site : récupère l'icône propre à chaque site, sans service d'icônes tiers
• Importation depuis un fichier HTML ou JSON, avec aperçu, gestion des doublons et annulation possible
• Exportation au format HTML, JSON, Markdown ou CSV, avec une vérification de confidentialité facultative qui peut masquer les valeurs sensibles

Le vérificateur de liens morts, la récupération des métadonnées, l'outil Actualiser les icônes de site et le paramètre d'IA Lire le contenu des pages demandent un accès facultatif aux sites Web lors de leur première utilisation ; une fois cet accès autorisé, Demander à l'IA peut aussi vérifier si les liens de vos favoris fonctionnent toujours. Cet accès n'est jamais accordé à l'installation, les requêtes sont envoyées sans cookies, et si vous le refusez, la fonctionnalité concernée reste simplement désactivée.

PARAMÈTRES ET SAUVEGARDE
• Exporter, en bas des paramètres, enregistre une sauvegarde : les paramètres que vous avez modifiés, les prompts personnalisés, les services d'IA (jamais leurs clés API), les recherches enregistrées et les colonnes du gestionnaire. Importer la restaure
• Seuls les paramètres que vous modifiez sont enregistrés : les valeurs par défaut améliorées des versions suivantes s'appliquent donc toujours à vous

OUTILS D'IA FACULTATIFS (DÉSACTIVÉS PAR DÉFAUT)
Activez l'IA dans les paramètres et choisissez un fournisseur d'IA dans le cloud, n'importe quel point de terminaison compatible OpenAI ou un serveur de modèles sur votre propre ordinateur, avec votre propre clé API lorsque le fournisseur en exige une.
• Suggestions de dossiers pour la page actuelle, y compris la création d'un nouveau chemin de dossiers après vérification
• Suggestions d'étiquettes et courts résumés, que vous vérifiez avant de les enregistrer
• Plans de réorganisation des dossiers, toujours prévisualisés avant toute modification
• Exportation des favoris sélectionnés au format Markdown ou XML comme contexte pour une discussion avec une IA (fonctionne sans IA et n'envoie rien)
• Demander à l'IA : discutez de vos favoris. L'IA peut les rechercher par mots, dossier, étiquette, site ou date d'ajout, trouver les doublons, suggérer des dossiers et consulter la page actuelle
• Demander à l'IA n'effectue de modifications que si vous le demandez : l'IA enregistre des pages, et propose les déplacements, renommages, suppressions et nouveaux dossiers sous forme d'un plan qui ne modifie rien tant que vous ne l'avez pas approuvé. Chaque modification peut être annulée
• Les réponses peuvent se terminer par des boutons : une question de suivi, des options parmi lesquelles choisir, l'enregistrement de la page dans un dossier suggéré ou l'ouverture d'un favori. Rien ne se passe tant que vous n'avez pas cliqué
• Choisissez ce que Demander à l'IA peut consulter ou modifier (Paramètres > IA)
• Lire le contenu des pages (désactivé par défaut) : envoie le texte lisible de chaque page, et pas seulement son titre et son URL, pour de meilleures suggestions
• Agents d'IA locaux (désactivé par défaut) : permettez aux agents d'IA de votre ordinateur, comme Claude Code, de consulter vos favoris via bookmark-scout-mcp, un programme open source installé à part. Si Autoriser les modifications est aussi activé, ils peuvent enregistrer et réorganiser des favoris, et chaque modification attend votre accord dans une fenêtre Bookmark Scout

Lorsque vous utilisez une fonctionnalité d'IA, les données dont elle a besoin sont envoyées directement de votre navigateur au fournisseur que vous avez choisi, selon les conditions de ce fournisseur : titres de favoris, URL, noms de dossiers, dates d'ajout des favoris, ainsi que les étiquettes et résumés enregistrés ; le titre et l'URL de la page actuelle ; vos messages Demander à l'IA ; le fait que les liens vérifiés par Demander à l'IA fonctionnent encore ou non ; et, uniquement si Lire le contenu des pages est activé, le texte des pages concernées. Rien n'est envoyé à Bookmark Scout. Votre clé API est conservée dans le stockage local des extensions de ce navigateur et n'est pas synchronisée. L'utilisation du fournisseur peut être payante.

CONFIDENTIALITÉ
• Aucun compte, aucune mesure d'audience, aucun suivi, aucune publicité
• Les favoris restent dans votre navigateur ; les étiquettes, les résumés et les recherches enregistrées restent dans le stockage local de l'extension
• Les paramètres que vous modifiez et vos prompts personnalisés sont synchronisés via votre compte de navigateur lorsque celui-ci le permet
• Open source sous licence AGPL-3.0 : https://github.com/isandrel/bookmark-scout

MISE À JOUR DEPUIS UNE VERSION ANTÉRIEURE
La version 0.3.3 enregistre ses données dans un nouveau format et ne convertit pas les anciennes données : les paramètres reviennent à leurs valeurs par défaut, les services d'IA et les clés API doivent être ajoutés à nouveau, et les prompts personnalisés, les recherches enregistrées, les étiquettes, les résumés et les icônes de site enregistrées sont effacés. Vos favoris eux-mêmes ne sont pas modifiés.

Disponible en 9 langues. Thèmes clair, sombre et système.

Documentation : https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Bookmark Scout enregistre chaque page dans le bon dossier en quelques secondes, depuis la barre d'outils ou avec un seul raccourci clavier, puis vous aide à retrouver et à ranger vos favoris sans quitter le navigateur.

ENREGISTRER DANS LE BON DOSSIER EN QUELQUES SECONDES
• Saisissez une partie du nom de n'importe quel dossier, même profondément imbriqué dans l'arborescence, et enregistrez-y la page actuelle sans quitter le clavier
• Saisissez un chemin comme work/react ; une petite faute de frappe n'empêche pas de trouver le dossier, et les dossiers utilisés récemment apparaissent en premier
• Une page déjà présente dans ce dossier n'est pas enregistrée deux fois
• L'IA facultative suggère le meilleur dossier pour la page, ou un nouveau chemin de dossiers que vous vérifiez avant sa création
• Enregistrement de liens dans les dossiers récents depuis le menu contextuel

RACCOURCIS D'ENREGISTREMENT RAPIDE
• Appuyez sur Alt+Shift+S sur n'importe quelle page pour l'enregistrer sans ouvrir Bookmark Scout : par défaut dans le dossier qui correspond le mieux à la page (classement calculé sur votre appareil), ou dans le dernier dossier utilisé ou un dossier de votre choix
• Une petite notification dans la page indique où elle a été enregistrée, avec Annuler et d'autres dossiers vers lesquels la déplacer
• Lorsque l'IA est activée, Alt+Shift+D enregistre la page dans le premier dossier suggéré par l'IA
• Modifiez les touches dans Paramètres > Enregistrement et recherche > Raccourcis clavier

RECHERCHER DEPUIS LA BARRE D'OUTILS
• Recherche instantanée dans tous les favoris, avec les options Respecter la casse, Mot entier et Expression régulière
• Arborescence de dossiers avec glisser-déposer, Tout développer, Tout réduire et création de dossiers
• La même arborescence, la même recherche et les dossiers correspondants dans la barre latérale de Firefox, qui reste ouverte pendant votre navigation
• Suppression avec boîte de dialogue de confirmation (activée par défaut) et annulation possible pendant 10 secondes

GESTIONNAIRE DE FAVORIS
Ouvrir le gestionnaire de favoris, dans la fenêtre pop-up de la barre d'outils ou dans la barre latérale, ouvre un gestionnaire complet dans un nouvel onglet, avec une arborescence de dossiers et un tableau triable et filtrable.
• Menus contextuels sur les favoris, les dossiers et les zones vides : modifier, renommer, couper, copier, coller, ouvrir, afficher dans le dossier et supprimer
• Glisser-déposer pour déplacer des favoris dans des dossiers ou les réorganiser ; les liens déposés depuis d'autres pages deviennent des favoris
• Sélectionnez plusieurs lignes avec Ctrl+clic et Shift+clic (Cmd sur Mac), copiez, coupez et collez avec les touches habituelles, et annulez ou rétablissez vos modifications avec Ctrl+Z et Ctrl+Y

PARAMÈTRES ET SAUVEGARDE
• Exporter, en bas des paramètres, enregistre une sauvegarde : les paramètres que vous avez modifiés, les prompts personnalisés, les services d'IA (jamais leurs clés API) et les recherches enregistrées. Importer la restaure
• Seuls les paramètres que vous modifiez sont enregistrés : les valeurs par défaut améliorées des versions suivantes s'appliquent donc toujours à vous

SUGGESTIONS DE DOSSIERS PAR IA FACULTATIVES (DÉSACTIVÉES PAR DÉFAUT)
Activez l'IA dans les paramètres et choisissez un fournisseur d'IA dans le cloud, n'importe quel point de terminaison compatible OpenAI ou un serveur de modèles sur votre propre ordinateur, avec votre propre clé API lorsque le fournisseur en exige une. Bookmark Scout suggère alors des dossiers pour la page actuelle, dans la fenêtre pop-up ou avec le raccourci d'enregistrement rapide avec l'IA, et peut créer un nouveau chemin de dossiers après votre vérification.

Lorsque vous demandez des suggestions, le titre et l'URL de la page actuelle, les noms de vos dossiers et, uniquement si vous activez Lire le contenu des pages, le texte de la page sont envoyés directement de votre navigateur au fournisseur que vous avez choisi, selon les conditions de ce fournisseur. Rien n'est envoyé à Bookmark Scout. Votre clé API est conservée dans le stockage local des extensions de ce navigateur et n'est pas synchronisée. L'utilisation du fournisseur peut être payante.

CONFIDENTIALITÉ
• Aucun compte, aucune mesure d'audience, aucun suivi, aucune publicité
• Les favoris restent dans votre navigateur
• Les paramètres que vous modifiez et vos prompts personnalisés sont synchronisés via Firefox Sync lorsque cette fonction est activée
• Open source sous licence AGPL-3.0 : https://github.com/isandrel/bookmark-scout

MISE À JOUR DEPUIS UNE VERSION ANTÉRIEURE
La version 0.3.3 enregistre ses données dans un nouveau format et ne convertit pas les anciennes données : les paramètres reviennent à leurs valeurs par défaut, les services d'IA et les clés API doivent être ajoutés à nouveau, et les prompts personnalisés, les recherches enregistrées, les étiquettes, les résumés et les icônes de site enregistrées sont effacés. Vos favoris eux-mêmes ne sont pas modifiés.

Disponible en 9 langues. Thèmes clair, sombre et système.
```

## What's new in 0.3.3

Translation of the English release notes; paste into AMO's release notes for 0.3.3.

```text
• Enregistrement rapide : appuyez sur Alt+Shift+S sur n'importe quelle page pour l'enregistrer dans le dossier qui lui correspond le mieux. Une notification dans la page indique où elle a été enregistrée, avec Annuler et d'autres dossiers vers lesquels la déplacer. Lorsque l'IA est activée, Alt+Shift+D enregistre la page dans la première suggestion de l'IA
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
