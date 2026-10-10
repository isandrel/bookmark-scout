# Brazilian Portuguese Listing Copy (Português (Brasil))

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts count Unicode characters and were measured on 2026-10-10.

| Block | Characters |
| --- | --- |
| Optional manifest description | 131 |
| Firefox Add-ons summary | 248 |
| Full description, Chrome and Edge | 4,915 |
| Full description, Firefox | 2,457 |

## Name

```text
Bookmark Scout
```

Read from `extName` in `apps/extension/public/_locales/pt_BR/messages.json`.

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

Packaged as `extDescription`; changing it needs a new version. Ships with the next version after 0.3.2 (131 characters):

```text
Salve páginas na pasta certa, rápido: digite parte do nome de uma pasta ou deixe a IA sugerir. E ferramentas de pesquisa e limpeza.
```

### Firefox Add-ons summary (250 characters maximum, 248 characters)

```text
Salve páginas na pasta de favoritos certa, rápido: digite parte do nome de uma pasta, mesmo no fundo da árvore, e salve pelo teclado, ou deixe a IA opcional sugerir uma. E mais: pesquisa instantânea e árvore de pastas no pop-up e no painel lateral.
```

## Search terms (Edge Add-ons)

```text
salvar em pasta
gerenciador de favoritos
pesquisar favoritos
favoritos duplicados
links quebrados
pastas de favoritos
favoritos com IA
```

## Full description: Chrome Web Store and Edge Add-ons

The same Edge condition as in `en.md` applies.

```text
O Bookmark Scout salva cada página na pasta certa em segundos e depois ajuda você a encontrar e organizar seus favoritos sem sair do navegador.

SALVE NA PASTA CERTA EM SEGUNDOS
• Digite parte do nome de qualquer pasta, mesmo uma que esteja bem no fundo da árvore, e salve a página atual nela sem tirar as mãos do teclado
• Digite um caminho como work/react; um pequeno erro de digitação ainda encontra a pasta, e as pastas que você usou recentemente aparecem primeiro
• Uma página que já está nessa pasta não é salva duas vezes
• A IA opcional sugere a melhor pasta para a página, ou um novo caminho de pastas que você revisa antes de ele ser criado
• Menu de clique com o botão direito opcional (ative Menu de contexto nas Configurações) para salvar links em pastas recentes

PESQUISE PELA BARRA DE FERRAMENTAS
• Pesquisa instantânea em todos os favoritos, com opções para diferenciar maiúsculas e minúsculas, palavra inteira e expressão regular
• Árvore de pastas com arrastar e soltar, expandir e recolher tudo e criação de novas pastas
• Painel lateral com a mesma árvore, a mesma pesquisa e as pastas correspondentes
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
O Bookmark Scout salva cada página na pasta certa em segundos e depois ajuda você a encontrar seus favoritos sem sair do navegador.

SALVE NA PASTA CERTA EM SEGUNDOS
• Digite parte do nome de qualquer pasta, mesmo uma que esteja bem no fundo da árvore, e salve a página atual nela sem tirar as mãos do teclado
• Digite um caminho como work/react; um pequeno erro de digitação ainda encontra a pasta, e as pastas que você usou recentemente aparecem primeiro
• Uma página que já está nessa pasta não é salva duas vezes
• A IA opcional sugere a melhor pasta para a página, ou um novo caminho de pastas que você revisa antes de ele ser criado
• Salve links em pastas recentes pelo menu de clique com o botão direito

PESQUISE PELA BARRA DE FERRAMENTAS
• Pesquisa instantânea em todos os favoritos, com opções para diferenciar maiúsculas e minúsculas, palavra inteira e expressão regular
• Árvore de pastas com arrastar e soltar, expandir e recolher tudo e criação de novas pastas
• A mesma árvore, a mesma pesquisa e as pastas correspondentes no painel lateral do Firefox, que continua aberto enquanto você navega
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
