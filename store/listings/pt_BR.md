# Brazilian Portuguese Listing Copy (Português (Brasil))

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts were measured on 2026-10-08 and count Unicode characters.

| Block | Characters |
| --- | --- |
| Optional manifest description | 129 |
| Firefox Add-ons summary | 241 |
| Full description, Chrome and Edge | 4,474 |
| Full description, Firefox | 1,910 |

## Name

```text
Bookmark Scout
```

Read from `extName` in `apps/extension/public/_locales/pt_BR/messages.json`.

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

Packaged as `extDescription`; changing it needs a new version:

```text
Encontre, organize e limpe favoritos: pesquisa rápida, salvar em pastas, duplicatas, links quebrados e IA opcional com sua chave.
```

### Firefox Add-ons summary (250 characters maximum)

```text
Pesquise e organize seus favoritos pela barra de ferramentas: pesquisa instantânea, árvore de pastas com arrastar e soltar, salvamento em qualquer pasta com um clique e sugestões de pasta com IA opcional, usando seu próprio provedor e chave.
```

## Search terms (Edge Add-ons)

```text
gerenciador de favoritos
pesquisar favoritos
favoritos duplicados
links quebrados
pastas de favoritos
favoritos com IA
importar exportar favoritos
```

## Full description: Chrome Web Store and Edge Add-ons

The same Edge condition as in `en.md` applies.

```text
O Bookmark Scout ajuda você a encontrar, guardar e organizar seus favoritos sem sair do navegador.

PESQUISE E SALVE PELA BARRA DE FERRAMENTAS
• Pesquisa instantânea em todos os favoritos, com opções para diferenciar maiúsculas e minúsculas, palavra inteira e expressão regular
• Árvore de pastas com arrastar e soltar, expandir e recolher tudo e criação de novas pastas
• Salve a página atual em qualquer pasta com um clique; uma página que já está nessa pasta não é salva duas vezes
• Painel lateral com a mesma árvore e a mesma pesquisa
• Menu de clique com o botão direito opcional (ative Menu de contexto nas Configurações) para salvar links em pastas recentes
• Atalhos de teclado que nunca substituem os atalhos Ctrl/Cmd do navegador
• Exclusão com caixa de confirmação (ativada por padrão) e opção de desfazer por 10 segundos

GERENCIADOR DE FAVORITOS
O Bookmark Scout substitui a página de favoritos do navegador por um gerenciador com árvore de pastas, trilha de navegação, tabela com classificação e filtros, colunas redimensionáveis e pesquisas salvas (visualizações inteligentes que guardam só os filtros e sempre mostram resultados atualizados).

FERRAMENTAS DE MANUTENÇÃO
• Limpador de duplicatas: revise os grupos de duplicatas antes de remover as cópias extras
• Limpador de URLs: veja uma prévia e remova parâmetros de rastreamento
• Verificador de links quebrados: encontre links inacessíveis e revise as correções (excluir, usar o destino do redirecionamento, apontar para uma cópia arquivada ou editar o URL), com opção de desfazer
• Buscador de metadados: sugere títulos de página e aplica só os que você selecionar
• Verificador de privacidade: encontra parâmetros de consulta confidenciais, fragmentos de URL, endereços de e-mail e UUIDs nos favoritos
• Estatísticas: domínios, pastas, profundidade e duplicatas
• Atualizar ícones dos sites: baixa o ícone de cada site diretamente, sem serviço de ícones de terceiros
• Importação de HTML ou JSON com prévia, tratamento de duplicatas e opção de desfazer
• Exportação para HTML, JSON, Markdown ou CSV, com revisão de privacidade opcional que pode ocultar valores confidenciais

O Verificador de links quebrados, o Buscador de metadados, Atualizar ícones dos sites e a configuração de IA Ler conteúdo da página pedem acesso opcional aos sites na primeira vez que você os usa. Esse acesso nunca é concedido na instalação, as solicitações são enviadas sem cookies e, se você recusar, o recurso simplesmente fica desativado.

FERRAMENTAS DE IA OPCIONAIS (DESATIVADAS POR PADRÃO)
Ative a IA nas Configurações e escolha um provedor de IA na nuvem, qualquer endpoint compatível com OpenAI ou um servidor de modelos no seu próprio computador, com sua própria chave de API quando o provedor exigir uma.
• Sugestões de pasta para a página atual, incluindo a criação revisada de um novo caminho de pastas
• Sugestões de tags e resumos curtos que você revisa antes de salvar
• Planos de reorganização de pastas, com prévia antes de qualquer alteração (padrão)
• Exportação dos favoritos selecionados como contexto em Markdown ou XML para uma conversa com IA (funciona sem IA e não envia nada)
• Perguntar à IA: converse sobre seus favoritos; a IA pode consultar favoritos correspondentes, os nomes das suas pastas e a página atual
• Ler conteúdo da página (desativado por padrão): envia o texto legível de cada página, não só o título e o URL, para sugestões melhores

Quando você usa um recurso de IA, os dados de que ele precisa são enviados diretamente do seu navegador ao provedor escolhido, de acordo com os termos desse provedor: títulos, URLs e nomes de pastas dos favoritos, além das tags e resumos salvos; o título e o URL da página atual; suas mensagens do Perguntar à IA; e, somente com Ler conteúdo da página ativado, o texto das páginas envolvidas. Nada é enviado ao Bookmark Scout. Sua chave de API fica no armazenamento local de extensões deste navegador e não é sincronizada. O uso do provedor pode ser cobrado.

PRIVACIDADE
• Sem conta, sem análises de uso, sem rastreamento, sem anúncios
• Os favoritos ficam no seu navegador; tags, resumos e pesquisas salvas ficam no armazenamento local de extensões
• As configurações são sincronizadas pela conta do navegador, quando o navegador permite
• Código aberto sob a licença AGPL-3.0: https://github.com/isandrel/bookmark-scout

Disponível em 9 idiomas. Temas claro, escuro e do sistema.

Documentação: https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
O Bookmark Scout ajuda você a encontrar e guardar seus favoritos sem sair do navegador.

PESQUISE E SALVE PELA BARRA DE FERRAMENTAS
• Pesquisa instantânea em todos os favoritos, com opções para diferenciar maiúsculas e minúsculas, palavra inteira e expressão regular
• Árvore de pastas com arrastar e soltar, expandir e recolher tudo e criação de novas pastas
• Salve a página atual em qualquer pasta com um clique; uma página que já está nessa pasta não é salva duas vezes
• A mesma árvore e a mesma pesquisa no painel lateral do Firefox, que continua aberto enquanto você navega
• Salve links em pastas recentes pelo menu de clique com o botão direito
• Atalhos de teclado que nunca substituem os atalhos Ctrl/Cmd do navegador
• Exclusão com caixa de confirmação (ativada por padrão) e opção de desfazer por 10 segundos

SUGESTÕES DE PASTA COM IA OPCIONAIS (DESATIVADAS POR PADRÃO)
Ative a IA nas Configurações e escolha um provedor de IA na nuvem, qualquer endpoint compatível com OpenAI ou um servidor de modelos no seu próprio computador, com sua própria chave de API quando o provedor exigir uma. O Bookmark Scout então sugere pastas para a página atual e pode criar um novo caminho de pastas depois que você revisá-lo.

Quando você pede sugestões, o título e o URL da página atual e os nomes das suas pastas são enviados diretamente do seu navegador ao provedor escolhido, de acordo com os termos desse provedor. Nada é enviado ao Bookmark Scout. Sua chave de API fica no armazenamento local de extensões deste navegador e não é sincronizada. O uso do provedor pode ser cobrado.

PRIVACIDADE
• Sem conta, sem análises de uso, sem rastreamento, sem anúncios
• Os favoritos ficam no seu navegador
• As configurações são sincronizadas pelo Firefox Sync, quando ativado
• Código aberto sob a licença AGPL-3.0: https://github.com/isandrel/bookmark-scout

Disponível em 9 idiomas. Temas claro, escuro e do sistema.

O gerenciador de favoritos abre em uma nova aba pelo pop-up da barra de ferramentas.
```

## Category

Same as `en.md`. Stores set the category once for all locales.

## Support and links

Same as [`en.md`](en.md#support-and-links). Where a store accepts a value per locale, use the English pages until the website has a Brazilian Portuguese version (`/pt-BR/` or the path the website adopts):

| Field | Value |
| --- | --- |
| Support URL | https://bookmark-scout.com/pt-BR/support/ |
| Privacy policy URL | https://bookmark-scout.com/pt-BR/privacy/ |
| Support email | support@bookmark-scout.com |
