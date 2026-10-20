{# source: 4d963e58c520 #}
{% import "../../_partials/markdown.md.j2" as md %}
{{ md.language_switcher() }}
<p align="center">
  <img src="https://raw.githubusercontent.com/{{ site.repo.slug }}/{{ site.repo.branch }}/apps/extension/public/icon-128.png" alt="Logo de {{ site.name }}" width="96" height="96">
</p>

<h1 align="center">{{ site.name }}</h1>

<h3 align="center">Enregistrez chaque page dans le bon dossier de favoris, en quelques secondes.</h3>

<p align="center">
  Saisissez quelques lettres du nom d'un dossier, ou appuyez sur un seul raccourci, et la page est enregistrée là où elle doit aller.<br>
  Gratuit, sans compte et sans publicité. Rien n'est envoyé au développeur.
</p>

<p align="center">
{{ md.store_badges("Ajouter à {browser}") }}
</p>

<p align="center">
  <a href="{{ site.url }}"><img src="https://img.shields.io/badge/site%20Web-visiter-{{ site.brand_color }}?style=flat-square" alt="Site Web"></a>
  <a href="{{ docs_url }}"><img src="https://img.shields.io/badge/guides-lire-{{ site.brand_color }}?style=flat-square" alt="Guides"></a>
  <a href="{{ site.license.file_url }}"><img src="https://img.shields.io/badge/open%20source-{{ md.badge_text(site.license.spdx) }}-blue?style=flat-square" alt="Licence open source"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="{{ screenshots.popup.dark }}">
    <img src="{{ screenshots.popup.light }}" alt="La fenêtre pop-up de {{ site.name }} : la saisie de « fin » trouve le dossier Fine-tuning dans AI / LLMs, prêt à y enregistrer la page avec Entrée. À côté, des suggestions facultatives de l'IA pour un article sur la mise en cache des prompts, dont un nouveau dossier." width="800">
  </picture>
</p>

## ✨ Fonctionnalités

- 📁 **Enregistrez dans le bon dossier en saisissant son nom.** Saisissez quelques lettres, même pour un dossier rangé loin à l'intérieur d'autres dossiers, puis appuyez sur Entrée. Les petites fautes de frappe sont tolérées.
- ⚡ **Enregistrez avec un seul raccourci.** Appuyez sur {{ shortcuts["commands.quick-save"].both }} sur n'importe quelle page. Un petit message indique où la page a été enregistrée, avec **Annuler** et d'autres dossiers vers lesquels la déplacer.
- 🔎 **Retrouvez tout ce que vous avez enregistré.** Recherchez dans tous vos favoris pendant la saisie, depuis la barre d'outils, le panneau latéral ou un gestionnaire de favoris en pleine page.
- 🧹 **Faites le tri dans des années de favoris.** Supprimez les doublons, trouvez les liens qui ne fonctionnent plus et retirez les codes de suivi des adresses Web. Vous voyez chaque modification avant qu'elle ait lieu, et vous pouvez l'annuler.
- ✨ **Des suggestions de l'IA, si vous le souhaitez.** Laissez l'IA choisir le dossier à votre place, avec votre propre compte d'IA ou un modèle d'IA gratuit sur votre ordinateur, comme celui intégré à Chrome. L'IA reste désactivée tant que vous ne l'activez pas.
- 🔒 **Conçu pour protéger votre vie privée.** Aucun compte, aucune publicité, aucun suivi, et rien n'est envoyé au développeur. L'enregistrement et la recherche fonctionnent même hors connexion.

🌍 Disponible en {{ locales|map(attribute="name")|join(" · ") }}.

## 📦 Installation

{{ md.store_links("bientôt disponible sur {store}. En attendant, vous pouvez [l'installer manuellement]({docs}/installation#{id}) (avancé).") }}

Enregistrez ensuite votre première page :

1. **Épinglez l'extension.** Cliquez sur l'icône en forme de pièce de puzzle dans la barre d'outils de votre navigateur, puis sur l'épingle à côté de {{ site.name }}.
2. **Ouvrez une page que vous voulez garder** et cliquez sur l'icône de {{ site.name }}.
3. **Saisissez quelques lettres du nom d'un dossier** et appuyez sur Entrée : la page est enregistrée dans le premier dossier de la liste. Pour en choisir un autre, appuyez d'abord sur ↓. C'est tout.

La prochaine fois, appuyez simplement sur {{ shortcuts["commands.quick-save"].both }} sur la page. Le [guide pour enregistrer et organiser]({{ docs_url }}/guides/save-and-organize) vous en dit plus.

## 🔒 Confidentialité

{{ site.name }} n'a ni compte ni serveur : le développeur ne reçoit donc jamais vos favoris, vos paramètres ni quoi que ce soit d'autre. Vos favoris sont lus et modifiés au sein de votre navigateur. Les données n'en sortent que lorsque vous utilisez une fonctionnalité qui en a besoin, par exemple l'IA (elles sont envoyées à l'entreprise d'IA que vous avez choisie) ou la vérification des liens morts (elle consulte les sites Web enregistrés en favoris). Lisez la [politique de confidentialité]({{ pages.privacy }}) pour en savoir plus.

## 🔐 Autorisations

Ce que votre navigateur va vous demander :

- **À l'installation :** *« Accéder à vos favoris et les modifier ».* C'est tout ce dont {{ site.name }} a besoin pour commencer.
- **Uniquement lorsque vous utilisez une fonctionnalité qui en demande plus**, après une courte explication de {{ site.name }}. Par exemple, la vérification des liens morts demande l'accès aux sites Web concernés, et l'enregistrement depuis le panneau latéral demande à voir quel onglet est ouvert. Si vous refusez, seule cette fonctionnalité reste désactivée.

Consultez [chaque autorisation et la raison pour laquelle elle est nécessaire]({{ docs_url }}/permissions).

## ❓ Questions

**Est-ce vraiment gratuit ?**<br>
Oui. Pas de publicité, pas d'offre payante, et le code est ouvert : tout le monde peut le lire. Si vous activez l'IA avec un compte auprès d'une entreprise d'IA, celle-ci peut vous facturer son utilisation.

**Ai-je besoin de l'IA ?**<br>
Non. L'enregistrement, la recherche et le nettoyage fonctionnent tous sans elle.

**Fonctionne-t-il dans Firefox, Edge ou Safari ?**<br>
Firefox et Edge : oui (consultez [Installation](#-installation)). Safari : non, car Safari ne permet pas aux extensions d'accéder aux favoris.

Vous trouverez d'autres réponses dans la [FAQ]({{ docs_url }}/faq).

## 💬 Aide et liens

- 🌐 Site Web : [{{ site.url }}]({{ site.url }})
- 📖 Guides : [{{ docs_url }}]({{ docs_url }})
- ✉️ E-mail : [{{ contact.support }}](mailto:{{ contact.support }})
- 🐞 Vous avez trouvé un problème ou vous avez une idée ? [Dites-le-nous sur GitHub]({{ site.repo.new_issue }})

{{ site.name }} est créé par un développeur indépendant, [@{{ site.author.name }}]({{ site.author.url }}), et non par une entreprise : sans publicité, sans compte et open source.

## 🛠️ Pour les développeurs et les agents d'IA

La compilation à partir des sources, les technologies utilisées, l'état du projet et les tests sont décrits dans [DEVELOPMENT.md]({{ links.DEVELOPMENT }}) (en anglais). Pour contribuer, lisez [CONTRIBUTING.md]({{ links.CONTRIBUTING }}). Les agents de programmation IA de votre ordinateur, comme Claude Code, peuvent rechercher et organiser vos favoris avec votre accord : consultez [Utiliser avec des agents d'IA locaux]({{ docs_url }}/guides/local-agents).

---

<p align="center">
  Gratuit et open source sous <a href="{{ root }}LICENSE">licence {{ site.license.spdx }}</a>.
</p>
