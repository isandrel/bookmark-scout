# German Listing Copy (Deutsch)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts were measured on 2026-10-12 and count Unicode characters.

| Block | Characters |
| --- | --- |
| Optional manifest description | 130 |
| Firefox Add-ons summary | 249 |
| Full description, Chrome and Edge | 8,832 |
| Full description, Firefox | 4,783 |
| What's new in 0.3.3 | 1,240 |

## Name

```text
Bookmark Scout
```

Read from `extName` in `apps/extension/public/_locales/de/messages.json`.

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

Packaged from `extDescription` (changing it needs a new version). Ships with 0.3.3 (130 characters):

```text
Seiten schnell im richtigen Ordner speichern: Namensteil tippen oder KI vorschlagen lassen. Dazu Lesezeichensuche und Bereinigung.
```

### Firefox Add-ons summary (250 characters maximum)

```text
Seiten schnell im richtigen Lesezeichenordner speichern: Teil eines Ordnernamens tippen, mit Alt+Shift+S im passendsten Ordner speichern oder optionale KI Ordner vorschlagen lassen. Dazu Sofortsuche, Ordnerbaum und vollständiger Lesezeichen-Manager.
```

## Search terms (Edge Add-ons)

```text
in Ordner speichern
Lesezeichen-Manager
Lesezeichen suchen
doppelte Lesezeichen
defekte Links
Lesezeichenordner
KI Lesezeichen
```

## Full description: Chrome Web Store and Edge Add-ons

The same Edge condition as in `en.md` applies.

```text
Bookmark Scout speichert jede Seite in Sekunden im richtigen Ordner, über die Symbolleiste oder mit einer einzigen Tastenkombination, und hilft Ihnen dann, Ihre Lesezeichen zu finden und zu organisieren, ohne den Browser zu verlassen.

IN SEKUNDEN IM RICHTIGEN ORDNER SPEICHERN
• Einen Teil eines beliebigen Ordnernamens eingeben, auch eines tief im Baum verschachtelten Ordners, und die aktuelle Seite dort speichern, ohne die Tastatur zu verlassen
• Einen Pfad wie work/react eingeben; ein kleiner Tippfehler findet den Ordner trotzdem, und zuletzt verwendete Ordner stehen oben
• Eine Seite, die bereits in diesem Ordner liegt, wird nicht doppelt gespeichert
• Optionale KI schlägt den besten Ordner für die Seite vor oder einen neuen Ordnerpfad, den Sie prüfen, bevor er erstellt wird
• Optionales Rechtsklickmenü (aktivieren Sie „Kontextmenü“ in den Einstellungen), um Links in zuletzt verwendeten Ordnern zu speichern

TASTENKÜRZEL ZUM SCHNELLSPEICHERN
• Auf einer beliebigen Seite Alt+Shift+S drücken, um sie zu speichern, ohne Bookmark Scout zu öffnen: standardmäßig im Ordner, der am besten zur Seite passt (die Rangfolge wird auf Ihrem Gerät berechnet), oder im zuletzt verwendeten Ordner oder in einem Ordner Ihrer Wahl
• Eine kleine Benachrichtigung auf der Seite zeigt, wo sie gespeichert wurde, mit „Rückgängig“ und weiteren Ordnern, in die Sie sie verschieben können
• Bei aktivierter KI speichert Alt+Shift+D die Seite im ersten KI-Ordnervorschlag
• Die Tasten ändern Sie auf der Seite für Tastenkombinationen des Browsers. Dort können Sie dem Schnellspeichern auch Ctrl+D (⌘D auf einem Mac) zuweisen, sodass es den Lesezeichendialog des Browsers ersetzt; die Einstellungen zeigen, wie das geht

SUCHEN IN DER SYMBOLLEISTE
• Sofortsuche in allen Lesezeichen, mit den Optionen Groß-/Kleinschreibung, ganzes Wort und reguläre Ausdrücke
• Ordnerbaum mit Drag-and-drop, „Alle ausklappen“ und „Alle einklappen“ sowie neuen Ordnern
• Seitenleiste mit demselben Ordnerbaum, derselben Suche und den passenden Ordnern
• Löschen mit Bestätigungsdialog (standardmäßig aktiviert) und 10 Sekunden Zeit zum Rückgängigmachen

LESEZEICHEN-MANAGER
Bookmark Scout ersetzt die Lesezeichenseite des Browsers durch einen Manager, der wie der browsereigene funktioniert, ergänzt um Pfadnavigation, eine sortier- und filterbare Tabelle, anpassbare Spaltenbreiten und gespeicherte Suchen (intelligente Ansichten, die nur Ihre Filter speichern und immer aktuelle Ergebnisse zeigen).
• Rechtsklickmenüs für Lesezeichen, Ordner und leere Flächen: Bearbeiten, Umbenennen, Ausschneiden, Kopieren, Einfügen, Öffnen in neuen Tabs oder Fenstern, Anzeigen im Ordner und Löschen
• Lesezeichen per Drag-and-drop in Ordner verschieben oder neu anordnen; Links, die aus anderen Seiten hineingezogen werden, werden zu Lesezeichen
• Mehrere Zeilen mit Ctrl+Klick und Shift+Klick auswählen und die Tastenkombinationen des browsereigenen Managers verwenden (Cmd auf einem Mac): Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Delete, Ctrl+Z zum Rückgängigmachen und Ctrl+Y zum Wiederholen
• Rückgängigmachen und Wiederholen umfassen Bearbeitungen, Verschiebungen, Sortierungen und Löschungen, auch Änderungen durch „KI fragen“
• Die Adresse enthält die Suche und den Ordner, sodass ein Link den Manager direkt mit einer Suche (?q=react) oder in einem Ordner öffnen kann, und „Zurück“ und „Vorwärts“ stellen beides wieder her
• Festlegen, welche Befehle die Rechtsklick- und ⋯-Menüs zeigen und in welcher Reihenfolge (Einstellungen > Verhalten)

WARTUNGSTOOLS
• Duplikatbereinigung: Duplikatgruppen prüfen, bevor überzählige Kopien entfernt werden
• URL-Bereinigung: Tracking-Parameter in einer Vorschau prüfen und entfernen
• Linkprüfung: nicht erreichbare Links finden und Reparaturen prüfen (löschen, Weiterleitungsziel verwenden, auf eine Archivkopie verweisen oder URL bearbeiten), mit Rückgängig
• Metadatenabruf: Seitentitel vorschlagen und nur die ausgewählten übernehmen
• Datenschutzprüfung: sensible Abfrageparameter, URL-Fragmente, E-Mail-Adressen und UUIDs in Lesezeichen finden
• Statistik: Domains, Ordner, Tiefe und Duplikate
• Website-Symbole aktualisieren: das Symbol jeder Website direkt abrufen, ohne Symboldienst eines Drittanbieters
• Import aus HTML oder JSON mit Vorschau, Umgang mit Duplikaten und Rückgängig
• Export als HTML, JSON, Markdown oder CSV, mit optionaler Datenschutzprüfung, die sensible Werte schwärzen kann

Linkprüfung, Metadatenabruf, „Website-Symbole aktualisieren“ und die KI-Einstellung „Seiteninhalt lesen“ fragen bei der ersten Verwendung nach optionalem Zugriff auf Websites; sobald er erlaubt ist, kann „KI fragen“ auch prüfen, ob Links in Ihren Lesezeichen noch funktionieren. Dieser Zugriff wird nie bei der Installation erteilt, Anfragen werden ohne Cookies gesendet, und wenn Sie ablehnen, bleibt die jeweilige Funktion einfach deaktiviert.

EINSTELLUNGEN UND SICHERUNG
• „Exportieren“ unten in den Einstellungen speichert eine Sicherung: die von Ihnen geänderten Einstellungen, eigene Prompts, KI-Dienste (nie deren API-Schlüssel), gespeicherte Suchen und die Spalten des Managers. „Importieren“ stellt sie wieder her
• Nur die Einstellungen, die Sie ändern, werden gespeichert, sodass verbesserte Standardwerte späterer Versionen Sie weiterhin erreichen

OPTIONALE KI-TOOLS (STANDARDMÄSSIG DEAKTIVIERT)
Aktivieren Sie KI in den Einstellungen und wählen Sie einen Cloud-KI-Anbieter, einen beliebigen OpenAI-kompatiblen Endpunkt oder einen Modellserver auf Ihrem eigenen Computer, mit Ihrem eigenen API-Schlüssel, wenn der Anbieter einen verlangt.
• Ordnervorschläge für die aktuelle Seite, einschließlich geprüfter Erstellung eines neuen Ordnerpfads
• Tag-Vorschläge und kurze Zusammenfassungen, die Sie vor dem Speichern prüfen
• Pläne zur Neuordnung von Ordnern, immer mit Vorschau, bevor etwas geändert wird
• Ausgewählte Lesezeichen als Markdown- oder XML-Kontext für einen KI-Chat exportieren (funktioniert ohne KI und sendet nichts)
• KI fragen: Chat über Ihre Lesezeichen. Die KI kann sie nach Wörtern, Ordner, Tag, Website oder Hinzufügedatum durchsuchen, Duplikate finden, Ordner vorschlagen und sich die aktuelle Seite ansehen
• „KI fragen“ ändert nur etwas, wenn Sie darum bitten: Es speichert Seiten und schlägt Verschiebungen, Umbenennungen, Löschungen und neue Ordner als Plan vor, der nichts ändert, bis Sie ihn genehmigen. Jede Änderung lässt sich rückgängig machen
• Antworten können mit Schaltflächen enden: eine Anschlussfrage, Optionen zur Auswahl, Speichern der Seite in einem vorgeschlagenen Ordner oder Öffnen eines Lesezeichens. Es passiert nichts, bis Sie klicken
• Festlegen, was „KI fragen“ nachschlagen oder ändern darf (Einstellungen > KI)
• Seiteninhalt lesen (standardmäßig deaktiviert): für bessere Vorschläge den lesbaren Text jeder Seite senden, nicht nur Titel und URL
• Lokale KI-Agenten (standardmäßig deaktiviert): KI-Agenten auf Ihrem Computer, etwa Claude Code, Ihre Lesezeichen über das separate Open-Source-Programm bookmark-scout-mcp nachschlagen lassen. Ist zusätzlich „Änderungen erlauben“ aktiviert, können sie Lesezeichen speichern und neu ordnen, und jede Änderung wartet in einem Bookmark-Scout-Fenster auf Ihre Zustimmung

Wenn Sie eine KI-Funktion verwenden, werden die benötigten Daten direkt von Ihrem Browser an den von Ihnen gewählten Anbieter gesendet und unterliegen dessen Bedingungen: Lesezeichentitel, URLs, Ordnernamen, das Datum, an dem Lesezeichen hinzugefügt wurden, sowie gespeicherte Tags und Zusammenfassungen; Titel und URL der aktuellen Seite; Ihre Nachrichten an „KI fragen“; ob die Links, die „KI fragen“ prüft, noch funktionieren; und nur bei aktiviertem „Seiteninhalt lesen“ der Text der betroffenen Seiten. An Bookmark Scout wird nichts gesendet. Ihr API-Schlüssel wird im lokalen Erweiterungsspeicher dieses Browsers aufbewahrt und nicht synchronisiert. Die Nutzung des Anbieters kann kostenpflichtig sein.

DATENSCHUTZ
• Kein Konto, keine Analyse, kein Tracking, keine Werbung
• Lesezeichen bleiben in Ihrem Browser; Tags, Zusammenfassungen und gespeicherte Suchen bleiben im lokalen Erweiterungsspeicher
• Die von Ihnen geänderten Einstellungen und Ihre eigenen Prompts werden über Ihr Browserkonto synchronisiert, sofern der Browser dies unterstützt
• Open Source unter AGPL-3.0: https://github.com/isandrel/bookmark-scout

UPDATE VON EINER FRÜHEREN VERSION
Version 0.3.3 speichert ihre Daten in einem neuen Format und übernimmt ältere Daten nicht: Die Einstellungen werden auf die Standardwerte zurückgesetzt, KI-Dienste und API-Schlüssel müssen erneut hinzugefügt werden, und eigene Prompts, gespeicherte Suchen, Tags, Zusammenfassungen und gespeicherte Website-Symbole werden gelöscht. Ihre Lesezeichen selbst bleiben unverändert.

In 9 Sprachen verfügbar. Helles, dunkles und System-Design.

Dokumentation: https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Bookmark Scout speichert jede Seite in Sekunden im richtigen Ordner, über die Symbolleiste oder mit einer einzigen Tastenkombination, und hilft Ihnen dann, Ihre Lesezeichen zu finden und zu organisieren, ohne den Browser zu verlassen.

IN SEKUNDEN IM RICHTIGEN ORDNER SPEICHERN
• Einen Teil eines beliebigen Ordnernamens eingeben, auch eines tief im Baum verschachtelten Ordners, und die aktuelle Seite dort speichern, ohne die Tastatur zu verlassen
• Einen Pfad wie work/react eingeben; ein kleiner Tippfehler findet den Ordner trotzdem, und zuletzt verwendete Ordner stehen oben
• Eine Seite, die bereits in diesem Ordner liegt, wird nicht doppelt gespeichert
• Optionale KI schlägt den besten Ordner für die Seite vor oder einen neuen Ordnerpfad, den Sie prüfen, bevor er erstellt wird
• Links über das Rechtsklickmenü in zuletzt verwendeten Ordnern speichern

TASTENKÜRZEL ZUM SCHNELLSPEICHERN
• Auf einer beliebigen Seite Alt+Shift+S drücken, um sie zu speichern, ohne Bookmark Scout zu öffnen: standardmäßig im Ordner, der am besten zur Seite passt (die Rangfolge wird auf Ihrem Gerät berechnet), oder im zuletzt verwendeten Ordner oder in einem Ordner Ihrer Wahl
• Eine kleine Benachrichtigung auf der Seite zeigt, wo sie gespeichert wurde, mit „Rückgängig“ und weiteren Ordnern, in die Sie sie verschieben können
• Bei aktivierter KI speichert Alt+Shift+D die Seite im ersten KI-Ordnervorschlag
• Die Tasten ändern Sie unter Einstellungen > Speichern & Suche > Tastenkürzel

SUCHEN IN DER SYMBOLLEISTE
• Sofortsuche in allen Lesezeichen, mit den Optionen Groß-/Kleinschreibung, ganzes Wort und reguläre Ausdrücke
• Ordnerbaum mit Drag-and-drop, „Alle ausklappen“ und „Alle einklappen“ sowie neuen Ordnern
• Derselbe Ordnerbaum, dieselbe Suche und die passenden Ordner in der Firefox-Sidebar, die beim Surfen geöffnet bleibt
• Löschen mit Bestätigungsdialog (standardmäßig aktiviert) und 10 Sekunden Zeit zum Rückgängigmachen

LESEZEICHEN-MANAGER
„Lesezeichen-Manager öffnen“ im Pop-up der Symbolleiste oder in der Sidebar öffnet einen vollständigen Manager in einem neuen Tab, mit Ordnerbaum und sortier- und filterbarer Tabelle.
• Rechtsklickmenüs für Lesezeichen, Ordner und leere Flächen: Bearbeiten, Umbenennen, Ausschneiden, Kopieren, Einfügen, Öffnen, Anzeigen im Ordner und Löschen
• Lesezeichen per Drag-and-drop in Ordner verschieben oder neu anordnen; Links, die aus anderen Seiten hineingezogen werden, werden zu Lesezeichen
• Mehrere Zeilen mit Ctrl+Klick und Shift+Klick auswählen (Cmd auf einem Mac), mit den üblichen Tasten kopieren, ausschneiden und einfügen und Ihre Änderungen mit Ctrl+Z und Ctrl+Y rückgängig machen und wiederholen

EINSTELLUNGEN UND SICHERUNG
• „Exportieren“ unten in den Einstellungen speichert eine Sicherung: die von Ihnen geänderten Einstellungen, eigene Prompts, KI-Dienste (nie deren API-Schlüssel) und gespeicherte Suchen. „Importieren“ stellt sie wieder her
• Nur die Einstellungen, die Sie ändern, werden gespeichert, sodass verbesserte Standardwerte späterer Versionen Sie weiterhin erreichen

OPTIONALE KI-ORDNERVORSCHLÄGE (STANDARDMÄSSIG DEAKTIVIERT)
Aktivieren Sie KI in den Einstellungen und wählen Sie einen Cloud-KI-Anbieter, einen beliebigen OpenAI-kompatiblen Endpunkt oder einen Modellserver auf Ihrem eigenen Computer, mit Ihrem eigenen API-Schlüssel, wenn der Anbieter einen verlangt. Bookmark Scout schlägt dann Ordner für die aktuelle Seite vor, im Pop-up oder mit dem Tastenkürzel für KI-Schnellspeichern, und kann nach Ihrer Prüfung einen neuen Ordnerpfad erstellen.

Wenn Sie Vorschläge anfordern, werden Titel und URL der aktuellen Seite, Ihre Ordnernamen und, nur wenn Sie „Seiteninhalt lesen“ aktivieren, der Text der Seite direkt von Ihrem Browser an den von Ihnen gewählten Anbieter gesendet und unterliegen dessen Bedingungen. An Bookmark Scout wird nichts gesendet. Ihr API-Schlüssel wird im lokalen Erweiterungsspeicher dieses Browsers aufbewahrt und nicht synchronisiert. Die Nutzung des Anbieters kann kostenpflichtig sein.

DATENSCHUTZ
• Kein Konto, keine Analyse, kein Tracking, keine Werbung
• Lesezeichen bleiben in Ihrem Browser
• Die von Ihnen geänderten Einstellungen und Ihre eigenen Prompts werden über Firefox Sync synchronisiert, sofern aktiviert
• Open Source unter AGPL-3.0: https://github.com/isandrel/bookmark-scout

UPDATE VON EINER FRÜHEREN VERSION
Version 0.3.3 speichert ihre Daten in einem neuen Format und übernimmt ältere Daten nicht: Die Einstellungen werden auf die Standardwerte zurückgesetzt, KI-Dienste und API-Schlüssel müssen erneut hinzugefügt werden, und eigene Prompts, gespeicherte Suchen, Tags, Zusammenfassungen und gespeicherte Website-Symbole werden gelöscht. Ihre Lesezeichen selbst bleiben unverändert.

In 9 Sprachen verfügbar. Helles, dunkles und System-Design.
```

## What's new in 0.3.3

Translation of the English release notes; paste into AMO's release notes for 0.3.3.

```text
• Schnellspeichern: Drücken Sie auf einer beliebigen Seite Alt+Shift+S, um sie im Ordner zu speichern, der am besten zu ihr passt. Eine Benachrichtigung auf der Seite zeigt, wo sie gespeichert wurde, mit „Rückgängig“ und weiteren Ordnern, in die Sie sie verschieben können. Bei aktivierter KI speichert Alt+Shift+D im ersten KI-Vorschlag
• Lesezeichen-Manager: Rechtsklickmenüs, Drag-and-drop, Ausschneiden, Kopieren und Einfügen, Auswahl mehrerer Zeilen sowie Rückgängigmachen und Wiederholen
• „KI fragen“ kann Seiten speichern und Verschiebungen, Umbenennungen, Löschungen und neue Ordner vorschlagen, die nichts ändern, bis Sie sie genehmigen, und jede Änderung lässt sich rückgängig machen. Antworten können mit Schaltflächen enden, die Sie anklicken
• Festlegen, welche Befehle die Menüs des Managers zeigen und was „KI fragen“ tun darf
• „Exportieren“ in den Einstellungen speichert jetzt eine Sicherung, die Sie importieren können
• Dieses Update setzt die gespeicherten Daten von Bookmark Scout zurück: Die Einstellungen werden auf die Standardwerte zurückgesetzt, und KI-Dienste und API-Schlüssel, eigene Prompts, gespeicherte Suchen, Tags und Zusammenfassungen müssen neu eingerichtet werden. Ihre Lesezeichen bleiben unverändert
```

## Category

Same as `en.md`. Stores set the category once for all locales.

## Support and links

Same as [`en.md`](en.md#support-and-links). Where a store accepts a value per locale, use the German pages:

| Field | Value |
| --- | --- |
| Support URL | https://bookmark-scout.com/de/support/ |
| Privacy policy URL | https://bookmark-scout.com/de/privacy/ |
| Support email | support@bookmark-scout.com |
