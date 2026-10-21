{# source: c43b8d0cbafe #}
{% import "../../_partials/markdown.md.j2" as md %}
{{ md.language_switcher() }}
# 🤝 Mitwirken bei {{ site.name }}

Zunächst einmal vielen Dank, dass Sie überlegen, zu {{ site.name }} beizutragen! Menschen wie Sie machen diese Erweiterung für alle besser.

## 📋 Inhaltsverzeichnis

- [Verhaltenskodex](#-verhaltenskodex)
- [Wie kann ich beitragen?](#-wie-kann-ich-beitragen)
- [Entwicklungsumgebung einrichten](#-entwicklungsumgebung-einrichten)
- [Ablauf eines Pull Requests](#-ablauf-eines-pull-requests)
- [Stilrichtlinien](#-stilrichtlinien)
- [Internationalisierung](#-internationalisierung)
- [Fragen?](#-fragen)

## 📜 Verhaltenskodex

Dieses Projekt folgt einem [Verhaltenskodex]({{ root }}CODE_OF_CONDUCT.md). Wer mitmacht, verpflichtet sich zu respektvollem und inklusivem Verhalten. Bitte melden Sie inakzeptables Verhalten über GitHub Issues.

## 🎯 Wie kann ich beitragen?

### 🐛 Fehler melden

Bevor Sie einen Fehlerbericht erstellen, prüfen Sie bitte die vorhandenen Issues, um Duplikate zu vermeiden.

**Geben Sie in einem Fehlerbericht an:**

- Browser und Version ({{ browsers|map(attribute="name")|join(", ") }})
- Version der Erweiterung
- Schritte zum Reproduzieren
- Erwartetes und tatsächliches Verhalten
- Screenshots, falls hilfreich

Verwenden Sie unsere [Vorlage für Fehlerberichte]({{ root }}.github/ISSUE_TEMPLATE/01-bug-report.yml).

### ✨ Funktionen vorschlagen

Wir freuen uns über Vorschläge für neue Funktionen! Bitte verwenden Sie unsere [Vorlage für Funktionswünsche]({{ root }}.github/ISSUE_TEMPLATE/02-feature-request.yml).

**Gute Funktionswünsche enthalten:**

- Eine klare Beschreibung des Problems
- Einen Lösungsvorschlag
- Erwogene Alternativen

### 🔧 Code beitragen

Sie suchen eine Aufgabe? Sehen Sie sich Issues mit diesen Labels an:

- `good first issue` - Gut für den Einstieg
- `help wanted` - Hier freuen wir uns über Hilfe

## 💻 Entwicklungsumgebung einrichten

Um {{ site.name }} zu nutzen, installieren Sie die Erweiterung aus dem Store Ihres Browsers oder aus einem GitHub-Release, wie in der [README]({{ links.README }}#-installieren) beschrieben. Die folgenden Schritte erstellen sie aus dem Quellcode, um daran zu arbeiten. Tech-Stack, Funktionsstatus, Release-Builds und Projektstruktur finden Sie in [DEVELOPMENT.md]({{ links.DEVELOPMENT }}).

### Voraussetzungen

- [Bun](https://bun.sh) (neueste Version)
- [mise](https://mise.jdx.dev/) zur Verwaltung der Laufzeitumgebungen
- Einer dieser Browser: {{ browsers|map(attribute="name")|join(", ") }}

### Installation

```bash
# Repository klonen
git clone {{ site.repo.url }}.git
cd {{ site.repo.name }}

# Abhängigkeiten installieren
bun install

# Entwicklungsserver starten (Chrome)
bun run dev
```

### Erstellen

```bash
# Für alle Browser erstellen
bun run build

# Für Chrome erstellen
bunx nx run extension:build:chrome

# Für Firefox erstellen
bun run build:firefox

# Für Edge erstellen
bun run build:edge
```

### Die Erweiterung laden

**Chrome/Edge:**

1. Öffnen Sie `chrome://extensions` oder `edge://extensions`
2. Aktivieren Sie den „Entwicklermodus“
3. Klicken Sie auf „Entpackte Erweiterung laden“ (in Edge „Entpackt laden“)
4. Wählen Sie `apps/extension/dist/chrome-mv3` (Chrome) oder `apps/extension/dist/edge-mv3` (Edge) aus

**Firefox:**

1. Öffnen Sie `about:debugging#/runtime/this-firefox`
2. Klicken Sie auf „Temporäres Add-on laden…“
3. Wählen Sie die Datei `manifest.json` in `apps/extension/dist/firefox-mv2` aus

## 🔄 Ablauf eines Pull Requests

### Bevor Sie beginnen

1. **Mit main synchronisieren**: Führen Sie vor Arbeitsbeginn immer einen Pull mit Rebase aus
   ```bash
   git checkout {{ site.repo.branch }}
   git pull --rebase origin {{ site.repo.branch }}
   ```

2. **Issue erstellen**: Besprechen Sie größere Änderungen, bevor Sie sie umsetzen

3. **Branch erstellen**: Verwenden Sie die übliche Benennung
   ```bash
   git checkout -b feat/123-description
   git checkout -b fix/123-description
   ```

### Commit-Nachrichten

Wir verwenden [Conventional Commits](https://www.conventionalcommits.org/) mit [Gitmoji](https://gitmoji.dev/):

Der `commit-msg`-Hook und die Prüfung **PR title** setzen das durch; die erlaubten Typen stehen in `config/commits.toml`.

```
✨ feat(scope): add new feature
🐛 fix(scope): fix bug description
📝 docs: update documentation
♻️ refactor(scope): refactor code
🔧 chore: maintenance task
```

| Emoji | Type       | Beschreibung     |
| ----- | ---------- | ---------------- |
| ✨    | `feat`     | Neue Funktion    |
| 🐛    | `fix`      | Fehlerbehebung   |
| 📝    | `docs`     | Dokumentation    |
| 💄    | `style`    | UI/Gestaltung    |
| ♻️     | `refactor` | Refactoring      |
| ⚡    | `perf`     | Leistung         |
| ✅    | `test`     | Tests            |
| 🔧    | `chore`    | Wartung          |

### Einen Pull Request erstellen

1. **Branch pushen**
   ```bash
   git push -u origin feat/123-description
   ```

2. **PR über die GitHub CLI erstellen**
   ```bash
   gh pr create --title "✨ feat: description" --body "Closes #123" --base {{ site.repo.branch }}
   ```

3. **Warten, bis die CI-Prüfungen** erfolgreich sind

4. **Auf Review-Feedback eingehen**, falls vorhanden

### PR-Checkliste

- [ ] Der Code folgt den Stilrichtlinien des Projekts
- [ ] Eigenes Review durchgeführt
- [ ] Passende Lint- und Build-Prüfungen ausgeführt
- [ ] Tests hinzugefügt oder aktualisiert, falls es für den geänderten Bereich eine Testsuite gibt
- [ ] Dokumentation bei Bedarf aktualisiert
- [ ] Mit dem passenden Issue verknüpft

## 📐 Stilrichtlinien

### Codestil

Wir verwenden [Biome](https://biomejs.dev/) für Linting und Formatierung.

```bash
# Linting prüfen
bun run lint

# Nur das Linting der Erweiterung ausführen
bunx nx run extension:lint

# Alle Tests der Erweiterung ausführen (erstellt Chrome und installiert Playwright Chromium)
bun run test
```

Der Testbefehl führt die Unit-Tests und die headless Chromium-E2E-Suite aus (Pop-up, Seitenleiste, Lesezeichen-Manager, Einstellungen, Schnellspeichern, Wartung, Berichte, Import/Export, Ask AI und Abläufe über mehrere Oberflächen). Die CI führt dieselben Suiten ohne manuelle Browsereinrichtung aus, dazu die Edge-Suite und die Firefox-Smoke-Suite. Netzwerkabhängige Abläufe und KI-Anbieter laufen offline: Tests mit dem Titel `[mocked provider contract]` ersetzen KI-Anbieter durch Stubs (Vitest-Mocks für `ai` und einen über Playwright gerouteten OpenAI-kompatiblen Endpunkt) und simulieren Netzwerkabrufe per Route-Mock; sie prüfen den Anfrage-/Antwortvertrag von {{ site.name }}, die Opt-in-Sperre und die Fehlerbehandlung, nicht die Kompatibilität mit echten Anbietern oder Websites.

Weitere Suiten, für die Änderungen, die sie abdecken:

```bash
# Edge und Firefox
bunx nx run extension:test:e2e:edge
bunx nx run extension:test:e2e:firefox

# Lokale KI-Agenten: die eigenen Tests der MCP-Brücke, dann das kompilierte
# bookmark-scout-mcp mit der Erweiterung in Chromium (Linux und macOS)
bun test packages/mcp-bridge
bunx nx run extension:test:e2e:bridge

# Latenz und Scrollen in einer großen Sammlung; vor und nach einer Geschwindigkeitsänderung ausführen
bunx nx run extension:test:perf

# KI-Funktionen mit einem echten Anbieter; übersprungen, solange die Variablen BS_LIVE_AI_* nicht gesetzt sind
# (siehe apps/extension/tests/live/README.md)
bunx nx run extension:test:live
```

Die CI führt die Brückentests aus, wenn sich die Erweiterung oder `packages/mcp-bridge` ändert, die Leistungssuite täglich und die Live-KI-Suite nur bei Bedarf.

### Die integrierte KI von Chrome

Der Dienst **Integrierte KI** führt Chromes eigenes Modell (Gemini Nano, das `LanguageModel` der Prompt API) auf Ihrem Computer aus. Unit- und E2E-Tests verwenden ein simuliertes `LanguageModel` (`tests/unit/fake-language-model.ts`, `tests/e2e/builtin-ai.spec.ts`); das echte Modell wird von Hand geprüft:

1. Verwenden Sie Chrome 138 oder neuer auf einem Computer, der die [Hardwareanforderungen von Chrome](https://developer.chrome.com/docs/ai/get-started#hardware) erfüllt. **Diesen Computer prüfen** unter dem Dienst in Einstellungen > KI vergleicht diesen Computer mit ihnen. Um es auf einem schwächeren Computer auszuprobieren, setzen Sie `chrome://flags/#optimization-guide-on-device-model` auf **Enabled BypassPerfRequirement** und starten Chrome neu.
2. Der Browser, den `bun run dev` öffnet, meldet das Modell als nicht verfügbar. Starten Sie ihn entweder mit dem unten gezeigten Schalter, oder schalten Sie den Runner ab und laden Sie `apps/extension/dist/chrome-mv3-dev` über `chrome://extensions` in Ihrem eigenen Chrome-Profil. Halten Sie diese entwicklerspezifische Datei aus Git heraus: `apps/extension/web-ext.config.ts` wird ignoriert.

   ```ts
   // apps/extension/web-ext.config.ts
   import { defineWebExtConfig } from 'wxt';

   export default defineWebExtConfig({
     chromiumArgs: ['--disable-features=DisableLoadExtensionCommandLineSwitch'],
     // Oder stattdessen Ihr eigenes Profil verwenden: disabled: true,
   });
   ```

3. Klicken Sie in **Einstellungen** > **KI** auf **Integrierte KI verwenden** und dann auf **Modell herunterladen**. `chrome://on-device-internals` zeigt den Zustand und den Download des Modells und lässt Sie ihm direkt einen Prompt senden; Chrome öffnet die Seite erst, nachdem Sie unter `chrome://chrome-urls` die internen Debugging-Seiten aktiviert haben.
4. Aktivieren Sie **KI-Funktionen** und **Anfragen aufzeichnen**, öffnen Sie das Pop-up auf einer Seite und klicken Sie auf die Schaltfläche für Ordnervorschläge. **KI-Aktivität** zeigt den Prompt als `ON-DEVICE`.
5. Drücken Sie auf einer Seite zweimal das Tastenkürzel für KI-Schnellspeichern. Beide Speichervorgänge erscheinen in **KI-Aktivität**; der zweite ist schneller, weil die KI-Hostseite (ein Offscreen-Dokument, in `chrome://extensions` unter den Ansichten der Erweiterung aufgeführt) die Anweisungen für die Dauer von `[quick_save] idle_timeout_ms` in `apps/extension/config/ai/built-in.toml` geladen hält.

### TypeScript

- Verwenden Sie TypeScript für allen neuen Code
- Bevorzugen Sie `type` gegenüber `interface` für Objekttypen
- Geben Sie Rückgabetypen von Funktionen explizit an

### React-Komponenten

- Verwenden Sie Funktionskomponenten mit Hooks
- Halten Sie Komponenten klein und fokussiert
- Verwenden Sie aussagekräftige Prop-Namen

### Dateiorganisation

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

`packages/mcp-bridge` enthält `bookmark-scout-mcp`, den MCP-Server und Native-Messaging-Host, den lokale KI-Agenten verwenden; seine Nachrichten an die Erweiterung sind in `packages/mcp-bridge/src/protocol.ts` definiert.

## 🌐 Internationalisierung

Wenn Sie für Nutzer sichtbaren Text hinzufügen:

1. Fügen Sie die Strings zu `apps/extension/public/_locales/<locale>/messages.json` hinzu
2. Fügen Sie sie jeder Sprache hinzu, die unter `[locales] extension` in `config/project.toml` aufgeführt ist
3. Verwenden Sie den vorhandenen i18n-Helfer: `t("message_key")`

`README.md`, diese Anleitung und ihre Übersetzungen in `i18n/<language>/` werden aus `templates/` erzeugt: Bearbeiten Sie die Vorlage, nie die erzeugte Datei. Siehe [Generated Markdown]({{ links.DEVELOPMENT }}#-generated-markdown).

## 🤔 Fragen?

- Sehen Sie in den vorhandenen [Issues]({{ site.repo.url }}/issues) nach
- Starten Sie eine [Diskussion]({{ site.repo.url }}/discussions)
- Erstellen Sie ein [Issue mit einer Frage]({{ root }}.github/ISSUE_TEMPLATE/04-question.yml)

## 🙏 Vielen Dank!

Jeder Beitrag hilft, {{ site.name }} besser zu machen. Ob Sie:

- 🐛 Fehler melden
- ✨ Funktionen vorschlagen
- 📝 die Dokumentation verbessern
- 🔧 Code schreiben
- 🌐 übersetzen

Wir schätzen Ihre Zeit und Ihre Mühe!
