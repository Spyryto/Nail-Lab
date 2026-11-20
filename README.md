# Nail Lab

**PWA mobile portrait** per studiare storia e architettura di [NailLang](https://github.com/Spyryto/NailLang).

## Prima iterazione

- Quattro sezioni a schermata singola: **Leggi**, **Scrivi**, **Esplora**, **Storia**.
- Lezione sul vero Core AST a cinque costruttori.
- Editor CodeMirror 6 e salvataggio locale automatico in IndexedDB.
- Esecuzione reale in Web Worker con il bundle ufficiale NailLang **v0.54**, scaricato dalla release GitHub.
- Ispezione con le API autentiche `NailSeed.expand` (forma testuale del Core espanso) e `NailSeed.analyze` (simboli, diagnostica, riferimenti e tipi).
- PWA installabile, cache offline e avviso di aggiornamento.
- GitHub Actions: build Haxe, test del runtime Nail e deploy su Pages dopo merge in main.

**Non ancora inclusi:** runtime di *tutte* le release, AST ad albero interattivo, bytecode strutturato e VM step-by-step. Non presentiamo dati inventati come se fossero prodotti dal compilatore.

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

Indirizzo previsto *dopo attivazione e deploy riuscito*: https://spyryto.github.io/Nail-Lab/

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
2. Catalogo esaustivo delle versioni, relativi runtime e lezioni.
3. Esploratore bytecode con collegamenti al sorgente.
4. Debugger VM con step, ambiente, stack e closure.
5. Strumenti prodotti in Nail stesso.

La cronologia Git del repository NailLang è una **ricostruzione pubblica** della storia di NailSeed, non la storia privata originale. Non attribuiamo intenzioni storiche non documentate.
