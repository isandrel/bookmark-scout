{# source: c43b8d0cbafe #}
{% import "../../_partials/markdown.md.j2" as md %}
{{ md.language_switcher() }}
# 🤝 Участие в разработке {{ site.name }}

Прежде всего спасибо, что думаете о том, чтобы внести вклад в {{ site.name }}! Благодаря таким людям, как вы, это расширение становится лучше для всех.

## 📋 Содержание

- [Правила поведения](#-правила-поведения)
- [Как помочь проекту?](#-как-помочь-проекту)
- [Настройка среды разработки](#-настройка-среды-разработки)
- [Процесс pull request](#-процесс-pull-request)
- [Правила оформления](#-правила-оформления)
- [Интернационализация](#-интернационализация)
- [Вопросы?](#-вопросы)

## 📜 Правила поведения

Этот проект следует [Правилам поведения]({{ root }}CODE_OF_CONDUCT.md). Участвуя в нём, вы обязуетесь вести себя уважительно и инклюзивно. Сообщайте о недопустимом поведении через GitHub Issues.

## 🎯 Как помочь проекту?

### 🐛 Сообщения об ошибках

Прежде чем сообщать об ошибке, проверьте существующие issue, чтобы не создавать дубликаты.

**В сообщении об ошибке укажите:**

- Браузер и его версию ({{ browsers|map(attribute="name")|join(", ") }})
- Версию расширения
- Шаги для воспроизведения
- Ожидаемое и фактическое поведение
- Снимки экрана, если они уместны

Используйте наш [шаблон сообщения об ошибке]({{ root }}.github/ISSUE_TEMPLATE/01-bug-report.yml).

### ✨ Предложения функций

Мы рады предложениям! Используйте наш [шаблон запроса функции]({{ root }}.github/ISSUE_TEMPLATE/02-feature-request.yml).

**Хороший запрос функции включает:**

- Чёткое описание проблемы
- Предлагаемое решение
- Рассмотренные альтернативы

### 🔧 Вклад в код

Ищете, чем заняться? Посмотрите issue с метками:

- `good first issue` — хорошо подходит новичкам
- `help wanted` — нам очень пригодится ваша помощь

## 💻 Настройка среды разработки

Чтобы пользоваться {{ site.name }}, установите его из магазина своего браузера или из выпуска на GitHub, как описано в [README]({{ links.README }}#-установка). Шаги ниже собирают его из исходного кода — для работы над ним. Используемые технологии, состояние функций, сборки выпусков и структура проекта описаны в [DEVELOPMENT.md]({{ links.DEVELOPMENT }}) (на английском).

### Требования

- [Bun](https://bun.sh) (последняя версия)
- [mise](https://mise.jdx.dev/) для управления средами выполнения
- Один из этих браузеров: {{ browsers|map(attribute="name")|join(", ") }}

### Установка

```bash
# Клонировать репозиторий
git clone {{ site.repo.url }}.git
cd {{ site.repo.name }}

# Установить зависимости
bun install

# Запустить сервер разработки (Chrome)
bun run dev
```

### Сборка

```bash
# Собрать для всех браузеров
bun run build

# Собрать для Chrome
bunx nx run extension:build:chrome

# Собрать для Firefox
bun run build:firefox

# Собрать для Edge
bun run build:edge
```

### Загрузка расширения

**Chrome/Edge:**

1. Откройте `chrome://extensions` или `edge://extensions`
2. Включите «Режим разработчика»
3. Нажмите «Загрузить распакованное расширение»
4. Выберите `apps/extension/dist/chrome-mv3` (Chrome) или `apps/extension/dist/edge-mv3` (Edge)

**Firefox:**

1. Откройте `about:debugging#/runtime/this-firefox`
2. Нажмите «Загрузить временное дополнение»
3. Выберите файл `manifest.json` в `apps/extension/dist/firefox-mv2`

## 🔄 Процесс pull request

### Прежде чем начать

1. **Синхронизируйтесь с main**: всегда выполняйте pull с rebase перед началом работы
   ```bash
   git checkout {{ site.repo.branch }}
   git pull --rebase origin {{ site.repo.branch }}
   ```

2. **Создайте issue**: обсудите значительные изменения до их реализации

3. **Создайте ветку**: используйте принятые названия
   ```bash
   git checkout -b feat/123-description
   git checkout -b fix/123-description
   ```

### Сообщения коммитов

Мы используем [Conventional Commits](https://www.conventionalcommits.org/) с [Gitmoji](https://gitmoji.dev/):

Хук `commit-msg` и проверка **PR title** следят за этим; допустимые типы перечислены в `config/commits.toml`.

```
✨ feat(scope): add new feature
🐛 fix(scope): fix bug description
📝 docs: update documentation
♻️ refactor(scope): refactor code
🔧 chore: maintenance task
```

| Эмодзи | Тип        | Описание               |
| ------ | ---------- | ---------------------- |
| ✨     | `feat`     | Новая функция          |
| 🐛     | `fix`      | Исправление ошибки     |
| 📝     | `docs`     | Документация           |
| 💄     | `style`    | Интерфейс и стили      |
| ♻️      | `refactor` | Рефакторинг кода       |
| ⚡     | `perf`     | Производительность     |
| ✅     | `test`     | Тесты                  |
| 🔧     | `chore`    | Обслуживание           |

### Создание pull request

1. **Отправьте ветку**
   ```bash
   git push -u origin feat/123-description
   ```

2. **Создайте PR через GitHub CLI**
   ```bash
   gh pr create --title "✨ feat: description" --body "Closes #123" --base {{ site.repo.branch }}
   ```

3. **Дождитесь**, пока пройдут проверки CI

4. **Учтите замечания** ревьюеров, если они есть

### Чек-лист PR

- [ ] Код соответствует правилам оформления проекта
- [ ] Выполнена самопроверка
- [ ] Выполнены нужные проверки lint и сборки
- [ ] Добавлены или обновлены тесты, если для изменённой области есть набор тестов
- [ ] При необходимости обновлена документация
- [ ] Есть ссылка на соответствующий issue

## 📐 Правила оформления

### Стиль кода

Для линтинга и форматирования мы используем [Biome](https://biomejs.dev/).

```bash
# Проверить линтером
bun run lint

# Запустить lint только для расширения
bunx nx run extension:lint

# Запустить все тесты расширения (собирает Chrome и устанавливает Chromium для Playwright)
bun run test
```

Команда тестирования запускает модульные тесты и набор E2E-тестов в Chromium без окна браузера (headless): всплывающее окно, боковая панель, диспетчер закладок, настройки, быстрое сохранение, обслуживание, отчёты, импорт и экспорт, «Спросить ИИ» и сценарии, охватывающие несколько частей интерфейса. CI выполняет те же наборы без ручной настройки браузера, а также набор для Edge и смоук-набор Firefox. Сценарии, зависящие от сети и ИИ-провайдеров, выполняются офлайн: тесты с пометкой `[mocked provider contract]` подменяют ИИ-провайдеров (моки `ai` в Vitest и OpenAI-совместимый сервис с маршрутизацией через Playwright) и сетевые запросы; они проверяют контракт запросов и ответов {{ site.name }}, включение только по желанию и обработку ошибок, но не совместимость с реальными провайдерами или сайтами.

Другие наборы — для изменений, которые они покрывают:

```bash
# Edge и Firefox
bunx nx run extension:test:e2e:edge
bunx nx run extension:test:e2e:firefox

# Локальные ИИ-агенты: собственные тесты MCP-моста, затем скомпилированный
# bookmark-scout-mcp вместе с расширением в Chromium (Linux и macOS)
bun test packages/mcp-bridge
bunx nx run extension:test:e2e:bridge

# Задержки и прокрутка на большой коллекции; запускайте до и после изменения скорости
bunx nx run extension:test:perf

# Функции ИИ с реальным провайдером; пропускается, если не заданы переменные BS_LIVE_AI_*
# (см. apps/extension/tests/live/README.md)
bunx nx run extension:test:live
```

CI запускает тесты моста, когда меняется расширение или `packages/mcp-bridge`, набор тестов производительности — ежедневно, а набор live-тестов ИИ — только по запросу.

### Встроенный ИИ Chrome

Сервис **Встроенный ИИ** запускает собственную модель Chrome (Gemini Nano, `LanguageModel` из Prompt API) на вашем компьютере. Модульные и E2E-тесты используют поддельный `LanguageModel` (`tests/unit/fake-language-model.ts`, `tests/e2e/builtin-ai.spec.ts`); настоящая модель проверяется вручную:

1. Используйте Chrome 138 или новее на компьютере, который соответствует [аппаратным требованиям Chrome](https://developer.chrome.com/docs/ai/get-started#hardware). **Проверить этот компьютер** под сервисом в разделе «Настройки > ИИ» сравнивает этот компьютер с ними. Чтобы попробовать на более слабом компьютере, установите для `chrome://flags/#optimization-guide-on-device-model` значение **Enabled BypassPerfRequirement** и перезапустите Chrome.
2. Браузер, который открывает `bun run dev`, сообщает, что модель недоступна. Либо запустите его с параметром ниже, либо отключите запуск браузера и загрузите `apps/extension/dist/chrome-mv3-dev` в свой профиль Chrome на странице `chrome://extensions`. Этот файл у каждого разработчика свой, поэтому не добавляйте его в Git: `apps/extension/web-ext.config.ts` игнорируется.

   ```ts
   // apps/extension/web-ext.config.ts
   import { defineWebExtConfig } from 'wxt';

   export default defineWebExtConfig({
     chromiumArgs: ['--disable-features=DisableLoadExtensionCommandLineSwitch'],
     // Или используйте вместо этого свой профиль: disabled: true,
   });
   ```

3. В разделе **Настройки** > **ИИ** нажмите **Использовать встроенный ИИ**, затем **Скачать модель**. `chrome://on-device-internals` показывает состояние модели и скачивания и позволяет отправить ей промпт напрямую; Chrome открывает эту страницу, только после того как вы включите внутренние отладочные страницы на `chrome://chrome-urls`.
4. Включите **Функции ИИ** и **Записывать запросы**, откройте всплывающее окно на странице и нажмите кнопку подсказки папки. **Активность ИИ** показывает промпт как `ON-DEVICE`.
5. Дважды нажмите на странице сочетание клавиш быстрого сохранения с ИИ. Оба сохранения появятся в **Активность ИИ**; второе быстрее, потому что страница-хост ИИ (offscreen-документ, указанный в `chrome://extensions` среди представлений расширения) держит инструкции загруженными в течение `[quick_save] idle_timeout_ms` из `apps/extension/config/ai/built-in.toml`.

### TypeScript

- Используйте TypeScript для всего нового кода
- Для объектных типов предпочитайте `type`, а не `interface`
- Указывайте явные типы возвращаемых значений функций

### Компоненты React

- Используйте функциональные компоненты с хуками
- Делайте компоненты небольшими и сосредоточенными на одной задаче
- Давайте свойствам понятные названия

### Организация файлов

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

`packages/mcp-bridge` содержит `bookmark-scout-mcp` — MCP-сервер и хост обмена сообщениями с нативными приложениями, которыми пользуются локальные ИИ-агенты; его сообщения расширению определены в `packages/mcp-bridge/src/protocol.ts`.

## 🌐 Интернационализация

Когда вы добавляете текст, который видят пользователи:

1. Добавьте строки в `apps/extension/public/_locales/<locale>/messages.json`
2. Добавьте их для каждого языка, перечисленного в `[locales] extension` в `config/project.toml`
3. Используйте существующую функцию i18n: `t("message_key")`

`README.md`, это руководство и их переводы в `i18n/<language>/` создаются из `templates/`: редактируйте шаблон, а не созданный файл. См. [Generated Markdown]({{ links.DEVELOPMENT }}#-generated-markdown).

## 🤔 Вопросы?

- Посмотрите существующие [issue]({{ site.repo.url }}/issues)
- Начните [обсуждение]({{ site.repo.url }}/discussions)
- Создайте [issue с вопросом]({{ root }}.github/ISSUE_TEMPLATE/04-question.yml)

## 🙏 Спасибо!

Каждый вклад помогает сделать {{ site.name }} лучше, будь то:

- 🐛 Сообщения об ошибках
- ✨ Предложения функций
- 📝 Улучшение документации
- 🔧 Написание кода
- 🌐 Переводы

Мы ценим ваше время и усилия!
