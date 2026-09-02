# Cancellazione account — le copie sul dispositivo

Terza revisione, 2 settembre 2026. **Non chiusa: manca la prova a mano
su telefono** (vedi in fondo).

> **Revisione 3 — due modi che restavano di dire «pulito» senza saperlo.**
> Tutti e due producevano la stessa cosa: «Account eliminato.» dopo una
> verifica che non era stata fatta.
>
> 1. **`rigaValida` accettava righe che non sono coppie.** Chiedeva
>    «almeno un elemento, il primo stringa». Una riga con la sola chiave
>    veniva attribuita ad A e la coda — che nessuno sa come sia finita in
>    quello stato — veniva **cancellata**, con la pulizia dichiarata
>    riuscita. Peggio: una riga con un elemento in più veniva letta
>    guardando i primi due, giudicata «di B» e tenuta, mentre il dato di
>    A stava nel terzo elemento, sul disco, sotto la conferma. Adesso una
>    riga vale solo se è **esattamente** `[chiave, valore]`.
> 2. **`rimuoviMarcatoreDi` scambiava «non l'ho potuto leggere» per «non
>    c'è».** La lettura passava da `leggiMarcatore`, che risponde `null`
>    in tutti e due i casi; il `null` diventava `ok: true`. Con `getItem`
>    negato — Safari in navigazione privata, storage in sola lettura — la
>    cancellazione dichiarava la pulizia riuscita senza aver mai guardato
>    se `smetto:uscito` fosse ancora lì. Adesso la pulizia usa una lettura
>    stretta a tre stati che sa dire **«non lo so»**.
>
> Correzioni alla regola 5 e alla regola sul marcatore, qui sotto.
> Controprova eseguita: **41 controlli falliscono sul codice precedente**.

> **Revisione 2 — perché la prima consegna non era accettabile.**
> Dichiarava la pulizia riuscita anche con la coda offline ancora sul
> dispositivo. `ripuliscilaCoda()` restituiva `ok: true` subito dopo
> `set`/`delete`, e la verifica finale saltava la chiave della coda:
> se lo storage risolveva senza persistere, l'utente leggeva «Account
> eliminato.» con una voce di quell'account ancora lì, pronta a
> rimettere in circolo i suoi dati sanitari al riavvio. In più una coda
> formalmente valida ma strutturalmente rotta (`[null]`) faceva uscire
> un `TypeError` dal destructuring invece di un esito sicuro.
> Corretto qui sotto, alla regola 4 e alla regola 5.

## Il difetto

`delete_me()` cancella l'utente e le righe remote. Non tocca niente di
quello che sta sul dispositivo. Dopo il messaggio «Account eliminato.»
restavano:

- `smetto:log:<uid>` — eventi, orari, trigger, ricadute, prezzo del
  pacchetto, i se–allora;
- `smetto:seen:<uid>` — la mappa dei «già visti» del gruppo;
- le voci di `__coda__` attribuite a quell'utente, che contengono il
  registro **per intero** perché la coda tiene il valore, non il delta.

Sono dati di salute, in chiaro, su un telefono che può cambiare mano. Il
percorso `localAuth` cancellava il solo log (`window.storage.delete(logKey(id))`);
quello Supabase non cancellava niente.

Aggravante: l'utente aveva appena letto una frase che diceva il
contrario. Non è una svista di pulizia, è la stessa famiglia di difetti
già trovata sul logout e sulla cancellazione remota — **l'app diceva più
di quello che era successo**.

## Cosa fa adesso

La sequenza in `utils/account.js`:

1. uscita dai gruppi — se fallisce ci si ferma qui;
2. cancellazione remota — se fallisce ci si ferma qui, **e non si tocca
   niente in locale**;
3. `primaDiPulire()` — chi chiama azzera il proprio stato;
4. `pulisci(uid)` — la pulizia del dispositivo;
5. il messaggio, scelto sull'esito reale.

### Le regole, e perché

**L'ordine non è arbitrario.** Se la cancellazione remota fallisce
l'account è ancora vivo: portargli via registro e «già visti» dal
telefono sarebbe una perdita di dati secca, per giunta a un utente che
l'app sta per invitare a riprovare.

**Si tocca solo quello che è suo.** Il dispositivo è uno, gli account che
ci sono passati possono essere tanti. La proprietà di una chiave la
decide `uidDaChiave`, non un prefisso: cancellare per prefisso vorrebbe
dire portarsi via il registro di chi presta il telefono.

**Prima la memoria, poi il disco.** La coda ha due copie. Pulire solo il
disco non serve a niente: il primo `salvaCoda` che passa — anche quello
di un altro account che registra una sigaretta — riscrive dalla mappa in
memoria le voci appena tolte.

**Non si passa da `window.storage`.** Quella cancella anche in rete, e a
questo punto la sessione è già chiusa: `sincronizza.js` accoderebbe una
cancellazione attribuita a un utente che non esiste più. Cioè
lascerebbe indietro, in coda, esattamente la voce che si sta togliendo.
La pulizia parla direttamente con la copia locale.

**Non si crede a una scrittura, si rilegge.** «Ho chiamato delete» non è
«non c'è più», e — questo è il punto della revisione 2 — nemmeno «delete
ha risolto» lo è. `set` e `delete` possono **risolvere senza
persistere**: quota superata, storage in sola lettura, navigazione
privata, un adattatore che ingoia. Nessuna eccezione, nessun valore di
ritorno diverso, solo il disco che non è cambiato. Quindi l'esito delle
singole chiamate non entra nel verdetto: dopo ogni modifica si **rilegge**
— l'elenco delle chiavi e, separatamente, il contenuto della coda — e
`rimosse`/`rimaste` si ricavano da lì.

**La coda si giudica per contenuto, non per nome.** La verifica sulle
chiavi salta di proposito `__coda__`, perché quella chiave non appartiene
a nessuno. Era la fessura da cui passava il difetto: la coda veniva
riscritta e nessuno andava a vedere com'era finita. Adesso
`ripuliscilaCoda` rilegge da sé e, se dentro c'è ancora una voce di
quell'utente, `__coda__` finisce **nominata** fra i residui.

**Quello che non si capisce non è pulito.** Una coda illeggibile o
malformata — JSON rotto, `[null]`, una riga che non è una coppia, una
chiave che non è una stringa — non si può dichiarare priva dei dati di
nessuno. Non si butta via (dentro può esserci roba di un altro account) e
non si dà per buona: si dice che è rimasta. Il controllo di forma sta
**prima** del filtro, perché `voci.filter(([k, v]) => …)` su `[null]`
lancia durante il destructuring, e un'eccezione che scappa da lì lascia la
cancellazione a metà senza dirlo a nessuno.

**Una riga è una coppia: né più corta, né più lunga.** È la correzione
della revisione 3. `rigaValida` chiedeva `length >= 1`, e i due modi di
sbagliare erano diversi per gravità:

| coda | prima | perché è sbagliato |
|---|---|---|
| `[["smetto:log:A"]]` | `ok: true`, coda **cancellata** | il valore non c'è: la riga viene attribuita ad A per la sola chiave, e una coda che questa app non ha scritto viene distrutta per rimediare a uno stato che nessuno sa spiegare |
| `[["smetto:log:B", {uid:"B",…}, {uid:"A",…}]]` | `ok: true`, coda tenuta, **`dato-A` sul disco** | il codice guarda i primi due elementi, conclude «è di B» e la conserva: il dato di A resta, e viene dichiarato assente |

Il formato lo scrive `salvaCoda` con `[...inCoda.entries()]`, che produce
solo coppie: una riga di lunghezza diversa da 2 **non l'ha scritta questa
app**, e su una riga simile non si può affermare niente — né che sia di
A, né che non lo sia. Quindi `length === 2`, coda dichiarata illeggibile,
`__coda__` nominata fra i residui, e la coda lasciata dov'è.

**Il marcatore `smetto:uscito` ha la sua regola.** È un residuo locale
legato a una persona e porta scritto di chi è. Quello dell'account
cancellato va via; quello di un'altra persona **no** — toglierlo
rimetterebbe in piedi il difetto che `marcatoreLogout.js` esiste per
chiudere: la scheda congelata di qualcun altro tornerebbe a fidarsi di
una sessione che non deve più valere. Anche qui si rilegge, perché
`removeItem` può fallire in silenzio.

**E il marcatore si legge stretto, ma solo qui.** Seconda correzione
della revisione 3. `leggiMarcatore` ha due risposte — un marcatore valido
oppure `null` — e per l'autenticazione va bene così: «non l'ho potuto
leggere» e «non c'è» portano tutti e due a **lasciar passare**, che è la
scelta giusta quando il dubbio riguarda se buttare fuori qualcuno. Un
JSON rotto in `smetto:uscito` non deve diventare un modo elaborato di non
far entrare più nessuno.

Per la pulizia la stessa fusione è un difetto: il `null` veniva letto
come «non è di questo utente» e diventava `ok: true`. Quindi
`ispezionaMarcatore()`, usata **solo** dalla pulizia, ne distingue tre:

| stato | quando | cosa fa la pulizia |
|---|---|---|
| `assente` | il posto si legge e non c'è niente (compreso: piattaforma senza `localStorage`, dove non si è mai potuto scrivere) | `ok: true`, niente da togliere |
| `letto` | marcatore ben formato: si sa **di chi è** | decide sul nome: quello di A va via, quello di B resta |
| `illeggibile` | `getItem` che lancia o che non c'è, valore non stringa, JSON rotto, forma che non è quella di un marcatore | `ok: false`, e **non si cancella** |

L'ultima riga ha una conseguenza che non è ovvia. `smetto:uscito` è una
chiave sola per tutto il dispositivo e porta scritto dentro il nome del
proprietario: se quel nome non si riesce a leggere, toglierla può voler
dire togliere il «sei uscito» di un'altra persona. Fra dichiarare un
residuo che forse non c'è e rimettere in piedi il difetto che
`marcatoreLogout.js` esiste per chiudere, **si dichiara il residuo**.
`leggiMarcatore` è riscritta sopra `ispezionaMarcatore` e non accanto:
due letture separate potrebbero divergere, e una divergenza qui vorrebbe
dire che l'accesso e la cancellazione non stanno guardando lo stesso
marcatore. Il comportamento pubblico non cambia — tutto quello che non è
`letto` resta `null`.

**Lo stato dell'app si azzera fra il passo 2 e il passo 4.** Dopo sarebbe
tardi (`salva()` non aspetta `writeStore`: un salvataggio in volo
rimetterebbe `smetto:log:<uid>` un istante dopo che è stato tolto), prima
sarebbe presto (se la cancellazione fallisce l'utente deve ritrovare i
suoi dati a schermo). In più `utils/storage.js` aspetta le fila già
aperte su `logKey` e `seenKey` prima di cominciare.

### Il messaggio

Tre esiti, tre frasi. Quella di mezzo prima non esisteva:

| esito | frase |
|---|---|
| remoto fallito | «Non è stato possibile eliminare l'account. Controlla la rete e riprova.» |
| remoto e locale riusciti | «Account eliminato.» |
| remoto riuscito, locale no | «Account eliminato. Alcuni dati potrebbero essere rimasti su questo dispositivo: per toglierli svuota i dati del sito o disinstalla l'app.» |

Le frasi stanno in `utils/account.js` e non in `App.jsx` perché sono la
conclusione di questa sequenza: separarle vorrebbe dire poterle far
divergere dagli esiti senza che nessun controllo se ne accorga.

## File toccati

| file | cosa |
|---|---|
| `src/utils/puliziaLocale.js` | **nuovo** — `dimenticaUtenteSulDispositivo`: spazza le chiavi, ripulisce la coda, toglie il marcatore, **rilegge tutto** e restituisce `{ ok, rimosse, rimaste, motivo }` |
| `src/utils/marcatoreLogout.js` | `rimuoviMarcatoreDi(userId)`: toglie `smetto:uscito` solo se è di quell'utente, e verifica rileggendo. **Revisione 3**: nuova `ispezionaMarcatore()` a tre stati, usata solo dalla pulizia; `leggiMarcatore` ora è costruita sopra di essa **senza cambiare comportamento** |
| `src/utils/sincronizza.js` | nuovo `dimenticaUtente(uid)` sul motore (coda in memoria + `revNota`, poi disco); nuova opzione `togliMarcatore`, iniettata come `uidDaChiave` |
| `src/utils/account.js` | `eliminaAccount` accetta `pulisci` e `primaDiPulire` e restituisce `pulizia`; nuovi `MESSAGGI` e `messaggioEliminazione` |
| `src/utils/storage.js` | nuovo `dimenticaUtente(uid)`: aspetta le fila aperte, poi chiama `window.storage.dimenticaUtente` |
| `src/installStorage.js` | `uidDaChiave` importata invece che ridefinita; `rimuoviMarcatoreDi` collegata; `localeSolo` sa dimenticare un utente anche senza Supabase |
| `src/constants.js` | `uidDaChiave` accanto a `logKey`/`seenKey`, e importabile da un banco di prova |
| `src/App.jsx` | `handleDeleteAccount` collega pulizia e messaggio |
| `verifica/account.mjs` | banco riscritto: da 22 a 171 controlli, e con la revisione 3 a **297** (sezioni 14 e 15) |
| `verifica/affidabilita.mjs`, `verifica/coda-utente.mjs` | tolte le due copie della regex, ora importano quella vera |

Non toccati: `localAuth.js`, `supabaseAuth.js`, `windowStorage.js`,
calcoli, gruppi, logout, notifiche.

## Come ho verificato «risolve ma non persiste»

Il difetto non produce eccezioni e non cambia nessun valore di ritorno:
un banco che non lo simula esplicitamente non lo vede. Il finto
dispositivo di `verifica/account.mjs` ha quindi **due** modi di
rompersi, e sono diversi:

- `guasto.lancia` — l'operazione esplode. Facile da vedere.
- `guasto.finge` — l'operazione **risolve e non persiste**: `set` e
  `delete` restituiscono l'oggetto di sempre e la mappa non viene
  toccata. Nessun segnale, solo il disco che non è cambiato.

```js
async set(k, v) {
  if (guasto.lancia.has(k)) throw new Error('storage negato');
  if (guasto.finge.has(k)) return { key: k, value: v };      // risolve, non scrive
  m.set(k, v); return { key: k, value: v };
}
```

Con `guasto.finge.add('__coda__')` si riproducono i due scenari
segnalati, e i controlli non si fermano all'esito: vanno a **guardare il
disco**, con `codaSuDisco(locale)`, e verificano che la voce di A sia
effettivamente ancora lì mentre `pulizia.ok` è `false`. Lo stesso guasto
è applicato anche a una chiave normale (`seenKey(A)`), per provare che la
rilettura dell'elenco scopre pure quella e che `rimosse` elenca solo ciò
che è sparito davvero. La stessa bugia è riprodotta su `localStorage` per
il marcatore, con un `removeItem` sordo.

## Controprova

Rimettendo la `puliziaLocale.js` della consegna precedente, **28 dei 171
controlli falliscono**:

```
✗ set che finge · ma la pulizia NON è riuscita
✗ set che finge · la coda è nominata fra i residui
✗ delete che finge · si dice che qualcosa può essere rimasto
✗ coda malformata ([null]) · nessuna eccezione esce
✗ coda malformata (riga non iterabile) · la pulizia fallisce
✗ finge su una chiave · «rimosse» dice solo quello che è sparito davvero
✗ marcatore di A · il marcatore è stato tolto
✗ marcatore sordo · la pulizia fallisce
✗ regola generale (coda che finge) · nessuna falsa promessa
…
143 controlli superati, 28 falliti
```

E rimettendo il comportamento della prima fase (`eliminaAccount` che non
chiama `pulisci`), i controlli che falliscono sono quelli sulla pulizia
in sé — registro ancora sul dispositivo, coda in memoria non svuotata,
promessa di dispositivo pulito.

### Controprova della revisione 3

Rimettendo `rigaValida` a `length >= 1` e `rimuoviMarcatoreDi` alla
lettura non stretta, **41 dei 297 controlli falliscono**:

```
✗ riga non coppia (solo la chiave) · la pulizia NON è riuscita
✗ riga non coppia (solo la chiave) · la coda non viene buttata via
✗ riga non coppia (chiave e valore, più un terzo elemento di A) · la pulizia NON è riuscita
✗ riga non coppia (quattro elementi) · la coda è nominata fra i residui
✗ riga non coppia (una buona e una a tre elementi) · e il motivo è la coda
✗ dato di A nel terzo elemento · la pulizia locale NO
✗ dato di A nel terzo elemento · messaggio sui possibili residui
✗ marcatore non verificabile (getItem che lancia) · NON è dichiarato riuscito
✗ marcatore non verificabile (JSON malformato) · NON è dichiarato riuscito
✗ marcatore non verificabile (valore non stringa) · NON è dichiarato riuscito
✗ marcatore illeggibile (JSON malformato) · e il marcatore non viene cancellato
✗ marcatore non verificabile via sequenza (getItem che lancia) · la pulizia locale no
✗ marcatore non verificabile via sequenza (JSON malformato) · messaggio sui possibili residui
…
256 controlli superati, 41 falliti
```

I due esiti prodotti dal codice precedente, presi dall'esecuzione:

```
[["smetto:log:utente-A"]]
  → {"ok":true,"rimosse":["smetto:log:utente-A"],"rimaste":[],"motivo":null}
    e la coda malformata era stata CANCELLATA

[["smetto:log:utente-B",{uid:"utente-B",…},{uid:"utente-A",…}]]
  → {"ok":true,"rimosse":["smetto:log:utente-A"],"rimaste":[],"motivo":null}
    con "dato-A" ancora sul disco: true

rimuoviMarcatoreDi('utente-A', { getItem: () => { throw … } })
  → {"ok":true,"tolto":false,"chiave":"smetto:uscito"}
```

e gli stessi tre dopo la correzione:

```
  → {"ok":false,"rimosse":["smetto:log:utente-A"],"rimaste":["__coda__"],"motivo":"coda"}
  → {"ok":false,"rimosse":["smetto:log:utente-A"],"rimaste":["__coda__"],"motivo":"coda"}
  → {"ok":false,"tolto":false,"chiave":"smetto:uscito","motivo":"storage"}
```

**Sezione 14** — righe di coda che non sono coppie: sola chiave, tre
elementi con un dato di A nel terzo, quattro elementi, cinque elementi,
riga vuota, e una coda mista con una riga buona e una rotta. Per ognuna:
nessuna eccezione esce, la pulizia fallisce, il motivo è `coda`,
`__coda__` è fra i residui, la coda **non viene toccata**, le chiavi di A
se ne vanno lo stesso e **B resta identico** (registro e «già visti»
confrontati byte per byte). In coda alla sezione, il caso peggiore
attraverso la sequenza intera e una prova che le coppie buone continuano
a funzionare — la correzione non deve trasformare ogni coda in un
residuo.

**Sezione 15** — marcatore non verificabile: `getItem` che lancia, JSON
malformato, JSON valido ma non un marcatore, marcatore senza utente,
marcatore di tipo sbagliato, valore non stringa, `getItem` che non è una
funzione. Per ognuno: nessuna eccezione, `ok: false`, `tolto: false`, la
chiave nominata, e — sullo stesso ambiente — `leggiMarcatore` che
continua a restituire `null` senza bloccare l'accesso. Poi i due casi
illeggibili con un deposito vero, per verificare che il marcatore **non
venga cancellato**; i tre stati di `ispezionaMarcatore` presi da soli; il
marcatore di A che viene tolto e quello di B che resta intatto; e i
quattro modi di non poter verificare attraverso la sequenza intera, dove
l'account remoto è eliminato, la pulizia locale è `ok: false`, il
messaggio è quello sui possibili residui, si esce comunque dall'account e
le chiavi di B non sono state toccate.

I controlli 5–13 guidano il **motore vero** (`creaKvSincronizzato`) con
un database spento e due account sullo stesso dispositivo: la coda che
riempiono è quella di produzione, non una finta.

### La sezione 13, che è la regola detta una volta sola

Sette guasti diversi — coda che finge, chiave che finge, chiave che
lancia, elenco non leggibile, coda non leggibile, coda malformata,
marcatore sordo — e per ognuno gli stessi quattro controlli: l'account
risulta **eliminato**, la pulizia risulta **fallita**, il messaggio è
quello sui possibili residui, e si esce comunque dall'account. È lì che
si vede che non esiste una strada in cui un errore locale produce
«Account eliminato.» e basta.

## Esiti

| comando | esito |
|---|---|
| `npm run lint` | 0 errori, 0 avvisi |
| `npm run verifica:completa` | 2.305 controlli su 8 suite + 44 stati renderizzati, nessun fallimento |
| `npm run build` | pulita (resta l'avviso preesistente sulla dimensione del chunk) |

## Limiti residui

1. **`escoSoloDaQui` dentro `deleteAccount` ignora ancora il proprio
   errore.** Se `delete_me()` passa ma il `signOut` no, resta scritto il
   blob di sessione Supabase (`sb-*-auth-token`) di un account che non
   esiste più. Non sono dati sanitari e la sessione è morta lato server,
   ma è un residuo. Preesistente, fuori dal perimetro di questa
   correzione.
2. **La corsa con le scritture in volo è ridotta, non annullata.** Resta
   teoricamente possibile che una scrittura parta fra l'azzeramento dello
   stato e la cancellazione. La verifica finale lo direbbe, ma solo se
   arriva prima della rilettura dell'elenco.
3. **Su Capacitor, `Preferences` può contenere altre chiavi** (per
   esempio le notifiche programmate): non passano da `uidDaChiave` e non
   vengono spazzate. Se ne occupa `annullaTappe()`, che resta com'era.
4. **Coda illeggibile o malformata:** non si cancella e non si dichiara
   pulita. Dentro potrebbero esserci scritture di un altro account, e
   distruggerle per rimediare a un JSON rotto sarebbe un danno vero al
   posto di un dubbio. Conseguenza voluta: se la coda è rotta l'utente
   riceve il messaggio sui residui anche quando dentro non c'era niente
   di suo. Non si può sapere, e fra il dubbio e la falsa promessa vince
   il dubbio.
5. **La finestra fra rilettura e riavvio.** La verifica dice com'è il
   disco in quell'istante. Se qualcosa scrivesse dopo — non dovrebbe,
   perché lo stato è azzerato e la sessione chiusa — la rilettura non lo
   vedrebbe.
6. **`smetto:uscito` è una chiave sola per tutto il dispositivo.** Se in
   futuro servisse tenere il marcatore di due persone insieme, la
   struttura andrà cambiata: oggi l'ultimo che esce sovrascrive il
   precedente, e questo è un comportamento preesistente che la pulizia
   non altera.
7. **Marcatore illeggibile: stessa scelta della coda rotta.** Se
   `smetto:uscito` non si può leggere o non ha la forma di un marcatore,
   la pulizia dichiara il residuo e non cancella — anche quando dentro
   non c'era niente di quell'utente, o non c'era niente del tutto. È il
   prezzo di non poter sapere di chi sia, e si paga volentieri:
   l'alternativa è cancellare il «sei uscito» di un altro account.
   L'utente vede il messaggio sui possibili residui, che è vero («*potrebbero*
   essere rimasti»), mentre «Account eliminato.» sarebbe una promessa
   fatta senza guardare.
8. **La lettura stretta vale solo per la pulizia.** Avvio, risveglio e
   `sessioneAmmessa` continuano a passare da `leggiMarcatore`, che tratta
   l'illeggibile come assente e lascia entrare. Sono due politiche
   opposte sullo stesso dato, ed è voluto — nel dubbio, non si butta
   fuori nessuno dall'app e non si promette niente sulla cancellazione —
   ma è una distinzione che va tenuta a mente se un domani qualcuno
   cambiasse una delle due.

## Da provare a mano, prima di chiudere la fase

Nessun controllo automatico sostituisce questo.

1. Due account sullo stesso telefono. Con A: registrare qualche
   sigaretta **in aereo** (offline), così restano in coda. Rientrare
   online, poi uscire ed entrare con B, registrare qualcosa anche lì.
2. Con A: eliminare l'account. Verificare il messaggio.
3. Ispezionare `localStorage` (o `Preferences` su dispositivo): non
   devono esserci `smetto:kv:smetto:log:<A>` né `smetto:kv:smetto:seen:<A>`,
   e in `smetto:kv:__coda__` nessuna voce con `uid` di A. Se c'è un
   `smetto:uscito` di A, non deve esserci più.
4. **Su Safari in navigazione privata**, dove lo storage può accettare la
   scrittura e non tenerla: ripetere il punto 2. Il messaggio deve essere
   quello sui possibili residui, non «Account eliminato.». È il caso reale
   che questa revisione corregge, e il banco lo simula ma non lo prova sul
   motore del browser.
5. Le chiavi di B devono esserci tutte, le sue voci in coda devono essere
   ancora attribuite a lui, e un eventuale `smetto:uscito` di B deve
   essere intatto.
6. Entrare con B e verificare che il suo registro sia quello di prima.
7. Ripetere il punto 2 **in aereo**: la cancellazione deve fallire, il
   messaggio deve dirlo, e le chiavi di A devono essere ancora tutte lì.
8. **Coda rotta a mano** (revisione 3). Da console, sostituire
   `smetto:kv:__coda__` con una riga a tre elementi — per esempio
   `[["smetto:log:<B>", {"uid":"<B>","value":"x"}, {"uid":"<A>","value":"x"}]]`
   — e poi eliminare l'account A. Il messaggio deve essere quello sui
   possibili residui, e la coda deve essere **ancora lì**, immutata.
9. **Marcatore rotto a mano** (revisione 3). Scrivere `smetto:uscito` a
   `{rotto` ed eliminare l'account A: stesso messaggio, e la chiave non
   deve essere stata cancellata. Poi verificare che si riesca comunque a
   entrare con B — la lettura dell'accesso non deve essersi irrigidita.
