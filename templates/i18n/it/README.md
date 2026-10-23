{# source: e22425e92aee #}
{% import "../../_partials/markdown.md.j2" as md %}
{{ md.language_switcher() }}
<p align="center">
  <img src="https://raw.githubusercontent.com/{{ site.repo.slug }}/{{ site.repo.branch }}/apps/extension/public/icon-128.png" alt="Logo di {{ site.name }}" width="96" height="96">
</p>

<h1 align="center">{{ site.name }}</h1>

<h3 align="center">Salva ogni pagina nella cartella dei preferiti giusta, in pochi secondi.</h3>

<p align="center">
  Digita qualche lettera del nome di una cartella, oppure premi una sola scorciatoia, e la pagina finisce dove deve stare.<br>
  Gratuito, senza account e senza pubblicità. Non viene inviato nulla allo sviluppatore.
</p>

<p align="center">
{{ md.store_badges("Aggiungi a {browser}") }}
</p>

<p align="center">
  <a href="{{ site.url }}"><img src="https://img.shields.io/badge/sito%20web-visita-{{ site.brand_color }}?style=flat-square" alt="Sito web"></a>
  <a href="{{ docs_url }}"><img src="https://img.shields.io/badge/guide-leggi-{{ site.brand_color }}?style=flat-square" alt="Guide"></a>
  <a href="{{ site.license.file_url }}"><img src="https://img.shields.io/badge/open%20source-{{ md.badge_text(site.license.spdx) }}-blue?style=flat-square" alt="Licenza open source"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="{{ screenshots.popup.dark }}">
    <img src="{{ screenshots.popup.light }}" alt="Il popup di {{ site.name }}: digitando &quot;fin&quot; trova la cartella Fine-tuning dentro AI / LLMs, pronta per salvarvi la pagina con Invio. Accanto, i suggerimenti facoltativi dell'IA per un articolo sul prompt caching, tra cui una nuova cartella." width="800">
  </picture>
</p>

## ✨ Cosa fa

- 📁 **Salva nella cartella giusta digitandone il nome.** Digita qualche lettera, anche di una cartella annidata in profondità dentro altre, e premi Invio. Anche i piccoli errori di battitura vanno bene.
- ⚡ **Salva con una sola scorciatoia.** Premi {{ shortcuts["commands.quick-save"].both }} su qualsiasi pagina. Un piccolo messaggio indica dove è finita la pagina, con **Annulla** e altre cartelle in cui spostarla.
- 🔎 **Trova tutto ciò che hai salvato.** Cerca tra tutti i preferiti mentre digiti, dalla barra degli strumenti, dal riquadro laterale o da una gestione preferiti a pagina intera, che può anche mostrare i preferiti come riquadri con un'immagine di ogni pagina. Se lo attivi, la ricerca trova anche le parole all'interno delle pagine che hai salvato.
- 🧹 **Metti ordine in anni di preferiti.** Rimuovi i duplicati, trova i link che non funzionano più, elimina i codici di tracciamento dagli indirizzi web e crea regole tue che aggiungono tag e spostano i preferiti nelle cartelle. Per pulizie e regole vedi ogni modifica prima che avvenga e puoi annullarla.
- 🕘 **Vedi ogni modifica e recupera i preferiti eliminati.** La Cronologia elenca ogni modifica ai tuoi preferiti, anche quelle fatte fuori da Bookmark Scout, e recupera ciò che è stato eliminato, anche dopo il riavvio del browser. Resta sul tuo computer.
- ✨ **Suggerimenti dell'IA facoltativi.** Lascia che sia l'IA a scegliere la cartella, con il tuo account di IA o con un modello di IA gratuito sul tuo computer, come quello integrato in Chrome. L'IA resta disattivata finché non la attivi.
- 🔒 **Privacy fin dalla progettazione.** Nessun account, nessuna pubblicità, nessun tracciamento, e non arriva nulla allo sviluppatore. Il salvataggio e la ricerca funzionano anche offline.

🌍 Disponibile in {{ locales|map(attribute="name")|join(" · ") }}.

## 📦 Installazione

{{ md.store_links("in arrivo su {store}. Nel frattempo puoi [installarlo a mano]({docs}/installation#{id}) (procedura avanzata).") }}

Poi salva la tua prima pagina:

1. **Fissalo.** Fai clic sull'icona a forma di pezzo di puzzle nella barra degli strumenti del browser, poi sulla puntina accanto a {{ site.name }}.
2. **Apri una pagina che vuoi conservare** e fai clic sull'icona di {{ site.name }}.
3. **Digita qualche lettera del nome di una cartella** e premi Invio: la pagina viene salvata nella prima cartella dell'elenco. Per sceglierne un'altra, premi prima ↓. Tutto qui.

La prossima volta, premi semplicemente {{ shortcuts["commands.quick-save"].both }} sulla pagina. La [guida per salvare e organizzare]({{ docs_url }}/guides/save-and-organize) spiega di più.

## 🔒 La tua privacy

{{ site.name }} non ha account né server, quindi lo sviluppatore non riceve mai i tuoi preferiti, le tue impostazioni o qualsiasi altra cosa. I preferiti vengono letti e modificati all'interno del browser. I dati ne escono solo quando usi una funzione che ne ha bisogno, ad esempio l'IA (vanno all'azienda di IA che hai scelto) o il controllo dei link non funzionanti (visita i siti web salvati nei preferiti). Leggi l'[informativa sulla privacy]({{ pages.privacy }}) per i dettagli.

## 🔐 Autorizzazioni

Cosa ti chiederà il browser:

- **All'installazione:** *"Leggere e modificare i preferiti".* È l'unica cosa di cui {{ site.name }} ha bisogno per iniziare.
- **Solo quando usi una funzione che richiede di più**, dopo una breve spiegazione di {{ site.name }}. Ad esempio, il controllo dei link non funzionanti chiede di visitare quei siti web, e il salvataggio dal riquadro laterale chiede di vedere quale scheda è aperta. Se rifiuti, resta disattivata solo quella funzione.

Consulta [ogni autorizzazione e il motivo per cui serve]({{ docs_url }}/permissions).

## ❓ Domande

**È davvero gratuito?**<br>
Sì. Niente pubblicità, niente piani a pagamento, e il codice è aperto e chiunque può leggerlo. Se attivi l'IA con un account presso un'azienda di IA, quell'azienda può farti pagare l'utilizzo.

**Mi serve l'IA?**<br>
No. Salvataggio, ricerca e pulizia funzionano tutti senza.

**Funziona in Firefox, Edge o Safari?**<br>
Firefox ed Edge: sì (vedi [Installazione](#-installazione)). Safari: no, perché Safari non consente alle estensioni di lavorare con i preferiti.

Altre risposte sono nelle [domande frequenti]({{ docs_url }}/faq).

## 💬 Assistenza e link

- 🌐 Sito web: [{{ site.url }}]({{ site.url }})
- 📖 Guide: [{{ docs_url }}]({{ docs_url }})
- ✉️ Email: [{{ contact.support }}](mailto:{{ contact.support }})
- 🐞 Hai trovato un problema o hai un'idea? [Scrivici su GitHub]({{ site.repo.new_issue }})

{{ site.name }} è creato da uno sviluppatore indipendente, [@{{ site.author.name }}]({{ site.author.url }}), non da un'azienda: niente pubblicità, niente account, e open source.

## 🛠️ Per sviluppatori e agenti IA

La compilazione dal codice sorgente, le tecnologie usate, lo stato del progetto e i test sono descritti in [DEVELOPMENT.md]({{ links.DEVELOPMENT }}) (in inglese). Per contribuire, leggi [CONTRIBUTING.md]({{ links.CONTRIBUTING }}). Gli agenti di programmazione basati sull'IA sul tuo computer, come Claude Code, possono cercare e organizzare i tuoi preferiti con la tua approvazione: vedi [Usare con agenti IA locali]({{ docs_url }}/guides/local-agents).

---

<p align="center">
  Gratuito e open source con <a href="{{ root }}LICENSE">licenza {{ site.license.spdx }}</a>.
</p>
