# French Listing Copy (Français)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts were measured on 2026-10-10 and count Unicode characters.

| Block | Characters |
| --- | --- |
| Optional manifest description | 132 |
| Firefox Add-ons summary | 247 |
| Full description, Chrome and Edge | 5,476 |
| Full description, Firefox | 2,770 |

## Name

```text
Bookmark Scout
```

Read from `extName` in `apps/extension/public/_locales/fr/messages.json`. The brand name is not translated.

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

Packaged as `extDescription` (changing it needs a new version). Ships with the next version after 0.3.2 (132 characters):

```text
Classez vite vos pages dans le bon dossier : tapez une partie de son nom ou laissez l'IA le suggérer. Recherche et nettoyage inclus.
```

### Firefox Add-ons summary (250 characters maximum, 247 characters)

```text
Classez vite vos favoris dans le bon dossier : tapez une partie de son nom, même s'il est imbriqué, et validez au clavier, ou laissez l'IA facultative le suggérer. Recherche instantanée et arborescence dans la barre d'outils et le panneau latéral.
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
Bookmark Scout enregistre chaque page dans le bon dossier en quelques secondes, puis vous aide à retrouver et à ranger vos favoris sans quitter le navigateur.

ENREGISTRER DANS LE BON DOSSIER EN QUELQUES SECONDES
• Saisissez une partie du nom de n'importe quel dossier, même profondément imbriqué dans l'arborescence, et enregistrez-y la page actuelle sans quitter le clavier
• Saisissez un chemin comme work/react ; une petite faute de frappe n'empêche pas de trouver le dossier, et les dossiers utilisés récemment apparaissent en premier
• Une page déjà présente dans ce dossier n'est pas enregistrée deux fois
• L'IA facultative suggère le meilleur dossier pour la page, ou un nouveau chemin de dossiers que vous vérifiez avant sa création
• Menu contextuel facultatif (activez Menu contextuel dans les paramètres) pour enregistrer des liens dans les dossiers récents

RECHERCHER DEPUIS LA BARRE D'OUTILS
• Recherche instantanée dans tous les favoris, avec les options Respecter la casse, Mot entier et Expression régulière
• Arborescence de dossiers avec glisser-déposer, Tout développer, Tout réduire et création de dossiers
• Panneau latéral avec la même arborescence, la même recherche et les dossiers correspondants
• Raccourcis clavier qui ne remplacent jamais les raccourcis Ctrl/Cmd du navigateur
• Suppression avec boîte de dialogue de confirmation (activée par défaut) et annulation possible pendant 10 secondes

GESTIONNAIRE DE FAVORIS
Bookmark Scout remplace la page Favoris du navigateur par un gestionnaire doté d'une arborescence de dossiers, d'un fil d'Ariane, d'un tableau triable et filtrable, de colonnes redimensionnables et de recherches enregistrées (des vues intelligentes qui ne stockent que vos filtres et affichent toujours des résultats à jour).

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

Le vérificateur de liens morts, la récupération des métadonnées, l'outil Actualiser les icônes de site et le paramètre d'IA Lire le contenu des pages demandent un accès facultatif aux sites Web lors de leur première utilisation. Cet accès n'est jamais accordé à l'installation, les requêtes sont envoyées sans cookies, et si vous le refusez, la fonctionnalité concernée reste simplement désactivée.

OUTILS D'IA FACULTATIFS (DÉSACTIVÉS PAR DÉFAUT)
Activez l'IA dans les paramètres et choisissez un fournisseur d'IA dans le cloud, n'importe quel point de terminaison compatible OpenAI ou un serveur de modèles sur votre propre ordinateur, avec votre propre clé API lorsque le fournisseur en exige une.
• Suggestions de dossiers pour la page actuelle, y compris la création d'un nouveau chemin de dossiers après vérification
• Suggestions d'étiquettes et courts résumés, que vous vérifiez avant de les enregistrer
• Plans de réorganisation des dossiers, prévisualisés avant toute modification (par défaut)
• Exportation des favoris sélectionnés au format Markdown ou XML comme contexte pour une discussion avec une IA (fonctionne sans IA et n'envoie rien)
• Demander à l'IA : discutez de vos favoris ; l'IA peut rechercher les favoris correspondants, les noms de vos dossiers et la page actuelle
• Lire le contenu des pages (désactivé par défaut) : envoie le texte lisible de chaque page, et pas seulement son titre et son URL, pour de meilleures suggestions

Lorsque vous utilisez une fonctionnalité d'IA, les données dont elle a besoin sont envoyées directement de votre navigateur au fournisseur que vous avez choisi, selon les conditions de ce fournisseur : titres de favoris, URL, noms de dossiers, ainsi que les étiquettes et résumés enregistrés ; le titre et l'URL de la page actuelle ; vos messages Demander à l'IA ; et, uniquement si Lire le contenu des pages est activé, le texte des pages concernées. Rien n'est envoyé à Bookmark Scout. Votre clé API est conservée dans le stockage local des extensions de ce navigateur et n'est pas synchronisée. L'utilisation du fournisseur peut être payante.

CONFIDENTIALITÉ
• Aucun compte, aucune mesure d'audience, aucun suivi, aucune publicité
• Les favoris restent dans votre navigateur ; les étiquettes, les résumés et les recherches enregistrées restent dans le stockage local de l'extension
• Les paramètres sont synchronisés via votre compte de navigateur lorsque celui-ci le permet
• Open source sous licence AGPL-3.0 : https://github.com/isandrel/bookmark-scout

Disponible en 9 langues. Thèmes clair, sombre et système.

Documentation : https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Bookmark Scout enregistre chaque page dans le bon dossier en quelques secondes, puis vous aide à retrouver vos favoris sans quitter le navigateur.

ENREGISTRER DANS LE BON DOSSIER EN QUELQUES SECONDES
• Saisissez une partie du nom de n'importe quel dossier, même profondément imbriqué dans l'arborescence, et enregistrez-y la page actuelle sans quitter le clavier
• Saisissez un chemin comme work/react ; une petite faute de frappe n'empêche pas de trouver le dossier, et les dossiers utilisés récemment apparaissent en premier
• Une page déjà présente dans ce dossier n'est pas enregistrée deux fois
• L'IA facultative suggère le meilleur dossier pour la page, ou un nouveau chemin de dossiers que vous vérifiez avant sa création
• Enregistrement de liens dans les dossiers récents depuis le menu contextuel

RECHERCHER DEPUIS LA BARRE D'OUTILS
• Recherche instantanée dans tous les favoris, avec les options Respecter la casse, Mot entier et Expression régulière
• Arborescence de dossiers avec glisser-déposer, Tout développer, Tout réduire et création de dossiers
• La même arborescence, la même recherche et les dossiers correspondants dans le panneau latéral de Firefox, qui reste ouvert pendant votre navigation
• Raccourcis clavier qui ne remplacent jamais les raccourcis Ctrl/Cmd du navigateur
• Suppression avec boîte de dialogue de confirmation (activée par défaut) et annulation possible pendant 10 secondes

SUGGESTIONS DE DOSSIERS PAR IA FACULTATIVES (DÉSACTIVÉES PAR DÉFAUT)
Activez l'IA dans les paramètres et choisissez un fournisseur d'IA dans le cloud, n'importe quel point de terminaison compatible OpenAI ou un serveur de modèles sur votre propre ordinateur, avec votre propre clé API lorsque le fournisseur en exige une. Bookmark Scout suggère alors des dossiers pour la page actuelle et peut créer un nouveau chemin de dossiers après votre vérification.

Lorsque vous demandez des suggestions, le titre et l'URL de la page actuelle ainsi que les noms de vos dossiers sont envoyés directement de votre navigateur au fournisseur que vous avez choisi, selon les conditions de ce fournisseur. Rien n'est envoyé à Bookmark Scout. Votre clé API est conservée dans le stockage local des extensions de ce navigateur et n'est pas synchronisée. L'utilisation du fournisseur peut être payante.

CONFIDENTIALITÉ
• Aucun compte, aucune mesure d'audience, aucun suivi, aucune publicité
• Les favoris restent dans votre navigateur
• Les paramètres sont synchronisés via Firefox Sync lorsque cette fonction est activée
• Open source sous licence AGPL-3.0 : https://github.com/isandrel/bookmark-scout

Disponible en 9 langues. Thèmes clair, sombre et système.

Le gestionnaire de favoris s'ouvre dans un nouvel onglet depuis la fenêtre pop-up de la barre d'outils.
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
