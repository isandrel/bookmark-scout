<p align="center">
  <a href="../../CONTRIBUTING.md" lang="en" hreflang="en">English</a> ·
  <strong lang="zh-CN">简体中文</strong> ·
  <a href="../es/CONTRIBUTING.md" lang="es" hreflang="es">Español</a> ·
  <a href="../fr/CONTRIBUTING.md" lang="fr" hreflang="fr">Français</a> ·
  <a href="../pt-BR/CONTRIBUTING.md" lang="pt-BR" hreflang="pt-BR">Português (Brasil)</a> ·
  <a href="../de/CONTRIBUTING.md" lang="de" hreflang="de">Deutsch</a> ·
  <a href="../ja/CONTRIBUTING.md" lang="ja" hreflang="ja">日本語</a> ·
  <a href="../ko/CONTRIBUTING.md" lang="ko" hreflang="ko">한국어</a> ·
  <a href="../zh-TW/CONTRIBUTING.md" lang="zh-TW" hreflang="zh-TW">繁體中文</a>
</p>

# 🤝 为 Bookmark Scout 做贡献

首先，感谢你考虑为 Bookmark Scout 做贡献。正是有了大家的参与，这个扩展程序才能变得更好用。

## 📋 目录

- [行为准则](#-行为准则)
- [如何参与贡献？](#-如何参与贡献)
- [开发环境设置](#-开发环境设置)
- [拉取请求流程](#-拉取请求流程)
- [风格指南](#-风格指南)
- [国际化](#-国际化)
- [有疑问？](#-有疑问)

## 📜 行为准则

本项目遵守[行为准则](../../CODE_OF_CONDUCT.md)。参与本项目即表示你会保持尊重和包容的态度。如遇不当行为，请通过 GitHub Issues 报告。

## 🎯 如何参与贡献？

### 🐛 报告错误

提交错误报告前，请先查看现有的 issue，避免重复。

**报告错误时，请提供：**

- 浏览器及版本（Chrome, Firefox, Edge）
- 扩展程序版本
- 重现步骤
- 预期行为与实际行为
- 截图（如适用）

请使用我们的[错误报告模板](../../.github/ISSUE_TEMPLATE/01-bug-report.yml)。

### ✨ 建议新功能

我们很欢迎功能建议。请使用我们的[功能请求模板](../../.github/ISSUE_TEMPLATE/02-feature-request.yml)。

**好的功能请求包括：**

- 清晰的问题描述
- 建议的解决方案
- 考虑过的其他方案

### 🔧 贡献代码

想找点事情做？请查看带有以下标签的 issue：

- `good first issue`：适合新贡献者
- `help wanted`：期待你的帮助

## 💻 开发环境设置

如果只是想使用 Bookmark Scout，请按照 [README](README.md#-安装) 中的说明，从浏览器的应用商店或 GitHub 版本发布中安装。以下步骤用于从源代码构建，供开发使用。技术栈、功能状态、发布构建和项目结构请参阅 [DEVELOPMENT.md](../../DEVELOPMENT.md)（英文）。

### 前提条件

- [Bun](https://bun.sh)（最新版本）
- [mise](https://mise.jdx.dev/)，用于管理运行时
- 以下浏览器之一：Chrome, Firefox, Edge

### 安装

```bash
# 克隆代码仓库
git clone https://github.com/isandrel/bookmark-scout.git
cd bookmark-scout

# 安装依赖
bun install

# 启动开发服务器（Chrome）
bun run dev
```

### 构建

```bash
# 为所有浏览器构建
bun run build

# 为 Chrome 构建
bunx nx run extension:build:chrome

# 为 Firefox 构建
bun run build:firefox

# 为 Edge 构建
bun run build:edge
```

### 加载扩展程序

**Chrome/Edge：**

1. 前往 `chrome://extensions` 或 `edge://extensions`
2. 开启“开发者模式”（Edge 中为“开发人员模式”）
3. 点击“加载已解压的扩展程序”（Edge 中为“加载解压缩的扩展”）
4. 选择 `apps/extension/dist/chrome-mv3`（Chrome）或 `apps/extension/dist/edge-mv3`（Edge）

**Firefox：**

1. 前往 `about:debugging#/runtime/this-firefox`
2. 点击“临时载入附加组件”
3. 选择 `apps/extension/dist/firefox-mv2` 中的 `manifest.json` 文件

## 🔄 拉取请求流程

### 开始之前

1. **与 main 同步**：开始工作前，务必先以 rebase 方式拉取
   ```bash
   git checkout main
   git pull --rebase origin main
   ```

2. **创建 issue**：较大的更改请先讨论，再动手实现

3. **创建分支**：使用约定的命名方式
   ```bash
   git checkout -b feat/123-description
   git checkout -b fix/123-description
   ```

### 提交信息

我们使用 [Conventional Commits](https://www.conventionalcommits.org/)，并加上 [Gitmoji](https://gitmoji.dev/) 前缀：

`commit-msg` 钩子和 **PR title** 检查会强制执行此格式，允许的类型见 `config/commits.toml`。

```
✨ feat(scope): add new feature
🐛 fix(scope): fix bug description
📝 docs: update documentation
♻️ refactor(scope): refactor code
🔧 chore: maintenance task
```

| Emoji | Type       | Description |
| ----- | ---------- | ----------- |
| ✨    | `feat`     | 新功能      |
| 🐛    | `fix`      | 错误修复    |
| 📝    | `docs`     | 文档        |
| 💄    | `style`    | 界面/样式   |
| ♻️     | `refactor` | 代码重构    |
| ⚡    | `perf`     | 性能        |
| ✅    | `test`     | 测试        |
| 🔧    | `chore`    | 维护        |

### 创建拉取请求

1. **推送分支**
   ```bash
   git push -u origin feat/123-description
   ```

2. **通过 GitHub CLI 创建 PR**
   ```bash
   gh pr create --title "✨ feat: description" --body "Closes #123" --base main
   ```

3. **等待 CI 检查**通过

4. **处理评审意见**（如有）

### 拉取请求检查清单

- [ ] 代码遵循项目的风格指南
- [ ] 已完成自我审查
- [ ] 已完成相关的 lint/构建验证
- [ ] 如果更改的部分有测试套件，已添加或更新相应测试
- [ ] 已按需更新文档
- [ ] 已关联相关 issue

## 📐 风格指南

### 代码风格

我们使用 [Biome](https://biomejs.dev/) 进行 lint 和格式化。

```bash
# 运行 lint 检查
bun run lint

# 仅运行扩展程序的 lint
bunx nx run extension:lint

# 运行扩展程序的全部测试（会构建 Chrome 版本并安装 Playwright Chromium）
bun run test
```

测试命令会运行单元测试和无头 Chromium 端到端测试套件（弹出窗口、侧边栏、书签管理器、设置、快速保存、维护、报告、导入和导出、Ask AI，以及跨界面的完整流程）。CI 会运行同样的测试套件，无需手动设置浏览器，另外还会运行 Edge 测试套件和 Firefox 冒烟测试套件。依赖网络和 AI 服务商的流程都离线运行：标题为 `[mocked provider contract]` 的测试会模拟 AI 服务商（Vitest 的 `ai` 模拟和由 Playwright 路由的 OpenAI 兼容端点），并通过路由模拟网络请求；它们验证的是 Bookmark Scout 的请求/响应约定、需用户开启的功能限制和错误处理，而不是与真实服务商或网站的兼容性。

其他测试套件，按其覆盖的更改使用：

```bash
# Edge 和 Firefox
bunx nx run extension:test:e2e:edge
bunx nx run extension:test:e2e:firefox

# 本地 AI 智能体：先运行 MCP 桥接程序自身的测试，再在 Chromium 中
# 运行编译后的 bookmark-scout-mcp 与扩展程序（Linux 和 macOS）
bun test packages/mcp-bridge
bunx nx run extension:test:e2e:bridge

# 大型书签库上的延迟和滚动；在提升速度的更改前后各运行一次
bunx nx run extension:test:perf

# 针对真实服务商的 AI 功能；未设置 BS_LIVE_AI_* 变量时会跳过
# （参见 apps/extension/tests/live/README.md）
bunx nx run extension:test:live
```

CI 会在扩展程序或 `packages/mcp-bridge` 发生变化时运行桥接测试，每天运行一次性能测试套件，实时 AI 测试套件只按需运行。

### Chrome 内置 AI

**内置 AI** 服务在你的电脑上运行 Chrome 自带的模型（Gemini Nano，即 Prompt API 的 `LanguageModel`）。单元测试和端到端测试使用模拟的 `LanguageModel`（`tests/unit/fake-language-model.ts`、`tests/e2e/builtin-ai.spec.ts`）；真实模型需要手动检查：

1. 在符合 [Chrome 硬件要求](https://developer.chrome.com/docs/ai/get-started#hardware)的电脑上使用 Chrome 138 或更高版本。“设置 > AI”中该服务下方的**检查这台电脑**会将这台电脑与这些要求进行比较。如需在配置较低的电脑上试用，请将 `chrome://flags/#optimization-guide-on-device-model` 设为 **Enabled BypassPerfRequirement**，然后重启 Chrome。
2. `bun run dev` 打开的浏览器会报告模型不可用。可以使用下面的开关启动它，也可以关闭运行器，然后在自己的 Chrome 配置文件中通过 `chrome://extensions` 加载 `apps/extension/dist/chrome-mv3-dev`。这个文件因开发者而异，不要提交到 Git：`apps/extension/web-ext.config.ts` 已被忽略。

   ```ts
   // apps/extension/web-ext.config.ts
   import { defineWebExtConfig } from 'wxt';

   export default defineWebExtConfig({
     chromiumArgs: ['--disable-features=DisableLoadExtensionCommandLineSwitch'],
     // 或改用自己的配置文件：disabled: true,
   });
   ```

3. 在 **设置** > **AI** 中，点击**使用内置 AI**，然后点击**下载模型**。`chrome://on-device-internals` 会显示模型的状态和下载进度，并可直接向模型发送提示；只有在 `chrome://chrome-urls` 中开启内部调试页面后，Chrome 才会打开它。
4. 开启 **AI 功能**和**记录请求**，在某个网页上打开弹出窗口，然后点击文件夹建议按钮。**AI 活动记录**会将该提示显示为 `ON-DEVICE`。
5. 在网页上连续按两次 AI 快速保存快捷键。两次保存都会出现在 **AI 活动记录**中；第二次更快，因为 AI 宿主页面（一个离屏文档，在 `chrome://extensions` 中列在扩展程序的视图下）会在 `apps/extension/config/ai/built-in.toml` 的 `[quick_save] idle_timeout_ms` 时间内保持指令已加载。

### TypeScript

- 所有新代码都使用 TypeScript
- 对象类型优先使用 `type` 而不是 `interface`
- 为函数显式声明返回类型

### React 组件

- 使用函数组件和 hooks
- 保持组件小而专注
- 使用描述性的 prop 名称

### 文件组织

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

`packages/mcp-bridge` 包含 `bookmark-scout-mcp`，即本地 AI 智能体使用的 MCP 服务器和原生消息传递宿主；它发送给扩展程序的消息定义在 `packages/mcp-bridge/src/protocol.ts` 中。

## 🌐 国际化

添加面向用户的文字时：

1. 将字符串添加到 `apps/extension/public/_locales/<locale>/messages.json`
2. 为 `config/project.toml` 中 `[locales] extension` 下列出的每种语言都添加这些字符串
3. 使用现有的 i18n 辅助函数：`t("message_key")`

`README.md`、本指南及其位于 `i18n/<language>/` 中的译文都由 `templates/` 生成：请编辑模板，不要编辑生成的文件。请参阅 [Generated Markdown](../../DEVELOPMENT.md#-generated-markdown)。

## 🤔 有疑问？

- 查看现有的 [issue](https://github.com/isandrel/bookmark-scout/issues)
- 发起[讨论](https://github.com/isandrel/bookmark-scout/discussions)
- 创建[提问 issue](../../.github/ISSUE_TEMPLATE/04-question.yml)

## 🙏 谢谢！

每一份贡献都能让 Bookmark Scout 变得更好，无论是：

- 🐛 报告错误
- ✨ 建议功能
- 📝 改进文档
- 🔧 编写代码
- 🌐 翻译

感谢你付出的时间和精力！
