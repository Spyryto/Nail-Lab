# Nail Lab

**PWA mobile portrait** per studiare storia e architettura di [NailLang](https://github.com/Spyryto/NailLang).

## Cosa fa oggi

- Quattro sezioni a schermata singola: **Leggi**, **Scrivi**, **Esplora**, **Storia**.
- Lezione sul vero Core AST a cinque costruttori.
- Editor CodeMirror 6 e salvataggio locale automatico in IndexedDB, con una bozza distinta per ogni versione; il selettore conserva anche la scelta alla riapertura.
- Selezione del compilatore/runtime reale **v0.54, v0.60 oppure v0.61**, con bundle ufficiali scaricati dalle rispettive release GitHub; ogni versione gira in un Web Worker separato.
- Ispezione con le API autentiche `NailSeed.expand` (forma testuale del Core espanso) e `NailSeed.analyze` (simboli, diagnostica, riferimenti e tipi).
- PWA installabile, cache offline e avviso di aggiornamento.
- GitHub Actions: build Haxe, test del runtime Nail e deploy su Pages dopo merge in main.

**Non ancora inclusi:** runtime di *tutte* le release (v0.54, v0.60 e v0.61 sono verificate per il browser), AST ad albero interattivo, bytecode strutturato e VM step-by-step. Non presentiamo dati inventati come se fossero prodotti dal compilatore.

## Selettore delle versioni

Nella sezione **Scrivi** scegli fra Nail **v0.54**, **v0.60** e **v0.61**. La scelta cambia davvero il bundle ufficiale utilizzato per il parsing, la compilazione interna ed esecuzione nella VM JavaScript: **non** è un transpiler Nail → JavaScript/PHP e non è una simulazione del linguaggio. Lo stesso runtime fornisce anche le API di analisi per la schermata **Esplora**, quando disponibili.

Ogni versione mantiene la propria bozza sul dispositivo. Cambiando versione non si riscrive automaticamente la sintassi di un programma: codice delle diverse versioni può comportarsi diversamente. La lezione storica sui cinque costruttori usa v0.54 e apre quella versione quando premi **Apri nell'editor**.

Questa prima integrazione supporta solo le tre distribuzioni browser **verificate**. Non carichiamo arbitrariamente un tag GitHub perché la presenza di una release non garantisce che esporti la stessa API. Il cache offline della PWA include tutti e tre i runtime; il download avviene durante la build, non durante ogni esecuzione.

## Nuovo in 0.61

L'editor usa **v0.61** come predefinita per le nuove installazioni. Le preferenze già salvate e le bozze delle versioni precedenti sono conservate. Il programma iniziale dimostra un'operazione nuova:

```nail
nail 0.61 ;
type Person { name Text age Float } ;
def getName data = data . name ;
getName { name = " Ada " , age = 19.0 } ;
getName ( Person " Mario " 46.0 ) ;
```

Il parametro non annotato è strutturale; se fosse annotato con `( data : Person )` si applicherebbe invece il vincolo nominale. L'esecuzione e la diagnostica usano **il runtime pubblicato da NailLang**, non codice JavaScript che simula i tipi.

## Interfaccia

- Restyling mobile con colori distintivi, superfici morbide e ombre leggere, **senza framework UI o dipendenze grafiche aggiuntive**.
- Nella sezione **Scrivi**, **Amplia/Riduci** aumenta lo spazio del codice; il pannello Risultato distingue esecuzione, successo ed errore.
- La schermata **Leggi** offre l'accesso diretto alla versione corrente, mentre la lezione sul Core AST continua ad aprire la sua versione storica 0.54.
- CI: test sul vero runtime 0.61, differenza fra record nominali/strutturali e smoke test in Chromium mobile, con screenshot allegati alla build per revisione visiva.

## Interfaccia chiara e diagnostica

Il Lab usa uno stile chiaro avorio/lavanda, il ciano come accento per le
etichette tecniche e un editor scuro con token ad alto contrasto. Le
sezioni della documentazione mostrano ora il codice Nail con colorazione
lessicale anche **fuori** da CodeMirror, senza eseguirlo o reinterpretarlo.

La home ha un solo invito principale ad aprire il laboratorio. La lezione
storica indica la versione 0.54, selezionabile dall'editor.

La barra sotto **Esegui** mostra:
- **Esecuzione riuscita**, con tempo misurato nel Worker per **analisi
  statica ed esecuzione complessiva**.
- **Errore**, con il messaggio autentico di Nail; il pulsante di salto
  continua a usare esclusivamente le coordinate fornite dal compilatore.

Il runtime espone `runPlain`, che include compilazione ed esecuzione.
Non descriviamo quindi il totale come tempo di sola compilazione.
Non sono stati aggiunti un parser Nail o un compilatore duplicato:
la colorazione dei frammenti non editabili è puramente visiva.

## Sviluppo locale

Prerequisiti: Haxe 4.3.7, Node.js 22, curl, unzip.

```sh
npm install
npm run fetch:runtime
npm run build
npm test
```

Servire la directory `dist/` tramite un server HTTP locale (non usare `file://`). L'app è statica e non necessita di backend né di CDN a runtime.

## CI e distribuzione

La workflow [pages.yml](.github/workflows/pages.yml) compila e verifica ogni PR. Su `main` distribuisce su GitHub Pages, dopo un build riuscito.

**Prima pubblicazione:** se Pages non è già abilitato, selezionare **Settings → Pages → Source → GitHub Actions**.

**App online:** https://spyryto.github.io/Nail-Lab/ (dopo deploy riuscito su `main`).

Un file `version.json` segnala nuove build; il service worker aggiorna la cache. La bozza è salvata prima di offrire il reload, quindi gli aggiornamenti non devono cancellare il programma dell'utente.

## Principi

- **Haxe** gestisce navigazione, eventi e integrazione col runtime.
- **CodeMirror** è solo il componente editor.
- La semantica Nail rimane nel suo compilatore/VM, **mai riscritta nel frontend**.
- La valutazione gira in un Worker con budget di passi, interrompibile dal pulsante. Un Worker, da solo, non è una sandbox di sicurezza completa.
- UI singola, portrait, senza layout desktop o tablet.
- Le API future di analisi devono essere riutilizzabili anche da CLI, VS Code, Language Server e test.

## Sviluppi successivi

1. API NailLang per AST strutturato e source spans verificabili.
2. Catalogo delle versioni e delle relative lezioni: aggiungere i runtime storici solo dopo aver verificato le API effettive, senza simulare la semantica delle vecchie release.
3. Esploratore bytecode con collegamenti al sorgente.
4. Debugger VM con step, ambiente, stack e closure.
5. Strumenti prodotti in Nail stesso.

La cronologia Git del repository NailLang è una **ricostruzione pubblica** della storia di NailSeed, non la storia privata originale. Non attribuiamo intenzioni storiche non documentate.
