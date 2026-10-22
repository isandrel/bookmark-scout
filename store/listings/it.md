# Italian Listing Copy (Italiano)

Translation of [`en.md`](en.md). The structure, store limits, and verification notes in the English file apply here too. Character counts were measured on 2026-10-22 and count Unicode characters.

| Block | Characters |
| --- | --- |
| Manifest description | 132 |
| Firefox Add-ons summary | 236 |
| Full description, Chrome and Edge | 10,968 |
| Full description, Firefox | 6,520 |
| What's new in 0.3.3 | 1,139 |

## Name

```text
Bookmark Scout
```

Read from `extName` in `apps/extension/public/_locales/it/messages.json`. The brand name is not translated.

## Short summary

### Chrome Web Store and Edge Add-ons (manifest description, 132 characters maximum)

Packaged as `extDescription`; changing it needs a new version. Ships with 0.3.3 (132 characters):

```text
Salva le pagine nella cartella giusta: digita parte del nome di una cartella o lascia che l'IA la suggerisca. Più ricerca e pulizia.
```

### Firefox Add-ons summary (250 characters maximum, 236 characters on 2026-10-22)

```text
Salva le pagine nella cartella giusta: digita parte del nome, premi ⌥⇧S su Mac (Alt+Shift+S su Windows e Linux) per salvare nella più adatta o lascia che l'IA facoltativa ne suggerisca una. Con ricerca, albero delle cartelle e gestione.
```

## Search terms (Edge Add-ons)

```text
salva nella cartella
gestione preferiti
cerca nei preferiti
preferiti duplicati
link non funzionanti
cartelle dei preferiti
preferiti con IA
```

## Full description: Chrome Web Store and Edge Add-ons

The same Edge condition as in `en.md` applies.

```text
Bookmark Scout salva ogni pagina nella cartella giusta in pochi secondi, dalla barra degli strumenti o con una sola scorciatoia da tastiera, poi ti aiuta a trovare e riordinare i tuoi preferiti senza uscire dal browser. Gratuito, senza account e senza pubblicità.

SALVA NELLA CARTELLA GIUSTA IN POCHI SECONDI
• Fai clic sul pulsante di Bookmark Scout, digita parte del nome di una cartella qualsiasi, anche una annidata in profondità nell'albero, e salvaci la pagina senza staccare le mani dalla tastiera
• Digita un percorso come ai/llms; anche con un piccolo errore di battitura la cartella viene trovata, e le cartelle usate di recente compaiono per prime
• Una pagina già presente in quella cartella non viene salvata due volte
• L'IA facoltativa suggerisce la cartella migliore per la pagina, oppure una nuova cartella che controlli prima che venga creata
• Menu contestuale facoltativo (disattivato all'inizio; attiva Menu contestuale nelle Impostazioni) per salvare i link nelle cartelle recenti

SCORCIATOIE DI SALVATAGGIO RAPIDO
• Premi ⌥⇧S su Mac (Alt+Shift+S su Windows e Linux) su qualsiasi pagina per salvarla senza aprire Bookmark Scout: per impostazione predefinita nella cartella che corrisponde meglio alla pagina (calcolata sul tuo dispositivo), oppure nell'ultima cartella usata o in una che scegli tu
• Una piccola notifica nella pagina indica dove è stata salvata, con Annulla e altre cartelle in cui spostarla
• Con l'IA attiva, ⌥⇧D su Mac (Alt+Shift+D su Windows e Linux) salva la pagina nella prima cartella suggerita dall'IA
• Cambia i tasti nella pagina delle scorciatoie del browser. Lì puoi anche assegnare ⌘D su Mac (Ctrl+D su Windows e Linux) al salvataggio rapido, che sostituisce così la finestra dei preferiti del browser; le Impostazioni spiegano come

TROVA I TUOI PREFERITI
• Cerca in tutti i tuoi preferiti mentre digiti, direttamente dalla barra degli strumenti
• Albero delle cartelle con trascinamento, espandi e comprimi tutto e nuove cartelle
• Riquadro laterale con lo stesso albero, la ricerca e le cartelle corrispondenti
• Eliminazione con conferma (attiva per impostazione predefinita) e Annulla per 10 secondi

GESTIONE PREFERITI
Bookmark Scout sostituisce la pagina Preferiti del browser con una gestione che funziona come quella del browser, con in più il percorso di navigazione, una tabella ordinabile e ricerche salvate che mostrano sempre risultati aggiornati.
• Menu contestuali su preferiti, cartelle e spazio vuoto: modifica, rinomina, taglia, copia, incolla, apri in nuove schede o finestre, mostra nella cartella ed elimina
• Trascina per spostare i preferiti nelle cartelle o riordinarli; i link trascinati da altre pagine diventano preferiti
• Seleziona più righe con Cmd+clic e Shift+clic e usa le scorciatoie da tastiera della gestione preferiti del browser: ⌘A, ⌘C, ⌘X, ⌘V, ⌘⌫, ⌘Z per annullare e ⇧⌘Z per ripetere su Mac (Ctrl+clic, Ctrl+A, Ctrl+C, Ctrl+X, Ctrl+V, Delete, Ctrl+Z e Ctrl+Shift+Z su Windows e Linux)
• Annulla e Ripeti valgono per modifiche, spostamenti, ordinamenti ed eliminazioni, comprese quelle fatte da Chiedi all'IA
• Scegli quali comandi mostrano il menu contestuale e il menu ⋯, e in quale ordine (Impostazioni)

RIORDINA ANNI DI PREFERITI
• Pulizia duplicati: controlla i gruppi di duplicati prima di rimuovere le copie in più
• Pulizia URL: visualizza in anteprima e rimuovi i codici di tracciamento dagli indirizzi web
• Controlla link non funzionanti: trova i link che non funzionano più, poi controlla le riparazioni (elimina, usa il nuovo indirizzo, punta a una copia archiviata o modificalo) con Annulla
• Recupero metadati: suggerisce titoli delle pagine e applica solo quelli che scegli
• Controllo privacy: trova dati privati nei tuoi preferiti, come indirizzi email e codici di accesso nei link
• Statistiche: siti, cartelle, profondità e duplicati
• Aggiorna icone dei siti: scarica l'icona di ogni sito direttamente dal sito, senza servizi di icone di terze parti
• Importa un file di preferiti con anteprima, gestione dei duplicati e Annulla
• Esporta in HTML, JSON, Markdown o CSV, con un controllo della privacy facoltativo che può nascondere i dati privati

COSA TI CHIEDERÀ IL BROWSER, E PERCHÉ
All'installazione, il browser chiede una sola cosa: "Leggere e modificare i preferiti", così Bookmark Scout può salvarli, cercarli e organizzarli. Tutto il resto viene chiesto solo quando usi la funzione che ne ha bisogno, dopo una breve spiegazione. Se rispondi di no, resta disattivata solo quella funzione.
• "Leggere le icone dei siti web che visiti": quando fai clic su Mostra le icone del browser in Aggiorna icone dei siti, o attivi Usa la cache delle icone del browser, per mostrare accanto ai preferiti le icone che il browser ha già salvato
• "Leggere e modificare i tuoi dati su tutti i siti example.com" (o "su diversi siti web"): quando esegui Controlla link non funzionanti, Recupero metadati o Aggiorna icone dei siti, solo per i siti di quell'esecuzione. Un'esecuzione su più di 20 siti e l'impostazione IA Leggi il contenuto delle pagine chiedono "Leggere e modificare tutti i tuoi dati su tutti i siti web". Le richieste vengono inviate senza cookie. Una volta consentiti tutti i siti web, Chiedi all'IA può anche controllare se i link salvati funzionano ancora
• "Leggere la cronologia di navigazione": solo per salvare la pagina corrente o ricevere suggerimenti di cartelle dal riquadro laterale. Il pulsante nella barra degli strumenti e la scorciatoia di salvataggio rapido non richiedono autorizzazioni, e Bookmark Scout legge solo il titolo e l'indirizzo della scheda aperta
• "Comunicare con applicazioni native di cooperazione": solo quando attivi Agenti IA locali (vedi Per sviluppatori più avanti)
Anche il menu contestuale è facoltativo, ma non comporta avvisi, quindi il browser lo aggiunge senza chiedere.

PRIVACY
• Nessun account, nessuna analisi, nessun tracciamento, nessuna pubblicità
• I tuoi preferiti restano nel browser; tag, riassunti e ricerche salvate restano su questo dispositivo
• Le impostazioni che modifichi, i tuoi prompt personalizzati e Su di me si sincronizzano tramite l'account del browser, se il browser lo supporta

IA FACOLTATIVA (DISATTIVATA PER IMPOSTAZIONE PREDEFINITA)
L'IA è facoltativa e tutto quanto descritto sopra funziona senza. Per usarla ti serve un account presso un'azienda di IA, che potrebbe addebitare una piccola somma a ogni utilizzo, oppure un programma di IA gratuito sul tuo computer. Bookmark Scout non ha un proprio servizio di IA: attiva l'IA nelle Impostazioni e aggiungi il servizio che hai scelto.
• Suggerimenti di cartelle per la pagina corrente, inclusa una nuova cartella che controlli prima
• In Chrome, suggerimenti di cartelle gratuiti dall'IA integrata di Chrome, che funziona sul tuo computer senza account né chiave, se il computer è in grado di eseguirla
• Suggerimenti di tag e brevi riassunti che controlli prima di salvarli
• Piani di riorganizzazione delle cartelle, sempre mostrati in anteprima prima di qualsiasi modifica
• Chiedi all'IA: chatta dei tuoi preferiti. Può cercarli per parole, cartella, tag, sito o data di aggiunta, trovare duplicati, suggerire cartelle ed esaminare la pagina corrente
• Chiedi all'IA apporta modifiche solo quando lo chiedi tu: salva pagine e propone spostamenti, ridenominazioni, eliminazioni e nuove cartelle come un piano che non cambia nulla finché non lo approvi. Ogni modifica può essere annullata
• Le risposte possono terminare con dei pulsanti: una domanda di approfondimento, opzioni tra cui scegliere, il salvataggio della pagina in una cartella suggerita o l'apertura di un preferito. Non succede nulla finché non fai clic
• Scegli cosa Chiedi all'IA può consultare o modificare (Impostazioni > IA)
• Leggi il contenuto delle pagine (disattivato per impostazione predefinita): invia il testo leggibile di ogni pagina, non solo il titolo e l'indirizzo, per suggerimenti migliori
• Tag, riassunti e nomi delle nuove cartelle arrivano nella tua lingua, in una che scegli tu o nella lingua di ciascuna pagina (Impostazioni > IA)

Quando usi una funzione IA, i dati di cui ha bisogno vengono inviati direttamente dal browser al servizio di IA che hai scelto, secondo i termini di quel servizio: titoli, indirizzi e nomi delle cartelle dei preferiti, le date in cui i preferiti sono stati aggiunti, e i tag e i riassunti salvati; il titolo e l'indirizzo della pagina corrente; i tuoi messaggi a Chiedi all'IA; il testo Su di me che scrivi, se presente; se i link che Chiedi all'IA controlla funzionano ancora; e, solo con Leggi il contenuto delle pagine attivo, il testo delle pagine coinvolte. Nulla viene inviato a Bookmark Scout. La tua chiave API è conservata nello spazio di archiviazione locale delle estensioni di questo browser e non viene sincronizzata. L'uso di un servizio di IA potrebbe avere un costo.

IMPOSTAZIONI E BACKUP
• Esegui il backup delle impostazioni, in fondo alle Impostazioni, salva un file con le impostazioni che hai modificato, i prompt personalizzati, Su di me, i servizi IA (mai le loro chiavi), le ricerche salvate e le colonne della gestione preferiti. Ripristina le impostazioni li riporta indietro
• Vengono salvate solo le impostazioni che modifichi, così i valori predefiniti migliorati delle versioni successive ti arrivano comunque

PER SVILUPPATORI
• Opzioni di ricerca: maiuscole/minuscole, parola intera ed espressioni regolari. L'indirizzo della gestione preferiti conserva la ricerca e la cartella, così un link può aprirla già con la ricerca attiva (?q=react), e Indietro e Avanti ripristinano entrambe
• I servizi IA possono essere provider di IA nel cloud, qualsiasi endpoint compatibile con OpenAI o un server di modelli sul tuo computer
• Esporta i preferiti selezionati come contesto Markdown o XML per una chat con l'IA (funziona senza IA e non invia nulla)
• Controllo privacy segnala anche parametri di query sensibili, frammenti di URL e UUID
• Agenti IA locali (disattivati per impostazione predefinita): consenti agli agenti IA sul tuo computer, come Claude Code, di consultare i tuoi preferiti tramite il programma open source separato bookmark-scout-mcp. Con Consenti modifiche attivo, possono anche salvare e riorganizzare i preferiti, e ogni modifica attende la tua approvazione in una finestra di Bookmark Scout
• Open source con licenza AGPL-3.0: https://github.com/isandrel/bookmark-scout

AGGIORNAMENTO DA UNA VERSIONE PRECEDENTE
La versione 0.3.3 salva i dati in un nuovo formato e non converte quelli precedenti: le impostazioni tornano ai valori predefiniti, i servizi IA e le chiavi API vanno aggiunti di nuovo, e prompt personalizzati, ricerche salvate, tag, riassunti e icone dei siti salvate vengono cancellati. I tuoi preferiti non vengono toccati.

Creato da uno sviluppatore indipendente: nessuna azienda, nessuna pubblicità, nessun account. Disponibile in 12 lingue. Temi chiaro, scuro e di sistema.

Documentazione: https://docs.bookmark-scout.com
```

## Full description: Firefox Add-ons

```text
Bookmark Scout salva ogni pagina nella cartella giusta in pochi secondi, dalla barra degli strumenti o con una sola scorciatoia da tastiera, poi ti aiuta a trovare e organizzare i tuoi preferiti senza uscire dal browser. Gratuito, senza account e senza pubblicità.

SALVA NELLA CARTELLA GIUSTA IN POCHI SECONDI
• Fai clic sul pulsante di Bookmark Scout, digita parte del nome di una cartella qualsiasi, anche una annidata in profondità nell'albero, e salvaci la pagina senza staccare le mani dalla tastiera
• Digita un percorso come ai/llms; anche con un piccolo errore di battitura la cartella viene trovata, e le cartelle usate di recente compaiono per prime
• Una pagina già presente in quella cartella non viene salvata due volte
• L'IA facoltativa suggerisce la cartella migliore per la pagina, oppure una nuova cartella che controlli prima che venga creata
• Salva i link dal menu contestuale nelle cartelle recenti, dopo aver attivato Menu contestuale nelle Impostazioni

SCORCIATOIE DI SALVATAGGIO RAPIDO
• Premi ⌥⇧S su Mac (Alt+Shift+S su Windows e Linux) su qualsiasi pagina per salvarla senza aprire Bookmark Scout: per impostazione predefinita nella cartella che corrisponde meglio alla pagina (calcolata sul tuo dispositivo), oppure nell'ultima cartella usata o in una che scegli tu
• Una piccola notifica nella pagina indica dove è stata salvata, con Annulla e altre cartelle in cui spostarla
• Con l'IA attiva, ⌥⇧D su Mac (Alt+Shift+D su Windows e Linux) salva la pagina nella prima cartella suggerita dall'IA
• Cambia i tasti in Impostazioni > Salvataggio e ricerca > Scorciatoie da tastiera

TROVA I TUOI PREFERITI
• Cerca in tutti i tuoi preferiti mentre digiti, direttamente dalla barra degli strumenti
• Albero delle cartelle con trascinamento, espandi e comprimi tutto e nuove cartelle
• Lo stesso albero, la ricerca e le cartelle corrispondenti nella barra laterale di Firefox, che resta aperta mentre navighi
• Eliminazione con conferma (attiva per impostazione predefinita) e Annulla per 10 secondi

GESTIONE PREFERITI
Apri gestione preferiti, nel popup della barra degli strumenti o nella barra laterale, apre una gestione completa in una nuova scheda, con un albero delle cartelle e una tabella ordinabile.
• Menu contestuali su preferiti, cartelle e spazio vuoto: modifica, rinomina, taglia, copia, incolla, apri, mostra nella cartella ed elimina
• Trascina per spostare i preferiti nelle cartelle o riordinarli; i link trascinati da altre pagine diventano preferiti
• Seleziona più righe con Cmd+clic e Shift+clic, copia, taglia e incolla con i tasti abituali, e annulla e ripeti le modifiche con ⌘Z e ⇧⌘Z su Mac (Ctrl+clic, Ctrl+Z e Ctrl+Shift+Z su Windows e Linux)

COSA TI CHIEDERÀ FIREFOX, E PERCHÉ
All'installazione, Firefox chiede una sola cosa: "Leggere e modificare i segnalibri". Tutto il resto viene chiesto solo quando usi la funzione che ne ha bisogno, dopo una breve spiegazione. Se rispondi di no, resta disattivata solo quella funzione.
• "Accedere alle schede del browser": solo per salvare la pagina corrente o ricevere suggerimenti di cartelle dalla barra laterale. Il pulsante nella barra degli strumenti e la scorciatoia di salvataggio rapido non richiedono autorizzazioni
• Attivazione dell'IA: Firefox chiede di condividere "informazioni di autenticazione, segnalibri, attività di navigazione" (la tua chiave API, i tuoi preferiti e le cartelle, e il titolo e l'indirizzo della pagina corrente). Il suo messaggio dice che lo sviluppatore vuole raccoglierli; qui significa il servizio di IA che hai scelto, che li riceve direttamente dal tuo browser. Nulla arriva a Bookmark Scout
• Leggi il contenuto delle pagine: "Accedere ai dati di tutti i siti web" e condividere "contenuti dei siti web" con il tuo servizio di IA
• Verifica servizio: accesso all'indirizzo del tuo servizio di IA e condivisione delle "informazioni di autenticazione" (la tua chiave API) con esso

PRIVACY
• Nessun account, nessuna analisi, nessun tracciamento, nessuna pubblicità
• I tuoi preferiti restano nel browser
• Le impostazioni che modifichi, i tuoi prompt personalizzati e Su di me si sincronizzano tramite Firefox Sync, se attivato

SUGGERIMENTI DI CARTELLE CON IA FACOLTATIVI (DISATTIVATI PER IMPOSTAZIONE PREDEFINITA)
L'IA è facoltativa e tutto quanto descritto sopra funziona senza. Per usarla ti serve un account presso un'azienda di IA, che potrebbe addebitare una piccola somma a ogni utilizzo, oppure un programma di IA gratuito sul tuo computer. Attiva l'IA nelle Impostazioni e aggiungi il servizio che hai scelto. Bookmark Scout suggerisce quindi cartelle per la pagina corrente, nel popup o con la scorciatoia di salvataggio rapido con IA, e può creare una nuova cartella dopo che l'hai controllata.

Quando chiedi dei suggerimenti, il titolo e l'indirizzo della pagina corrente e i nomi delle tue cartelle vengono inviati direttamente dal browser al servizio di IA che hai scelto, secondo i termini di quel servizio, e, solo se attivi Leggi il contenuto delle pagine, anche il testo della pagina. Nulla viene inviato a Bookmark Scout. La tua chiave API è conservata nello spazio di archiviazione locale delle estensioni di questo browser e non viene sincronizzata. L'uso di un servizio di IA potrebbe avere un costo.

IMPOSTAZIONI E BACKUP
• Esegui il backup delle impostazioni, in fondo alle Impostazioni, salva un file con le impostazioni che hai modificato, i prompt personalizzati, Su di me, i servizi IA (mai le loro chiavi) e le ricerche salvate. Ripristina le impostazioni li riporta indietro
• Vengono salvate solo le impostazioni che modifichi, così i valori predefiniti migliorati delle versioni successive ti arrivano comunque

PER SVILUPPATORI
• Opzioni di ricerca: maiuscole/minuscole, parola intera ed espressioni regolari
• I servizi IA possono essere provider di IA nel cloud, qualsiasi endpoint compatibile con OpenAI o un server di modelli sul tuo computer
• Open source con licenza AGPL-3.0: https://github.com/isandrel/bookmark-scout

AGGIORNAMENTO DA UNA VERSIONE PRECEDENTE
La versione 0.3.3 salva i dati in un nuovo formato e non converte quelli precedenti: le impostazioni tornano ai valori predefiniti, i servizi IA e le chiavi API vanno aggiunti di nuovo, e prompt personalizzati, ricerche salvate, tag, riassunti e icone dei siti salvate vengono cancellati. I tuoi preferiti non vengono toccati.

Creato da uno sviluppatore indipendente: nessuna azienda, nessuna pubblicità, nessun account. Disponibile in 12 lingue. Temi chiaro, scuro e di sistema.
```

## What's new in 0.3.3

Translation of the English release notes; paste into AMO's release notes for 0.3.3.

```text
• Salvataggio rapido: premi ⌥⇧S su Mac (Alt+Shift+S su Windows e Linux) su qualsiasi pagina per salvarla nella cartella che le corrisponde meglio. Una notifica nella pagina indica dove è stata salvata, con Annulla e altre cartelle in cui spostarla. Con l'IA attiva, ⌥⇧D su Mac (Alt+Shift+D su Windows e Linux) salva nel primo suggerimento dell'IA
• Gestione preferiti: menu contestuali, trascinamento, taglia, copia e incolla, selezione di più righe, annulla e ripeti
• Chiedi all'IA può salvare pagine e proporre spostamenti, ridenominazioni, eliminazioni e nuove cartelle che non cambiano nulla finché non li approvi, e ogni modifica può essere annullata. Le risposte possono terminare con pulsanti su cui fare clic
• Scegli quali comandi mostrano i menu della gestione preferiti e cosa può fare Chiedi all'IA
• Esporta nelle Impostazioni ora salva un backup che puoi importare
• Questo aggiornamento azzera i dati salvati di Bookmark Scout: le impostazioni tornano ai valori predefiniti, e servizi IA e chiavi API, prompt personalizzati, ricerche salvate, tag e riassunti vanno configurati di nuovo. I tuoi preferiti non vengono toccati
```

## Category

Same as `en.md`. Stores set the category once for all locales.

## Support and links

Same as [`en.md`](en.md#support-and-links). Where a store accepts a value per locale, use the Italian pages:

| Field | Value |
| --- | --- |
| Support URL | https://bookmark-scout.com/it/support/ |
| Privacy policy URL | https://bookmark-scout.com/it/privacy/ |
| Support email | support@bookmark-scout.com |
