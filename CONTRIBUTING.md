<p align="center">
  <strong lang="en">English</strong> ·
  <a href="i18n/es/CONTRIBUTING.md" lang="es" hreflang="es">Español</a> ·
  <a href="i18n/pt-BR/CONTRIBUTING.md" lang="pt-BR" hreflang="pt-BR">Português (Brasil)</a> ·
  <a href="i18n/ja/CONTRIBUTING.md" lang="ja" hreflang="ja">日本語</a> ·
  <a href="i18n/de/CONTRIBUTING.md" lang="de" hreflang="de">Deutsch</a> ·
  <a href="i18n/fr/CONTRIBUTING.md" lang="fr" hreflang="fr">Français</a> ·
  <a href="i18n/zh-CN/CONTRIBUTING.md" lang="zh-CN" hreflang="zh-CN">简体中文</a> ·
  <a href="i18n/ko/CONTRIBUTING.md" lang="ko" hreflang="ko">한국어</a> ·
  <a href="i18n/zh-TW/CONTRIBUTING.md" lang="zh-TW" hreflang="zh-TW">繁體中文</a>
</p>

# 🤝 Contributing to Bookmark Scout

First off, thank you for considering contributing to Bookmark Scout! It's people like you that make this extension better for everyone.

## 📋 Table of Contents

- [Code of Conduct](#-code-of-conduct)
- [How Can I Contribute?](#-how-can-i-contribute)
- [Development Setup](#-development-setup)
- [Pull Request Process](#-pull-request-process)
- [Style Guidelines](#-style-guidelines)
- [Internationalization](#-internationalization)
- [Questions?](#-questions)

## 📜 Code of Conduct

This project adheres to a [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold respectful and inclusive behavior. Please report unacceptable behavior via GitHub Issues.

## 🎯 How Can I Contribute?

### 🐛 Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates.

**When reporting a bug, include:**

- Browser and version (Chrome, Firefox, Edge)
- Extension version
- Steps to reproduce
- Expected vs actual behavior
- Screenshots if applicable

Use our [bug report template](.github/ISSUE_TEMPLATE/01-bug-report.yml).

### ✨ Suggesting Features

We love feature suggestions! Please use our [feature request template](.github/ISSUE_TEMPLATE/02-feature-request.yml).

**Great feature requests include:**

- Clear problem statement
- Proposed solution
- Alternative approaches considered

### 🔧 Code Contributions

Looking for something to work on? Check issues labeled:

- `good first issue` - Great for newcomers
- `help wanted` - We'd love your help

## 💻 Development Setup

To use Bookmark Scout, install it from your browser's store or a GitHub release, as the [README](README.md#-install) describes. The steps below build it from source, for working on it. For the tech stack, feature status, release builds, and project structure, see [DEVELOPMENT.md](DEVELOPMENT.md).

### Prerequisites

- [Bun](https://bun.sh) (latest version)
- [mise](https://mise.jdx.dev/) for runtime management
- One of these browsers: Chrome, Firefox, Edge

### Installation

```bash
# Clone the repository
git clone https://github.com/isandrel/bookmark-scout.git
cd bookmark-scout

# Install dependencies
bun install

# Start development server (Chrome)
bun run dev
```

### Building

```bash
# Build for all browsers
bun run build

# Build for Chrome
bunx nx run extension:build:chrome

# Build for Firefox
bun run build:firefox

# Build for Edge
bun run build:edge
```

### Loading the Extension

**Chrome/Edge:**

1. Go to `chrome://extensions` or `edge://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select `apps/extension/dist/chrome-mv3` (Chrome) or `apps/extension/dist/edge-mv3` (Edge)

**Firefox:**

1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select the `manifest.json` file in `apps/extension/dist/firefox-mv2`

## 🔄 Pull Request Process

### Before You Start

1. **Sync with main**: Always pull rebase before starting work
   ```bash
   git checkout main
   git pull --rebase origin main
   ```

2. **Create an issue**: Discuss significant changes before implementing

3. **Create a branch**: Use conventional naming
   ```bash
   git checkout -b feat/123-description
   git checkout -b fix/123-description
   ```

### Commit Messages

We use [Conventional Commits](https://www.conventionalcommits.org/) with [Gitmoji](https://gitmoji.dev/):

```
✨ feat(scope): add new feature
🐛 fix(scope): fix bug description
📝 docs: update documentation
♻️ refactor(scope): refactor code
🔧 chore: maintenance task
```

| Emoji | Type       | Description      |
| ----- | ---------- | ---------------- |
| ✨    | `feat`     | New feature      |
| 🐛    | `fix`      | Bug fix          |
| 📝    | `docs`     | Documentation    |
| 💄    | `style`    | UI/styling       |
| ♻️     | `refactor` | Code refactoring |
| ⚡    | `perf`     | Performance      |
| ✅    | `test`     | Tests            |
| 🔧    | `chore`    | Maintenance      |

### Creating a Pull Request

1. **Push your branch**
   ```bash
   git push -u origin feat/123-description
   ```

2. **Create PR via GitHub CLI**
   ```bash
   gh pr create --title "✨ feat: description" --body "Closes #123" --base main
   ```

3. **Wait for CI checks** to pass

4. **Address review feedback** if any

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] Self-review completed
- [ ] Relevant lint/build validation completed
- [ ] Tests added/updated if applicable when a test suite exists for the changed area
- [ ] Documentation updated if needed
- [ ] Linked to relevant issue

## 📐 Style Guidelines

### Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting.

```bash
# Check linting
bun run lint

# Run extension lint only
bunx nx run extension:lint

# Run all extension tests (builds Chrome and installs Playwright Chromium)
bun run test
```

The test command runs the unit tests and the headless Chromium E2E suite (popup, side panel, bookmarks manager, settings, quick save, maintenance, reports, import/export, Ask AI, and cross-surface journeys). CI runs the same suites without manual browser setup, plus the Edge suite and the Firefox smoke suite. Network-dependent and AI provider flows run offline: tests titled `[mocked provider contract]` stub AI providers (Vitest `ai` mocks and a Playwright-routed OpenAI-compatible endpoint) and route-mock network fetches; they verify Bookmark Scout's request/response contract, opt-in gating, and error handling, not live provider or website compatibility.

Other suites, for the changes they cover:

```bash
# Edge and Firefox
bunx nx run extension:test:e2e:edge
bunx nx run extension:test:e2e:firefox

# Local AI agents: the MCP bridge's own tests, then the compiled
# bookmark-scout-mcp with the extension in Chromium (Linux and macOS)
bun test packages/mcp-bridge
bunx nx run extension:test:e2e:bridge

# Latency and scrolling on a large library; run before and after a speed change
bunx nx run extension:test:perf

# AI features against a real provider; skipped unless the BS_LIVE_AI_* variables are set
# (see apps/extension/tests/live/README.md)
bunx nx run extension:test:live
```

CI runs the bridge tests when the extension or `packages/mcp-bridge` changes, the performance suite daily, and the live AI suite only on demand.

### Chrome's built-in AI

The **Built-in AI** service runs Chrome's own model (Gemini Nano, the Prompt API's `LanguageModel`) on your computer. Unit and E2E tests use a fake `LanguageModel` (`tests/unit/fake-language-model.ts`, `tests/e2e/builtin-ai.spec.ts`); the real model is checked by hand:

1. Use Chrome 138 or later on a computer that meets [Chrome's hardware requirements](https://developer.chrome.com/docs/ai/get-started#hardware). **Check this computer**, under the service in Settings > AI, compares this computer with them. To try it on a weaker one, set `chrome://flags/#optimization-guide-on-device-model` to **Enabled BypassPerfRequirement** and restart Chrome.
2. The browser that `bun run dev` opens reports the model as unavailable. Either start it with the switch below, or turn the runner off and load `apps/extension/dist/chrome-mv3-dev` in your own Chrome profile from `chrome://extensions`. Keep this per-developer file out of Git: `apps/extension/web-ext.config.ts` is ignored.

   ```ts
   // apps/extension/web-ext.config.ts
   import { defineWebExtConfig } from 'wxt';

   export default defineWebExtConfig({
     chromiumArgs: ['--disable-features=DisableLoadExtensionCommandLineSwitch'],
     // Or use your own profile instead: disabled: true,
   });
   ```

3. In **Settings** > **AI**, click **Use built-in AI**, then **Download the model**. `chrome://on-device-internals` shows the model's state and download, and lets you send it a prompt directly; Chrome opens it only after you turn on its internal debugging pages at `chrome://chrome-urls`.
4. Turn on **AI Features** and **Record requests**, open the popup on a page, and click the folder suggestion button. **AI activity** shows the prompt as `ON-DEVICE`.
5. Press the AI quick save shortcut on a page twice. Both saves appear in **AI activity**; the second is quicker, because the AI host page (an offscreen document, listed in `chrome://extensions` under the extension's views) keeps the instructions loaded for `[quick_save] idle_timeout_ms` in `apps/extension/config/ai/built-in.toml`.

### TypeScript

- Use TypeScript for all new code
- Prefer `type` over `interface` for object types
- Use explicit return types for functions

### React Components

- Use functional components with hooks
- Keep components small and focused
- Use descriptive prop names

### File Organization

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

`packages/mcp-bridge` holds `bookmark-scout-mcp`, the MCP server and native messaging host that local AI agents use; its messages to the extension are defined in `packages/mcp-bridge/src/protocol.ts`.

## 🌐 Internationalization

When adding user-facing text:

1. Add strings to `apps/extension/public/_locales/<locale>/messages.json`
2. Add them to every locale listed under `[locales] extension` in `config/project.toml`
3. Use the existing i18n helper: `t("message_key")`

`README.md`, this guide, and their translations in `i18n/<language>/` are generated from `templates/`: edit the template, never the generated file. See [Generated Markdown](DEVELOPMENT.md#-generated-markdown).

## 🤔 Questions?

- Check existing [issues](https://github.com/isandrel/bookmark-scout/issues)
- Start a [discussion](https://github.com/isandrel/bookmark-scout/discussions)
- Create a [question issue](.github/ISSUE_TEMPLATE/04-question.yml)

## 🙏 Thank You!

Every contribution helps make Bookmark Scout better. Whether it's:

- 🐛 Reporting bugs
- ✨ Suggesting features
- 📝 Improving documentation
- 🔧 Writing code
- 🌐 Translating

We appreciate your time and effort!
