# German Listing Copy (Deutsch)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts count Unicode characters. The full descriptions and What's new were measured on 2026-10-23; the other blocks keep their earlier counts.

| Block | Characters |
| --- | --- |
| Optional manifest description | 130 |
| Firefox Add-ons summary | 246 |
| Full description, Chrome and Edge | 13,241 |
| Full description, Firefox | 7,298 |
| What's new in 0.3.5 | 1,391 |

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
Seiten schnell im richtigen Ordner speichern: Teil des Namens tippen, mit ⌥⇧S auf dem Mac (Alt+Shift+S unter Windows und Linux) im passendsten Ordner speichern oder optionale KI Ordner vorschlagen lassen. Dazu Sofortsuche, Ordnerbaum und Manager.
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
• Einen Pfad wie ai/llms eingeben; ein kleiner Tippfehler findet den Ordner trotzdem, und zuletzt verwendete Ordner stehen oben
• Eine Seite, die bereits in diesem Ordner liegt, wird nicht doppelt gespeichert
• Optionale KI schlägt den besten Ordner für die Seite vor oder einen neuen Ordner, den Sie prüfen, bevor er erstellt wird
• Optionales Rechtsklickmenü (anfangs aus; aktivieren Sie „Rechtsklickmenü“ in den Einstellungen), um einen Link oder die geöffnete Seite in einem zuletzt verwendeten Ordner zu speichern

TASTENKÜRZEL ZUM SCHNELLSPEICHERN
• Auf einer beliebigen Seite ⌥⇧S auf dem Mac (Alt+Shift+S unter Windows und Linux) drücken, um sie zu speichern, ohne Bookmark Scout zu öffnen: standardmäßig im Ordner, der am besten zur Seite passt (ermittelt auf Ihrem Gerät), oder im zuletzt verwendeten Ordner oder in einem Ordner Ihrer Wahl
• Eine kleine Benachrichtigung auf der Seite zeigt, wo sie gespeichert wurde, mit „Rückgängig“ und weiteren Ordnern, in die Sie sie verschieben können
• Bei aktivierter KI speichert ⌥⇧D auf dem Mac (Alt+Shift+D unter Windows und Linux) die Seite im ersten KI-Ordnervorschlag
• Die Tasten ändern Sie auf der Seite für Tastenkombinationen des Browsers. Dort können Sie dem Schnellspeichern auch ⌘D auf dem Mac (Ctrl+D unter Windows und Linux) zuweisen, sodass es den Lesezeichendialog des Browsers ersetzt; die Einstellungen zeigen, wie das geht

IHRE LESEZEICHEN FINDEN
• Alle Ihre Lesezeichen schon beim Tippen durchsuchen, direkt in der Symbolleiste: Titel, Adressen, Ordner, Tags und Zusammenfassungen, mit Operatoren wie tag:, domain: und folder:
• Ordnerbaum mit Drag-and-drop, „Alle ausklappen“ und „Alle einklappen“ sowie neuen Ordnern
• Seitenleiste mit demselben Ordnerbaum, derselben Suche und den passenden Ordnern
• Mit dem Mauszeiger auf einem Lesezeichen sehen Sie Adresse, Ordner, Tags und Zusammenfassung
• Löschen mit Bestätigung (standardmäßig aktiviert) und 10 Sekunden Zeit zum Rückgängigmachen

LESEZEICHEN-MANAGER
Bookmark Scout ersetzt die Lesezeichenseite des Browsers durch einen Manager, der wie der browsereigene funktioniert, ergänzt um Pfadnavigation, eine sortierbare Tabelle und gespeicherte Suchen, die immer aktuelle Ergebnisse zeigen.
• Rechtsklickmenüs für Lesezeichen, Ordner und leere Flächen: Bearbeiten, Umbenennen, Ausschneiden, Kopieren, Einfügen, Öffnen in neuen Tabs oder Fenstern, Anzeigen im Ordner und Löschen
• Lesezeichen per Drag-and-drop in Ordner verschieben oder neu anordnen; Links, die aus anderen Seiten hineingezogen werden, werden zu Lesezeichen
• Mehrere Zeilen mit Cmd+Klick und Shift+Klick auswählen und die Tastenkombinationen des browsereigenen Managers verwenden: ⌘A, ⌘C, ⌘X, ⌘V, ⌘⌫, ⌘Z zum Rückgängigmachen und ⇧⌘Z zum Wiederholen auf dem Mac (Ctrl+Klick, Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Delete, Ctrl+Z und Ctrl+Shift+Z unter Windows und Linux)
• Rückgängigmachen und Wiederholen umfassen Bearbeitungen, Verschiebungen, Sortierungen und Löschungen, auch Änderungen durch „KI fragen“
• Einen Ordner oder eine Suche als Liste oder als Karten mit Titelbild, Tags und Zusammenfassung jeder Seite anzeigen und ein Lesezeichen in der Vorschau ansehen, ohne es zu öffnen
• Lesezeichen-Verlauf: jede Änderung an Ihren Lesezeichen, mit dem vorherigen Stand jedes Eintrags, Rückgängig und „Wiederherstellen“ für gelöschte Einträge, auch wenn Rückgängig nicht mehr geht
• Menüs, Spalten, Karten, Seitenleisten und Tastenkürzel von Manager und Popup in den Einstellungen anpassen

JAHRE AN LESEZEICHEN AUFRÄUMEN
• Duplikatbereinigung: Duplikatgruppen prüfen und auswählen, welche Kopie bleibt
• URL-Bereinigung: Tracking-Codes in Webadressen in einer Vorschau prüfen und entfernen
• Linkprüfung: Links finden, die nicht mehr funktionieren, und Reparaturen prüfen (löschen, die neue Adresse verwenden, auf eine Archivkopie verweisen oder die Adresse bearbeiten), mit Rückgängig
• Metadatenabruf: Seitentitel vorschlagen und nur die ausgewählten übernehmen
• Datenschutzprüfung: private Angaben in Ihren Lesezeichen finden, etwa E-Mail-Adressen und Anmeldecodes in Links
• Statistik: Websites, Ordner, Tiefe und Duplikate
• Website-Symbole aktualisieren: das Symbol jeder Website direkt abrufen, ohne Symboldienst eines Drittanbieters
• Intelligente Regeln: Lesezeichen, die zu einer Suche passen, mit Tags versehen und in einen Ordner verschieben, nach einer Prüfung oder, wenn Sie es einschalten, sobald neue Lesezeichen hinzukommen
• Seitentext indexieren: den Text der gewählten Seiten auf diesem Gerät behalten, damit die Suche Wörter darin findet
• Titelbilder laden: das Vorschaubild jeder Seite auf diesem Gerät für die Kartenansicht behalten. „Titelbilder beim Surfen aufnehmen“ (standardmäßig aus) nimmt das Bild stattdessen auf, wenn Sie eine gespeicherte Seite öffnen
• Zeitaufwendige Werkzeuge laufen im Hintergrund weiter, wenn Sie den Manager schließen, mit Pause und Fortsetzen, und jede Prüfung lässt viele Einträge auf einmal festlegen
• Eine Lesezeichendatei mit Vorschau, Umgang mit Duplikaten und Rückgängig importieren
• Export als HTML, JSON, Markdown oder CSV, mit optionaler Datenschutzprüfung, die private Angaben ausblenden kann

WAS IHR BROWSER FRAGT UND WARUM
Bei der Installation fragt der Browser nur nach einem: „Deine Lesezeichen lesen und ändern“, damit Bookmark Scout sie speichern, durchsuchen und organisieren kann. Alles andere wird erst angefragt, wenn Sie die Funktion verwenden, die es benötigt, nach einer kurzen Erklärung. Wenn Sie ablehnen, bleibt nur diese Funktion deaktiviert.
• „Die Symbole der von dir besuchten Websites lesen“: wenn Sie bei „Website-Symbole aktualisieren“ auf „Browser-Symbole anzeigen“ klicken oder „Symbol-Cache des Browsers verwenden“ aktivieren, um die Symbole, die Ihr Browser bereits gespeichert hat, neben Ihren Lesezeichen anzuzeigen
• „Eigene Daten auf alle example.com-Websites lesen und ändern“ (oder „Eigene Daten auf verschiedenen Websites lesen und ändern“): wenn Sie die Linkprüfung, den Metadatenabruf, „Website-Symbole aktualisieren“, „Seitentext indexieren“ oder „Titelbilder laden“ ausführen, nur für die Websites in diesem Durchlauf. Ein Durchlauf über mehr als 20 Websites, die KI-Einstellung „Seiteninhalt lesen“ und „Titelbilder beim Surfen aufnehmen“ fragen nach „Alle deine Daten auf allen Websites lesen und ändern“; die Bilder von „Titelbilder beim Surfen aufnehmen“ bleiben auf diesem Gerät. Anfragen werden ohne Cookies gesendet. Sobald alle Websites erlaubt sind, kann „KI fragen“ auch prüfen, ob Links in Ihren Lesezeichen noch funktionieren
• „Browserverlauf lesen“: nur, um die aktuelle Seite aus der Seitenleiste zu speichern oder dort Ordnervorschläge zu erhalten. Die Schaltfläche in der Symbolleiste und das Tastenkürzel zum Schnellspeichern benötigen keine Berechtigung, und Bookmark Scout liest nur Titel und Adresse des geöffneten Tabs
• „Mit zusammenarbeitenden nativen Anwendungen kommunizieren“: nur wenn Sie „Lokale KI-Agenten“ aktivieren (siehe „Für Entwickler“ unten)
Das Rechtsklickmenü ist ebenfalls optional, löst aber keine Warnung aus, daher fügt der Browser es ohne Nachfrage hinzu.

DATENSCHUTZ
• Kein Konto, keine Analyse, kein Tracking, keine Werbung
• Ihre Lesezeichen bleiben in Ihrem Browser; Tags, Zusammenfassungen, gespeicherte Suchen, intelligente Regeln, Seitentexte, Titelbilder und der Lesezeichen-Verlauf bleiben auf diesem Gerät
• Die von Ihnen geänderten Einstellungen, Ihre eigenen Prompts und „Über mich“ werden über Ihr Browserkonto synchronisiert, sofern der Browser dies unterstützt

OPTIONALE KI (STANDARDMÄSSIG DEAKTIVIERT)
KI ist optional, und alles oben Genannte funktioniert auch ohne sie. Um sie zu nutzen, brauchen Sie ein Konto bei einem KI-Unternehmen, das für jede Nutzung einen kleinen Betrag berechnen kann, oder ein kostenloses KI-Programm auf Ihrem eigenen Computer. Bookmark Scout hat keinen eigenen KI-Dienst: Aktivieren Sie KI in den Einstellungen und fügen Sie den Dienst Ihrer Wahl hinzu.
• Ordnervorschläge für die aktuelle Seite, einschließlich eines neuen Ordners, den Sie zuerst prüfen
• In Chrome kostenlose Ordnervorschläge durch die integrierte KI des Browsers, die auf Ihrem Computer läuft, ohne Konto oder Schlüssel, sofern der Computer sie ausführen kann
• Tag-Vorschläge und kurze Zusammenfassungen, die Sie vor dem Speichern prüfen
• Pläne zur Neuordnung von Ordnern, immer mit Vorschau, bevor etwas geändert wird
• KI fragen: Chat über Ihre Lesezeichen. Die KI kann sie nach Wörtern, Ordner, Tag, Website oder Hinzufügedatum durchsuchen, Duplikate finden, Ordner vorschlagen und sich die aktuelle Seite ansehen
• „KI fragen“ ändert nur etwas, wenn Sie darum bitten: Es speichert Seiten und schlägt Verschiebungen, Umbenennungen, Löschungen und neue Ordner als Plan vor, der nichts ändert, bis Sie ihn genehmigen. Jede Änderung lässt sich rückgängig machen
• Antworten können mit Schaltflächen enden: eine Anschlussfrage, Optionen zur Auswahl, Speichern der Seite in einem vorgeschlagenen Ordner oder Öffnen eines Lesezeichens. Es passiert nichts, bis Sie klicken
• Festlegen, was „KI fragen“ nachschlagen oder ändern darf (Einstellungen > KI)
• Seiteninhalt lesen (standardmäßig deaktiviert): für bessere Vorschläge den lesbaren Text jeder Seite senden, nicht nur Titel und Adresse
• Tags, Zusammenfassungen und neue Ordnernamen kommen in Ihrer Sprache, in einer von Ihnen gewählten Sprache oder in der Sprache der jeweiligen Seite (Einstellungen > KI)

Wenn Sie eine KI-Funktion verwenden, werden die benötigten Daten direkt von Ihrem Browser an den von Ihnen gewählten KI-Dienst gesendet und unterliegen dessen Bedingungen: Lesezeichentitel, Adressen, Ordnernamen, das Datum, an dem Lesezeichen hinzugefügt wurden, sowie gespeicherte Tags und Zusammenfassungen; Titel und Adresse der aktuellen Seite; Ihre Nachrichten an „KI fragen“; Ihr Text unter „Über mich“, falls vorhanden; ob die Links, die „KI fragen“ prüft, noch funktionieren; und nur bei aktiviertem „Seiteninhalt lesen“ der Text der betroffenen Seiten. An Bookmark Scout wird nichts gesendet. Ihr API-Schlüssel wird im lokalen Erweiterungsspeicher dieses Browsers aufbewahrt und nicht synchronisiert. Die Nutzung eines KI-Dienstes kann kostenpflichtig sein.

EINSTELLUNGEN UND SICHERUNG
• „Einstellungen sichern“ unten in den Einstellungen speichert die Teile, die Sie auswählen: Ihre Einstellungen, die Einstellungen dieses Computers, gespeicherte Suchen und Tabellenansicht, Prompts und „Über mich“, intelligente Regeln, KI-Dienste und Titelbilder. API-Schlüssel kommen nur hinein, wenn Sie sie auswählen, und sind dann mit einem Passwort geschützt
• „Einstellungen wiederherstellen“ zeigt zuerst, was jeder Teil ändern würde, führt dann zusammen oder ersetzt, und „Import rückgängig machen“ nimmt es zurück
• Nur die Einstellungen, die Sie ändern, werden gespeichert, sodass verbesserte Standardwerte späterer Versionen Sie weiterhin erreichen

FÜR ENTWICKLER
• Suchoperatoren: title:, url:, domain:, folder:, tag:, summary:, content: (Seitentext), is:, has:, after:, before:, -Wort, OR und Klammern; dazu Groß-/Kleinschreibung, ganzes Wort und reguläre Ausdrücke. Die Adresse des Managers enthält die Suche und den Ordner, sodass ein Link ihn direkt mit einer Suche (?q=react) öffnen kann, und „Zurück“ und „Vorwärts“ stellen beides wieder her
• KI-Dienste können Cloud-KI-Anbieter, ein beliebiger OpenAI-kompatibler Endpunkt oder ein Modellserver auf Ihrem eigenen Computer sein, mit oder ohne API-Schlüssel
• Ausgewählte Lesezeichen als Markdown- oder XML-Kontext für einen KI-Chat exportieren (funktioniert ohne KI und sendet nichts)
• Die Datenschutzprüfung markiert außerdem sensible Abfrageparameter, URL-Fragmente und UUIDs
• Lokale KI-Agenten (standardmäßig deaktiviert): KI-Agenten auf Ihrem Computer, etwa Claude Code, Ihre Lesezeichen über das separate Open-Source-Programm bookmark-scout-mcp nachschlagen lassen. Ist zusätzlich „Änderungen erlauben“ aktiviert, können sie Lesezeichen speichern und neu ordnen, und jede Änderung wartet in einem Bookmark-Scout-Fenster auf Ihre Zustimmung
• Open Source unter AGPL-3.0: https://github.com/isandrel/bookmark-scout

UPDATE VON EINER FRÜHEREN VERSION
Version 0.3.3 speichert ihre Daten in einem neuen Format und übernimmt ältere Daten nicht: Die Einstellungen werden auf die Standardwerte zurückgesetzt, KI-Dienste und API-Schlüssel müssen erneut hinzugefügt werden, und eigene Prompts, gespeicherte Suchen, Tags, Zusammenfassungen und gespeicherte Website-Symbole werden gelöscht. Ihre Lesezeichen selbst bleiben unverändert.

Entwickelt von einem unabhängigen Entwickler: keine Firma, keine Werbung, kein Konto. In 12 Sprachen verfügbar. Helles, dunkles und System-Design.

Dokumentation: https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Bookmark Scout speichert jede Seite in Sekunden im richtigen Ordner, über die Symbolleiste oder mit einer einzigen Tastenkombination, und hilft Ihnen dann, Ihre Lesezeichen zu finden und zu organisieren, ohne den Browser zu verlassen. Kostenlos, ohne Konto und ohne Werbung.

IN SEKUNDEN IM RICHTIGEN ORDNER SPEICHERN
• Auf die Schaltfläche von Bookmark Scout klicken, einen Teil eines beliebigen Ordnernamens eingeben, auch eines tief im Baum verschachtelten Ordners, und die Seite dort speichern, ohne die Tastatur zu verlassen
• Einen Pfad wie ai/llms eingeben; ein kleiner Tippfehler findet den Ordner trotzdem, und zuletzt verwendete Ordner stehen oben
• Eine Seite, die bereits in diesem Ordner liegt, wird nicht doppelt gespeichert
• Optionale KI schlägt den besten Ordner für die Seite vor oder einen neuen Ordner, den Sie prüfen, bevor er erstellt wird
• Links über das Rechtsklickmenü in zuletzt verwendeten Ordnern speichern, sobald Sie „Rechtsklickmenü“ in den Einstellungen aktivieren

TASTENKÜRZEL ZUM SCHNELLSPEICHERN
• Auf einer beliebigen Seite ⌥⇧S auf dem Mac (Alt+Shift+S unter Windows und Linux) drücken, um sie zu speichern, ohne Bookmark Scout zu öffnen: standardmäßig im Ordner, der am besten zur Seite passt (ermittelt auf Ihrem Gerät), oder im zuletzt verwendeten Ordner oder in einem Ordner Ihrer Wahl
• Eine kleine Benachrichtigung auf der Seite zeigt, wo sie gespeichert wurde, mit „Rückgängig“ und weiteren Ordnern, in die Sie sie verschieben können
• Bei aktivierter KI speichert ⌥⇧D auf dem Mac (Alt+Shift+D unter Windows und Linux) die Seite im ersten KI-Ordnervorschlag
• Die Tasten ändern Sie unter Einstellungen > Speichern & Suche > Tastenkürzel

IHRE LESEZEICHEN FINDEN
• Alle Ihre Lesezeichen schon beim Tippen durchsuchen, direkt in der Symbolleiste: Titel, Adressen, Ordner, Tags und Zusammenfassungen, mit Operatoren wie tag:, domain: und folder:
• Ordnerbaum mit Drag-and-drop, „Alle ausklappen“ und „Alle einklappen“ sowie neuen Ordnern
• Derselbe Ordnerbaum, dieselbe Suche und die passenden Ordner in der Firefox-Sidebar, die beim Surfen geöffnet bleibt
• Löschen mit Bestätigung (standardmäßig aktiviert) und 10 Sekunden Zeit zum Rückgängigmachen

LESEZEICHEN-MANAGER
„Lesezeichen-Manager öffnen“ im Pop-up der Symbolleiste oder in der Sidebar öffnet einen vollständigen Manager in einem neuen Tab, mit Ordnerbaum und sortierbarer Tabelle.
• Rechtsklickmenüs für Lesezeichen, Ordner und leere Flächen: Bearbeiten, Umbenennen, Ausschneiden, Kopieren, Einfügen, Öffnen, Anzeigen im Ordner und Löschen
• Lesezeichen per Drag-and-drop in Ordner verschieben oder neu anordnen; Links, die aus anderen Seiten hineingezogen werden, werden zu Lesezeichen
• Mehrere Zeilen mit Cmd+Klick und Shift+Klick auswählen, mit den üblichen Tasten kopieren, ausschneiden und einfügen und Ihre Änderungen auf dem Mac mit ⌘Z und ⇧⌘Z rückgängig machen und wiederholen (Ctrl+Klick, Ctrl+Z und Ctrl+Shift+Z unter Windows und Linux)

WAS FIREFOX FRAGT UND WARUM
Bei der Installation fragt Firefox nur nach einem: der Berechtigung, Lesezeichen zu lesen und zu ändern. Alles andere wird erst angefragt, wenn Sie die Funktion verwenden, die es benötigt, nach einer kurzen Erklärung. Wenn Sie ablehnen, bleibt nur diese Funktion deaktiviert.
• Zugriff auf Browsertabs: nur, um die aktuelle Seite aus der Sidebar zu speichern oder dort Ordnervorschläge zu erhalten. Die Schaltfläche in der Symbolleiste und das Tastenkürzel zum Schnellspeichern benötigen keine Berechtigung
• KI aktivieren: Firefox fragt, ob Authentifizierungsinformationen, Lesezeichen und Browseraktivität geteilt werden dürfen (Ihr API-Schlüssel, Ihre Lesezeichen und Ordner sowie Titel und Adresse der aktuellen Seite). Laut der Abfrage möchte der Entwickler sie erfassen; gemeint ist hier der von Ihnen gewählte KI-Dienst, der sie direkt von Ihrem Browser erhält. An Bookmark Scout gelangt nichts
• „Seiteninhalt lesen“: Zugriff auf Ihre Daten für alle Websites und Weitergabe von Website-Inhalten an Ihren KI-Dienst
• „Titelbilder beim Surfen aufnehmen“ (standardmäßig aus), das Bilder der geöffneten Lesezeichen-Seiten auf diesem Gerät behält: Zugriff auf Ihre Daten für alle Websites, ohne Weitergabe
• „Dienst überprüfen“: Zugriff auf die Adresse Ihres KI-Dienstes und Weitergabe von Authentifizierungsinformationen (Ihrem API-Schlüssel) an ihn

DATENSCHUTZ
• Kein Konto, keine Analyse, kein Tracking, keine Werbung
• Ihre Lesezeichen bleiben in Ihrem Browser
• Die von Ihnen geänderten Einstellungen, Ihre eigenen Prompts und „Über mich“ werden über Firefox Sync synchronisiert, sofern aktiviert

OPTIONALE KI-ORDNERVORSCHLÄGE (STANDARDMÄSSIG DEAKTIVIERT)
KI ist optional, und alles oben Genannte funktioniert auch ohne sie. Um sie zu nutzen, brauchen Sie ein Konto bei einem KI-Unternehmen, das für jede Nutzung einen kleinen Betrag berechnen kann, oder ein kostenloses KI-Programm auf Ihrem eigenen Computer. Aktivieren Sie KI in den Einstellungen und fügen Sie den Dienst Ihrer Wahl hinzu. Bookmark Scout schlägt dann Ordner für die aktuelle Seite vor, im Pop-up oder mit dem Tastenkürzel für KI-Schnellspeichern, und kann nach Ihrer Prüfung einen neuen Ordner erstellen.

Wenn Sie Vorschläge anfordern, werden Titel und Adresse der aktuellen Seite, Ihre Ordnernamen und, nur wenn Sie „Seiteninhalt lesen“ aktivieren, der Text der Seite direkt von Ihrem Browser an den von Ihnen gewählten KI-Dienst gesendet und unterliegen dessen Bedingungen. An Bookmark Scout wird nichts gesendet. Ihr API-Schlüssel wird im lokalen Erweiterungsspeicher dieses Browsers aufbewahrt und nicht synchronisiert. Die Nutzung eines KI-Dienstes kann kostenpflichtig sein.

EINSTELLUNGEN UND SICHERUNG
• „Einstellungen sichern“ unten in den Einstellungen speichert die Teile, die Sie auswählen: Ihre Einstellungen, die Einstellungen dieses Computers, gespeicherte Suchen und Tabellenansicht, Prompts und „Über mich“, KI-Dienste und mehr. API-Schlüssel kommen nur hinein, wenn Sie sie auswählen, und sind dann mit einem Passwort geschützt
• „Einstellungen wiederherstellen“ zeigt zuerst, was jeder Teil ändern würde, führt dann zusammen oder ersetzt, und „Import rückgängig machen“ nimmt es zurück
• Nur die Einstellungen, die Sie ändern, werden gespeichert, sodass verbesserte Standardwerte späterer Versionen Sie weiterhin erreichen

FÜR ENTWICKLER
• Suchoperatoren: title:, url:, domain:, folder:, tag:, summary:, is:, has:, after:, before:, -Wort, OR und Klammern; dazu Groß-/Kleinschreibung, ganzes Wort und reguläre Ausdrücke
• KI-Dienste können Cloud-KI-Anbieter, ein beliebiger OpenAI-kompatibler Endpunkt oder ein Modellserver auf Ihrem eigenen Computer sein, mit oder ohne API-Schlüssel
• Open Source unter AGPL-3.0: https://github.com/isandrel/bookmark-scout

UPDATE VON EINER FRÜHEREN VERSION
Version 0.3.3 speichert ihre Daten in einem neuen Format und übernimmt ältere Daten nicht: Die Einstellungen werden auf die Standardwerte zurückgesetzt, KI-Dienste und API-Schlüssel müssen erneut hinzugefügt werden, und eigene Prompts, gespeicherte Suchen, Tags, Zusammenfassungen und gespeicherte Website-Symbole werden gelöscht. Ihre Lesezeichen selbst bleiben unverändert.

Entwickelt von einem unabhängigen Entwickler: keine Firma, keine Werbung, kein Konto. In 12 Sprachen verfügbar. Helles, dunkles und System-Design.
```

## What's new in 0.3.5

Translation of the English release notes; paste into AMO's release notes for 0.3.5.

```text
• Titelbilder und Karten: Zeigen Sie einen Ordner im Lesezeichen-Manager als Karten mit Titelbild, Tags und Zusammenfassung jeder Seite. Titelbilder stammen aus dem Vorschaubild der Seite selbst, aus einem Bild des gewählten Tabs oder, wenn Sie es einschalten, aus Bildern beim Surfen, und bleiben auf diesem Gerät
• Suche in Seiten: „Seitentext indexieren“ behält den Text der gewählten Seiten auf diesem Gerät, damit die Suche Wörter darin findet
• Überall dieselbe Suche: Titel, Adressen, Ordner, Tags und Zusammenfassungen, mit Operatoren wie tag:, domain:, folder: und OR
• Intelligente Regeln versehen Lesezeichen, die zu einer Suche passen, mit Tags und verschieben sie nach einer Prüfung in einen Ordner
• Der Lesezeichen-Verlauf zeigt jede Änderung an Ihren Lesezeichen, mit Rückgängig, und kann gelöschte Einträge zurückholen
• Zeitaufwendige Werkzeuge laufen im Hintergrund weiter, wenn Sie den Manager schließen
• Menüs, Spalten, Tastenkürzel, das Rechtsklickmenü und mehr in den Einstellungen anpassen
• Die gewählten Teile Ihrer Einstellungen sichern und vor „Zusammenführen“ oder „Ersetzen“ sehen, was eine Wiederherstellung ändern würde, mit „Import rückgängig machen“. API-Schlüssel kommen nur hinein, wenn Sie sie auswählen, mit Passwortschutz
• Die Einstellungen „Seitentitel und Symbole“ heißen jetzt „Seitendetails“
• Neue Sprachen: Russisch, Indonesisch und Italienisch
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
