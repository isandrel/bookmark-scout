{# source: d9794b5f15a5 #}
{% import "../../_partials/markdown.md.j2" as md %}
{{ md.language_switcher() }}
<p align="center">
  <img src="https://raw.githubusercontent.com/{{ site.repo.slug }}/{{ site.repo.branch }}/apps/extension/public/icon-128.png" alt="Logo von {{ site.name }}" width="96" height="96">
</p>

<h1 align="center">{{ site.name }}</h1>

<h3 align="center">Jede Seite in Sekunden im richtigen Lesezeichenordner speichern.</h3>

<p align="center">
  Geben Sie ein paar Buchstaben eines Ordnernamens ein oder drücken Sie ein Tastenkürzel, und die Seite landet dort, wo sie hingehört.<br>
  Kostenlos, ohne Konto und ohne Werbung. Nichts wird an den Entwickler gesendet.
</p>

<p align="center">
{{ md.store_badges("Zu {browser} hinzufügen") }}
</p>

<p align="center">
  <a href="{{ site.url }}"><img src="https://img.shields.io/badge/Website-besuchen-{{ site.brand_color }}?style=flat-square" alt="Website"></a>
  <a href="{{ docs_url }}"><img src="https://img.shields.io/badge/Anleitungen-lesen-{{ site.brand_color }}?style=flat-square" alt="Anleitungen"></a>
  <a href="{{ site.license.file_url }}"><img src="https://img.shields.io/badge/Open%20Source-{{ md.badge_text(site.license.spdx) }}-blue?style=flat-square" alt="Open-Source-Lizenz"></a>
</p>

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="{{ screenshots.popup.dark }}">
    <img src="{{ screenshots.popup.light }}" alt="Das Pop-up von {{ site.name }}: Die Eingabe „fin“ findet den Ordner Fine-tuning in AI / LLMs, und Enter speichert die Seite dort. Daneben optionale KI-Vorschläge für einen Artikel über Prompt-Caching, darunter ein neuer Ordner." width="800">
  </picture>
</p>

## ✨ Was Sie damit tun können

- 📁 **Im richtigen Ordner speichern, indem Sie seinen Namen eingeben.** Geben Sie ein paar Buchstaben ein, auch von einem Ordner tief in anderen Ordnern, und drücken Sie Enter. Kleine Tippfehler werden trotzdem erkannt.
- ⚡ **Mit einem Tastenkürzel speichern.** Drücken Sie auf einer beliebigen Seite {{ shortcuts["commands.quick-save"].both }}. Eine kleine Meldung zeigt, wo die Seite gespeichert wurde, mit **Rückgängig** und weiteren Ordnern, in die Sie sie verschieben können.
- 🔎 **Alles Gespeicherte wiederfinden.** Durchsuchen Sie alle Lesezeichen schon beim Tippen, über die Symbolleiste, die Seitenleiste oder einen Lesezeichen-Manager in voller Seitengröße, der Ihre Lesezeichen auch als Karten mit einem Bild jeder Seite zeigen kann. Wenn Sie es einschalten, findet die Suche auch Wörter in den Seiten, die Sie gespeichert haben.
- 🧹 **Lesezeichen aus vielen Jahren aufräumen.** Entfernen Sie doppelte Lesezeichen, finden Sie Links, die nicht mehr funktionieren, entfernen Sie Tracking-Codes aus Webadressen, und legen Sie eigene Regeln an, die Tags hinzufügen und Lesezeichen in Ordner verschieben. Bei Bereinigungen und Regeln sehen Sie jede Änderung, bevor sie ausgeführt wird, und können sie rückgängig machen.
- 🕘 **Jede Änderung sehen und Gelöschtes zurückholen.** Der Verlauf listet jede Änderung an Ihren Lesezeichen auf, auch solche außerhalb von Bookmark Scout, und holt Gelöschtes zurück, auch nach einem Neustart des Browsers. Er bleibt auf Ihrem Computer.
- ✨ **Optionale KI-Vorschläge.** Lassen Sie KI den Ordner für Sie auswählen, mit Ihrem eigenen KI-Konto oder einem kostenlosen KI-Modell auf Ihrem Computer, etwa dem in Chrome integrierten. KI bleibt aus, bis Sie sie aktivieren.
- 🎛️ **Ganz nach Ihren Wünschen.** Legen Sie in den Einstellungen fest, welche Befehle die Menüs in welcher Reihenfolge zeigen, ordnen Sie die Bereiche und Schaltflächen des Pop-ups in der Symbolleiste und die Werkzeuge in der Tools-Leiste des Lesezeichen-Managers an, und wählen Sie, wo Meldungen wie **Rückgängig** erscheinen. Auch die Tasten, die Sie im Lesezeichen-Manager und im Pop-up drücken, können Sie ändern.
- 💾 **Sicherungen in Ihrer Hand.** Sichern Sie Ihre Einstellungen in einer Datei und wählen Sie, was hineinkommt: Einstellungen, Prompts, Regeln, Titelbilder und, nur wenn Sie es möchten, Ihre KI-Schlüssel. Schützen Sie die Datei mit einem Passwort, sehen Sie vor dem Wiederherstellen, was sich ändern wird, und machen Sie es rückgängig, wenn Sie es sich anders überlegen.
- 🔒 **Von Grund auf privat.** Kein Konto, keine Werbung, kein Tracking, und nichts geht an den Entwickler. Speichern und Suchen funktionieren sogar offline.

🌍 Verfügbar auf {{ locales|map(attribute="name")|join(" · ") }}.

## 📦 Installieren

{{ md.store_links("demnächst bei {store}. Bis dahin können Sie die Erweiterung [manuell installieren]({docs}/installation#{id}) (für Fortgeschrittene).") }}

Speichern Sie dann Ihre erste Seite:

1. **Anheften.** Klicken Sie in der Symbolleiste Ihres Browsers auf das Puzzleteil-Symbol und dann auf die Stecknadel neben {{ site.name }}.
2. **Öffnen Sie eine Seite, die Sie behalten möchten**, und klicken Sie auf das Symbol von {{ site.name }}.
3. **Geben Sie ein paar Buchstaben eines Ordnernamens ein** und drücken Sie Enter: Die Seite wird im ersten aufgelisteten Ordner gespeichert. Um einen anderen auszuwählen, drücken Sie vorher ↓. Das ist alles.

Beim nächsten Mal drücken Sie auf der Seite einfach {{ shortcuts["commands.quick-save"].both }}. Mehr dazu in der [Anleitung zum Speichern und Ordnen]({{ docs_url }}/guides/save-and-organize).

## 🔒 Ihr Datenschutz

{{ site.name }} hat kein Konto und keinen Server. Der Entwickler erhält also nie Ihre Lesezeichen, Einstellungen oder sonstige Daten. Ihre Lesezeichen werden in Ihrem Browser gelesen und geändert. Daten verlassen den Browser nur, wenn Sie eine Funktion verwenden, die das erfordert, zum Beispiel KI (die Daten gehen an das KI-Unternehmen Ihrer Wahl) oder die Prüfung auf defekte Links (dabei werden die gespeicherten Websites aufgerufen). Details finden Sie in der [Datenschutzerklärung]({{ pages.privacy }}).

## 🔐 Berechtigungen

Was Ihr Browser abfragt:

- **Bei der Installation:** *„Deine Lesezeichen lesen und ändern“.* Mehr braucht {{ site.name }} für den Anfang nicht.
- **Nur wenn Sie eine Funktion verwenden, die mehr braucht**, nach einer kurzen Erklärung von {{ site.name }}. Die Prüfung auf defekte Links fragt zum Beispiel, ob sie diese Websites aufrufen darf, und das Speichern über die Seitenleiste, ob sie sehen darf, welcher Tab geöffnet ist. Wenn Sie ablehnen, bleibt nur diese eine Funktion aus.

Hier sehen Sie [jede Berechtigung und wofür sie gebraucht wird]({{ docs_url }}/permissions).

## ❓ Fragen

**Ist es wirklich kostenlos?**<br>
Ja. Keine Werbung, kein kostenpflichtiges Abo, und jeder kann den Quellcode lesen. Wenn Sie KI mit dem Konto eines KI-Unternehmens aktivieren, kann dieses Unternehmen Ihnen die Nutzung berechnen.

**Brauche ich KI?**<br>
Nein. Speichern, Suchen und Aufräumen funktionieren auch ohne.

**Funktioniert es in Firefox, Edge oder Safari?**<br>
Firefox und Edge: ja (siehe [Installieren](#-installieren)). Safari: nein, weil Safari Erweiterungen keinen Zugriff auf Lesezeichen erlaubt.

Weitere Antworten finden Sie in den [häufigen Fragen]({{ docs_url }}/faq).

## 💬 Hilfe und Links

- 🌐 Website: [{{ site.url }}]({{ site.url }})
- 📖 Anleitungen: [{{ docs_url }}]({{ docs_url }})
- ✉️ E-Mail: [{{ contact.support }}](mailto:{{ contact.support }})
- 🐞 Ein Problem gefunden oder eine Idee? [Schreiben Sie uns auf GitHub]({{ site.repo.new_issue }})

{{ site.name }} wird von einem unabhängigen Entwickler entwickelt, [@{{ site.author.name }}]({{ site.author.url }}), nicht von einem Unternehmen: keine Werbung, kein Konto, und Open Source.

## 🛠️ Für Entwickler und KI-Agenten

Wie Sie die Erweiterung aus dem Quellcode erstellen, die verwendeten Technologien, den Projektstatus und die Tests finden Sie in [DEVELOPMENT.md]({{ links.DEVELOPMENT }}) (auf Englisch). Wenn Sie mithelfen möchten, lesen Sie [CONTRIBUTING.md]({{ links.CONTRIBUTING }}). KI-Programmieragenten auf Ihrem Computer, etwa Claude Code, können Ihre Lesezeichen mit Ihrer Zustimmung durchsuchen und ordnen: siehe [Mit lokalen KI-Agenten verwenden]({{ docs_url }}/guides/local-agents).

---

<p align="center">
  Kostenlos und Open Source unter der <a href="{{ root }}LICENSE">{{ site.license.spdx }}-Lizenz</a>.
</p>
