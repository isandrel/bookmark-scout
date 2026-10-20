<p align="center">
  <a href="../../CONTRIBUTING.md" lang="en" hreflang="en">English</a> ·
  <a href="../zh-CN/CONTRIBUTING.md" lang="zh-CN" hreflang="zh-CN">简体中文</a> ·
  <a href="../es/CONTRIBUTING.md" lang="es" hreflang="es">Español</a> ·
  <strong lang="fr">Français</strong> ·
  <a href="../pt-BR/CONTRIBUTING.md" lang="pt-BR" hreflang="pt-BR">Português (Brasil)</a> ·
  <a href="../de/CONTRIBUTING.md" lang="de" hreflang="de">Deutsch</a> ·
  <a href="../ja/CONTRIBUTING.md" lang="ja" hreflang="ja">日本語</a> ·
  <a href="../ko/CONTRIBUTING.md" lang="ko" hreflang="ko">한국어</a> ·
  <a href="../zh-TW/CONTRIBUTING.md" lang="zh-TW" hreflang="zh-TW">繁體中文</a>
</p>

# 🤝 Contribuer à Bookmark Scout

Tout d'abord, merci d'envisager de contribuer à Bookmark Scout ! Ce sont des personnes comme vous qui rendent cette extension meilleure pour tout le monde.

## 📋 Table des matières

- [Code de conduite](#-code-de-conduite)
- [Comment contribuer ?](#-comment-contribuer-)
- [Environnement de développement](#-environnement-de-développement)
- [Processus de pull request](#-processus-de-pull-request)
- [Conventions de style](#-conventions-de-style)
- [Internationalisation](#-internationalisation)
- [Des questions ?](#-des-questions-)

## 📜 Code de conduite

Ce projet applique un [code de conduite](../../CODE_OF_CONDUCT.md). En y participant, vous vous engagez à adopter un comportement respectueux et inclusif. Signalez tout comportement inacceptable via les GitHub Issues.

## 🎯 Comment contribuer ?

### 🐛 Signaler des bugs

Avant de créer un rapport de bug, vérifiez les issues existantes pour éviter les doublons.

**Dans un rapport de bug, indiquez :**

- Le navigateur et sa version (Chrome, Firefox, Edge)
- La version de l'extension
- Les étapes pour reproduire le problème
- Le comportement attendu et le comportement observé
- Des captures d'écran, le cas échéant

Utilisez notre [modèle de rapport de bug](../../.github/ISSUE_TEMPLATE/01-bug-report.yml).

### ✨ Proposer des fonctionnalités

Les suggestions de fonctionnalités sont les bienvenues ! Utilisez notre [modèle de demande de fonctionnalité](../../.github/ISSUE_TEMPLATE/02-feature-request.yml).

**Une bonne demande de fonctionnalité comprend :**

- Une description claire du problème
- La solution proposée
- Les autres approches envisagées

### 🔧 Contribuer au code

Vous cherchez quelque chose sur quoi travailler ? Consultez les issues portant ces labels :

- `good first issue` : idéal pour une première contribution
- `help wanted` : votre aide est la bienvenue

## 💻 Environnement de développement

Pour utiliser Bookmark Scout, installez-le depuis la boutique de votre navigateur ou depuis une release GitHub, comme l'explique le [README](README.md#-installation). Les étapes ci-dessous le compilent à partir des sources, pour travailler dessus. Pour la stack technique, l'état des fonctionnalités, les builds de release et la structure du projet, consultez [DEVELOPMENT.md](../../DEVELOPMENT.md).

### Prérequis

- [Bun](https://bun.sh) (dernière version)
- [mise](https://mise.jdx.dev/) pour la gestion des runtimes
- L'un de ces navigateurs : Chrome, Firefox, Edge

### Installation

```bash
# Cloner le dépôt
git clone https://github.com/isandrel/bookmark-scout.git
cd bookmark-scout

# Installer les dépendances
bun install

# Lancer le serveur de développement (Chrome)
bun run dev
```

### Compilation

```bash
# Compiler pour tous les navigateurs
bun run build

# Compiler pour Chrome
bunx nx run extension:build:chrome

# Compiler pour Firefox
bun run build:firefox

# Compiler pour Edge
bun run build:edge
```

### Charger l'extension

**Chrome/Edge :**

1. Ouvrez `chrome://extensions` ou `edge://extensions`
2. Activez le **Mode développeur**
3. Cliquez sur **Charger l'extension non empaquetée** (**Charger l'extension décompressée** dans Edge)
4. Sélectionnez `apps/extension/dist/chrome-mv3` (Chrome) ou `apps/extension/dist/edge-mv3` (Edge)

**Firefox :**

1. Ouvrez `about:debugging#/runtime/this-firefox`
2. Cliquez sur **Charger un module complémentaire temporaire**
3. Sélectionnez le fichier `manifest.json` dans `apps/extension/dist/firefox-mv2`

## 🔄 Processus de pull request

### Avant de commencer

1. **Synchronisez-vous avec main** : faites toujours un pull avec rebase avant de commencer
   ```bash
   git checkout main
   git pull --rebase origin main
   ```

2. **Créez une issue** : discutez des changements importants avant de les implémenter

3. **Créez une branche** : suivez la convention de nommage
   ```bash
   git checkout -b feat/123-description
   git checkout -b fix/123-description
   ```

### Messages de commit

Nous utilisons les [Conventional Commits](https://www.conventionalcommits.org/) avec [Gitmoji](https://gitmoji.dev/) :

```
✨ feat(scope): add new feature
🐛 fix(scope): fix bug description
📝 docs: update documentation
♻️ refactor(scope): refactor code
🔧 chore: maintenance task
```

| Emoji | Type       | Description                  |
| ----- | ---------- | ---------------------------- |
| ✨    | `feat`     | Nouvelle fonctionnalité      |
| 🐛    | `fix`      | Correction de bug            |
| 📝    | `docs`     | Documentation                |
| 💄    | `style`    | Interface et styles          |
| ♻️     | `refactor` | Refactorisation du code      |
| ⚡    | `perf`     | Performances                 |
| ✅    | `test`     | Tests                        |
| 🔧    | `chore`    | Maintenance                  |

### Créer une pull request

1. **Poussez votre branche**
   ```bash
   git push -u origin feat/123-description
   ```

2. **Créez la PR avec GitHub CLI**
   ```bash
   gh pr create --title "✨ feat: description" --body "Closes #123" --base main
   ```

3. **Attendez que les vérifications de la CI** réussissent

4. **Tenez compte des retours de la revue**, le cas échéant

### Checklist de la PR

- [ ] Le code respecte les conventions de style du projet
- [ ] Relecture personnelle effectuée
- [ ] Validation lint/build correspondante effectuée
- [ ] Tests ajoutés ou mis à jour, le cas échéant, lorsqu'une suite de tests couvre la partie modifiée
- [ ] Documentation mise à jour si nécessaire
- [ ] Liée à l'issue correspondante

## 📐 Conventions de style

### Style du code

Nous utilisons [Biome](https://biomejs.dev/) pour le lint et le formatage.

```bash
# Vérifier le lint
bun run lint

# Lancer uniquement le lint de l'extension
bunx nx run extension:lint

# Lancer tous les tests de l'extension (compile Chrome et installe le Chromium de Playwright)
bun run test
```

La commande de test exécute les tests unitaires et la suite E2E Chromium en mode headless (fenêtre pop-up, panneau latéral, gestionnaire de favoris, paramètres, enregistrement rapide, maintenance, rapports, importation et exportation, Demander à l'IA, et parcours entre plusieurs surfaces). La CI exécute les mêmes suites sans configuration manuelle du navigateur, ainsi que la suite Edge et la suite de tests de fumée Firefox. Les flux qui dépendent du réseau et des fournisseurs d'IA s'exécutent hors ligne : les tests intitulés `[mocked provider contract]` simulent les fournisseurs d'IA (mocks `ai` de Vitest et un point de terminaison compatible OpenAI routé par Playwright) et simulent les requêtes réseau ; ils vérifient le contrat de requête et de réponse de Bookmark Scout, l'activation explicite et la gestion des erreurs, et non la compatibilité avec les vrais fournisseurs ou sites Web.

Autres suites, pour les changements qu'elles couvrent :

```bash
# Edge et Firefox
bunx nx run extension:test:e2e:edge
bunx nx run extension:test:e2e:firefox

# Agents d'IA locaux : les tests propres au pont MCP, puis le binaire compilé
# bookmark-scout-mcp avec l'extension dans Chromium (Linux et macOS)
bun test packages/mcp-bridge
bunx nx run extension:test:e2e:bridge

# Latence et défilement sur une grande collection ; à lancer avant et après un changement de vitesse
bunx nx run extension:test:perf

# Fonctionnalités d'IA avec un vrai fournisseur ; ignorées si les variables BS_LIVE_AI_* ne sont pas définies
# (voir apps/extension/tests/live/README.md)
bunx nx run extension:test:live
```

La CI exécute les tests du pont lorsque l'extension ou `packages/mcp-bridge` change, la suite de performances chaque jour, et la suite d'IA réelle uniquement à la demande.

### L'IA intégrée de Chrome

Le service **IA intégrée** utilise le modèle propre à Chrome (Gemini Nano, le `LanguageModel` de la Prompt API) sur votre ordinateur. Les tests unitaires et E2E utilisent un faux `LanguageModel` (`tests/unit/fake-language-model.ts`, `tests/e2e/builtin-ai.spec.ts`) ; le vrai modèle se vérifie à la main :

1. Utilisez Chrome 138 ou une version ultérieure sur un ordinateur qui respecte la [configuration matérielle requise par Chrome](https://developer.chrome.com/docs/ai/get-started#hardware). **Vérifier cet ordinateur**, sous le service dans Paramètres > IA, compare cet ordinateur à ces exigences. Pour l'essayer sur un ordinateur moins puissant, réglez `chrome://flags/#optimization-guide-on-device-model` sur **Enabled BypassPerfRequirement** et redémarrez Chrome.
2. Le navigateur ouvert par `bun run dev` indique que le modèle n'est pas disponible. Lancez-le avec l'option ci-dessous, ou désactivez le runner et chargez `apps/extension/dist/chrome-mv3-dev` dans votre propre profil Chrome depuis `chrome://extensions`. Gardez ce fichier propre à chaque développeur hors de Git : `apps/extension/web-ext.config.ts` est ignoré.

   ```ts
   // apps/extension/web-ext.config.ts
   import { defineWebExtConfig } from 'wxt';

   export default defineWebExtConfig({
     chromiumArgs: ['--disable-features=DisableLoadExtensionCommandLineSwitch'],
     // Ou utilisez plutôt votre propre profil : disabled: true,
   });
   ```

3. Dans **Paramètres** > **IA**, cliquez sur **Utiliser l'IA intégrée**, puis sur **Télécharger le modèle**. `chrome://on-device-internals` affiche l'état et le téléchargement du modèle, et permet de lui envoyer directement un prompt ; Chrome ne l'ouvre qu'après l'activation de ses pages de débogage internes dans `chrome://chrome-urls`.
4. Activez **Fonctionnalités d'IA** et **Enregistrer les requêtes**, ouvrez la fenêtre pop-up sur une page et cliquez sur le bouton de suggestion de dossier. **Activité de l'IA** affiche le prompt avec la mention `ON-DEVICE`.
5. Appuyez deux fois sur le raccourci d'enregistrement rapide avec l'IA sur une page. Les deux enregistrements apparaissent dans **Activité de l'IA** ; le second est plus rapide, car la page hôte de l'IA (un document offscreen, listé dans `chrome://extensions` parmi les vues de l'extension) garde les instructions chargées pendant `[quick_save] idle_timeout_ms` dans `apps/extension/config/ai/built-in.toml`.

### TypeScript

- Utilisez TypeScript pour tout nouveau code
- Préférez `type` à `interface` pour les types d'objets
- Indiquez explicitement le type de retour des fonctions

### Composants React

- Utilisez des composants fonctionnels avec des hooks
- Gardez des composants petits et ciblés
- Donnez des noms explicites aux props

### Organisation des fichiers

```
apps/extension/src/
├── components/     # Reusable UI components
├── hooks/          # Custom React hooks
├── services/       # Bookmark actions, AI, browser integrations, import/export
├── stores/         # Zustand stores
├── lib/            # Storage, schemas, and low-level helpers
├── types/          # TypeScript types
└── entrypoints/    # Extension entry points
```

`packages/mcp-bridge` contient `bookmark-scout-mcp`, le serveur MCP et l'hôte de messagerie native qu'utilisent les agents d'IA locaux ; ses messages vers l'extension sont définis dans `packages/mcp-bridge/src/protocol.ts`.

## 🌐 Internationalisation

Lorsque vous ajoutez du texte visible par l'utilisateur :

1. Ajoutez les chaînes dans `apps/extension/public/_locales/<locale>/messages.json`
2. Ajoutez-les dans chaque langue listée sous `[locales] extension` dans `config/project.toml`
3. Utilisez l'utilitaire i18n existant : `t("message_key")`

`README.md`, ce guide et leurs traductions dans `i18n/<language>/` sont générés à partir de `templates/` : modifiez le modèle, jamais le fichier généré. Consultez [Generated Markdown](../../DEVELOPMENT.md#-generated-markdown).

## 🤔 Des questions ?

- Consultez les [issues](https://github.com/isandrel/bookmark-scout/issues) existantes
- Lancez une [discussion](https://github.com/isandrel/bookmark-scout/discussions)
- Créez une [issue de type question](../../.github/ISSUE_TEMPLATE/04-question.yml)

## 🙏 Merci !

Chaque contribution aide à améliorer Bookmark Scout, qu'il s'agisse de :

- 🐛 Signaler des bugs
- ✨ Proposer des fonctionnalités
- 📝 Améliorer la documentation
- 🔧 Écrire du code
- 🌐 Traduire

Merci pour votre temps et vos efforts !
