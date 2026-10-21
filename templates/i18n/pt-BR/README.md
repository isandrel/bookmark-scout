{# source: 755c10623769 #}
{% import "../../_partials/markdown.md.j2" as md %}
{{ md.language_switcher() }}
<p align="center">
  <img src="https://raw.githubusercontent.com/{{ site.repo.slug }}/{{ site.repo.branch }}/apps/extension/public/icon-128.png" alt="Logotipo do {{ site.name }}" width="96" height="96">
</p>

<h1 align="center">{{ site.name }}</h1>

<h3 align="center">Salve cada página na pasta de favoritos certa, em segundos.</h3>

<p align="center">
  Digite algumas letras do nome de uma pasta, ou pressione um atalho, e a página vai para onde deve ficar.<br>
  Gratuito, sem conta e sem anúncios. Nada é enviado ao desenvolvedor.
</p>

<p align="center">
{{ md.store_badges("Adicionar ao {browser}") }}
</p>

<p align="center">
  <a href="{{ site.url }}"><img src="https://img.shields.io/badge/site-visitar-{{ site.brand_color }}?style=flat-square" alt="Site"></a>
  <a href="{{ docs_url }}"><img src="https://img.shields.io/badge/guias-ler-{{ site.brand_color }}?style=flat-square" alt="Guias"></a>
  <a href="{{ site.license.file_url }}"><img src="https://img.shields.io/badge/código%20aberto-{{ md.badge_text(site.license.spdx) }}-blue?style=flat-square" alt="Licença de código aberto"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="{{ screenshots.popup.dark }}">
    <img src="{{ screenshots.popup.light }}" alt="O pop-up do {{ site.name }}: ao digitar &quot;fin&quot;, aparece a pasta Fine-tuning dentro de AI / LLMs, pronta para receber a página com Enter. Ao lado, sugestões opcionais da IA para um artigo sobre cache de prompts, incluindo uma nova pasta." width="800">
  </picture>
</p>

## ✨ O que ele faz

- 📁 **Salve na pasta certa digitando o nome dela.** Digite algumas letras, mesmo de uma pasta guardada bem no fundo de outras, e pressione Enter. Pequenos erros de digitação ainda encontram a pasta.
- ⚡ **Salve com um só atalho.** Pressione {{ shortcuts["commands.quick-save"].both }} em qualquer página. Uma pequena mensagem mostra onde a página foi salva, com **Desfazer** e outras pastas para onde você pode movê-la.
- 🔎 **Encontre tudo o que você salvou.** Pesquise em todos os seus favoritos enquanto digita, pela barra de ferramentas, pelo painel lateral ou por um gerenciador de favoritos em página inteira.
- 🧹 **Arrume anos de favoritos.** Remova duplicatas, encontre links que não funcionam mais e tire os códigos de rastreamento dos endereços da web. Você vê cada alteração antes que ela aconteça e pode desfazê-la.
- 🕘 **Veja cada alteração e recupere o que excluiu.** O histórico lista cada alteração nos seus favoritos, até as feitas fora do Bookmark Scout, e traz de volta o que foi excluído, mesmo depois de reiniciar o navegador. Ele fica no seu computador.
- ✨ **Sugestões opcionais da IA.** Deixe a IA escolher a pasta para você, usando sua própria conta de IA ou um modelo de IA gratuito no seu computador, como o que vem integrado ao Chrome. A IA fica desativada até você ativá-la.
- 🔒 **Privacidade desde o início.** Sem conta, sem anúncios, sem rastreamento, e nada vai para o desenvolvedor. Salvar e pesquisar funcionam até sem internet.

🌍 Disponível em {{ locales|map(attribute="name")|join(" · ") }}.

## 📦 Instalação

{{ md.store_links("em breve na loja {store}. Até lá, você pode [instalar manualmente]({docs}/installation#{id}) (avançado).") }}

Depois, salve sua primeira página:

1. **Fixe o ícone.** Clique no ícone de quebra-cabeça na barra de ferramentas do navegador e depois no alfinete ao lado do {{ site.name }}.
2. **Abra uma página que você quer guardar** e clique no ícone do {{ site.name }}.
3. **Digite algumas letras do nome de uma pasta** e pressione Enter: a página é salva na primeira pasta da lista. Para escolher outra, pressione ↓ antes. Pronto.

Da próxima vez, é só pressionar {{ shortcuts["commands.quick-save"].both }} na página. O guia [Salvar e organizar]({{ docs_url }}/guides/save-and-organize) mostra mais.

## 🔒 Sua privacidade

O {{ site.name }} não tem conta nem servidor, então o desenvolvedor nunca recebe seus favoritos, suas configurações nem qualquer outra coisa. Seus favoritos são lidos e alterados dentro do seu navegador. Os dados só saem dele quando você usa um recurso que precisa disso, por exemplo a IA (eles vão para a empresa de IA que você escolheu) ou a verificação de links quebrados (ela acessa os sites salvos nos favoritos). Leia a [política de privacidade]({{ pages.privacy }}) para ver os detalhes.

## 🔐 Permissões

O que o navegador vai pedir:

- **Na instalação:** *“Ler e alterar seus favoritos”*. É a única coisa de que o {{ site.name }} precisa para começar.
- **Só quando você usa um recurso que precisa de mais**, depois de uma breve explicação do {{ site.name }}. Por exemplo, a verificação de links quebrados pede para acessar esses sites, e salvar pelo painel lateral pede para ver qual guia está aberta. Se você disser não, só esse recurso fica desativado.

Veja [cada permissão e por que ela é necessária]({{ docs_url }}/permissions).

## ❓ Perguntas

**É gratuito mesmo?**<br>
Sim. Sem anúncios, sem plano pago, e o código é aberto para qualquer pessoa ler. Se você ativar a IA com a conta de uma empresa de IA, essa empresa pode cobrar pelo uso.

**Preciso de IA?**<br>
Não. Salvar, pesquisar e limpar funcionam sem ela.

**Funciona no Firefox, no Edge ou no Safari?**<br>
Firefox e Edge: sim (veja [Instalação](#-instalação)). Safari: não, porque o Safari não permite que extensões trabalhem com favoritos.

Há mais respostas nas [Perguntas frequentes]({{ docs_url }}/faq).

## 💬 Ajuda e links

- 🌐 Site: [{{ site.url }}]({{ site.url }})
- 📖 Guias: [{{ docs_url }}]({{ docs_url }})
- ✉️ E-mail: [{{ contact.support }}](mailto:{{ contact.support }})
- 🐞 Encontrou um problema ou tem uma ideia? [Conte para nós no GitHub]({{ site.repo.new_issue }})

O {{ site.name }} é feito por um desenvolvedor independente, [@{{ site.author.name }}]({{ site.author.url }}), e não por uma empresa: sem anúncios, sem conta e de código aberto.

## 🛠️ Para desenvolvedores e agentes de IA

Como compilar a partir do código-fonte, as tecnologias usadas, o status do projeto e os testes estão no [DEVELOPMENT.md]({{ links.DEVELOPMENT }}) (em inglês). Para ajudar, leia o [CONTRIBUTING.md]({{ links.CONTRIBUTING }}). Agentes de programação com IA no seu computador, como o Claude Code, podem pesquisar e organizar seus favoritos com a sua aprovação: veja [Usar com agentes de IA locais]({{ docs_url }}/guides/local-agents).

---

<p align="center">
  Gratuito e de código aberto sob a <a href="{{ root }}LICENSE">licença {{ site.license.spdx }}</a>.
</p>
