<p align="center">
  <a href="../../CONTRIBUTING.md" lang="en" hreflang="en">English</a> ·
  <a href="../zh-CN/CONTRIBUTING.md" lang="zh-CN" hreflang="zh-CN">简体中文</a> ·
  <a href="../es/CONTRIBUTING.md" lang="es" hreflang="es">Español</a> ·
  <a href="../fr/CONTRIBUTING.md" lang="fr" hreflang="fr">Français</a> ·
  <a href="../pt-BR/CONTRIBUTING.md" lang="pt-BR" hreflang="pt-BR">Português (Brasil)</a> ·
  <a href="../ru/CONTRIBUTING.md" lang="ru" hreflang="ru">Русский</a> ·
  <a href="../id/CONTRIBUTING.md" lang="id" hreflang="id">Bahasa Indonesia</a> ·
  <a href="../de/CONTRIBUTING.md" lang="de" hreflang="de">Deutsch</a> ·
  <a href="../ja/CONTRIBUTING.md" lang="ja" hreflang="ja">日本語</a> ·
  <a href="../ko/CONTRIBUTING.md" lang="ko" hreflang="ko">한국어</a> ·
  <strong lang="it">Italiano</strong> ·
  <a href="../zh-TW/CONTRIBUTING.md" lang="zh-TW" hreflang="zh-TW">繁體中文</a>
</p>

# 🤝 Contribuire a Bookmark Scout

Innanzitutto, grazie per aver pensato di contribuire a Bookmark Scout! Sono le persone come te a rendere questa estensione migliore per tutti.

## 📋 Indice

- [Codice di comportamento](#-codice-di-comportamento)
- [Come posso contribuire?](#-come-posso-contribuire)
- [Ambiente di sviluppo](#-ambiente-di-sviluppo)
- [Processo di pull request](#-processo-di-pull-request)
- [Linee guida di stile](#-linee-guida-di-stile)
- [Internazionalizzazione](#-internazionalizzazione)
- [Domande?](#-domande)

## 📜 Codice di comportamento

Questo progetto adotta un [codice di comportamento](../../CODE_OF_CONDUCT.md). Partecipando, ti impegni a mantenere un comportamento rispettoso e inclusivo. Segnala i comportamenti inaccettabili tramite le GitHub Issues.

## 🎯 Come posso contribuire?

### 🐛 Segnalare bug

Prima di creare una segnalazione di bug, controlla le issue esistenti per evitare duplicati.

**Quando segnali un bug, indica:**

- Browser e versione (Chrome, Firefox, Edge)
- Versione dell'estensione
- Passaggi per riprodurre il problema
- Comportamento previsto e comportamento effettivo
- Screenshot, se utili

Usa il nostro [modello di segnalazione bug](../../.github/ISSUE_TEMPLATE/01-bug-report.yml).

### ✨ Proporre funzioni

Le proposte di nuove funzioni sono sempre benvenute! Usa il nostro [modello di richiesta di funzione](../../.github/ISSUE_TEMPLATE/02-feature-request.yml).

**Una buona richiesta di funzione include:**

- Una descrizione chiara del problema
- La soluzione proposta
- Gli approcci alternativi considerati

### 🔧 Contribuire al codice

Cerchi qualcosa su cui lavorare? Controlla le issue con queste etichette:

- `good first issue`: ideale per chi inizia
- `help wanted`: il tuo aiuto è benvenuto

## 💻 Ambiente di sviluppo

Per usare Bookmark Scout, installalo dallo store del tuo browser o da una release su GitHub, come descritto nel [README](README.md#-installazione). I passaggi seguenti lo compilano dal codice sorgente, per lavorarci. Per lo stack tecnologico, lo stato delle funzioni, le build di release e la struttura del progetto, consulta [DEVELOPMENT.md](../../DEVELOPMENT.md).

### Prerequisiti

- [Bun](https://bun.sh) (ultima versione)
- [mise](https://mise.jdx.dev/) per la gestione dei runtime
- Uno di questi browser: Chrome, Firefox, Edge

### Installazione

```bash
# Clona il repository
git clone https://github.com/isandrel/bookmark-scout.git
cd bookmark-scout

# Installa le dipendenze
bun install

# Avvia il server di sviluppo (Chrome)
bun run dev
```

### Compilazione

```bash
# Compila per tutti i browser
bun run build

# Compila per Chrome
bunx nx run extension:build:chrome

# Compila per Firefox
bun run build:firefox

# Compila per Edge
bun run build:edge
```

### Caricare l'estensione

**Chrome/Edge:**

1. Vai su `chrome://extensions` o `edge://extensions`
2. Attiva **Modalità sviluppatore**
3. Fai clic su **Carica estensione non pacchettizzata** (**Carica decompressa** in Edge)
4. Seleziona `apps/extension/dist/chrome-mv3` (Chrome) o `apps/extension/dist/edge-mv3` (Edge)

**Firefox:**

1. Vai su `about:debugging#/runtime/this-firefox`
2. Fai clic su **Carica componente aggiuntivo temporaneo**
3. Seleziona il file `manifest.json` in `apps/extension/dist/firefox-mv2`

## 🔄 Processo di pull request

### Prima di iniziare

1. **Sincronizzati con main**: fai sempre un pull con rebase prima di iniziare a lavorare
   ```bash
   git checkout main
   git pull --rebase origin main
   ```

2. **Crea una issue**: discuti le modifiche importanti prima di implementarle

3. **Crea un branch**: segui la convenzione di denominazione
   ```bash
   git checkout -b feat/123-description
   git checkout -b fix/123-description
   ```

### Messaggi di commit

Usiamo i [Conventional Commits](https://www.conventionalcommits.org/) con [Gitmoji](https://gitmoji.dev/):

L'hook `commit-msg` e il controllo **PR title** lo verificano, con i tipi consentiti in `config/commits.toml`.

```
✨ feat(scope): add new feature
🐛 fix(scope): fix bug description
📝 docs: update documentation
♻️ refactor(scope): refactor code
🔧 chore: maintenance task
```

| Emoji | Tipo       | Descrizione                  |
| ----- | ---------- | ---------------------------- |
| ✨    | `feat`     | Nuova funzione               |
| 🐛    | `fix`      | Correzione di bug            |
| 📝    | `docs`     | Documentazione               |
| 💄    | `style`    | Interfaccia e stili          |
| ♻️     | `refactor` | Refactoring del codice       |
| ⚡    | `perf`     | Prestazioni                  |
| ✅    | `test`     | Test                         |
| 🔧    | `chore`    | Manutenzione                 |

### Creare una pull request

1. **Esegui il push del tuo branch**
   ```bash
   git push -u origin feat/123-description
   ```

2. **Crea la PR con GitHub CLI**
   ```bash
   gh pr create --title "✨ feat: description" --body "Closes #123" --base main
   ```

3. **Attendi che i controlli della CI** vengano superati

4. **Rispondi ai commenti della revisione**, se ce ne sono

### Checklist della PR

- [ ] Il codice segue le linee guida di stile del progetto
- [ ] Revisione personale completata
- [ ] Validazione lint/build pertinente completata
- [ ] Test aggiunti o aggiornati, se applicabile, quando esiste una suite di test per l'area modificata
- [ ] Documentazione aggiornata se necessario
- [ ] Collegata alla issue pertinente

## 📐 Linee guida di stile

### Stile del codice

Usiamo [Biome](https://biomejs.dev/) per il lint e la formattazione.

```bash
# Controlla il lint
bun run lint

# Esegui solo il lint dell'estensione
bunx nx run extension:lint

# Esegui tutti i test dell'estensione (compila Chrome e installa il Chromium di Playwright)
bun run test
```

Il comando di test esegue i test unitari e la suite E2E Chromium in modalità headless (popup, riquadro laterale, gestione preferiti, impostazioni, salvataggio rapido, manutenzione, report, importazione/esportazione, Chiedi all'IA e percorsi tra più superfici). La CI esegue le stesse suite senza configurazione manuale del browser, più la suite per Edge e la suite di smoke test per Firefox. I flussi che dipendono dalla rete e dai provider IA vengono eseguiti offline: i test intitolati `[mocked provider contract]` simulano i provider IA (mock `ai` di Vitest e un endpoint compatibile con OpenAI instradato da Playwright) e simulano le richieste di rete; verificano il contratto di richiesta e risposta di Bookmark Scout, l'attivazione esplicita e la gestione degli errori, non la compatibilità con provider o siti web reali.

Altre suite, per le modifiche che coprono:

```bash
# Edge e Firefox
bunx nx run extension:test:e2e:edge
bunx nx run extension:test:e2e:firefox

# Agenti IA locali: i test del bridge MCP, poi il binario compilato
# bookmark-scout-mcp con l'estensione in Chromium (Linux e macOS)
bun test packages/mcp-bridge
bunx nx run extension:test:e2e:bridge

# Latenza e scorrimento su una raccolta di grandi dimensioni; da eseguire prima e dopo una modifica alla velocità
bunx nx run extension:test:perf

# Funzioni IA con un provider reale; saltate se le variabili BS_LIVE_AI_* non sono impostate
# (vedi apps/extension/tests/live/README.md)
bunx nx run extension:test:live
```

La CI esegue i test del bridge quando cambiano l'estensione o `packages/mcp-bridge`, la suite delle prestazioni ogni giorno e la suite IA dal vivo solo su richiesta.

### L'IA integrata di Chrome

Il servizio **IA integrata** esegue il modello di Chrome (Gemini Nano, il `LanguageModel` della Prompt API) sul tuo computer. I test unitari ed E2E usano un `LanguageModel` finto (`tests/unit/fake-language-model.ts`, `tests/e2e/builtin-ai.spec.ts`); il modello reale si verifica a mano:

1. Usa Chrome 138 o versioni successive su un computer che soddisfa i [requisiti hardware di Chrome](https://developer.chrome.com/docs/ai/get-started#hardware). **Verifica questo computer**, sotto il servizio in Impostazioni > IA, confronta questo computer con quei requisiti. Per provarlo su un computer meno potente, imposta `chrome://flags/#optimization-guide-on-device-model` su **Enabled BypassPerfRequirement** e riavvia Chrome.
2. Il browser aperto da `bun run dev` indica il modello come non disponibile. Avvialo con l'opzione qui sotto, oppure disattiva il runner e carica `apps/extension/dist/chrome-mv3-dev` nel tuo profilo di Chrome da `chrome://extensions`. Tieni fuori da Git questo file personale di ogni sviluppatore: `apps/extension/web-ext.config.ts` è ignorato.

   ```ts
   // apps/extension/web-ext.config.ts
   import { defineWebExtConfig } from 'wxt';

   export default defineWebExtConfig({
     chromiumArgs: ['--disable-features=DisableLoadExtensionCommandLineSwitch'],
     // Oppure usa invece il tuo profilo: disabled: true,
   });
   ```

3. In **Impostazioni** > **IA**, fai clic su **Usa l'IA integrata**, poi su **Scarica il modello**. `chrome://on-device-internals` mostra lo stato e il download del modello e consente di inviargli direttamente un prompt; Chrome lo apre solo dopo che hai attivato le sue pagine di debug interne in `chrome://chrome-urls`.
4. Attiva **Funzioni IA** e **Registra le richieste**, apri il popup su una pagina e fai clic sul pulsante dei suggerimenti di cartelle. **Attività IA** mostra il prompt come `ON-DEVICE`.
5. Premi due volte la scorciatoia di salvataggio rapido con IA su una pagina. Entrambi i salvataggi compaiono in **Attività IA**; il secondo è più veloce, perché la pagina host dell'IA (un documento offscreen, elencato in `chrome://extensions` tra le viste dell'estensione) mantiene caricate le istruzioni per `[quick_save] idle_timeout_ms` in `apps/extension/config/ai/built-in.toml`.

### TypeScript

- Usa TypeScript per tutto il nuovo codice
- Preferisci `type` a `interface` per i tipi di oggetto
- Indica esplicitamente il tipo di ritorno delle funzioni

### Componenti React

- Usa componenti funzionali con gli hook
- Mantieni i componenti piccoli e mirati
- Usa nomi descrittivi per le prop

### Organizzazione dei file

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

`packages/mcp-bridge` contiene `bookmark-scout-mcp`, il server MCP e host di messaggistica nativa usato dagli agenti IA locali; i suoi messaggi verso l'estensione sono definiti in `packages/mcp-bridge/src/protocol.ts`.

## 🌐 Internazionalizzazione

Quando aggiungi testo visibile agli utenti:

1. Aggiungi le stringhe in `apps/extension/public/_locales/<locale>/messages.json`
2. Aggiungile in ogni lingua elencata in `[locales] extension` in `config/project.toml`
3. Usa l'helper i18n esistente: `t("message_key")`

`README.md`, questa guida e le loro traduzioni in `i18n/<language>/` sono generati da `templates/`: modifica il modello, mai il file generato. Vedi [Generated Markdown](../../DEVELOPMENT.md#-generated-markdown).

## 🤔 Domande?

- Consulta le [issue](https://github.com/isandrel/bookmark-scout/issues) esistenti
- Avvia una [discussione](https://github.com/isandrel/bookmark-scout/discussions)
- Crea una [issue di tipo domanda](../../.github/ISSUE_TEMPLATE/04-question.yml)

## 🙏 Grazie!

Ogni contributo aiuta a migliorare Bookmark Scout, che si tratti di:

- 🐛 Segnalare bug
- ✨ Proporre funzioni
- 📝 Migliorare la documentazione
- 🔧 Scrivere codice
- 🌐 Tradurre

Grazie per il tuo tempo e il tuo impegno!
