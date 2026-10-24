# Brazilian Portuguese Listing Copy (Português (Brasil))

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts count Unicode characters. The full descriptions and What's new were measured on 2026-10-23; the other blocks keep their earlier counts.

| Block | Characters |
| --- | --- |
| Optional manifest description | 131 |
| Firefox Add-ons summary | 248 |
| Full description, Chrome and Edge | 12,493 |
| Full description, Firefox | 6,868 |
| What's new in 0.3.5 | 1,390 |

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

### Firefox Add-ons summary (250 characters maximum, 248 characters on 2026-10-19)

```text
Salve páginas na pasta certa, rápido: digite parte do nome de uma pasta, use ⌥⇧S no Mac (Alt+Shift+S no Windows e no Linux) para salvar na mais adequada ou deixe a IA opcional sugerir uma. Mais: pesquisa instantânea, árvore de pastas e gerenciador.
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

Plain text, 12,493 characters (2026-10-23); the Chrome Web Store allows 16,000. The same Edge condition as in `en.md` applies.

```text
O Bookmark Scout salva cada página na pasta certa em segundos, pela barra de ferramentas ou com um atalho de teclado, e depois ajuda você a encontrar e arrumar seus favoritos sem sair do navegador. Gratuito, sem conta e sem anúncios.

SALVE NA PASTA CERTA EM SEGUNDOS
• Clique no botão do Bookmark Scout, digite parte do nome de qualquer pasta, mesmo uma que esteja bem no fundo da árvore, e salve a página nela sem tirar as mãos do teclado
• Digite um caminho como ai/llms; um pequeno erro de digitação ainda encontra a pasta, e as pastas que você usou recentemente aparecem primeiro
• Uma página que já está nessa pasta não é salva duas vezes
• A IA opcional sugere a melhor pasta para a página, ou uma nova pasta que você revisa antes de ela ser criada
• Menu de clique com o botão direito opcional (vem desativado; ative Menu do botão direito nas Configurações) para salvar um link, ou a página aberta, em uma pasta recente

ATALHOS DE SALVAMENTO RÁPIDO
• Pressione ⌥⇧S no Mac (Alt+Shift+S no Windows e no Linux) em qualquer página para salvá-la sem abrir o Bookmark Scout: por padrão, na pasta que melhor corresponde à página (calculada no seu dispositivo), ou na última pasta que você usou ou em uma que você escolher
• Uma pequena notificação na página mostra onde ela foi salva, com Desfazer e outras pastas para onde você pode movê-la
• Com a IA ativada, ⌥⇧D no Mac (Alt+Shift+D no Windows e no Linux) salva a página na primeira pasta sugerida pela IA
• Altere as teclas na página de atalhos do navegador. Lá você também pode atribuir ⌘D no Mac (Ctrl+D no Windows e no Linux) ao salvamento rápido, para que ele substitua a janela de favoritos do navegador; as Configurações mostram como

ENCONTRE SEUS FAVORITOS
• Pesquise em todos os seus favoritos enquanto digita, direto pela barra de ferramentas: títulos, endereços, pastas, tags e resumos, com operadores como tag:, domain: e folder:
• Árvore de pastas com arrastar e soltar, expandir e recolher tudo e criação de novas pastas
• Painel lateral com a mesma árvore, a mesma pesquisa e as pastas correspondentes
• Pare o ponteiro sobre um favorito para ver o endereço, a pasta, as tags e o resumo
• Exclusão com confirmação (ativada por padrão) e opção de desfazer por 10 segundos

GERENCIADOR DE FAVORITOS
O Bookmark Scout substitui a página de favoritos do navegador por um gerenciador que funciona como o do próprio navegador e ainda tem trilha de navegação, tabela com classificação e pesquisas salvas que sempre mostram resultados atualizados.
• Menus de clique com o botão direito em favoritos, pastas e espaços vazios: editar, renomear, recortar, copiar, colar, abrir em novas guias ou janelas, mostrar na pasta e excluir
• Arraste e solte para mover favoritos para pastas ou reordená-los; links arrastados de outras páginas viram favoritos
• Selecione várias linhas com Cmd+clique e Shift+clique e use os atalhos de teclado do próprio gerenciador do navegador: ⌘A, ⌘C, ⌘X, ⌘V, ⌘⌫, ⌘Z para desfazer e ⇧⌘Z para refazer no Mac (Ctrl+clique, Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Delete, Ctrl+Z e Ctrl+Shift+Z no Windows e no Linux)
• Desfazer e refazer valem para edições, movimentações, classificações e exclusões, incluindo as alterações feitas pelo Perguntar à IA
• Mostre uma pasta ou uma pesquisa como lista ou como cartões com a imagem de capa, as tags e o resumo de cada página, e pré-visualize um favorito sem abri-lo
• Histórico de favoritos: cada alteração nos seus favoritos, com o que cada item era antes, Desfazer e Restaurar para itens excluídos mesmo quando não dá mais para desfazer
• Ajuste nas Configurações os menus, colunas, cartões, painéis laterais e atalhos de teclado do gerenciador e do pop-up

ARRUME ANOS DE FAVORITOS
• Limpador de duplicatas: revise os grupos de duplicatas e escolha qual cópia manter
• Limpador de URLs: veja uma prévia e remova códigos de rastreamento dos endereços da web
• Verificador de links quebrados: encontre links que não funcionam mais e revise as correções (excluir, usar o novo endereço, apontar para uma cópia arquivada ou editá-lo), com opção de desfazer
• Buscador de metadados: sugere títulos de página e aplica só os que você escolher
• Verificador de privacidade: encontra dados particulares nos seus favoritos, como endereços de e-mail e códigos de login em links
• Estatísticas: sites, pastas, profundidade e duplicatas
• Atualizar ícones dos sites: baixa o ícone de cada site diretamente, sem serviço de ícones de terceiros
• Regras inteligentes: adicione tags aos favoritos que correspondem a uma pesquisa e mova-os para uma pasta, depois de revisar, ou conforme novos favoritos chegam, se você ativar
• Indexar texto das páginas: guarde neste dispositivo o texto das páginas que você escolher, para a pesquisa encontrar palavras dentro delas
• Buscar capas: guarde neste dispositivo a imagem de prévia de cada página para a visualização em cartões. Capturar capas ao navegar (desativado por padrão) tira a imagem quando você abre uma página favoritada
• Ferramentas demoradas continuam em segundo plano depois que você fecha o gerenciador, com Pausar e Retomar, e toda revisão permite ajustar muitos itens de uma vez
• Importação de um arquivo de favoritos com prévia, tratamento de duplicatas e opção de desfazer
• Exportação para HTML, JSON, Markdown ou CSV, com revisão de privacidade opcional que pode ocultar dados particulares

O QUE O NAVEGADOR VAI PEDIR E POR QUÊ
Na instalação, o navegador pede uma coisa: "Ler e alterar seus favoritos", para que o Bookmark Scout possa salvá-los, pesquisá-los e organizá-los. Todo o resto é pedido somente quando você usa o recurso que precisa disso, depois de uma breve explicação. Se você disser não, somente esse recurso continua desativado.
• "Ler os ícones dos websites que você visitar": quando você clica em Mostrar ícones do navegador em Atualizar ícones dos sites, ou ativa Usar o cache de ícones do navegador, para mostrar ao lado dos seus favoritos os ícones que o navegador já salvou
• "Ler e alterar seus dados em todos os sites de example.com" (ou "em vários websites"): quando você executa o Verificador de links quebrados, o Buscador de metadados, Atualizar ícones dos sites, Indexar texto das páginas ou Buscar capas, somente para os sites dessa execução. Uma execução com mais de 20 sites, a configuração de IA Ler conteúdo da página e Capturar capas ao navegar pedem "Ler e mudar seus dados em qualquer site"; as imagens que Capturar capas ao navegar tira ficam neste dispositivo. As solicitações são enviadas sem cookies. Depois que todos os sites são permitidos, o Perguntar à IA também pode verificar se os links dos favoritos ainda funcionam
• "Ler seu histórico de navegação": somente para salvar a página atual ou receber sugestões de pasta pelo painel lateral. O botão da barra de ferramentas e o atalho de salvamento rápido não precisam de permissão, e o Bookmark Scout lê somente o título e o endereço da guia aberta
• "Comunicar-se com aplicativos nativos de colaboração": somente quando você ativa Agentes de IA locais (veja Para desenvolvedores, mais abaixo)
O menu de clique com o botão direito também é opcional, mas não tem aviso, então o navegador o adiciona sem perguntar.

PRIVACIDADE
• Sem conta, sem análises de uso, sem rastreamento, sem anúncios
• Seus favoritos ficam no seu navegador; tags, resumos, pesquisas salvas, Regras inteligentes, texto das páginas, capas e o Histórico de favoritos ficam neste dispositivo
• As configurações que você altera, seus prompts personalizados e Sobre mim são sincronizados pela conta do navegador, quando o navegador permite

IA OPCIONAL (DESATIVADA POR PADRÃO)
A IA é opcional, e tudo o que está acima funciona sem ela. Para usá-la, você precisa de uma conta em uma empresa de IA, que pode cobrar um pouco a cada uso, ou de um programa de IA gratuito no seu próprio computador. O Bookmark Scout não tem serviço de IA próprio: ative a IA nas Configurações e adicione o serviço que você escolheu.
• Sugestões de pasta para a página atual, incluindo uma nova pasta que você revisa antes
• No Chrome, sugestões de pasta gratuitas da IA integrada do Chrome, que roda no seu computador sem conta nem chave, se o computador for capaz de executá-la
• Sugestões de tags e resumos curtos que você revisa antes de salvar
• Planos de reorganização de pastas, sempre com prévia antes de qualquer alteração
• Perguntar à IA: converse sobre seus favoritos. Ele pode pesquisá-los por palavras, pasta, tag, site ou data de adição, encontrar duplicatas, sugerir pastas e consultar a página atual
• O Perguntar à IA só faz alterações quando você pede: ele salva páginas e propõe movimentações, renomeações, exclusões e novas pastas em um plano que não altera nada até você aprová-lo. Toda alteração pode ser desfeita
• As respostas podem terminar com botões: uma pergunta de acompanhamento, opções para escolher, salvar a página em uma pasta sugerida ou abrir um favorito. Nada acontece até você clicar
• Escolha o que o Perguntar à IA pode consultar ou alterar (Configurações > IA)
• Ler conteúdo da página (desativado por padrão): envia o texto legível de cada página, não só o título e o endereço, para sugestões melhores
• Tags, resumos e nomes de novas pastas vêm no seu idioma, em um que você escolher ou no idioma de cada página (Configurações > IA)

Quando você usa um recurso de IA, os dados de que ele precisa são enviados diretamente do seu navegador ao serviço de IA escolhido, de acordo com os termos desse serviço: títulos, endereços e nomes de pastas dos favoritos, as datas em que os favoritos foram adicionados, além das tags e resumos salvos; o título e o endereço da página atual; suas mensagens do Perguntar à IA; o texto de Sobre mim que você escrever, se houver; se os links que o Perguntar à IA verifica ainda funcionam; e, somente com Ler conteúdo da página ativado, o texto das páginas envolvidas. Nada é enviado ao Bookmark Scout. Sua chave de API fica no armazenamento local de extensões deste navegador e não é sincronizada. O uso de um serviço de IA pode ser cobrado.

CONFIGURAÇÕES E BACKUP
• Fazer backup das configurações, no final das Configurações, salva as partes que você escolher: suas configurações, as configurações deste computador, pesquisas salvas e visualização da tabela, prompts e Sobre mim, Regras inteligentes, serviços de IA e capas. As chaves de API só entram se você selecioná-las, e aí ficam protegidas por senha
• Restaurar configurações mostra primeiro o que cada parte mudaria, depois mescla ou substitui, e Desfazer importação volta atrás
• Só as configurações que você altera são salvas, então os padrões aprimorados das próximas versões continuam chegando até você

PARA DESENVOLVEDORES
• Operadores de pesquisa: title:, url:, domain:, folder:, tag:, summary:, content: (texto da página), is:, has:, after:, before:, -palavra, OR e parênteses; além de diferenciar maiúsculas e minúsculas, palavra inteira e expressões regulares. O endereço do gerenciador guarda a pesquisa e a pasta, então um link pode abri-lo já pesquisando (?q=react), e Voltar e Avançar restauram as duas
• Os serviços de IA podem ser provedores de IA na nuvem, qualquer endpoint compatível com OpenAI ou um servidor de modelos no seu próprio computador, com ou sem chave de API
• Exportação dos favoritos selecionados como contexto em Markdown ou XML para uma conversa com IA (funciona sem IA e não envia nada)
• O Verificador de privacidade também sinaliza parâmetros de consulta confidenciais, fragmentos de URL e UUIDs
• Agentes de IA locais (desativado por padrão): permita que agentes de IA do seu computador, como o Claude Code, consultem seus favoritos pelo programa de código aberto bookmark-scout-mcp, instalado à parte. Com Permitir alterações também ativado, eles podem salvar e reorganizar favoritos, e cada alteração aguarda sua aprovação em uma janela do Bookmark Scout
• Código aberto sob a licença AGPL-3.0: https://github.com/isandrel/bookmark-scout

ATUALIZAÇÃO DE UMA VERSÃO ANTERIOR
A versão 0.3.3 armazena os dados em um novo formato e não converte os dados antigos: as configurações voltam ao padrão, os serviços de IA e as chaves de API precisam ser adicionados de novo, e os prompts personalizados, as pesquisas salvas, as tags, os resumos e os ícones de sites salvos são apagados. Seus favoritos em si não são alterados.

Feito por um desenvolvedor independente: sem empresa, sem anúncios, sem conta. Disponível em 12 idiomas. Temas claro, escuro e do sistema.

Documentação: https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
O Bookmark Scout salva cada página na pasta certa em segundos, pela barra de ferramentas ou com um atalho de teclado, e depois ajuda você a encontrar e organizar seus favoritos sem sair do navegador. Gratuito, sem conta e sem anúncios.

SALVE NA PASTA CERTA EM SEGUNDOS
• Clique no botão do Bookmark Scout, digite parte do nome de qualquer pasta, mesmo uma que esteja bem no fundo da árvore, e salve a página nela sem tirar as mãos do teclado
• Digite um caminho como ai/llms; um pequeno erro de digitação ainda encontra a pasta, e as pastas que você usou recentemente aparecem primeiro
• Uma página que já está nessa pasta não é salva duas vezes
• A IA opcional sugere a melhor pasta para a página, ou uma nova pasta que você revisa antes de ela ser criada
• Salve links em pastas recentes pelo menu de clique com o botão direito, depois de ativar Menu do botão direito nas Configurações

ATALHOS DE SALVAMENTO RÁPIDO
• Pressione ⌥⇧S no Mac (Alt+Shift+S no Windows e no Linux) em qualquer página para salvá-la sem abrir o Bookmark Scout: por padrão, na pasta que melhor corresponde à página (calculada no seu dispositivo), ou na última pasta que você usou ou em uma que você escolher
• Uma pequena notificação na página mostra onde ela foi salva, com Desfazer e outras pastas para onde você pode movê-la
• Com a IA ativada, ⌥⇧D no Mac (Alt+Shift+D no Windows e no Linux) salva a página na primeira pasta sugerida pela IA
• Altere as teclas em Configurações > Salvar e pesquisar > Atalhos de teclado

ENCONTRE SEUS FAVORITOS
• Pesquise em todos os seus favoritos enquanto digita, direto pela barra de ferramentas: títulos, endereços, pastas, tags e resumos, com operadores como tag:, domain: e folder:
• Árvore de pastas com arrastar e soltar, expandir e recolher tudo e criação de novas pastas
• A mesma árvore, a mesma pesquisa e as pastas correspondentes no painel lateral do Firefox, que continua aberto enquanto você navega
• Exclusão com confirmação (ativada por padrão) e opção de desfazer por 10 segundos

GERENCIADOR DE FAVORITOS
Abrir gerenciador de favoritos, no pop-up da barra de ferramentas ou no painel lateral, abre um gerenciador completo em uma nova aba, com árvore de pastas e tabela com classificação.
• Menus de clique com o botão direito em favoritos, pastas e espaços vazios: editar, renomear, recortar, copiar, colar, abrir, mostrar na pasta e excluir
• Arraste e solte para mover favoritos para pastas ou reordená-los; links arrastados de outras páginas viram favoritos
• Selecione várias linhas com Cmd+clique e Shift+clique, copie, recorte e cole com as teclas de sempre, e desfaça e refaça suas alterações com ⌘Z e ⇧⌘Z no Mac (Ctrl+clique, Ctrl+Z e Ctrl+Shift+Z no Windows e no Linux)

O QUE O FIREFOX VAI PEDIR E POR QUÊ
Na instalação, o Firefox pede uma coisa: ler e modificar os favoritos. Todo o resto é pedido somente quando você usa o recurso que precisa disso, depois de uma breve explicação. Se você disser não, somente esse recurso continua desativado.
• Acesso às guias do navegador: somente para salvar a página atual ou receber sugestões de pasta pelo painel lateral. O botão da barra de ferramentas e o atalho de salvamento rápido não precisam de permissão
• Ativar a IA: o Firefox pede para compartilhar informações de autenticação, favoritos e atividade de navegação (sua chave de API, seus favoritos e pastas, e o título e o endereço da página atual). O pedido dele diz que o desenvolvedor quer coletá-los; aqui, isso significa o serviço de IA que você escolheu, que os recebe diretamente do seu navegador. Nada chega ao Bookmark Scout
• Ler conteúdo da página: acesso aos seus dados de todos os sites e compartilhamento do conteúdo dos sites com seu serviço de IA
• Capturar capas ao navegar (desativado por padrão), que guarda neste dispositivo imagens das páginas favoritadas que você abre: acesso aos seus dados de todos os sites, sem compartilhar nada
• Verificar serviço: acesso ao endereço do seu serviço de IA e compartilhamento das informações de autenticação (sua chave de API) com ele

PRIVACIDADE
• Sem conta, sem análises de uso, sem rastreamento, sem anúncios
• Seus favoritos ficam no seu navegador
• As configurações que você altera, seus prompts personalizados e Sobre mim são sincronizados pelo Firefox Sync, quando ativado

SUGESTÕES DE PASTA COM IA OPCIONAIS (DESATIVADAS POR PADRÃO)
A IA é opcional, e tudo o que está acima funciona sem ela. Para usá-la, você precisa de uma conta em uma empresa de IA, que pode cobrar um pouco a cada uso, ou de um programa de IA gratuito no seu próprio computador. Ative a IA nas Configurações e adicione o serviço que você escolheu. O Bookmark Scout então sugere pastas para a página atual, no pop-up ou com o atalho de salvamento rápido com IA, e pode criar uma nova pasta depois que você revisá-la.

Quando você pede sugestões, o título e o endereço da página atual e os nomes das suas pastas são enviados diretamente do seu navegador ao serviço de IA escolhido, de acordo com os termos desse serviço, e, somente se você ativar Ler conteúdo da página, também o texto da página. Nada é enviado ao Bookmark Scout. Sua chave de API fica no armazenamento local de extensões deste navegador e não é sincronizada. O uso de um serviço de IA pode ser cobrado.

CONFIGURAÇÕES E BACKUP
• Fazer backup das configurações, no final das Configurações, salva as partes que você escolher: suas configurações, as configurações deste computador, pesquisas salvas e visualização da tabela, prompts e Sobre mim, serviços de IA e mais. As chaves de API só entram se você selecioná-las, e aí ficam protegidas por senha
• Restaurar configurações mostra primeiro o que cada parte mudaria, depois mescla ou substitui, e Desfazer importação volta atrás
• Só as configurações que você altera são salvas, então os padrões aprimorados das próximas versões continuam chegando até você

PARA DESENVOLVEDORES
• Operadores de pesquisa: title:, url:, domain:, folder:, tag:, summary:, is:, has:, after:, before:, -palavra, OR e parênteses; além de diferenciar maiúsculas e minúsculas, palavra inteira e expressões regulares
• Os serviços de IA podem ser provedores de IA na nuvem, qualquer endpoint compatível com OpenAI ou um servidor de modelos no seu próprio computador, com ou sem chave de API
• Código aberto sob a licença AGPL-3.0: https://github.com/isandrel/bookmark-scout

ATUALIZAÇÃO DE UMA VERSÃO ANTERIOR
A versão 0.3.3 armazena os dados em um novo formato e não converte os dados antigos: as configurações voltam ao padrão, os serviços de IA e as chaves de API precisam ser adicionados de novo, e os prompts personalizados, as pesquisas salvas, as tags, os resumos e os ícones de sites salvos são apagados. Seus favoritos em si não são alterados.

Feito por um desenvolvedor independente: sem empresa, sem anúncios, sem conta. Disponível em 12 idiomas. Temas claro, escuro e do sistema.
```

## What's new in 0.3.5

Translation of the English release notes; paste into AMO's release notes for 0.3.5.

```text
• Capas e cartões: mostre uma pasta do gerenciador de favoritos como cartões com a imagem de capa, as tags e o resumo de cada página. As capas vêm da imagem de prévia da própria página, de uma imagem da aba que você escolher ou, se você ativar, de imagens tiradas enquanto navega, e ficam neste dispositivo
• Pesquisa dentro das páginas: Indexar texto das páginas guarda neste dispositivo o texto das páginas que você escolher, para a pesquisa encontrar palavras dentro delas
• A mesma pesquisa em todo lugar: títulos, endereços, pastas, tags e resumos, com operadores como tag:, domain:, folder: e OR
• As Regras inteligentes adicionam tags aos favoritos que correspondem a uma pesquisa e os movem para uma pasta, depois de revisar
• O Histórico de favoritos lista cada alteração nos seus favoritos, com Desfazer, e pode trazer de volta itens excluídos
• Ferramentas demoradas continuam em segundo plano depois que você fecha o gerenciador
• Ajuste menus, colunas, atalhos de teclado, o menu do botão direito e mais nas Configurações
• Faça backup das partes das configurações que você escolher e veja o que uma restauração mudaria antes de Mesclar ou Substituir, com Desfazer importação. As chaves de API só entram se você selecioná-las, protegidas por senha
• As configurações Títulos e ícones das páginas agora se chamam Detalhes das páginas
• Novos idiomas: russo, indonésio e italiano
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
