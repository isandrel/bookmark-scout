<p align="center">
  <a href="../../CONTRIBUTING.md" lang="en" hreflang="en">English</a> ·
  <a href="../zh-CN/CONTRIBUTING.md" lang="zh-CN" hreflang="zh-CN">简体中文</a> ·
  <a href="../es/CONTRIBUTING.md" lang="es" hreflang="es">Español</a> ·
  <a href="../fr/CONTRIBUTING.md" lang="fr" hreflang="fr">Français</a> ·
  <strong lang="pt-BR">Português (Brasil)</strong> ·
  <a href="../ru/CONTRIBUTING.md" lang="ru" hreflang="ru">Русский</a> ·
  <a href="../id/CONTRIBUTING.md" lang="id" hreflang="id">Bahasa Indonesia</a> ·
  <a href="../de/CONTRIBUTING.md" lang="de" hreflang="de">Deutsch</a> ·
  <a href="../ja/CONTRIBUTING.md" lang="ja" hreflang="ja">日本語</a> ·
  <a href="../ko/CONTRIBUTING.md" lang="ko" hreflang="ko">한국어</a> ·
  <a href="../it/CONTRIBUTING.md" lang="it" hreflang="it">Italiano</a> ·
  <a href="../zh-TW/CONTRIBUTING.md" lang="zh-TW" hreflang="zh-TW">繁體中文</a>
</p>

# 🤝 Como contribuir com o Bookmark Scout

Antes de tudo, obrigado por considerar contribuir com o Bookmark Scout! São pessoas como você que tornam esta extensão melhor para todos.

## 📋 Sumário

- [Código de Conduta](#-código-de-conduta)
- [Como posso contribuir?](#-como-posso-contribuir)
- [Configuração do ambiente de desenvolvimento](#-configuração-do-ambiente-de-desenvolvimento)
- [Processo de pull request](#-processo-de-pull-request)
- [Diretrizes de estilo](#-diretrizes-de-estilo)
- [Internacionalização](#-internacionalização)
- [Dúvidas?](#-dúvidas)

## 📜 Código de Conduta

Este projeto segue um [Código de Conduta](../../CODE_OF_CONDUCT.md). Ao participar, espera-se que você mantenha um comportamento respeitoso e inclusivo. Relate comportamentos inaceitáveis pelas Issues do GitHub.

## 🎯 Como posso contribuir?

### 🐛 Relatar bugs

Antes de criar um relato de bug, verifique as issues existentes para evitar duplicatas.

**Ao relatar um bug, inclua:**

- Navegador e versão (Chrome, Firefox, Edge)
- Versão da extensão
- Passos para reproduzir
- Comportamento esperado e comportamento real
- Capturas de tela, se for o caso

Use nosso [modelo de relato de bug](../../.github/ISSUE_TEMPLATE/01-bug-report.yml).

### ✨ Sugerir recursos

Adoramos sugestões de recursos! Use nosso [modelo de solicitação de recurso](../../.github/ISSUE_TEMPLATE/02-feature-request.yml).

**Boas solicitações de recurso incluem:**

- Uma descrição clara do problema
- A solução proposta
- As alternativas consideradas

### 🔧 Contribuir com código

Procurando algo para fazer? Veja as issues com estes rótulos:

- `good first issue` - Ótimas para quem está começando
- `help wanted` - Adoraríamos sua ajuda

## 💻 Configuração do ambiente de desenvolvimento

Para usar o Bookmark Scout, instale-o pela loja do seu navegador ou por uma versão do GitHub, como o [README](README.md#-instalação) descreve. Os passos abaixo compilam a extensão a partir do código-fonte, para quem vai trabalhar nela. Para a stack técnica, o status dos recursos, as compilações de versão e a estrutura do projeto, veja o [DEVELOPMENT.md](../../DEVELOPMENT.md) (em inglês).

### Pré-requisitos

- [Bun](https://bun.sh) (versão mais recente)
- [mise](https://mise.jdx.dev/) para gerenciar os runtimes
- Um destes navegadores: Chrome, Firefox, Edge

### Instalação

```bash
# Clone o repositório
git clone https://github.com/isandrel/bookmark-scout.git
cd bookmark-scout

# Instale as dependências
bun install

# Inicie o servidor de desenvolvimento (Chrome)
bun run dev
```

### Compilação

```bash
# Compile para todos os navegadores
bun run build

# Compile para o Chrome
bunx nx run extension:build:chrome

# Compile para o Firefox
bun run build:firefox

# Compile para o Edge
bun run build:edge
```

### Carregar a extensão

**Chrome/Edge:**

1. Acesse `chrome://extensions` ou `edge://extensions`
2. Ative o "Modo do desenvolvedor" (no Edge, "Modo de desenvolvedor")
3. Clique em "Carregar sem compactação" (no Edge, "Carregar sem pacote")
4. Selecione `apps/extension/dist/chrome-mv3` (Chrome) ou `apps/extension/dist/edge-mv3` (Edge)

**Firefox:**

1. Acesse `about:debugging#/runtime/this-firefox`
2. Clique em "Carregar extensão temporária"
3. Selecione o arquivo `manifest.json` em `apps/extension/dist/firefox-mv2`

## 🔄 Processo de pull request

### Antes de começar

1. **Sincronize com a main**: sempre faça pull com rebase antes de começar
   ```bash
   git checkout main
   git pull --rebase origin main
   ```

2. **Crie uma issue**: discuta mudanças significativas antes de implementá-las

3. **Crie uma branch**: use a convenção de nomes
   ```bash
   git checkout -b feat/123-description
   git checkout -b fix/123-description
   ```

### Mensagens de commit

Usamos [Conventional Commits](https://www.conventionalcommits.org/) com [Gitmoji](https://gitmoji.dev/):

O hook `commit-msg` e a verificação **PR title** exigem isso; os tipos permitidos estão em `config/commits.toml`.

```
✨ feat(scope): add new feature
🐛 fix(scope): fix bug description
📝 docs: update documentation
♻️ refactor(scope): refactor code
🔧 chore: maintenance task
```

| Emoji | Tipo       | Descrição                 |
| ----- | ---------- | ------------------------- |
| ✨    | `feat`     | Novo recurso              |
| 🐛    | `fix`      | Correção de bug           |
| 📝    | `docs`     | Documentação              |
| 💄    | `style`    | Interface e estilo        |
| ♻️     | `refactor` | Refatoração de código     |
| ⚡    | `perf`     | Desempenho                |
| ✅    | `test`     | Testes                    |
| 🔧    | `chore`    | Manutenção                |

### Criar um pull request

1. **Envie sua branch**
   ```bash
   git push -u origin feat/123-description
   ```

2. **Crie o PR pela GitHub CLI**
   ```bash
   gh pr create --title "✨ feat: description" --body "Closes #123" --base main
   ```

3. **Aguarde as verificações da CI** passarem

4. **Responda aos comentários da revisão**, se houver

### Checklist do PR

- [ ] O código segue as diretrizes de estilo do projeto
- [ ] Revisão própria concluída
- [ ] Validação de lint/build relevante concluída
- [ ] Testes adicionados ou atualizados, quando houver um conjunto de testes para a área alterada
- [ ] Documentação atualizada, se necessário
- [ ] Vinculado à issue correspondente

## 📐 Diretrizes de estilo

### Estilo de código

Usamos o [Biome](https://biomejs.dev/) para lint e formatação.

```bash
# Verifique o lint
bun run lint

# Execute só o lint da extensão
bunx nx run extension:lint

# Execute todos os testes da extensão (compila para o Chrome e instala o Chromium do Playwright)
bun run test
```

O comando de teste executa os testes de unidade e o conjunto E2E do Chromium em modo headless (pop-up, painel lateral, gerenciador de favoritos, configurações, salvamento rápido, manutenção, relatórios, importação e exportação, Perguntar à IA e jornadas entre superfícies). A CI executa os mesmos conjuntos sem configuração manual de navegador, além do conjunto do Edge e do conjunto de testes básicos do Firefox. Os fluxos que dependem da rede e de provedores de IA são executados offline: os testes com o título `[mocked provider contract]` simulam os provedores de IA (mocks `ai` do Vitest e um endpoint compatível com OpenAI roteado pelo Playwright) e as buscas de rede com rotas simuladas; eles verificam o contrato de solicitação e resposta do Bookmark Scout, a ativação opcional e o tratamento de erros, não a compatibilidade com provedores ou sites reais.

Outros conjuntos, para as mudanças que eles cobrem:

```bash
# Edge e Firefox
bunx nx run extension:test:e2e:edge
bunx nx run extension:test:e2e:firefox

# Agentes de IA locais: os testes da própria ponte MCP e depois o
# bookmark-scout-mcp compilado com a extensão no Chromium (Linux e macOS)
bun test packages/mcp-bridge
bunx nx run extension:test:e2e:bridge

# Latência e rolagem em uma coleção grande; execute antes e depois de uma mudança de velocidade
bunx nx run extension:test:perf

# Recursos de IA com um provedor real; ignorado a menos que as variáveis BS_LIVE_AI_* estejam definidas
# (veja apps/extension/tests/live/README.md)
bunx nx run extension:test:live
```

A CI executa os testes da ponte quando a extensão ou `packages/mcp-bridge` mudam, o conjunto de desempenho diariamente e o conjunto de IA ao vivo somente sob demanda.

### IA integrada do Chrome

O serviço **IA integrada** executa o modelo do próprio Chrome (Gemini Nano, o `LanguageModel` da Prompt API) no seu computador. Os testes de unidade e E2E usam um `LanguageModel` falso (`tests/unit/fake-language-model.ts`, `tests/e2e/builtin-ai.spec.ts`); o modelo real é verificado manualmente:

1. Use o Chrome 138 ou mais recente em um computador que atenda aos [requisitos de hardware do Chrome](https://developer.chrome.com/docs/ai/get-started#hardware). **Verificar este computador**, abaixo do serviço em Configurações > IA, compara este computador com esses requisitos. Para testar em um computador mais fraco, defina `chrome://flags/#optimization-guide-on-device-model` como **Enabled BypassPerfRequirement** e reinicie o Chrome.
2. O navegador que `bun run dev` abre informa que o modelo não está disponível. Inicie-o com a opção abaixo ou desative o runner e carregue `apps/extension/dist/chrome-mv3-dev` no seu próprio perfil do Chrome, em `chrome://extensions`. Mantenha esse arquivo, que é de cada desenvolvedor, fora do Git: `apps/extension/web-ext.config.ts` é ignorado.

   ```ts
   // apps/extension/web-ext.config.ts
   import { defineWebExtConfig } from 'wxt';

   export default defineWebExtConfig({
     chromiumArgs: ['--disable-features=DisableLoadExtensionCommandLineSwitch'],
     // Ou use seu próprio perfil: disabled: true,
   });
   ```

3. Em **Configurações** > **IA**, clique em **Usar a IA integrada** e depois em **Baixar o modelo**. `chrome://on-device-internals` mostra o estado e o download do modelo, e permite enviar um prompt diretamente a ele; o Chrome só abre essa página depois que você ativa as páginas internas de depuração em `chrome://chrome-urls`.
4. Ative **Recursos de IA** e **Registrar solicitações**, abra o pop-up em uma página e clique no botão de sugestão de pasta. **Atividade da IA** mostra o prompt como `ON-DEVICE`.
5. Pressione duas vezes o atalho de salvamento rápido com IA em uma página. Os dois salvamentos aparecem em **Atividade da IA**; o segundo é mais rápido, porque a página que hospeda a IA (um documento offscreen, listado em `chrome://extensions` entre as visualizações da extensão) mantém as instruções carregadas por `[quick_save] idle_timeout_ms` em `apps/extension/config/ai/built-in.toml`.

### TypeScript

- Use TypeScript em todo código novo
- Prefira `type` a `interface` para tipos de objeto
- Use tipos de retorno explícitos nas funções

### Componentes React

- Use componentes funcionais com hooks
- Mantenha os componentes pequenos e focados
- Use nomes de props descritivos

### Organização dos arquivos

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

`packages/mcp-bridge` contém o `bookmark-scout-mcp`, o servidor MCP e host de mensagens nativas que os agentes de IA locais usam; as mensagens dele para a extensão são definidas em `packages/mcp-bridge/src/protocol.ts`.

## 🌐 Internacionalização

Ao adicionar texto exibido ao usuário:

1. Adicione as strings em `apps/extension/public/_locales/<locale>/messages.json`
2. Adicione-as em todos os locales listados em `[locales] extension` no `config/project.toml`
3. Use o helper de i18n existente: `t("message_key")`

O `README.md`, este guia e as traduções deles em `i18n/<language>/` são gerados a partir de `templates/`: edite o template, nunca o arquivo gerado. Veja [Generated Markdown](../../DEVELOPMENT.md#-generated-markdown) (em inglês).

## 🤔 Dúvidas?

- Consulte as [issues](https://github.com/isandrel/bookmark-scout/issues) existentes
- Inicie uma [discussão](https://github.com/isandrel/bookmark-scout/discussions)
- Crie uma [issue de pergunta](../../.github/ISSUE_TEMPLATE/04-question.yml)

## 🙏 Obrigado!

Toda contribuição ajuda a melhorar o Bookmark Scout. Seja:

- 🐛 Relatando bugs
- ✨ Sugerindo recursos
- 📝 Melhorando a documentação
- 🔧 Escrevendo código
- 🌐 Traduzindo

Agradecemos seu tempo e seu esforço!
