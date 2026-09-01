# Smetto

Un percorso personale verso una vita senza fumo: scendi un po' ogni settimana,
da solo o — meglio — con qualcuno che ti guarda.

## Avviare l'app

```bash
npm install
npm run dev
```

Poi apri l'indirizzo che stampa Vite (`http://localhost:5173`). Vite parte con
`host: true`, quindi stampa anche un indirizzo tipo `http://192.168.x.x:5173`:
quello lo puoi aprire dal telefono, se è sulla stessa rete di casa.

```bash
npm run build             # produce dist/
npm run preview           # serve dist/ come in produzione
npm run lint              # 0 errori, 0 avvisi
npm run verifica          # calcoli + persistenza + interfaccia: 1489 controlli
npm run verifica:completa # tutto quanto: 1932 controlli + le schermate
```

### `npm run verifica:completa`

È il comando da lanciare prima di toccare qualsiasi cosa. Mette in fila tutte
le suite, comprese quelle che prima andavano ricordate a mano, e si ferma alla
prima che fallisce:

| suite | cosa guarda | controlli |
|---|---|---|
| `controlli.mjs` | i calcoli | 311 |
| `persistenza.mjs` | che i dati non spariscano | 133 |
| `redesign.mjs` | markup, CSS, accessibilità | 1045 |
| `gruppi.mjs` | rete incerta e classifica | 25 |
| `coda-utente.mjs` | code attribuite all'utente, scritture offline | 49 |
| `annulla-lotto.mjs` | annullamento delle registrazioni arretrate | 41 |
| `account.mjs` | eliminazione dell'account | 22 |
| `affidabilita.mjs` | gare di sessione, uscita e rientro nei gruppi, gare fra programmazione e annullamento notifiche, letture altrui, pareggi, gruppi sciolti, gare della sincronizzazione, logout fra schede dello stesso browser, risveglio delle schede sospese, scope del logout | 306 |
| `schermate.jsx` | ogni schermata renderizzata davvero | 42–44 stati * |
| | **totale** | **1932** + le schermate |

\* `schermate.jsx` parte da `Date.now()` e gira senza `TZ` fissa, quindi alcuni
controlli scattano o no a seconda dell'ora: il numero oscilla fra 42 e 44 nella
stessa giornata. Non è un problema di correttezza — non fallisce mai — ma è il
motivo per cui qui non c'è un totale unico. Rendere anche questa suite
deterministica è un lavoro a sé, non fatto.

`npm run verifica` resta quello di sempre — calcoli, persistenza, interfaccia —
e continua a girare con Node puro senza installare niente. Le altre suite hanno
bisogno delle dipendenze: `annulla-lotto` e `coda-utente` importano il motore di
sincronizzazione, `affidabilita` monta due `GoTrueClient` veri di
`@supabase/auth-js` (perché il logout fra schede su un Supabase finto sembrava
funzionare anche quando in Safari non funzionava), e `schermate` monta React per
davvero, quindi passa da
`esbuild` (che sta nelle devDependencies apposta, così il comando è
riproducibile). Gira anche da solo con `npm run verifica:schermate`.

`npm run verifica` fa tre giri.

`verifica/controlli.mjs` (311) controlla i **calcoli**, sui punti dove i bug
c'erano davvero — confini di giornata attorno al cambio d'ora, ritmo di
partenza che non deve muoversi, medie che non devono cambiare nel corso della
giornata, una sola formula per le sigarette risparmiate, numerazione delle
settimane del piano, calcolo del calo in classifica, soglia della ricaduta,
composizione del numero di telefono col prefisso, collocazione oraria delle
sigarette segnate in ritardo, coerenza fra le cifre delle due card del
Percorso — ed è scritto in modo da **fallire** con il codice di prima. Deve girare con `TZ=Europe/Rome`,
altrimenti quelli sull'ora legale non provano niente; lo script imposta il fuso
da solo.

`verifica/persistenza.mjs` (133) controlla che **i dati non spariscano**. Non
mima una rete che funziona: costruisce un database finto che fa i dispetti veri
— risponde in ritardo, non risponde affatto, risponde quando ormai qualcun altro
ha scritto — e due dispositivi che ci parlano insieme. Due telefoni con cento
sigarette a testa che ne registrano una ciascuno devono finire a 102, non a 101;
una registrazione fatta offline deve sopravvivere alla chiusura dell'app; una
risposta lenta non deve poter cancellare quello che è stato scritto nel
frattempo; una sigaretta cancellata non deve tornare dall'altro dispositivo. In
fondo c'è un banco a centoventi mosse casuali fra due dispositivi che vanno e
vengono dalla rete: alla fine il conto deve tornare esatto. Con il codice di
prima ne fallivano **15**.

La seconda metà del file riguarda l'**identità degli eventi**: due sigarette
allo stesso millisecondo devono restare due, e la stessa sigaretta ritrasmessa
dieci volte deve restare una. Con l'identità vecchia — il millisecondo — ne
fallivano **19**, e nel banco più duro (sessanta registrazioni distribuite su
tre soli istanti) ne sopravvivevano tre.

L'ultima sezione riguarda la **cancellazione**: `aggiorna` dichiarava da quale
revisione partiva, `cancella` no, quindi una cancellazione con una revisione
vecchia poteva portarsi via il lavoro di un altro dispositivo. Con il DELETE
secco di prima ne fallivano **7**. Vedi `PERSISTENZA.md`.

`verifica/redesign.mjs` (1045) controlla l'**interfaccia**: tag JSX e parentesi
bilanciate, componenti importati davvero, import mai usati, costanti usate prima
di essere dichiarate, ogni classe scritta nel markup esistente in `styles.css`
(e viceversa), contrasto WCAG AA di ogni coppia testo/fondo, bersagli tattili da
44px, `prefers-reduced-motion`, focus visibile, safe area. Anche questo è stato
provato rompendo il codice apposta: sette guasti diversi, sette fallimenti.

## Come è fatta

```
index.html                 monta #root
src/
├─ main.jsx                importa installStorage PRIMA di App (l'ordine conta)
├─ App.jsx                 stato, calcoli, sincronizzazione
├─ constants.js            palette, fasce orarie, TAPPE del corpo, frasi
├─ styles.css
├─ installStorage.js       definisce window.storage: database + cache locale
├─ windowStorage.js        la sola copia locale (Capacitor Preferences o localStorage)
├─ notificheTappe.js       notifiche programmate delle tappe
├─ utils/    format.js · storage.js · conti.js (risparmi e minuti di vita)
│            fusione.js (identità degli eventi e fusione di due copie)
│            sincronizza.js (revisioni, coda, tentativi — staccato dal browser
│                            apposta, così si può verificare davvero)
│            arretrate.js (sigarette segnate in ritardo)
├─ auth/     index.js (sceglie il backend) · supabaseAuth.js · supabaseClient.js · localAuth.js
├─ data/     groups.js     gruppi e classifica, su tabelle Supabase
│            prefissi.js   i prefissi telefonici internazionali
├─ components/             18 pezzi riusabili (Pianta, Respiro, Timeline, …)
└─ screens/                le 4 schermate + gruppo + i 2 overlay

public/                    icone, manifest della PWA
supabase/migrations/       lo schema del database, versionato
verifica/controlli.mjs     controlli sui calcoli, senza dipendenze
verifica/redesign.mjs      controlli su markup, CSS e accessibilità
verifica/persistenza.mjs   fusione, revisioni, cancellazioni
verifica/gruppi.mjs        rete incerta, classifica
verifica/coda-utente.mjs   code attribuite all'utente, scritture offline
verifica/annulla-lotto.mjs annullamento delle arretrate
verifica/account.mjs       eliminazione dell'account
verifica/affidabilita.mjs  i sei punti della fase 2
verifica/schermate.jsx     ogni schermata montata e renderizzata
strumenti/genera-icone.py  rifà le icone PNG dal logo
```

## Installarla sul telefono

`index.html` dichiara il manifest e le icone, quindi «Aggiungi a schermata
Home» dà un'app vera: icona propria, apertura a schermo intero, niente barra
del browser. Le icone si rigenerano dal logo con
`python3 strumenti/genera-icone.py` (serve Pillow).

## Cosa è stato corretto

`CORREZIONI.md` — la rilettura del 25 agosto: sedici bug, quasi tutti nel client.
`AUDIT-MATEMATICO.md` — l'audit di tutti i calcoli e il registro delle
correzioni: ritmo di partenza che si misurava da solo, medie che cambiavano nel
corso della giornata, due formule per le stesse «sigarette risparmiate», soglia
della ricaduta che contava le notti di sonno, silenzio contato come se fosse un
giorno a zero.

`REGOLE-MATEMATICHE.md` — le definizioni in vigore, una per una, con la tabella
degli otto scenari e i numeri che l'app deve mostrare in ciascuno. Da leggere
prima di toccare qualunque cosa produca una cifra.

## Pubblicarla

`PUBBLICARE.md` — guida passo passo, senza riga di comando.

## La grafica

`DESIGN.md` — il sistema visivo «Germoglio»: l'idea, le quattro regole, la
palette e cosa è cambiato rispetto al vecchio tema «Brace». Tutto l'aspetto vive
in `src/styles.css`, dove le regole sono scritte come commenti accanto al codice
che le applica.

## Backend

Supabase, progetto `smetto`. Schema, policy RLS e cose ancora da fare stanno in
`BACKEND.md`; le migrazioni vere e proprie in `supabase/migrations/`.

Le credenziali sono già scritte come default in `src/auth/supabaseClient.js`,
quindi l'app funziona appena clonata. Per puntare a un altro progetto copia
`.env.example` in `.env`.

## Capacitor

Il codice è già pronto per il telefono: `windowStorage.js` e `notificheTappe.js`
provano a caricare `@capacitor/preferences` e `@capacitor/local-notifications`
con un import dinamico, e se non li trovano usano il fallback web.

Finché Capacitor non è installato, `vite.config.js` risolve quei pacchetti su un
modulo vuoto — serve solo a non far fallire la build. **Quando installerai
Capacitor davvero, togli il plugin `stubCapacitor` da `vite.config.js`.**

## Limiti noti sul web

- Le notifiche delle tappe a schermo spento **non funzionano da browser**: non
  c'è nessun service worker registrato, e comunque i Notification Triggers li
  supportano solo alcuni browser Chromium. Con l'app aperta le tappe arrivano
  lo stesso (banner + notifica di sistema). Per averle davvero in tasca serve
  il pacchetto Capacitor.
- Il gruppo si aggiorna a intervalli: 30 secondi se sei nella schermata gruppo,
  90 altrimenti. Con Supabase Realtime diventerebbe istantaneo.
