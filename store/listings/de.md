# German Listing Copy (Deutsch)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts were measured on 2026-10-08 and count Unicode characters.

| Block | Characters |
| --- | --- |
| Optional manifest description | 132 |
| Firefox Add-ons summary | 218 |
| Full description, Chrome and Edge | 4,491 |
| Full description, Firefox | 2,014 |

## Name

```text
Bookmark Scout
```

Read from `extName` in `apps/extension/public/_locales/de/messages.json`.

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

Packaged from `extDescription` (changing it needs a new version):

```text
Lesezeichen suchen, ordnen, bereinigen: schnelle Suche, Ordnerablage, Duplikat- und Linkprüfung, optionale KI mit eigenem Schlüssel.
```

### Firefox Add-ons summary (250 characters maximum)

```text
Lesezeichen direkt in der Symbolleiste suchen und ordnen: Sofortsuche, Ordnerbaum mit Drag-and-drop, Speichern in jedem Ordner mit einem Klick und optionale KI-Ordnervorschläge mit Ihrem eigenen Anbieter und Schlüssel.
```

## Search terms (Edge Add-ons)

```text
Lesezeichen-Manager
Lesezeichen suchen
doppelte Lesezeichen
defekte Links
Lesezeichenordner
KI Lesezeichen
Lesezeichen importieren
```

## Full description: Chrome Web Store and Edge Add-ons

The same Edge condition as in `en.md` applies.

```text
Mit Bookmark Scout finden, ablegen und ordnen Sie Ihre Lesezeichen, ohne den Browser zu verlassen.

SUCHEN UND SPEICHERN IN DER SYMBOLLEISTE
• Sofortsuche in allen Lesezeichen, mit den Optionen Groß-/Kleinschreibung, ganzes Wort und reguläre Ausdrücke
• Ordnerbaum mit Drag-and-drop, „Alle ausklappen“ und „Alle einklappen“ sowie neuen Ordnern
• Aktuelle Seite mit einem Klick in jedem Ordner speichern; eine Seite, die bereits in diesem Ordner liegt, wird nicht doppelt gespeichert
• Seitenleiste mit demselben Ordnerbaum und derselben Suche
• Optionales Rechtsklickmenü (aktivieren Sie „Kontextmenü“ in den Einstellungen), um Links in zuletzt verwendeten Ordnern zu speichern
• Tastenkombinationen, die nie die Strg/Cmd-Tastenkombinationen des Browsers übernehmen
• Löschen mit Bestätigungsdialog (standardmäßig aktiviert) und 10 Sekunden Zeit zum Rückgängigmachen

LESEZEICHEN-MANAGER
Bookmark Scout ersetzt die Lesezeichenseite des Browsers durch einen Manager mit Ordnerbaum, Pfadnavigation, sortier- und filterbarer Tabelle, anpassbaren Spaltenbreiten und gespeicherten Suchen (intelligente Ansichten, die nur Ihre Filter speichern und immer aktuelle Ergebnisse zeigen).

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

Linkprüfung, Metadatenabruf, „Website-Symbole aktualisieren“ und die KI-Einstellung „Seiteninhalt lesen“ fragen bei der ersten Verwendung nach optionalem Zugriff auf Websites. Dieser Zugriff wird nie bei der Installation erteilt, Anfragen werden ohne Cookies gesendet, und wenn Sie ablehnen, bleibt die jeweilige Funktion einfach deaktiviert.

OPTIONALE KI-TOOLS (STANDARDMÄSSIG DEAKTIVIERT)
Aktivieren Sie KI in den Einstellungen und wählen Sie einen Cloud-KI-Anbieter, einen beliebigen OpenAI-kompatiblen Endpunkt oder einen Modellserver auf Ihrem eigenen Computer, mit Ihrem eigenen API-Schlüssel, wenn der Anbieter einen verlangt.
• Ordnervorschläge für die aktuelle Seite, einschließlich geprüfter Erstellung eines neuen Ordnerpfads
• Tag-Vorschläge und kurze Zusammenfassungen, die Sie vor dem Speichern prüfen
• Pläne zur Neuordnung von Ordnern, standardmäßig mit Vorschau, bevor etwas geändert wird
• Ausgewählte Lesezeichen als Markdown- oder XML-Kontext für einen KI-Chat exportieren (funktioniert ohne KI und sendet nichts)
• KI fragen: Chat über Ihre Lesezeichen; die KI kann passende Lesezeichen, Ihre Ordnernamen und die aktuelle Seite nachschlagen
• Seiteninhalt lesen (standardmäßig deaktiviert): für bessere Vorschläge den lesbaren Text jeder Seite senden, nicht nur Titel und URL

Wenn Sie eine KI-Funktion verwenden, werden die benötigten Daten direkt von Ihrem Browser an den von Ihnen gewählten Anbieter gesendet und unterliegen dessen Bedingungen: Lesezeichentitel, URLs, Ordnernamen sowie gespeicherte Tags und Zusammenfassungen; Titel und URL der aktuellen Seite; Ihre Nachrichten an „KI fragen“; und nur bei aktiviertem „Seiteninhalt lesen“ der Text der betroffenen Seiten. An Bookmark Scout wird nichts gesendet. Ihr API-Schlüssel wird im lokalen Erweiterungsspeicher dieses Browsers aufbewahrt und nicht synchronisiert. Die Nutzung des Anbieters kann kostenpflichtig sein.

DATENSCHUTZ
• Kein Konto, keine Analyse, kein Tracking, keine Werbung
• Lesezeichen bleiben in Ihrem Browser; Tags, Zusammenfassungen und gespeicherte Suchen bleiben im lokalen Erweiterungsspeicher
• Einstellungen werden über Ihr Browserkonto synchronisiert, sofern der Browser dies unterstützt
• Open Source unter AGPL-3.0: https://github.com/isandrel/bookmark-scout

In 9 Sprachen verfügbar. Helles, dunkles und System-Design.

Dokumentation: https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Mit Bookmark Scout finden und speichern Sie Ihre Lesezeichen, ohne den Browser zu verlassen.

SUCHEN UND SPEICHERN IN DER SYMBOLLEISTE
• Sofortsuche in allen Lesezeichen, mit den Optionen Groß-/Kleinschreibung, ganzes Wort und reguläre Ausdrücke
• Ordnerbaum mit Drag-and-drop, „Alle ausklappen“ und „Alle einklappen“ sowie neuen Ordnern
• Aktuelle Seite mit einem Klick in jedem Ordner speichern; eine Seite, die bereits in diesem Ordner liegt, wird nicht doppelt gespeichert
• Derselbe Ordnerbaum und dieselbe Suche in der Firefox-Sidebar, die beim Surfen geöffnet bleibt
• Links über das Rechtsklickmenü in zuletzt verwendeten Ordnern speichern
• Tastenkombinationen, die nie die Strg/Cmd-Tastenkombinationen des Browsers übernehmen
• Löschen mit Bestätigungsdialog (standardmäßig aktiviert) und 10 Sekunden Zeit zum Rückgängigmachen

OPTIONALE KI-ORDNERVORSCHLÄGE (STANDARDMÄSSIG DEAKTIVIERT)
Aktivieren Sie KI in den Einstellungen und wählen Sie einen Cloud-KI-Anbieter, einen beliebigen OpenAI-kompatiblen Endpunkt oder einen Modellserver auf Ihrem eigenen Computer, mit Ihrem eigenen API-Schlüssel, wenn der Anbieter einen verlangt. Bookmark Scout schlägt dann Ordner für die aktuelle Seite vor und kann nach Ihrer Prüfung einen neuen Ordnerpfad erstellen.

Wenn Sie Vorschläge anfordern, werden Titel und URL der aktuellen Seite sowie Ihre Ordnernamen direkt von Ihrem Browser an den von Ihnen gewählten Anbieter gesendet und unterliegen dessen Bedingungen. An Bookmark Scout wird nichts gesendet. Ihr API-Schlüssel wird im lokalen Erweiterungsspeicher dieses Browsers aufbewahrt und nicht synchronisiert. Die Nutzung des Anbieters kann kostenpflichtig sein.

DATENSCHUTZ
• Kein Konto, keine Analyse, kein Tracking, keine Werbung
• Lesezeichen bleiben in Ihrem Browser
• Einstellungen werden über Firefox Sync synchronisiert, sofern aktiviert
• Open Source unter AGPL-3.0: https://github.com/isandrel/bookmark-scout

In 9 Sprachen verfügbar. Helles, dunkles und System-Design.

Der Lesezeichen-Manager öffnet sich über das Pop-up in der Symbolleiste in einem neuen Tab.
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
