# Correzioni dall'audit di affidabilità

30 agosto 2026. Sei bug dimostrati, più i test che li bloccano in futuro.
Niente altro.

## File modificati

| file | correzione |
|---|---|
| `src/App.jsx` | 1, 2, 4, 5 |
| `src/data/groups.js` | 2 |
| `src/utils/sincronizza.js` | 3, 6 |
| `src/installStorage.js` | 3, 6 |
| `src/utils/arretrate.js` | 4 |
| `src/utils/account.js` | **nuovo** — 5 |
| `eslint.config.js` | una riga: il blocco dei file di verifica non copriva `.jsx` |

## File nuovi di verifica

`verifica/gruppi.mjs`, `verifica/coda-utente.mjs`,
`verifica/annulla-lotto.mjs`, `verifica/account.mjs`,
`verifica/schermate.jsx`.

## Come si esegue tutto

```bash
npm run verifica          # controlli + persistenza + redesign, com'era
node verifica/gruppi.mjs
node verifica/coda-utente.mjs
TZ=Europe/Rome node verifica/annulla-lotto.mjs
node verifica/account.mjs
```

Il render delle schermate ha bisogno di un passaggio di build, perché
Node non legge JSX. Va lanciato dalla radice del progetto:

```bash
npx esbuild verifica/schermate.jsx --bundle --platform=node \
  --format=cjs --jsx=automatic --loader:.css=empty \
  --outfile=verifica/.schermate.cjs && node verifica/.schermate.cjs
```

`gruppi.mjs` e `schermate.jsx` hanno bisogno di `node_modules`: il primo
importa il client Supabase, il secondo React. Gli altri girano su Node
nudo come i tre di sempre. Per questo NON li ho agganciati a
`npm run verifica`: aggancarli vuol dire mettere `esbuild` fra le
devDependencies e cambiare lo script in `package.json`, cioè una
decisione che non è mia.

Aggiungere `verifica/.schermate.cjs` a `.gitignore` conviene.

## Le sei correzioni, in breve

**1 — `lotto.ts`.** `registraArretrate` costruiva il lotto senza gli
istanti, e `OggiScreen` li leggeva: eccezione in render, schermo bianco.
Adesso il lotto porta `ts: nuovi` (già ordinati da `distribuisci`) e
`riavvio`, che serve alla correzione 4.

**2 — tre esiti invece di due.** `groups.fetch`, `mine` e `fetchMembers`
non distinguevano «non c'è» da «non lo so», e un errore di rete faceva
uscire dai propri gruppi. Adesso `{ ok }` dice se la risposta è
affidabile e `{ gruppo }` cosa contiene. La regola che decide chi resta
è `smista`, funzione pura: un codice finisce fra i morti **solo** con
`ok: true` e `gruppo: null`. In `sync` c'è la categoria «incerto», che
non tocca niente — né la lista, né la schermata, né l'ora dell'ultimo
aggiornamento.

**3 — la coda sa di chi è.** Ogni voce è `{ uid, value }`. Allo
svuotamento le voci di altri account si **saltano**, non si consumano.
Le voci del formato vecchio si migrano ricavando il proprietario dalla
chiave tramite `uidDaChiave`, che sta in `installStorage.js` perché il
motore non deve sapere com'è fatta una chiave.

**4 — `annullaLotto` non riavvolge il tempo.** Si parte dallo stato
corrente e si seppelliscono solo gli identificativi del lotto. Da
`lotto.prima` si recuperano solo `start` e `tappeViste`, e nemmeno
quelli alla cieca: le tappe si rimettono indietro solo se il riferimento
è ancora quello che il lotto aveva installato.

**5 — nessuna falsa conferma.** `eliminaAccount` restituisce un esito e
dice cosa è riuscito. Una transazione non c'è e non è stata inventata:
si procede in ordine, ci si ferma al primo passo che fallisce, e la
lista locale dei gruppi resta coerente con le uscite già avvenute.

**6 — sessione assente non vuol dire consegnato.** La scrittura va in
coda, attribuita al proprietario della chiave, e viene consegnata quando
l'utente rientra.

## Numeri

| suite | prima | dopo |
|---|---|---|
| controlli | 311 | 311 |
| persistenza | 133 | 133 |
| redesign | 1004 | 1013 |
| gruppi | — | 25 |
| coda-utente | — | 26 |
| annulla-lotto | — | 23 |
| account | — | 22 |
| schermate | — | 26 |
| **totale** | **1.448** | **1.579** |

`npm run build`: verde. `npm run lint`: 0 errori, 83 warning (erano 82;
l'unico nuovo è `Componente` in `schermate.jsx`, che eslint non vede
usato perché sta dentro il JSX).

Ogni banco nuovo è stato lanciato anche contro il codice di prima, e
fallisce: 4 controlli su `schermate`, 14 su `gruppi`, 12 e 5 su
`coda-utente` (i due difetti separatamente), 6 su `annulla-lotto`, 14 su
`account`.
