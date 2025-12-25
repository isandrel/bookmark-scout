# 🤝 Contributing to Bookmark Scout

First off, thank you for considering contributing to Bookmark Scout! It's people like you that make this extension better for everyone.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Setup](#development-setup)
- [Pull Request Process](#pull-request-process)
- [Style Guidelines](#style-guidelines)
- [Community](#community)

## 📜 Code of Conduct

This project adheres to a Code of Conduct. By participating, you are expected to uphold respectful and inclusive behavior. Please report unacceptable behavior via GitHub Issues.

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

### Prerequisites

- [Bun](https://bun.sh) (latest version)
- [mise](https://mise.jdx.dev/) for runtime management
- Chrome, Firefox, or Edge browser

### Installation

```bash
# Clone the repository
git clone https://github.com/isandrel/bookmark-scout.git
cd bookmark-scout

# Install dependencies
bun install

# Start development server (Chrome)
cd apps/extension
bun run dev
```

### Building

```bash
# Build for Chrome
bun run build

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
4. Select `.output/chrome-mv3` folder

**Firefox:**
1. Go to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in `.output/firefox-mv2` folder

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
| ✨     | `feat`     | New feature      |
| 🐛     | `fix`      | Bug fix          |
| 📝     | `docs`     | Documentation    |
| 💄     | `style`    | UI/styling       |
| ♻️     | `refactor` | Code refactoring |
| ⚡     | `perf`     | Performance      |
| ✅     | `test`     | Tests            |
| 🔧     | `chore`    | Maintenance      |

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
- [ ] Tests added/updated if applicable
- [ ] Documentation updated if needed
- [ ] Linked to relevant issue

## 📐 Style Guidelines

### Code Style

We use [Biome](https://biomejs.dev/) for linting and formatting.

```bash
# Check linting
bun run lint

# Auto-fix issues
bun run lint:fix
```

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
├── services/       # API/service layer
├── stores/         # Zustand stores
├── types/          # TypeScript types
└── entrypoints/    # Extension entry points
```

## 🌐 Internationalization

When adding user-facing text:

1. Add strings to `public/_locales/{locale}/messages.json`
2. Support all locales: `en`, `ja`, `ko`
3. Use the i18n hook: `const { t } = useI18n()`

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
