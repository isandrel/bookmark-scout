# Brazilian Portuguese Listing Copy (Português (Brasil))

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts count Unicode characters and were measured on 2026-10-12.

| Block | Characters |
| --- | --- |
| Optional manifest description | 131 |
| Firefox Add-ons summary | 250 |
| Full description, Chrome and Edge | 8,475 |
| Full description, Firefox | 4,491 |
| What's new in 0.3.3 | 1,125 |

## Name

```text
Bookmark Scout
```

Read from `extName` in `apps/extension/public/_locales/pt_BR/messages.json`.

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

Packaged as `extDescription`; changing it needs a new version. Ships with 0.3.3 (131 characters):

```text
Salve páginas na pasta certa, rápido: digite parte do nome de uma pasta ou deixe a IA sugerir. E ferramentas de pesquisa e limpeza.
```

### Firefox Add-ons summary (250 characters maximum, 250 characters)

```text
Salve páginas na pasta de favoritos certa, rápido: digite parte do nome de uma pasta, use Alt+Shift+S para salvar na mais adequada ou deixe a IA opcional sugerir uma. E mais: pesquisa instantânea, árvore de pastas e gerenciador de favoritos completo.
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
O Bookmark Scout salva cada página na pasta certa em segundos, pela barra de ferramentas ou com um atalho de teclado, e depois ajuda você a encontrar e organizar seus favoritos sem sair do navegador.

SALVE NA PASTA CERTA EM SEGUNDOS
• Digite parte do nome de qualquer pasta, mesmo uma que esteja bem no fundo da árvore, e salve a página atual nela sem tirar as mãos do teclado
• Digite um caminho como work/react; um pequeno erro de digitação ainda encontra a pasta, e as pastas que você usou recentemente aparecem primeiro
• Uma página que já está nessa pasta não é salva duas vezes
• A IA opcional sugere a melhor pasta para a página, ou um novo caminho de pastas que você revisa antes de ele ser criado
• Menu de clique com o botão direito opcional (ative Menu de contexto nas Configurações) para salvar links em pastas recentes

ATALHOS DE SALVAMENTO RÁPIDO
• Pressione Alt+Shift+S em qualquer página para salvá-la sem abrir o Bookmark Scout: por padrão, na pasta que melhor corresponde à página (calculada no seu dispositivo), ou na última pasta que você usou ou em uma que você escolher
• Uma pequena notificação na página mostra onde ela foi salva, com Desfazer e outras pastas para onde você pode movê-la
• Com a IA ativada, Alt+Shift+D salva a página na primeira pasta sugerida pela IA
• Altere as teclas na página de atalhos do navegador. Lá você também pode atribuir Ctrl+D (⌘D no Mac) ao salvamento rápido, para que ele substitua a janela de favoritos do navegador; as Configurações mostram como

PESQUISE PELA BARRA DE FERRAMENTAS
• Pesquisa instantânea em todos os favoritos, com opções para diferenciar maiúsculas e minúsculas, palavra inteira e expressão regular
• Árvore de pastas com arrastar e soltar, expandir e recolher tudo e criação de novas pastas
• Painel lateral com a mesma árvore, a mesma pesquisa e as pastas correspondentes
• Exclusão com caixa de confirmação (ativada por padrão) e opção de desfazer por 10 segundos

GERENCIADOR DE FAVORITOS
O Bookmark Scout substitui a página de favoritos do navegador por um gerenciador que funciona como o do próprio navegador e ainda tem trilha de navegação, tabela com classificação e filtros, colunas redimensionáveis e pesquisas salvas (visualizações inteligentes que guardam só os filtros e sempre mostram resultados atualizados).
• Menus de clique com o botão direito em favoritos, pastas e espaços vazios: editar, renomear, recortar, copiar, colar, abrir em novas guias ou janelas, mostrar na pasta e excluir
• Arraste e solte para mover favoritos para pastas ou reordená-los; links arrastados de outras páginas viram favoritos
• Selecione várias linhas com Ctrl+clique e Shift+clique e use os atalhos de teclado do próprio gerenciador do navegador (Cmd no Mac): Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Delete, Ctrl+Z para desfazer e Ctrl+Y para refazer
• Desfazer e refazer valem para edições, movimentações, classificações e exclusões, incluindo as alterações feitas pelo Perguntar à IA
• O endereço guarda a pesquisa e a pasta, então um link pode abrir o gerenciador já pesquisando (?q=react) ou em uma pasta, e Voltar e Avançar restauram as duas
• Escolha quais comandos os menus de clique com o botão direito e ⋯ mostram, e em que ordem (Configurações > Comportamento)

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

O Verificador de links quebrados, o Buscador de metadados, Atualizar ícones dos sites e a configuração de IA Ler conteúdo da página pedem acesso opcional aos sites na primeira vez que você os usa; depois que esse acesso é permitido, o Perguntar à IA também pode verificar se os links dos favoritos ainda funcionam. Esse acesso nunca é concedido na instalação, as solicitações são enviadas sem cookies e, se você recusar, o recurso simplesmente fica desativado.

CONFIGURAÇÕES E BACKUP
• Exportar, no final das Configurações, salva um backup: as configurações que você alterou, prompts personalizados, serviços de IA (nunca as chaves de API deles), pesquisas salvas e as colunas do gerenciador. Importar restaura esse backup
• Só as configurações que você altera são salvas, então os padrões aprimorados das próximas versões continuam chegando até você

FERRAMENTAS DE IA OPCIONAIS (DESATIVADAS POR PADRÃO)
Ative a IA nas Configurações e escolha um provedor de IA na nuvem, qualquer endpoint compatível com OpenAI ou um servidor de modelos no seu próprio computador, com sua própria chave de API quando o provedor exigir uma.
• Sugestões de pasta para a página atual, incluindo a criação revisada de um novo caminho de pastas
• Sugestões de tags e resumos curtos que você revisa antes de salvar
• Planos de reorganização de pastas, sempre com prévia antes de qualquer alteração
• Exportação dos favoritos selecionados como contexto em Markdown ou XML para uma conversa com IA (funciona sem IA e não envia nada)
• Perguntar à IA: converse sobre seus favoritos. A IA pode pesquisá-los por palavras, pasta, tag, site ou data de adição, encontrar duplicatas, sugerir pastas e consultar a página atual
• O Perguntar à IA só faz alterações quando você pede: ele salva páginas e propõe movimentações, renomeações, exclusões e novas pastas em um plano que não altera nada até você aprová-lo. Toda alteração pode ser desfeita
• As respostas podem terminar com botões: uma pergunta de acompanhamento, opções para escolher, salvar a página em uma pasta sugerida ou abrir um favorito. Nada acontece até você clicar
• Escolha o que o Perguntar à IA pode consultar ou alterar (Configurações > IA)
• Ler conteúdo da página (desativado por padrão): envia o texto legível de cada página, não só o título e o URL, para sugestões melhores
• Agentes de IA locais (desativado por padrão): permita que agentes de IA do seu computador, como o Claude Code, consultem seus favoritos pelo programa de código aberto bookmark-scout-mcp, instalado à parte. Com Permitir alterações também ativado, eles podem salvar e reorganizar favoritos, e cada alteração aguarda sua aprovação em uma janela do Bookmark Scout

Quando você usa um recurso de IA, os dados de que ele precisa são enviados diretamente do seu navegador ao provedor escolhido, de acordo com os termos desse provedor: títulos, URLs e nomes de pastas dos favoritos, as datas em que os favoritos foram adicionados, além das tags e resumos salvos; o título e o URL da página atual; suas mensagens do Perguntar à IA; se os links que o Perguntar à IA verifica ainda funcionam; e, somente com Ler conteúdo da página ativado, o texto das páginas envolvidas. Nada é enviado ao Bookmark Scout. Sua chave de API fica no armazenamento local de extensões deste navegador e não é sincronizada. O uso do provedor pode ser cobrado.

PRIVACIDADE
• Sem conta, sem análises de uso, sem rastreamento, sem anúncios
• Os favoritos ficam no seu navegador; tags, resumos e pesquisas salvas ficam no armazenamento local de extensões
• As configurações que você altera e seus prompts personalizados são sincronizados pela conta do navegador, quando o navegador permite
• Código aberto sob a licença AGPL-3.0: https://github.com/isandrel/bookmark-scout

ATUALIZAÇÃO DE UMA VERSÃO ANTERIOR
A versão 0.3.3 armazena os dados em um novo formato e não converte os dados antigos: as configurações voltam ao padrão, os serviços de IA e as chaves de API precisam ser adicionados de novo, e os prompts personalizados, as pesquisas salvas, as tags, os resumos e os ícones de sites salvos são apagados. Seus favoritos em si não são alterados.

Disponível em 9 idiomas. Temas claro, escuro e do sistema.

Documentação: https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
O Bookmark Scout salva cada página na pasta certa em segundos, pela barra de ferramentas ou com um atalho de teclado, e depois ajuda você a encontrar e organizar seus favoritos sem sair do navegador.

SALVE NA PASTA CERTA EM SEGUNDOS
• Digite parte do nome de qualquer pasta, mesmo uma que esteja bem no fundo da árvore, e salve a página atual nela sem tirar as mãos do teclado
• Digite um caminho como work/react; um pequeno erro de digitação ainda encontra a pasta, e as pastas que você usou recentemente aparecem primeiro
• Uma página que já está nessa pasta não é salva duas vezes
• A IA opcional sugere a melhor pasta para a página, ou um novo caminho de pastas que você revisa antes de ele ser criado
• Salve links em pastas recentes pelo menu de clique com o botão direito

ATALHOS DE SALVAMENTO RÁPIDO
• Pressione Alt+Shift+S em qualquer página para salvá-la sem abrir o Bookmark Scout: por padrão, na pasta que melhor corresponde à página (calculada no seu dispositivo), ou na última pasta que você usou ou em uma que você escolher
• Uma pequena notificação na página mostra onde ela foi salva, com Desfazer e outras pastas para onde você pode movê-la
• Com a IA ativada, Alt+Shift+D salva a página na primeira pasta sugerida pela IA
• Altere as teclas em Configurações > Salvar e pesquisar > Atalhos de teclado

PESQUISE PELA BARRA DE FERRAMENTAS
• Pesquisa instantânea em todos os favoritos, com opções para diferenciar maiúsculas e minúsculas, palavra inteira e expressão regular
• Árvore de pastas com arrastar e soltar, expandir e recolher tudo e criação de novas pastas
• A mesma árvore, a mesma pesquisa e as pastas correspondentes no painel lateral do Firefox, que continua aberto enquanto você navega
• Exclusão com caixa de confirmação (ativada por padrão) e opção de desfazer por 10 segundos

GERENCIADOR DE FAVORITOS
Abrir gerenciador de favoritos, no pop-up da barra de ferramentas ou no painel lateral, abre um gerenciador completo em uma nova aba, com árvore de pastas e tabela com classificação e filtros.
• Menus de clique com o botão direito em favoritos, pastas e espaços vazios: editar, renomear, recortar, copiar, colar, abrir, mostrar na pasta e excluir
• Arraste e solte para mover favoritos para pastas ou reordená-los; links arrastados de outras páginas viram favoritos
• Selecione várias linhas com Ctrl+clique e Shift+clique (Cmd no Mac), copie, recorte e cole com as teclas de sempre, e desfaça e refaça suas alterações com Ctrl+Z e Ctrl+Y

CONFIGURAÇÕES E BACKUP
• Exportar, no final das Configurações, salva um backup: as configurações que você alterou, prompts personalizados, serviços de IA (nunca as chaves de API deles) e pesquisas salvas. Importar restaura esse backup
• Só as configurações que você altera são salvas, então os padrões aprimorados das próximas versões continuam chegando até você

SUGESTÕES DE PASTA COM IA OPCIONAIS (DESATIVADAS POR PADRÃO)
Ative a IA nas Configurações e escolha um provedor de IA na nuvem, qualquer endpoint compatível com OpenAI ou um servidor de modelos no seu próprio computador, com sua própria chave de API quando o provedor exigir uma. O Bookmark Scout então sugere pastas para a página atual, no pop-up ou com o atalho de salvamento rápido com IA, e pode criar um novo caminho de pastas depois que você revisá-lo.

Quando você pede sugestões, o título e o URL da página atual e os nomes das suas pastas são enviados diretamente do seu navegador ao provedor escolhido, de acordo com os termos desse provedor, e, somente se você ativar Ler conteúdo da página, também o texto da página. Nada é enviado ao Bookmark Scout. Sua chave de API fica no armazenamento local de extensões deste navegador e não é sincronizada. O uso do provedor pode ser cobrado.

PRIVACIDADE
• Sem conta, sem análises de uso, sem rastreamento, sem anúncios
• Os favoritos ficam no seu navegador
• As configurações que você altera e seus prompts personalizados são sincronizados pelo Firefox Sync, quando ativado
• Código aberto sob a licença AGPL-3.0: https://github.com/isandrel/bookmark-scout

ATUALIZAÇÃO DE UMA VERSÃO ANTERIOR
A versão 0.3.3 armazena os dados em um novo formato e não converte os dados antigos: as configurações voltam ao padrão, os serviços de IA e as chaves de API precisam ser adicionados de novo, e os prompts personalizados, as pesquisas salvas, as tags, os resumos e os ícones de sites salvos são apagados. Seus favoritos em si não são alterados.

Disponível em 9 idiomas. Temas claro, escuro e do sistema.
```

## What's new in 0.3.3

Translation of the English release notes; paste into AMO's release notes for 0.3.3.

```text
• Salvamento rápido: pressione Alt+Shift+S em qualquer página para salvá-la na pasta que melhor corresponde a ela. Uma notificação na página mostra onde ela foi salva, com Desfazer e outras pastas para onde você pode movê-la. Com a IA ativada, Alt+Shift+D salva na primeira sugestão da IA
• Gerenciador de favoritos: menus de clique com o botão direito, arrastar e soltar, recortar, copiar e colar, seleção de várias linhas, e desfazer e refazer
• O Perguntar à IA pode salvar páginas e propor movimentações, renomeações, exclusões e novas pastas que não alteram nada até você aprová-las, e toda alteração pode ser desfeita. As respostas podem terminar com botões em que você clica
• Escolha quais comandos os menus do gerenciador mostram e o que o Perguntar à IA pode fazer
• Exportar, nas Configurações, agora salva um backup que você pode importar
• Esta atualização redefine os dados salvos do Bookmark Scout: as configurações voltam ao padrão, e os serviços de IA e as chaves de API, os prompts personalizados, as pesquisas salvas, as tags e os resumos precisam ser configurados de novo. Seus favoritos não são alterados
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
