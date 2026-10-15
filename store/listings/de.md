# German Listing Copy (Deutsch)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts were measured on 2026-10-12, the two full descriptions on 2026-10-15, and count Unicode characters.

| Block | Characters |
| --- | --- |
| Optional manifest description | 130 |
| Firefox Add-ons summary | 249 |
| Full description, Chrome and Edge | 10,713 |
| Full description, Firefox | 6,493 |
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
Bookmark Scout speichert jede Seite in Sekunden im richtigen Ordner, über die Symbolleiste oder mit einer einzigen Tastenkombination, und hilft Ihnen dann, Ihre Lesezeichen zu finden und aufzuräumen, ohne den Browser zu verlassen. Kostenlos, ohne Konto und ohne Werbung.

IN SEKUNDEN IM RICHTIGEN ORDNER SPEICHERN
• Auf die Schaltfläche von Bookmark Scout klicken, einen Teil eines beliebigen Ordnernamens eingeben, auch eines tief im Baum verschachtelten Ordners, und die Seite dort speichern, ohne die Tastatur zu verlassen
• Einen Pfad wie rezepte/pasta eingeben; ein kleiner Tippfehler findet den Ordner trotzdem, und zuletzt verwendete Ordner stehen oben
• Eine Seite, die bereits in diesem Ordner liegt, wird nicht doppelt gespeichert
• Optionale KI schlägt den besten Ordner für die Seite vor oder einen neuen Ordner, den Sie prüfen, bevor er erstellt wird
• Optionales Rechtsklickmenü (anfangs aus; aktivieren Sie „Rechtsklickmenü“ in den Einstellungen), um Links in zuletzt verwendeten Ordnern zu speichern

TASTENKÜRZEL ZUM SCHNELLSPEICHERN
• Auf einer beliebigen Seite Alt+Shift+S drücken, um sie zu speichern, ohne Bookmark Scout zu öffnen: standardmäßig im Ordner, der am besten zur Seite passt (ermittelt auf Ihrem Gerät), oder im zuletzt verwendeten Ordner oder in einem Ordner Ihrer Wahl
• Eine kleine Benachrichtigung auf der Seite zeigt, wo sie gespeichert wurde, mit „Rückgängig“ und weiteren Ordnern, in die Sie sie verschieben können
• Bei aktivierter KI speichert Alt+Shift+D die Seite im ersten KI-Ordnervorschlag
• Die Tasten ändern Sie auf der Seite für Tastenkombinationen des Browsers. Dort können Sie dem Schnellspeichern auch Ctrl+D (⌘D auf einem Mac) zuweisen, sodass es den Lesezeichendialog des Browsers ersetzt; die Einstellungen zeigen, wie das geht

IHRE LESEZEICHEN FINDEN
• Alle Ihre Lesezeichen schon beim Tippen durchsuchen, direkt in der Symbolleiste
• Ordnerbaum mit Drag-and-drop, „Alle ausklappen“ und „Alle einklappen“ sowie neuen Ordnern
• Seitenleiste mit demselben Ordnerbaum, derselben Suche und den passenden Ordnern
• Löschen mit Bestätigung (standardmäßig aktiviert) und 10 Sekunden Zeit zum Rückgängigmachen

LESEZEICHEN-MANAGER
Bookmark Scout ersetzt die Lesezeichenseite des Browsers durch einen Manager, der wie der browsereigene funktioniert, ergänzt um Pfadnavigation, eine sortierbare Tabelle und gespeicherte Suchen, die immer aktuelle Ergebnisse zeigen.
• Rechtsklickmenüs für Lesezeichen, Ordner und leere Flächen: Bearbeiten, Umbenennen, Ausschneiden, Kopieren, Einfügen, Öffnen in neuen Tabs oder Fenstern, Anzeigen im Ordner und Löschen
• Lesezeichen per Drag-and-drop in Ordner verschieben oder neu anordnen; Links, die aus anderen Seiten hineingezogen werden, werden zu Lesezeichen
• Mehrere Zeilen mit Ctrl+Klick und Shift+Klick auswählen und die Tastenkombinationen des browsereigenen Managers verwenden (Cmd auf einem Mac): Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Delete, Ctrl+Z zum Rückgängigmachen und Ctrl+Shift+Z zum Wiederholen
• Rückgängigmachen und Wiederholen umfassen Bearbeitungen, Verschiebungen, Sortierungen und Löschungen, auch Änderungen durch „KI fragen“
• Festlegen, welche Befehle die Rechtsklick- und ⋯-Menüs zeigen und in welcher Reihenfolge (Einstellungen)

JAHRE AN LESEZEICHEN AUFRÄUMEN
• Duplikatbereinigung: Duplikatgruppen prüfen, bevor überzählige Kopien entfernt werden
• URL-Bereinigung: Tracking-Codes in Webadressen in einer Vorschau prüfen und entfernen
• Linkprüfung: Links finden, die nicht mehr funktionieren, und Reparaturen prüfen (löschen, die neue Adresse verwenden, auf eine Archivkopie verweisen oder die Adresse bearbeiten), mit Rückgängig
• Metadatenabruf: Seitentitel vorschlagen und nur die ausgewählten übernehmen
• Datenschutzprüfung: private Angaben in Ihren Lesezeichen finden, etwa E-Mail-Adressen und Anmeldecodes in Links
• Statistik: Websites, Ordner, Tiefe und Duplikate
• Website-Symbole aktualisieren: das Symbol jeder Website direkt abrufen, ohne Symboldienst eines Drittanbieters
• Eine Lesezeichendatei mit Vorschau, Umgang mit Duplikaten und Rückgängig importieren
• Export als HTML, JSON, Markdown oder CSV, mit optionaler Datenschutzprüfung, die private Angaben ausblenden kann

WAS IHR BROWSER FRAGT UND WARUM
Bei der Installation fragt der Browser nur nach einem: „Deine Lesezeichen lesen und ändern“, damit Bookmark Scout sie speichern, durchsuchen und organisieren kann. Alles andere wird erst angefragt, wenn Sie die Funktion verwenden, die es benötigt, nach einer kurzen Erklärung. Wenn Sie ablehnen, bleibt nur diese Funktion deaktiviert.
• „Die Symbole der von dir besuchten Websites lesen“: wenn Sie bei „Website-Symbole aktualisieren“ auf „Browser-Symbole anzeigen“ klicken oder „Symbol-Cache des Browsers verwenden“ aktivieren, um die Symbole, die Ihr Browser bereits gespeichert hat, neben Ihren Lesezeichen anzuzeigen
• „Eigene Daten auf alle example.com-Websites lesen und ändern“ (oder „Eigene Daten auf verschiedenen Websites lesen und ändern“): wenn Sie die Linkprüfung, den Metadatenabruf oder „Website-Symbole aktualisieren“ ausführen, nur für die Websites in diesem Durchlauf. Ein Durchlauf über mehr als 20 Websites und die KI-Einstellung „Seiteninhalt lesen“ fragen nach „Alle deine Daten auf allen Websites lesen und ändern“. Anfragen werden ohne Cookies gesendet. Sobald alle Websites erlaubt sind, kann „KI fragen“ auch prüfen, ob Links in Ihren Lesezeichen noch funktionieren
• „Browserverlauf lesen“: nur, um die aktuelle Seite aus der Seitenleiste zu speichern oder dort Ordnervorschläge zu erhalten. Die Schaltfläche in der Symbolleiste und das Tastenkürzel zum Schnellspeichern benötigen keine Berechtigung, und Bookmark Scout liest nur Titel und Adresse des geöffneten Tabs
• „Mit zusammenarbeitenden nativen Anwendungen kommunizieren“: nur wenn Sie „Lokale KI-Agenten“ aktivieren (siehe „Für Entwickler“ unten)
Das Rechtsklickmenü ist ebenfalls optional, löst aber keine Warnung aus, daher fügt der Browser es ohne Nachfrage hinzu.

DATENSCHUTZ
• Kein Konto, keine Analyse, kein Tracking, keine Werbung
• Ihre Lesezeichen bleiben in Ihrem Browser; Tags, Zusammenfassungen und gespeicherte Suchen bleiben auf diesem Gerät
• Die von Ihnen geänderten Einstellungen und Ihre eigenen Prompts werden über Ihr Browserkonto synchronisiert, sofern der Browser dies unterstützt

OPTIONALE KI (STANDARDMÄSSIG DEAKTIVIERT)
KI ist optional, und alles oben Genannte funktioniert auch ohne sie. Um sie zu nutzen, brauchen Sie ein Konto bei einem KI-Unternehmen, das für jede Nutzung einen kleinen Betrag berechnen kann, oder ein kostenloses KI-Programm auf Ihrem eigenen Computer. Bookmark Scout hat keinen eigenen KI-Dienst: Aktivieren Sie KI in den Einstellungen und fügen Sie den Dienst Ihrer Wahl hinzu.
• Ordnervorschläge für die aktuelle Seite, einschließlich eines neuen Ordners, den Sie zuerst prüfen
• Tag-Vorschläge und kurze Zusammenfassungen, die Sie vor dem Speichern prüfen
• Pläne zur Neuordnung von Ordnern, immer mit Vorschau, bevor etwas geändert wird
• KI fragen: Chat über Ihre Lesezeichen. Die KI kann sie nach Wörtern, Ordner, Tag, Website oder Hinzufügedatum durchsuchen, Duplikate finden, Ordner vorschlagen und sich die aktuelle Seite ansehen
• „KI fragen“ ändert nur etwas, wenn Sie darum bitten: Es speichert Seiten und schlägt Verschiebungen, Umbenennungen, Löschungen und neue Ordner als Plan vor, der nichts ändert, bis Sie ihn genehmigen. Jede Änderung lässt sich rückgängig machen
• Antworten können mit Schaltflächen enden: eine Anschlussfrage, Optionen zur Auswahl, Speichern der Seite in einem vorgeschlagenen Ordner oder Öffnen eines Lesezeichens. Es passiert nichts, bis Sie klicken
• Festlegen, was „KI fragen“ nachschlagen oder ändern darf (Einstellungen > KI)
• Seiteninhalt lesen (standardmäßig deaktiviert): für bessere Vorschläge den lesbaren Text jeder Seite senden, nicht nur Titel und Adresse

Wenn Sie eine KI-Funktion verwenden, werden die benötigten Daten direkt von Ihrem Browser an den von Ihnen gewählten KI-Dienst gesendet und unterliegen dessen Bedingungen: Lesezeichentitel, Adressen, Ordnernamen, das Datum, an dem Lesezeichen hinzugefügt wurden, sowie gespeicherte Tags und Zusammenfassungen; Titel und Adresse der aktuellen Seite; Ihre Nachrichten an „KI fragen“; ob die Links, die „KI fragen“ prüft, noch funktionieren; und nur bei aktiviertem „Seiteninhalt lesen“ der Text der betroffenen Seiten. An Bookmark Scout wird nichts gesendet. Ihr API-Schlüssel wird im lokalen Erweiterungsspeicher dieses Browsers aufbewahrt und nicht synchronisiert. Die Nutzung eines KI-Dienstes kann kostenpflichtig sein.

EINSTELLUNGEN UND SICHERUNG
• „Einstellungen sichern“ unten in den Einstellungen speichert eine Datei mit den von Ihnen geänderten Einstellungen, eigenen Prompts, KI-Diensten (nie deren Schlüssel), gespeicherten Suchen und den Spalten des Managers. „Einstellungen wiederherstellen“ holt sie zurück
• Nur die Einstellungen, die Sie ändern, werden gespeichert, sodass verbesserte Standardwerte späterer Versionen Sie weiterhin erreichen

FÜR ENTWICKLER
• Suchoptionen: Groß-/Kleinschreibung, ganzes Wort und reguläre Ausdrücke. Die Adresse des Managers enthält die Suche und den Ordner, sodass ein Link ihn direkt mit einer Suche (?q=react) öffnen kann, und „Zurück“ und „Vorwärts“ stellen beides wieder her
• KI-Dienste können Cloud-KI-Anbieter, ein beliebiger OpenAI-kompatibler Endpunkt oder ein Modellserver auf Ihrem eigenen Computer sein
• Ausgewählte Lesezeichen als Markdown- oder XML-Kontext für einen KI-Chat exportieren (funktioniert ohne KI und sendet nichts)
• Die Datenschutzprüfung markiert außerdem sensible Abfrageparameter, URL-Fragmente und UUIDs
• Lokale KI-Agenten (standardmäßig deaktiviert): KI-Agenten auf Ihrem Computer, etwa Claude Code, Ihre Lesezeichen über das separate Open-Source-Programm bookmark-scout-mcp nachschlagen lassen. Ist zusätzlich „Änderungen erlauben“ aktiviert, können sie Lesezeichen speichern und neu ordnen, und jede Änderung wartet in einem Bookmark-Scout-Fenster auf Ihre Zustimmung
• Open Source unter AGPL-3.0: https://github.com/isandrel/bookmark-scout

UPDATE VON EINER FRÜHEREN VERSION
Version 0.3.3 speichert ihre Daten in einem neuen Format und übernimmt ältere Daten nicht: Die Einstellungen werden auf die Standardwerte zurückgesetzt, KI-Dienste und API-Schlüssel müssen erneut hinzugefügt werden, und eigene Prompts, gespeicherte Suchen, Tags, Zusammenfassungen und gespeicherte Website-Symbole werden gelöscht. Ihre Lesezeichen selbst bleiben unverändert.

Entwickelt von einem unabhängigen Entwickler: keine Firma, keine Werbung, kein Konto. In 9 Sprachen verfügbar. Helles, dunkles und System-Design.

Dokumentation: https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Bookmark Scout speichert jede Seite in Sekunden im richtigen Ordner, über die Symbolleiste oder mit einer einzigen Tastenkombination, und hilft Ihnen dann, Ihre Lesezeichen zu finden und zu organisieren, ohne den Browser zu verlassen. Kostenlos, ohne Konto und ohne Werbung.

IN SEKUNDEN IM RICHTIGEN ORDNER SPEICHERN
• Auf die Schaltfläche von Bookmark Scout klicken, einen Teil eines beliebigen Ordnernamens eingeben, auch eines tief im Baum verschachtelten Ordners, und die Seite dort speichern, ohne die Tastatur zu verlassen
• Einen Pfad wie rezepte/pasta eingeben; ein kleiner Tippfehler findet den Ordner trotzdem, und zuletzt verwendete Ordner stehen oben
• Eine Seite, die bereits in diesem Ordner liegt, wird nicht doppelt gespeichert
• Optionale KI schlägt den besten Ordner für die Seite vor oder einen neuen Ordner, den Sie prüfen, bevor er erstellt wird
• Links über das Rechtsklickmenü in zuletzt verwendeten Ordnern speichern, sobald Sie „Rechtsklickmenü“ in den Einstellungen aktivieren

TASTENKÜRZEL ZUM SCHNELLSPEICHERN
• Auf einer beliebigen Seite Alt+Shift+S drücken, um sie zu speichern, ohne Bookmark Scout zu öffnen: standardmäßig im Ordner, der am besten zur Seite passt (ermittelt auf Ihrem Gerät), oder im zuletzt verwendeten Ordner oder in einem Ordner Ihrer Wahl
• Eine kleine Benachrichtigung auf der Seite zeigt, wo sie gespeichert wurde, mit „Rückgängig“ und weiteren Ordnern, in die Sie sie verschieben können
• Bei aktivierter KI speichert Alt+Shift+D die Seite im ersten KI-Ordnervorschlag
• Die Tasten ändern Sie unter Einstellungen > Speichern & Suche > Tastenkürzel

IHRE LESEZEICHEN FINDEN
• Alle Ihre Lesezeichen schon beim Tippen durchsuchen, direkt in der Symbolleiste
• Ordnerbaum mit Drag-and-drop, „Alle ausklappen“ und „Alle einklappen“ sowie neuen Ordnern
• Derselbe Ordnerbaum, dieselbe Suche und die passenden Ordner in der Firefox-Sidebar, die beim Surfen geöffnet bleibt
• Löschen mit Bestätigung (standardmäßig aktiviert) und 10 Sekunden Zeit zum Rückgängigmachen

LESEZEICHEN-MANAGER
„Lesezeichen-Manager öffnen“ im Pop-up der Symbolleiste oder in der Sidebar öffnet einen vollständigen Manager in einem neuen Tab, mit Ordnerbaum und sortierbarer Tabelle.
• Rechtsklickmenüs für Lesezeichen, Ordner und leere Flächen: Bearbeiten, Umbenennen, Ausschneiden, Kopieren, Einfügen, Öffnen, Anzeigen im Ordner und Löschen
• Lesezeichen per Drag-and-drop in Ordner verschieben oder neu anordnen; Links, die aus anderen Seiten hineingezogen werden, werden zu Lesezeichen
• Mehrere Zeilen mit Ctrl+Klick und Shift+Klick auswählen (Cmd auf einem Mac), mit den üblichen Tasten kopieren, ausschneiden und einfügen und Ihre Änderungen mit Ctrl+Z und Ctrl+Shift+Z rückgängig machen und wiederholen

WAS FIREFOX FRAGT UND WARUM
Bei der Installation fragt Firefox nur nach einem: der Berechtigung, Lesezeichen zu lesen und zu ändern. Alles andere wird erst angefragt, wenn Sie die Funktion verwenden, die es benötigt, nach einer kurzen Erklärung. Wenn Sie ablehnen, bleibt nur diese Funktion deaktiviert.
• Zugriff auf Browsertabs: nur, um die aktuelle Seite aus der Sidebar zu speichern oder dort Ordnervorschläge zu erhalten. Die Schaltfläche in der Symbolleiste und das Tastenkürzel zum Schnellspeichern benötigen keine Berechtigung
• KI aktivieren: Firefox fragt, ob Authentifizierungsinformationen, Lesezeichen und Browseraktivität geteilt werden dürfen (Ihr API-Schlüssel, Ihre Lesezeichen und Ordner sowie Titel und Adresse der aktuellen Seite). Laut der Abfrage möchte der Entwickler sie erfassen; gemeint ist hier der von Ihnen gewählte KI-Dienst, der sie direkt von Ihrem Browser erhält. An Bookmark Scout gelangt nichts
• „Seiteninhalt lesen“: Zugriff auf Ihre Daten für alle Websites und Weitergabe von Website-Inhalten an Ihren KI-Dienst
• „Dienst überprüfen“: Zugriff auf die Adresse Ihres KI-Dienstes und Weitergabe von Authentifizierungsinformationen (Ihrem API-Schlüssel) an ihn

DATENSCHUTZ
• Kein Konto, keine Analyse, kein Tracking, keine Werbung
• Ihre Lesezeichen bleiben in Ihrem Browser
• Die von Ihnen geänderten Einstellungen und Ihre eigenen Prompts werden über Firefox Sync synchronisiert, sofern aktiviert

OPTIONALE KI-ORDNERVORSCHLÄGE (STANDARDMÄSSIG DEAKTIVIERT)
KI ist optional, und alles oben Genannte funktioniert auch ohne sie. Um sie zu nutzen, brauchen Sie ein Konto bei einem KI-Unternehmen, das für jede Nutzung einen kleinen Betrag berechnen kann, oder ein kostenloses KI-Programm auf Ihrem eigenen Computer. Aktivieren Sie KI in den Einstellungen und fügen Sie den Dienst Ihrer Wahl hinzu. Bookmark Scout schlägt dann Ordner für die aktuelle Seite vor, im Pop-up oder mit dem Tastenkürzel für KI-Schnellspeichern, und kann nach Ihrer Prüfung einen neuen Ordner erstellen.

Wenn Sie Vorschläge anfordern, werden Titel und Adresse der aktuellen Seite, Ihre Ordnernamen und, nur wenn Sie „Seiteninhalt lesen“ aktivieren, der Text der Seite direkt von Ihrem Browser an den von Ihnen gewählten KI-Dienst gesendet und unterliegen dessen Bedingungen. An Bookmark Scout wird nichts gesendet. Ihr API-Schlüssel wird im lokalen Erweiterungsspeicher dieses Browsers aufbewahrt und nicht synchronisiert. Die Nutzung eines KI-Dienstes kann kostenpflichtig sein.

EINSTELLUNGEN UND SICHERUNG
• „Einstellungen sichern“ unten in den Einstellungen speichert eine Datei mit den von Ihnen geänderten Einstellungen, eigenen Prompts, KI-Diensten (nie deren Schlüssel) und gespeicherten Suchen. „Einstellungen wiederherstellen“ holt sie zurück
• Nur die Einstellungen, die Sie ändern, werden gespeichert, sodass verbesserte Standardwerte späterer Versionen Sie weiterhin erreichen

FÜR ENTWICKLER
• Suchoptionen: Groß-/Kleinschreibung, ganzes Wort und reguläre Ausdrücke
• KI-Dienste können Cloud-KI-Anbieter, ein beliebiger OpenAI-kompatibler Endpunkt oder ein Modellserver auf Ihrem eigenen Computer sein
• Open Source unter AGPL-3.0: https://github.com/isandrel/bookmark-scout

UPDATE VON EINER FRÜHEREN VERSION
Version 0.3.3 speichert ihre Daten in einem neuen Format und übernimmt ältere Daten nicht: Die Einstellungen werden auf die Standardwerte zurückgesetzt, KI-Dienste und API-Schlüssel müssen erneut hinzugefügt werden, und eigene Prompts, gespeicherte Suchen, Tags, Zusammenfassungen und gespeicherte Website-Symbole werden gelöscht. Ihre Lesezeichen selbst bleiben unverändert.

Entwickelt von einem unabhängigen Entwickler: keine Firma, keine Werbung, kein Konto. In 9 Sprachen verfügbar. Helles, dunkles und System-Design.
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
