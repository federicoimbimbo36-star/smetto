# Rapporto — fase 2, affidabilità

31 agosto 2026. Sei punti, sei difetti confermati nel codice prima di
toccarlo, sei correzioni con test che falliscono sulla versione di prima.

Base di partenza: `smetto-fase-igiene.zip`, 1.628 verifiche, lint pulito.

## Correzioni applicate

### 1 — Uscire da un gruppo quando il server dice di no

**Il difetto.** `groups.leave` restituisce `{ error }` quando la
cancellazione non passa, e quel valore veniva buttato via. Il gruppo
spariva dal telefono e il messaggio diceva «sei uscito» comunque, mentre
l'iscrizione restava sul database: si continuava a comparire nella
classifica degli altri, senza più avere il gruppo da cui uscire. Era
l'unico stato dell'app da cui l'utente non aveva modo di venire fuori.
`join` questo controllo ce l'aveva già.

**Dove.** `src/App.jsx`, `handleEsciGruppo`.

### 2 — Notifiche delle tappe riferite a una sigaretta vecchia

**Il difetto.** Programmare le tappe è una catena di cinque attese. Due
sigarette a poca distanza fanno partire due catene, e siccome le notifiche
hanno identificativi fissi vince l'ultima che arriva — che può essere la
più vecchia. Il telefono avvisava «sono passate due ore» contando da un
momento sbagliato: una notizia falsa proprio sulla cosa che l'utente sta
misurando.

**Dove.** `src/notificheTappe.js`, `programmaTappe`, `programmaConCapacitor`,
`programmaSulWeb`, `annullaTappe`. Ogni chiamata prende un numero e si
ritira se non è più l'ultima. `annullaTappe` alza il numero a sua volta,
così una programmazione in volo non ricompare dopo un logout.

**Nota**: il test ha trovato una lacuna nella prima versione della
correzione. Il controllo stava solo prima della programmazione, ma la
cancellazione delle vecchie viene dopo un'attesa: la catena sorpassata
cancellava le tappe appena programmate dall'altra e poi si ritirava,
lasciando il telefono **senza nessuna tappa**. Adesso il controllo c'è
anche prima di cancellare.

### 3 — Cambi di sessione da un'altra scheda

**Il difetto.** La sessione si leggeva una volta sola, all'avvio. La
sessione Supabase sta in localStorage ed è condivisa fra le schede: uscire
in una le fa uscire tutte, ma solo quella che aveva premuto il pulsante se
ne accorgeva. Le altre restavano a mostrare i dati di un account da cui
l'utente era già uscito — su un dispositivo condiviso, sotto gli occhi di
chi entra dopo.

**Dove.** `src/auth/supabaseAuth.js` e `src/auth/localAuth.js` espongono
`onAuthChange` con la stessa forma, così `App.jsx` non deve sapere quale
backend sta usando; `src/App.jsx` ascolta. Sessione sparita → si torna
all'accesso con lo stesso `resetAuthState` del logout. Account cambiato →
si riparte con i suoi dati. Il rinnovo del token non fa niente.

**Scelta che ti segnalo**: il ritorno all'accesso è **silenzioso**, senza
avviso. Non ho inventato un messaggio nuovo. Se preferisci un avviso è una
riga.

### 4 — Una lettura che legge la chiave di un altro

**Il difetto.** `set` e `delete` avevano già il controllo di proprietà;
`get` no. Ed è peggio, perché `get` non si limita a leggere: fonde il
risultato nella copia locale e la riscrive. Con la sessione già passata a
B e la chiave ancora di A si interrogava il database per la riga
`(B, chiave-di-A)`, e quello che tornava finiva dentro il registro di A
sul dispositivo. In più la risposta arrivata in ritardo poteva scrivere
dopo un cambio di account.

**Dove.** `src/utils/sincronizza.js`, `get`. Chi non è il proprietario si
tiene la copia locale e non tocca né la rete né il disco; la risposta in
ritardo ricontrolla la sessione prima di scrivere.

### 5 — Pareggi degli orologi non deterministici

**Il difetto.** A parità di orologio decideva l'identificativo del
dispositivo. Ma i due dispositivi possono essere lo stesso —
`ID_DISPOSITIVO` si rigenera a ogni caricamento della pagina, quindi la
copia locale e la riga sul database possono portare lo stesso timbro — e
allora il confronto pareggiava e vinceva il **primo argomento**. Fondere
locale con remoto dava un risultato, fondere remoto con locale ne dava un
altro. L'intestazione del blocco promette che la fusione è commutativa.

Riprodotto: due valori di `prezzoPacchetto`, stesso millisecondo, stesso
dispositivo → `5.5` in un verso, `6.2` nell'altro. È il numero da cui
passano tutti i conti dei risparmi.

**Dove.** `src/utils/fusione.js`, `vinceY` dentro `fondiRegistri`.
L'ultimo spareggio è il valore stesso confrontato come testo: non conta
quale vinca, conta che vinca sempre lo stesso.

### 6 — Un gruppo lasciato che ritorna

**Il difetto.** `groups` sta fra i campi a orologio: vince la lista di chi
l'ha toccata per ultimo. Va bene per entrare, non per uscire. Un secondo
dispositivo che non sapeva dell'uscita e ha toccato la lista dopo
rimetteva dentro il gruppo — con l'iscrizione già cancellata sul server,
quindi un gruppo che c'è sullo schermo e non esiste più davvero.

**Dove.** `src/utils/fusione.js` (`normalizzaRegistro`, `fondiRegistri`) e
`src/App.jsx` (`handleEsciGruppo`, `handleJoinGruppo`, `vuotoLog`).

**Scelta che ti segnalo, perché tocca il formato dei dati**: ho aggiunto
`gruppiUsciti`, le lapidi dei gruppi, con la stessa regola già usata per
le sigarette cancellate (`rimossi`): si **uniscono**, non si votano.
Rientrare in un gruppo toglie la lapide, altrimenti da un gruppo lasciato
una volta non si potrebbe più rientrare. Il campo è additivo: un registro
vecchio che non ce l'ha si legge lo stesso e non perde i suoi gruppi
(verificato).

---

## Test

`verifica/affidabilita.mjs`, nuovo, 42 controlli, una sezione per punto.
Agganciato a `npm run verifica:completa`.

Le notifiche non sono controllate leggendo il sorgente: il ramo web viene
montato con un finto service worker che risponde lento a comando, così
l'ordine di arrivo delle due catene lo decide il test.

**Controprova.** Rimessi i sei sorgenti originali, lo stesso banco riporta
**22 controlli falliti su 42**, distribuiti su tutti e sei i punti.

## Esiti

| comando | esito |
|---|---|
| `npm run lint` | 0 errori, 0 avvisi |
| `npm run build` | verde, 2,35 s |
| `npm run verifica` | 311 + 133 + 1017 |
| `gruppi.mjs` | 25 |
| `coda-utente.mjs` | 49 |
| `annulla-lotto.mjs` | 41 |
| `account.mjs` | 22 |
| **`affidabilita.mjs`** | **42** (nuovo) |
| `schermate.jsx` | 30 stati |
| **totale** | **1.670**, da 1.628 |

Nessuna regressione: le otto suite preesistenti hanno gli stessi numeri
di prima.

## Limiti rimasti

- **Il punto 3 non è provato in un browser vero.** L'ascolto di
  `onAuthStateChange` è verificato sul sorgente e `localAuth.onAuthChange`
  è eseguito davvero, ma due schede aperte contemporaneamente non le ho
  potute provare: qui non c'è un browser. Va messo nella lista del
  collaudo a mano.
- **Il ramo Capacitor delle notifiche non è eseguito**, solo quello web.
  La guardia è la stessa funzione per entrambi, ma la prova vera è
  sull'app impacchettata.
- **Il punto 6 cambia il formato del registro.** In avanti è compatibile
  (campo additivo, verificato); all'indietro no: un dispositivo con la
  versione vecchia dell'app ignora `gruppiUsciti` e può far ritornare il
  gruppo. Durante la beta conviene aggiornare tutti i tester insieme.
- **Il punto 1 aggiunge un messaggio d'errore** («Non è stato possibile
  uscire dal gruppo. Riprova.»). È testo nuovo: se hai un tono diverso in
  mente, cambialo.
- Resta l'avviso di build sul chunk oltre i 500 kB, quello di sempre.

## Da spuntare nella checklist

- [ ] Due schede aperte: logout in una, verificare che l'altra torni
      all'accesso senza mostrare i dati di prima
- [ ] Due schede, due account diversi: verificare che la seconda carichi i
      dati giusti
- [ ] Uscita da un gruppo con la rete staccata: il gruppo deve restare e
      comparire l'errore
- [ ] Due sigarette a distanza di pochi secondi: le tappe programmate
      devono contare dall'ultima
- [ ] Uscita da un gruppo su un telefono mentre l'altro è offline, poi
      riconnessione: il gruppo non deve tornare
- [ ] Rientro in un gruppo da cui si era usciti
- [ ] Aggiornare tutti i tester insieme quando si passa a questa versione

---

# Secondo giro — i tre bug concorrenti

31 agosto 2026. La revisione indipendente aveva ragione su tutti e tre.

## P1 · Gara sull'autenticazione

Il caricamento di un account è una catena — `getSession`, poi `loadLog`
che legge il disco e interroga il database — e arrivava in fondo senza
mai chiedersi se la sessione fosse ancora quella di partenza. Il flag
`active` copriva solo lo smontaggio del componente, cioè un caso che in
pratica non succede: l'app resta montata e cambia la sessione sotto.

La sequenza protetta è ora in `src/utils/sessione.js`, fuori da App.jsx,
per la stessa ragione di `costruisciLotto`: una gara che non si può
eseguire non si può nemmeno dimostrare chiusa. Ogni sequenza prende un
gettone prima di partire e lo ricontrolla dopo ogni `await`; `brucia()`
lo invalida a ogni logout, cambio account e smontaggio. `resetAuthState`
azzera anche `datiRef` e `userRef` **in modo sincrono**, prima dello
stato React: erano loro che le operazioni in volo leggevano ancora.

Il secondo controllo — l'utente corrente, non solo il gettone — copre il
caso peggiore: il caricamento nuovo ha già preso il gettone valido e
quello vecchio arriva subito dopo.

## P2 · Uscita e rientro nei gruppi

`gruppiUsciti` era un'unione permanente, e un'unione non si disfa. Una
copia rimasta offline con la vecchia lapide se la riportava dietro e
buttava fuori l'utente da un gruppo in cui era appena rientrato.
Dimostrato: dopo la fusione con il telefono offline, `groups` tornava
vuoto.

Adesso `gruppiStato[CODICE]` vale `true` o `false` e sta fra le `MAPPE`,
che hanno già un orologio **per chiave**: `orologi['gruppiStato.CODICE']`
è la versione ordinabile, e la fusione passa dallo stesso `vinceY`
sistemato nel primo giro — commutativo, associativo, idempotente,
verificato. `groups` e `gruppiUsciti` restano come proiezioni rigenerate,
così i registri già scritti si leggono e un'app con la versione
precedente trova le due liste coerenti.

Ai codici migrati si dà una versione **bassa**, apposta: un rientro fatto
dopo l'aggiornamento vince su un registro scritto prima.

## P3 · Gare fra programmazione e annullamento delle notifiche

Il contatore da solo non ordinava niente. Aggiunta una **coda seriale**:
la seconda operazione comincia quando la prima ha finito, quindi due
catene non si intrecciano più. Il contatore resta e serve a scartare in
partenza quello che è già stato superato mentre aspettava il turno.
`annullaTappe` ha ora un numero suo — così una programmazione in volo si
accorge di essere stata superata — ma non si ritira mai per conto suo:
cancellare è sempre sicuro, e rinunciare lascerebbe notifiche in piedi
dopo un logout. Aggiunto anche il controllo mancante **dopo**
`cancel(...)`, che era l'ultima attesa scoperta.

Sta tutto prima del bivio, quindi vale per Capacitor e per il web.

## Controprove

| test nuovi | contro il codice di prima |
|---|---|
| sessione (9 controlli) | **9 falliti** |
| rientro nei gruppi | **fusione con la replica offline: `groups` vuoto** |
| sequenza a (annullamento lento → programmazione rapida) | **fallito** |
| sequenza b e c | già verdi: erano coperte dal contatore del primo giro, ma non erano provate da nessun test |

## Esiti

| | |
|---|---|
| `npm run lint` | 0 errori, 0 avvisi |
| `npm run build` | verde, 2,78 s |
| avviso di build | chunk da 513,58 kB, sopra la soglia di 500 kB consigliata da Vite |
| `npm run verifica:completa` | **1.708**, da 1.670 |

---

# Terzo giro — il P1 residuo

31 agosto 2026. Correzione mirata, niente altro toccato.

## Il difetto

`caricaSessione` impediva a una sequenza superata di chiamare
`autentica()`, ma `loadLog` scriveva per conto suo lungo la strada:
`visti.current`, `setGruppi`, `setGruppoAttivo`, `datiRef.current`,
`setDati`, e faceva partire o spegnere le notifiche di sistema. Il
controllo arrivava dopo, quindi impediva di dichiarare autenticato
l'account sbagliato e intanto lasciava mettere i dati di A sulla
schermata di B: utente in alto B, numeri di A.

## La correzione (soluzione 1)

`loadLog` è diventata due funzioni:

- **`preparaLog(uid)`** legge e basta — disco, normalizzazione, gruppi dal
  database — e restituisce tutto quello che servirà, senza toccare niente;
- **`applicaLog(preparato)`** fa le scritture, tutte insieme.

`caricaSessione` chiama `applicaRegistro` **solo dopo** aver verificato
gettone e utente corrente, e fra il controllo e le scritture non c'è
nessun `await`: nessun altro codice può girare in mezzo, quindi non esiste
un istante in cui la sessione cambi a metà scrittura.

`loadLog` resta come composizione delle due, per il percorso dell'accesso
appena fatto da questa scheda, dove la sessione non può cambiare sotto.
Caricamento iniziale e cambio account passano dalla stessa
`caricaSessione`: nessuna logica duplicata.

`resetAuthState` continua ad azzerare `datiRef.current`, `userRef.current`
e a bruciare la sequenza, in modo sincrono e prima dello stato React.

## Test

I test della sessione sono stati rifatti: adesso c'è uno **schermo finto**
con utente, dati, gruppi, visti, notifiche e stato di autenticazione, e si
verifica lo stato finale, non solo l'assenza di `AUTENTICATO`.

- caricamento normale senza disturbi
- logout durante il caricamento → nessun dato, nessun gruppo, nessuna
  notifica dell'account uscito
- A lento → B entra e finisce → A arriva in ritardo: utente **e** dati
  finali entrambi di B, una sola notifica, nessuna traccia di A
- gettone ancora valido ma utente cambiato (accesso dal modulo, che non
  passa dalla sequenza)
- errore su sequenza scaduta, e nessuna sessione

**Controprova**: rimettendo le scritture prima del controllo, **11
controlli falliscono**, fra cui `sorpasso · I DATI FINALI SONO DI B`.

## Esiti

| | |
|---|---|
| `npm run lint` | 0 errori, 0 avvisi |
| `npm run build` | verde, 2,40 s |
| avviso di build | chunk da 513,87 kB, sopra la soglia di 500 kB di Vite |
| `npm run verifica:completa` | **1.730**, da 1.708 |

La Fase 2 **non è conclusa**: resta il collaudo manuale con due schede e
su telefono.

---

# Quarto giro — l'ultimo P1: il modulo di accesso

31 agosto 2026.

## Il difetto

`handleAuthSubmit` era rimasto fuori dalla sequenza protetta:

```js
applyProfile(res.user);
await loadLog(res.user.id);
setIsAuthenticated(true);
```

Tre scritture che arrivavano comunque, anche in ritardo. Il commento che
avevo lasciato — «per i percorsi dove la sessione non può cambiare sotto,
l'accesso appena fatto da questa scheda» — era **falso**: il cambio non
arriva da questa scheda, arriva da un'altra, e questa non se ne accorge.
A fa l'accesso, il caricamento è lento, l'altra scheda entra come B, B
finisce, e A riscrive profilo, dati e autenticazione di A sopra la
schermata di B — con tanto di «Bentornato».

## La correzione

L'accesso passa dalla stessa `caricaSessione` del caricamento iniziale e
del cambio account. La sequenza si brucia prima di aprirne una nuova, così
qualunque caricamento partito prima è già superato. E la sessione si
**rilegge** invece di fidarsi di `res.user`: se quella vera non è più di
chi ha appena fatto l'accesso, non si applica niente.

Il benvenuto, la scheda iniziale e la pulizia dei campi password stanno
sotto `if (esito !== 'entrato') return;`. Il messaggio di errore per
credenziali o rete resta dov'era.

`loadLog` è stata rimossa: non la chiamava più nessuno, e tenerla in giro
sarebbe stato un invito a ricascarci.

## Test

Il percorso è ricostruito per intero — credenziali, risposta di `signIn`,
sequenza bruciata, rilettura della sessione, benvenuto — non
`caricaSessione` da sola:

- accesso normale, con benvenuto, scheda e campi puliti
- credenziali sbagliate: il messaggio di errore resta
- **A lento → altra scheda passa a B → B finisce → A in ritardo**: utente,
  dati, gruppi, gruppo attivo, visti, notifiche e autenticazione tutti di
  B, nessuna traccia di A, nessun benvenuto per A
- A → logout esterno durante il caricamento: nessun dato, nessun gruppo,
  nessuna notifica, nessuno autenticato
- sessione riletta di un altro utente: non si applica niente

Più cinque controlli sul sorgente che tengono il modello agganciato alla
funzione vera: `handleAuthSubmit` deve passare da `caricaSessione`, non
chiamare più un caricamento diretto, bruciare la sequenza prima, tenere il
benvenuto sotto l'esito, e `loadLog` non deve più esistere.

**Controprova**: rimettendo il percorso diretto, **20 controlli
falliscono**.

## Esiti

| | |
|---|---|
| `npm run lint` | 0 errori, 0 avvisi |
| `npm run build` | verde, 2,38 s |
| avviso di build | chunk da 514,05 kB, sopra la soglia di 500 kB di Vite |
| `npm run verifica:completa` | **1.772**, da 1.730 |

La Fase 2 **non è conclusa**: manca il collaudo manuale.
