# Rapporto della fase di igiene

31 agosto 2026. Nessuna funzione di prodotto aggiunta, nessun calcolo
toccato, nessuna regola ESLint disattivata, nessun test ammorbidito.

## La cosa più importante di questo rapporto

**Gli import da rimuovere non c'erano.** Dei 4 avvisi ESLint iniziali che
non erano falsi, zero riguardavano import inutilizzati: i 79 avvisi
`no-unused-vars` erano tutti falsi positivi.

ESLint da solo non sa che `<Check />` è un uso di `Check`. Vede
l'identificativo importato, non lo trova in nessuna espressione
JavaScript, e lo dichiara inutilizzato. Segnalava così `Check`, `Pianta`,
`OggiScreen`, `CampoTelefono`, perfino `App` dentro `main.jsx` — cioè la
riga che monta l'applicazione.

Seguendo alla lettera «rimuovi gli import realmente inutilizzati» si
smontava l'interfaccia riga per riga, con il lint che ringraziava. Ho
verificato ognuno prima di toccarlo (`grep -c "<Check"` → 3 usi, e così
via) e non ne ho rimosso nessuno, perché nessuno era inutilizzato.

La correzione vera è insegnare a ESLint a leggere il JSX:
`eslint-plugin-react` con la regola `react/jsx-uses-vars`. Da qui in poi
un avviso di import inutilizzato è vero, e ci si può contare.

## Risultato iniziale

| comando | esito |
|---|---|
| `npm ci` | 159 pacchetti, **2 vulnerabilità** (1 moderata, 1 alta) |
| `npm run build` | verde, 1661 moduli, 8,39 s |
| `npm run lint` | 0 errori, **83 avvisi** |
| `npm run verifica` | 311 + 133 + 1017 |
| `node verifica/gruppi.mjs` | 25 |
| `node verifica/coda-utente.mjs` | 49 |
| `TZ=Europe/Rome node verifica/annulla-lotto.mjs` | 41 |
| `node verifica/account.mjs` | 22 |
| `verifica/schermate.jsx` (via esbuild) | 30 stati |
| **totale** | **1.628** |

Gli 83 avvisi, classificati: 79 `no-unused-vars` (tutti falsi), 2
`react-hooks/exhaustive-deps` (veri), 2 direttive `eslint-disable` morte.

## Risultato finale

| comando | esito |
|---|---|
| `npm ci` | 238 pacchetti, **0 vulnerabilità** |
| `npm audit` | **found 0 vulnerabilities** |
| `npm run build` | verde, 2,19 s |
| `npm run lint` | **0 errori, 0 avvisi** |
| `npm run verifica` | 311 + 133 + 1017 = 1.461 |
| `npm run verifica:completa` | **1.628**, otto suite, nessun fallimento |

---

## File modificati

| file | cosa |
|---|---|
| `package.json` | `verifica:completa` e `verifica:schermate`; dipendenze aggiornate |
| `package-lock.json` | rigenerato da npm, coerente con `package.json` |
| `eslint.config.js` | `eslint-plugin-react` + `react/jsx-uses-vars`; tolta una frase ripetuta |
| `src/App.jsx` | `tick` porta l'istante; due dipendenze mancanti aggiunte; due soppressioni motivate |
| `src/auth/index.js` | tolta una direttiva `eslint-disable` morta |
| `src/data/groups.js` | tolta una direttiva `eslint-disable` morta |
| `README.md` | comandi reali, numeri reali, spiegazione della suite completa |
| `RAPPORTO-FASE-IGIENE.md` | questo file |

Nessun file sorgente è stato toccato oltre a questi. Calcoli, fusione,
sincronizzazione, code, annullamento dei lotti, account, Supabase,
migrazioni, Vite config, Germoglio: intatti.

---

## Le pulizie, una per una, e perché erano sicure

### 1. Due direttive `eslint-disable` morte — rimosse

`src/auth/index.js:23` e `src/data/groups.js:37` avevano
`// eslint-disable-next-line no-console` sopra due `console.warn`. Ma la
configurazione dice `'no-console': ['warn', { allow: ['warn', 'error'] }]`:
`console.warn` è già permesso, quindi le direttive non sopprimevano niente.
Erano ESLint stesso a segnalarle come inutili.

Sicura perché i commenti non hanno effetto a runtime, e il lint conferma
che non stavano nascondendo nulla.

### 2. `react-hooks/exhaustive-deps` in `App.jsx:1359` — risolto, non soppresso

```js
const conti = useMemo(() => calcolaConti(contiBase), [contiBase, tick, now]);
```

`tick` era `useState(0)` incrementato di uno al secondo, e **nessuno ne
leggeva il valore**: esisteva solo per comparire fra le dipendenze e far
ricalcolare `conti`. Dal punto di vista della regola era una dipendenza
inutile, e la regola aveva ragione — un battito che non porta l'ora non
dice niente al calcolo.

`calcolaConti(base, adesso = Date.now())` accetta già l'istante come
secondo parametro. Adesso `tick` porta l'istante in cui ha battuto e
glielo passa:

```js
const [tick, setTick] = useState(() => Date.now());
…
const adessoConti = Math.max(tick, now);
const conti = useMemo(() => calcolaConti(contiBase, adessoConti), [contiBase, adessoConti]);
```

Il `Math.max` non è un vezzo: `tick` batte ogni secondo ma **solo** nelle
schede Oggi e Percorso — l'effetto ha quel guardiano apposta, per non far
lavorare il telefono a vuoto — mentre `now` batte ogni quindici secondi
sempre. Prendendo il maggiore si riproduce esattamente il ritmo di prima:
un secondo dove i numeri si vedono, quindici dove non si vedono.

Sicura, con una precisazione onesta: prima l'istante era `Date.now()`
letto al momento del render, adesso è quello del battito, che può essere
fino a un secondo più vecchio. Il solo momento in cui i due differiscono
è il render immediatamente successivo a una sigaretta registrata, e la
differenza sul valore mostrato è `ritmo × 1s/86400s`, cioè meno di un
millesimo di sigaretta — invisibile dopo l'arrotondamento, e comunque
esatta un secondo dopo. In cambio il memo smette di leggere l'orologio al
suo interno, che è la cosa che lo rendeva impuro.

### 3. `react-hooks/exhaustive-deps` in `App.jsx:1443` — dipendenze aggiunte

Il memo del piano legge `ritmo.pronta` e `ritmo.valore` (riga
`const base = s?.mediaPrec ?? s?.media ?? (ritmo.pronta ? ritmo.valore : null)`)
ma non li aveva fra le dipendenze. Non è teoria: `ritmo` si ricalcola anche
quando cambia `oggiChiave`, cioè **al cambio di giorno**, e lì `dati` può
non essere cambiato affatto — il piano restava quello del ritmo di prima.

Sicura perché sono due primitivi, un booleano e un numero: entrano nelle
dipendenze senza portarsi dietro l'identità di un oggetto nuovo a ogni
render, quindi il memo si rifà quando cambia il ritmo e non a ogni giro.

### 4. Una frase ripetuta in `eslint.config.js` — tolta

«un lint che grida al lupo è un lint che nessuno guarda più» compariva in
due commenti a otto righe di distanza. Ne resta una, e il secondo blocco
rimanda al primo.

### 5. Codice morto — cercato, non trovato

Ho cercato funzioni e costanti mai raggiunte. Quello che salta fuori sono
**esporti** non consumati da altri file (`analizza`, `conScadenza`,
`promessaVera` in `sincronizza.js`, `fondiVisti` in `fusione.js`, e altri):
non sono codice morto, sono funzioni vive usate dentro il proprio modulo ed
esportate perché un banco di prova possa raggiungerle. Toglierne l'`export`
andrebbe contro il modo in cui questo progetto si verifica, quindi non l'ho
fatto.

Con `react/jsx-uses-vars` attivo, ESLint adesso segnala **zero**
`no-unused-vars`: non c'è un solo import o una sola variabile locale
inutilizzata in tutto il progetto.

---

## Il comando unico

```bash
npm run verifica:completa
```

Mette in fila le otto suite e si ferma alla prima che fallisce:

```
npm run verifica
  && node verifica/gruppi.mjs
  && node verifica/coda-utente.mjs
  && TZ=Europe/Rome node verifica/annulla-lotto.mjs
  && node verifica/account.mjs
  && npm run verifica:schermate
```

`npm run verifica` è rimasto **identico**: stessi tre giri, stesso
significato, sempre eseguibile con Node puro senza installare niente.

`npm run verifica:schermate` incapsula il comando esbuild che prima stava
solo dentro `CORREZIONI-AUDIT.md` e andava ricordato a mano. `esbuild` è
ora una devDependency dichiarata, quindi il comando è riproducibile da
`npm ci` e non dipende più da cosa `npx` trova in cache.

---

## Dipendenze aggiornate

| pacchetto | prima | dopo | perché |
|---|---|---|---|
| `vite` | ^5.4.8 | ^8.2.2 | GHSA-67mh-4wv8-2f99 via esbuild |
| `@vitejs/plugin-react` | ^4.3.2 | ^6.1.1 | compatibilità con Vite 8 |
| `esbuild` | — | ^0.28.2 | nuova, per `verifica:schermate` |
| `eslint-plugin-react` | — | ^7.37.5 | nuova, per `react/jsx-uses-vars` |

`npm audit` prima: 2 vulnerabilità (1 moderata, 1 alta), entrambe da
esbuild ≤ 0.24.2 trascinato da Vite — il difetto per cui qualsiasi sito
può interrogare il server di sviluppo e leggerne la risposta. `npm audit
fix --force` avvertiva che la correzione passa da Vite 8, cambio
incompatibile.

L'ho fatto e ho verificato: `vite.config.js` gira senza modifiche, plugin
`stubCapacitor` compreso. Vite 8 usa rolldown al posto di rollup, quindi
il bundle è cambiato — **in meglio**: da 529,86 kB a 510,47 kB, gzip da
154,36 a 148,42 kB, e la build da 8,39 s a 2,19 s. Tutte e 1.628 le
verifiche passano, comprese le 30 schermate montate per davvero con React.

`npm audit` dopo: **found 0 vulnerabilities**.

---

## Cosa resta aperto

**Due `eslint-disable-next-line react-hooks/exhaustive-deps` in `App.jsx`,
alle righe dell'effetto delle notifiche di gruppo e dell'effetto delle
tappe del corpo.** Non le ho tolte, e non le ho toccate: sono portanti.

- La prima tiene la scansione dei conteggi del gruppo separata dai cambi
  del registro personale. Allargare la lista vuol dire rifare la scansione
  a ogni sigaretta registrata da noi.
- La seconda protegge un effetto che chiama `salva({ ...dati, tappeViste })`
  come ultima riga: mettere `dati` fra le dipendenze lo fa rientrare subito
  dopo essere uscito.

Erano mute. Adesso ognuna ha sopra il motivo scritto, così chi le incontra
fra sei mesi sa perché ci sono invece di toglierle per far tacere il
linter. Cambiarle significa cambiare quando arrivano le notifiche, e
quello si prova con due telefoni, non con il lint: è lavoro del collaudo
reale, non di questa fase.

**Un avviso di build resta**: il chunk sopra i 500 kB. È quello di sempre,
già presente prima, e si toglie solo con il code splitting — che è un
cambio architetturale, fuori da questa fase.

**Non ho eseguito**: nessun collaudo su dispositivo reale, nessuna verifica
contro il Supabase vero, nessuna prova di `npm run dev` con Vite 8 nel
browser (l'ambiente non ha un browser). La build di produzione e tutte le
suite passano; il server di sviluppo di Vite 8 non l'ho visto girare.
Vale la pena lanciarlo una volta prima del collaudo sui due telefoni.
