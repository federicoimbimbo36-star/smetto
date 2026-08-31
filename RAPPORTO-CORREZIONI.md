# Rapporto delle correzioni

31 agosto 2026. Quattro difetti, tutti riprodotti con codice in esecuzione
prima di essere toccati, tutti con un controllo che boccia la versione di
prima. Niente altro: nessun refactor estetico, nessuna funzionalità nuova,
nessuna regola del linter disattivata, nessun test ammorbidito per farlo
passare.

## Premessa sulla base di partenza

L'archivio `smetto-unificato-pronto-collaudo.zip` non è arrivato. In
`uploads/` c'erano due file:

- `smetto-germoglio.zip` — progetto completo, radice `smetto/`
- `smetto-correzioni-audit.zip` — il solo delta dell'audit di affidabilità:
  6 sorgenti modificati, `src/utils/account.js` nuovo, `CORREZIONI-AUDIT.md`
  e i cinque banchi nuovi

Ho ricostruito l'unificato sovrapponendo il delta alla base. La
sovrapposizione combacia esattamente con l'inventario dichiarato in
`CORREZIONI-AUDIT.md` — 7 file sovrascritti, 6 nuovi, zero conflitti — e i
numeri di partenza combaciano al singolo controllo: **1.579 superati**,
build verde, lint 0 errori e 83 warning. Sono le cifre di quel documento.
Se l'archivio unificato conteneva qualcosa in più, questa base va rifatta.

---

## 1 — Gli identificativi del lotto presi per posizione

**Errore riprodotto.** Due sigarette fumate oggi. Stasera segno tre
arretrate nella finestra «Ieri». Tocco «Annulla» sulla card del lotto:

```
le 3 di ieri sono sparite?              : false
le 2 di oggi ci sono ancora?            : false
sigarette di OGGI seppellite per sbaglio: 2
```

Le due sigarette vere di oggi vengono cancellate **con la lapide**, quindi
non tornano né dal database né dall'altro telefono. Le tre arretrate
restano dentro. È l'inverso esatto di quello che il pulsante promette.

**Causa.** `src/App.jsx` prendeva gli identificativi del lotto contando le
posizioni:

```js
const idsLotto = next.eventi.slice(primaDiTutto.eventi?.length || 0).map((e) => e.id);
```

Ma `aggiungiEvento` **riordina** `eventi` per istante — apposta, perché
`start` si legge come `cigs[0]` e il registro si mostra dal più recente.
Le arretrate di ieri finiscono in mezzo alla lista, non in fondo, e lo
`slice` restituisce gli ultimi tre **per istante**: le sigarette di oggi.

Lo stesso errore, in forma singola, stava alla riga 806:

```js
const idSigaretta = next.eventi[next.eventi.length - 1].id;
```

A parità di millisecondo l'ordine lo decide l'identificativo, quindi un
evento arrivato dall'altro dispositivo nello stesso millisecondo poteva
finire dopo: la finestra dei 25 secondi si ritrovava l'id sbagliato e
«Annulla» cancellava la sigaretta dell'altro telefono. Due istanti uguali
non sono un'ipotesi in questo codice — `distribuisci` è una funzione pura,
e due dispositivi che segnano «ieri, 10 sigarette» producono dieci istanti
identici al millisecondo. È scritto nell'intestazione di `fusione.js`.

**Perché i banchi non lo vedevano.** `verifica/annulla-lotto.mjs` aveva
**ricopiato la riga difettosa** dentro il suo finto App, invece di chiamare
la funzione vera. Un banco che riscrive la regola verifica se stesso. E
provava solo finestre più recenti della sigaretta già registrata, dove la
posizione per caso coincide con l'identità.

**File modificati.**

| file | cosa |
|---|---|
| `src/utils/fusione.js` | nuova `idsAggiunti(prima, dopo)` — differenza per identificativo |
| `src/utils/arretrate.js` | nuova `costruisciLotto(prima, dopo, {…})`, unica sorgente della forma del lotto |
| `src/App.jsx` | usa il costruttore; `idsAggiunti` anche per la registrazione singola |
| `verifica/annulla-lotto.mjs` | il finto App chiama le funzioni vere, non le ricopia |
| `verifica/schermate.jsx` | il patto si controlla dove l'oggetto nasce davvero |

La ricaduta prodotta dal lotto ora rientra sempre fra gli `ids`, quindi
annullando il lotto sparisce con le sigarette che l'hanno causata:
`ripartenze` si conta come `ripartenzeBase + ricadute.length`, e lasciarne
indietro una vorrebbe dire una ripartenza mai successa.

**Controlli aggiunti.** `verifica/annulla-lotto.mjs` sezioni 4 e 5 (18
controlli nuovi), `verifica/schermate.jsx` 4 controlli nuovi sul patto.

**Controprova.** Rimettendo la sola logica posizionale dentro
`idsAggiunti`, a firme invariate:

```
33 controlli superati, 8 falliti
  ✗ ieri · gli ids del lotto NON sono gli ultimi tre per posizione
  ✗ ieri · nessuna sigaretta di oggi e' finita nel lotto
  ✗ ieri · LA PRIMA SIGARETTA DI OGGI C'E' ANCORA
  ✗ ieri · LA SECONDA SIGARETTA DI OGGI C'E' ANCORA
  ✗ ieri · nessuna sigaretta di oggi e' stata seppellita
  ✗ ieri · le tre arretrate sono sparite davvero
  ✗ stesso ms · idsAggiunti prende quello appena registrato
  ✗ stesso ms · annullando resta la sigaretta dell'altro dispositivo
```

E contro `App.jsx` / `arretrate.js` originali, `schermate.jsx` riporta
`22 stati renderizzati, 8 rotti`.

---

## 2 — `set()` non controllava di chi fosse la chiave

**Errore riprodotto.** Rete funzionante, sessione già passata a B, chiave
ancora di A:

```
righe scritte sul database: [ 'utente-B|smetto:log:utente-A' ]
la coda ha trattenuto la scrittura? 0
```

Il registro di A finisce sotto l'account di B senza nemmeno sfiorare la
coda. Con `delete` è peggio: la cancellazione veniva **inghiottita in
silenzio** — l'utente cancella i suoi dati, l'app dice fatto, e sul
database restano.

**Causa.** La correzione 3 dell'audit aveva blindato la coda, ma solo la
coda. `set()` e `delete()` prendevano `uid` da `remoto.utente()` e
scrivevano, qualunque chiave fosse. E le due cose non cambiano nello stesso
istante: la chiave la compone `installStorage.js` dallo stato dell'app,
`uid` arriva dalla sessione Supabase. La RLS non poteva difendere — la
policy guarda `user_id`, e B stava scrivendo righe sue.

**File modificati.** `src/utils/sincronizza.js` (`set` e `delete`): se
`uidDaChiave(key)` esiste e non è la sessione corrente, la scrittura si
accoda al proprietario invece di partire. Le chiavi senza proprietario
riconoscibile passano come prima. La copia locale viene scritta comunque:
la durabilità non si sacrifica.

**Controlli aggiunti.** `verifica/coda-utente.mjs` sezione 6, 13 controlli.

---

## 3 — `caricaCoda` alzava la bandiera prima di aver letto il disco

**Errore riprodotto.** Tre scritture offline in attesa sul disco, l'app che
si avvia e registra una sigaretta mentre il disco sta ancora rispondendo:

```
voci ancora sul disco: 1 → scritture offline PERSE
voci in memoria:       1
```

Perse da entrambe le parti. In un componente il cui unico scopo dichiarato
è la durabilità.

**Causa.** `codaCaricata = true` stava **prima** dell'`await`:

```
caricaCoda()  → bandiera alzata, si mette ad aspettare il disco
set()         → `await caricaCoda()` torna SUBITO, la mappa è vuota
              → accoda() → salvaCoda() riscrive la coda con la sola voce nuova
il disco risponde → e rilegge la coda già troncata
```

Non è una gara stretta: `installStorage.js` chiama `caricaCoda()` **senza
await** al caricamento del modulo, quindi ogni scrittura fatta nei primi
millisecondi dell'app cade esattamente lì.

**File modificati.** `src/utils/sincronizza.js`: la bandiera booleana
diventa la promessa condivisa della prima lettura. Chi arriva secondo
aspetta la stessa lettura invece di scavalcarla.

**Controlli aggiunti.** `verifica/coda-utente.mjs` sezione 7, 10 controlli.

**Controprova (difetti 2 e 3 insieme).** Rimettendo `sincronizza.js` com'era:

```
35 controlli superati, 14 falliti
  ✗ diretta · il registro di A NON finisce sotto l'account di B
      sotto B ci sono 2 sigarette di A
  ✗ diretta · nessuna riga estranea sul database        atteso 0, ottenuto 1
  ✗ diretta · la scrittura e' stata trattenuta in coda  atteso 1, ottenuto 0
  ✗ diretta · A rientra e il registro arriva al SUO account
  ✗ diretta · l'account di B resta pulito
  ✗ cancella · la cancellazione e' in coda, non eseguita
  ✗ cancella · A rientra e la cancellazione parte davvero  atteso null, ottenuto 3
  ✗ carica · sul disco ci sono ancora tutte e tre le voci  atteso 3, ottenuto 1
  ✗ carica · la voce dell'altro account e' ancora li'
  ✗ carica · e quella dei visti pure
  ✗ carica · in memoria ci sono tutte e tre               atteso 3, ottenuto 1
  ✗ carica · dopo la lettura il disco non ha perso niente atteso 3, ottenuto 1
  ✗ carica · e la mappa dei visti
  ✗ carica · la voce di B resta in attesa del suo proprietario
```

---

## 4 — Il comando documentato rompeva `npm run lint`

**Errore riprodotto.** Eseguendo, nell'ordine, i comandi scritti in
`CORREZIONI-AUDIT.md`:

```
lint prima del comando esbuild : 83 problems (0 errors, 83 warnings)
lint dopo  il comando esbuild  : 317 problems (234 errors, 83 warnings)
```

**Causa.** Il comando documentato scrive `verifica/.schermate.cjs` dentro
il progetto: 1,6 MB di fascio minificato che contiene React intero. ESLint
lo trova, non lo riconosce come file di verifica — il blocco dedicato
copre `.mjs`, `.js` e `.jsx`, non `.cjs` — e lo lint con i globali del
browser. `CORREZIONI-AUDIT.md` suggeriva di metterlo in `.gitignore`, ma
non era stato fatto, e comunque `.gitignore` non basta: la configurazione
flat di ESLint non lo legge.

**File modificati.** `eslint.config.js` (aggiunto agli `ignores`),
`.gitignore` (aggiunto, come suggerito).

**Controllo.** È il lint stesso: con il fascio presente,
`npm run lint` → 0 errori.

---

## Esiti, per intero

Node v22.22.2, npm 10.9.7, dipendenze da `npm ci` sul `package-lock.json`
del progetto.

| comando | esito |
|---|---|
| `npm ci` | 159 pacchetti, nessun errore |
| `npm run build` | ✅ verde — `dist/` prodotto, 1661 moduli, 8,49 s |
| `npm run lint` | ✅ **0 errori**, 83 warning |
| `npm run verifica` | ✅ 311 + 133 + 1017 |
| `node verifica/gruppi.mjs` | ✅ 25 |
| `node verifica/coda-utente.mjs` | ✅ 49 |
| `TZ=Europe/Rome node verifica/annulla-lotto.mjs` | ✅ 41 |
| `node verifica/account.mjs` | ✅ 22 |
| `verifica/schermate.jsx` (via esbuild, comando documentato) | ✅ 30 stati |

L'unico warning sulla build è quello di sempre sulla dimensione del chunk,
già presente prima.

| suite | prima | dopo |
|---|---|---|
| controlli | 311 | 311 |
| persistenza | 133 | 133 |
| redesign | 1013 | 1017 |
| gruppi | 25 | 25 |
| coda-utente | 26 | **49** |
| annulla-lotto | 23 | **41** |
| account | 22 | 22 |
| schermate | 26 | **30** |
| **totale** | **1.579** | **1.628** |

I quattro controlli in più di `redesign` non sono stati scritti a mano: quel
banco verifica che ogni import si risolva, e gli import nuovi sono quattro.

## Cosa NON è stato toccato

Calcoli matematici (`conti.js`, `format.js`, `REGOLE-MATEMATICHE.md`
D1–D14 e scenari A–G), persistenza offline e multi-dispositivo, la
fusione CRDT, la rete incerta nei gruppi (`smista` e i tre esiti),
l'eliminazione account, il backend Supabase e le migrazioni, la
configurazione di Vite, il design Germoglio. Nessun test è stato
ammorbidito: `schermate.jsx` è stato riagganciato alla nuova sorgente di
verità ed è uscito **più** stretto di prima, con tre controlli in più che
impediscono al difetto 1 di rientrare dalla finestra.

## Una nota, non una correzione

`verifica/schermate.jsx` resta fuori da `npm run verifica`, come deciso
nell'audit precedente: agganciarlo vuol dire mettere `esbuild` fra le
devDependencies e cambiare `package.json`. Non è una decisione mia. Ma
adesso quel banco è l'unico che controlla che il lotto non torni a essere
composto a mano, quindi vale la pena di ricordarsene: se un giorno viene
agganciato, quei tre controlli girano a ogni `npm run verifica`.
