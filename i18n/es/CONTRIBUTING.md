<p align="center">
  <a href="../../CONTRIBUTING.md" lang="en" hreflang="en">English</a> ·
  <a href="../zh-CN/CONTRIBUTING.md" lang="zh-CN" hreflang="zh-CN">简体中文</a> ·
  <strong lang="es">Español</strong> ·
  <a href="../fr/CONTRIBUTING.md" lang="fr" hreflang="fr">Français</a> ·
  <a href="../pt-BR/CONTRIBUTING.md" lang="pt-BR" hreflang="pt-BR">Português (Brasil)</a> ·
  <a href="../de/CONTRIBUTING.md" lang="de" hreflang="de">Deutsch</a> ·
  <a href="../ja/CONTRIBUTING.md" lang="ja" hreflang="ja">日本語</a> ·
  <a href="../ko/CONTRIBUTING.md" lang="ko" hreflang="ko">한국어</a> ·
  <a href="../zh-TW/CONTRIBUTING.md" lang="zh-TW" hreflang="zh-TW">繁體中文</a>
</p>

# 🤝 Cómo contribuir a Bookmark Scout

Ante todo, ¡gracias por plantearte contribuir a Bookmark Scout! Gracias a personas como tú, esta extensión mejora para todos.

## 📋 Índice

- [Código de conducta](#-código-de-conducta)
- [¿Cómo puedo contribuir?](#-cómo-puedo-contribuir)
- [Preparar el entorno de desarrollo](#-preparar-el-entorno-de-desarrollo)
- [Proceso de pull request](#-proceso-de-pull-request)
- [Guía de estilo](#-guía-de-estilo)
- [Internacionalización](#-internacionalización)
- [¿Preguntas?](#-preguntas)

## 📜 Código de conducta

Este proyecto se rige por un [Código de conducta](../../CODE_OF_CONDUCT.md). Al participar, se espera que mantengas un comportamiento respetuoso e inclusivo. Informa de cualquier comportamiento inaceptable a través de GitHub Issues.

## 🎯 ¿Cómo puedo contribuir?

### 🐛 Informar de errores

Antes de crear un informe de error, revisa los issues existentes para evitar duplicados.

**Al informar de un error, incluye:**

- Navegador y versión (Chrome, Firefox, Edge)
- Versión de la extensión
- Pasos para reproducirlo
- Comportamiento esperado y comportamiento real
- Capturas de pantalla, si procede

Usa nuestra [plantilla de informe de error](../../.github/ISSUE_TEMPLATE/01-bug-report.yml).

### ✨ Sugerir funciones

¡Nos encantan las sugerencias de funciones! Usa nuestra [plantilla de solicitud de función](../../.github/ISSUE_TEMPLATE/02-feature-request.yml).

**Una buena solicitud de función incluye:**

- Una descripción clara del problema
- La solución propuesta
- Las alternativas que has considerado

### 🔧 Contribuciones de código

¿Buscas algo en lo que trabajar? Revisa los issues con estas etiquetas:

- `good first issue`: ideal para quien empieza
- `help wanted`: nos encantaría contar con tu ayuda

## 💻 Preparar el entorno de desarrollo

Para usar Bookmark Scout, instálala desde la tienda de tu navegador o desde una versión de GitHub, como explica el [README](README.md#-instalación). Los pasos siguientes la compilan desde el código fuente, para trabajar en ella. Para las tecnologías que usa, el estado de las funciones, las compilaciones de versión y la estructura del proyecto, consulta [DEVELOPMENT.md](../../DEVELOPMENT.md).

### Requisitos previos

- [Bun](https://bun.sh) (la última versión)
- [mise](https://mise.jdx.dev/) para gestionar los entornos de ejecución
- Uno de estos navegadores: Chrome, Firefox, Edge

### Instalación

```bash
# Clona el repositorio
git clone https://github.com/isandrel/bookmark-scout.git
cd bookmark-scout

# Instala las dependencias
bun install

# Inicia el servidor de desarrollo (Chrome)
bun run dev
```

### Compilación

```bash
# Compila para todos los navegadores
bun run build

# Compila para Chrome
bunx nx run extension:build:chrome

# Compila para Firefox
bun run build:firefox

# Compila para Edge
bun run build:edge
```

### Cargar la extensión

**Chrome/Edge:**

1. Ve a `chrome://extensions` o `edge://extensions`
2. Activa el «Modo de desarrollador»
3. Haz clic en «Cargar descomprimida» (en Edge, «Cargar desempaquetada»)
4. Selecciona `apps/extension/dist/chrome-mv3` (Chrome) o `apps/extension/dist/edge-mv3` (Edge)

**Firefox:**

1. Ve a `about:debugging#/runtime/this-firefox`
2. Haz clic en «Cargar complemento temporal»
3. Selecciona el archivo `manifest.json` de `apps/extension/dist/firefox-mv2`

## 🔄 Proceso de pull request

### Antes de empezar

1. **Sincroniza con main**: haz siempre un pull con rebase antes de empezar a trabajar
   ```bash
   git checkout main
   git pull --rebase origin main
   ```

2. **Crea un issue**: comenta los cambios importantes antes de implementarlos

3. **Crea una rama**: usa los nombres convencionales
   ```bash
   git checkout -b feat/123-description
   git checkout -b fix/123-description
   ```

### Mensajes de commit

Usamos [Conventional Commits](https://www.conventionalcommits.org/) con [Gitmoji](https://gitmoji.dev/):

El hook `commit-msg` y la comprobación **PR title** lo exigen; los tipos permitidos están en `config/commits.toml`.

```
✨ feat(scope): add new feature
🐛 fix(scope): fix bug description
📝 docs: update documentation
♻️ refactor(scope): refactor code
🔧 chore: maintenance task
```

| Emoji | Tipo       | Descripción               |
| ----- | ---------- | ------------------------- |
| ✨    | `feat`     | Nueva función             |
| 🐛    | `fix`      | Corrección de errores     |
| 📝    | `docs`     | Documentación             |
| 💄    | `style`    | Interfaz y estilos        |
| ♻️     | `refactor` | Refactorización de código |
| ⚡    | `perf`     | Rendimiento               |
| ✅    | `test`     | Pruebas                   |
| 🔧    | `chore`    | Mantenimiento             |

### Crear una pull request

1. **Sube tu rama**
   ```bash
   git push -u origin feat/123-description
   ```

2. **Crea la PR con GitHub CLI**
   ```bash
   gh pr create --title "✨ feat: description" --body "Closes #123" --base main
   ```

3. **Espera a que pasen las comprobaciones de CI**

4. **Atiende los comentarios de la revisión**, si los hay

### Lista de comprobación de la PR

- [ ] El código sigue la guía de estilo del proyecto
- [ ] Revisión propia hecha
- [ ] Lint y compilación correspondientes comprobados
- [ ] Pruebas añadidas o actualizadas, si procede y si existe un conjunto de pruebas para la parte modificada
- [ ] Documentación actualizada, si hace falta
- [ ] Enlazada al issue correspondiente

## 📐 Guía de estilo

### Estilo de código

Usamos [Biome](https://biomejs.dev/) para el lint y el formato.

```bash
# Comprueba el lint
bun run lint

# Ejecuta solo el lint de la extensión
bunx nx run extension:lint

# Ejecuta todas las pruebas de la extensión (compila Chrome e instala el Chromium de Playwright)
bun run test
```

El comando de pruebas ejecuta las pruebas unitarias y el conjunto E2E de Chromium sin interfaz gráfica (ventana emergente, panel lateral, administrador de marcadores, configuración, guardado rápido, mantenimiento, informes, importación y exportación, Preguntar a la IA y recorridos entre varias superficies). La CI ejecuta los mismos conjuntos sin preparar ningún navegador a mano, además del conjunto de Edge y el conjunto de pruebas básicas de Firefox. Los flujos que dependen de la red y de proveedores de IA se ejecutan sin conexión: las pruebas tituladas `[mocked provider contract]` sustituyen a los proveedores de IA (mocks de `ai` en Vitest y un endpoint compatible con OpenAI enrutado por Playwright) y simulan las peticiones de red con rutas; comprueban el contrato de petición y respuesta de Bookmark Scout, la activación opcional y el manejo de errores, no la compatibilidad con proveedores o sitios web reales.

Otros conjuntos, para los cambios que cubren:

```bash
# Edge y Firefox
bunx nx run extension:test:e2e:edge
bunx nx run extension:test:e2e:firefox

# Agentes de IA locales: primero las pruebas del propio puente MCP, luego
# bookmark-scout-mcp compilado con la extensión en Chromium (Linux y macOS)
bun test packages/mcp-bridge
bunx nx run extension:test:e2e:bridge

# Latencia y desplazamiento con una biblioteca grande; ejecútalo antes y después de un cambio de velocidad
bunx nx run extension:test:perf

# Funciones de IA con un proveedor real; se omite salvo que estén definidas las variables BS_LIVE_AI_*
# (consulta apps/extension/tests/live/README.md)
bunx nx run extension:test:live
```

La CI ejecuta las pruebas del puente cuando cambian la extensión o `packages/mcp-bridge`, el conjunto de rendimiento a diario y el conjunto de IA en vivo solo a petición.

### IA integrada de Chrome

El servicio **IA integrada** ejecuta el modelo propio de Chrome (Gemini Nano, el `LanguageModel` de la Prompt API) en tu equipo. Las pruebas unitarias y E2E usan un `LanguageModel` falso (`tests/unit/fake-language-model.ts`, `tests/e2e/builtin-ai.spec.ts`); el modelo real se comprueba a mano:

1. Usa Chrome 138 o posterior en un equipo que cumpla los [requisitos de hardware de Chrome](https://developer.chrome.com/docs/ai/get-started#hardware). **Comprobar este equipo**, debajo del servicio en Configuración > IA, compara este equipo con ellos. Para probarlo en uno menos potente, pon `chrome://flags/#optimization-guide-on-device-model` en **Enabled BypassPerfRequirement** y reinicia Chrome.
2. El navegador que abre `bun run dev` indica que el modelo no está disponible. Inícialo con el modificador de abajo, o desactiva el runner y carga `apps/extension/dist/chrome-mv3-dev` en tu propio perfil de Chrome desde `chrome://extensions`. Mantén este archivo personal fuera de Git: `apps/extension/web-ext.config.ts` está ignorado.

   ```ts
   // apps/extension/web-ext.config.ts
   import { defineWebExtConfig } from 'wxt';

   export default defineWebExtConfig({
     chromiumArgs: ['--disable-features=DisableLoadExtensionCommandLineSwitch'],
     // O usa tu propio perfil en su lugar: disabled: true,
   });
   ```

3. En **Configuración** > **IA**, haz clic en **Usar la IA integrada** y luego en **Descargar el modelo**. `chrome://on-device-internals` muestra el estado y la descarga del modelo, y te permite enviarle un prompt directamente; Chrome solo la abre después de que actives sus páginas internas de depuración en `chrome://chrome-urls`.
4. Activa **Funciones de IA** y **Registrar solicitudes**, abre la ventana emergente en una página y haz clic en el botón de sugerencia de carpeta. **Actividad de IA** muestra el prompt como `ON-DEVICE`.
5. Pulsa dos veces el atajo de guardado rápido con IA en una página. Los dos guardados aparecen en **Actividad de IA**; el segundo es más rápido, porque la página que aloja la IA (un documento offscreen, que aparece en `chrome://extensions` entre las vistas de la extensión) mantiene cargadas las instrucciones durante `[quick_save] idle_timeout_ms` de `apps/extension/config/ai/built-in.toml`.

### TypeScript

- Usa TypeScript para todo el código nuevo
- Prefiere `type` a `interface` para los tipos de objeto
- Declara explícitamente los tipos de retorno de las funciones

### Componentes de React

- Usa componentes funcionales con hooks
- Mantén los componentes pequeños y centrados en una sola cosa
- Usa nombres de props descriptivos

### Organización de archivos

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

`packages/mcp-bridge` contiene `bookmark-scout-mcp`, el servidor MCP y host de mensajería nativa que usan los agentes de IA locales; sus mensajes a la extensión se definen en `packages/mcp-bridge/src/protocol.ts`.

## 🌐 Internacionalización

Al añadir texto visible para el usuario:

1. Añade las cadenas a `apps/extension/public/_locales/<locale>/messages.json`
2. Añádelas a todos los idiomas de `[locales] extension` en `config/project.toml`
3. Usa el helper de i18n existente: `t("message_key")`

`README.md`, esta guía y sus traducciones en `i18n/<language>/` se generan a partir de `templates/`: edita la plantilla, nunca el archivo generado. Consulta [Generated Markdown](../../DEVELOPMENT.md#-generated-markdown) (en inglés).

## 🤔 ¿Preguntas?

- Revisa los [issues](https://github.com/isandrel/bookmark-scout/issues) existentes
- Abre una [discusión](https://github.com/isandrel/bookmark-scout/discussions)
- Crea un [issue de pregunta](../../.github/ISSUE_TEMPLATE/04-question.yml)

## 🙏 ¡Gracias!

Cada contribución ayuda a mejorar Bookmark Scout, ya sea:

- 🐛 Informar de errores
- ✨ Sugerir funciones
- 📝 Mejorar la documentación
- 🔧 Escribir código
- 🌐 Traducir

¡Agradecemos tu tiempo y tu esfuerzo!
