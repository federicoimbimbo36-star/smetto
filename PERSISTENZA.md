# La persistenza — cosa perdeva, e perché adesso non può più

Rilettura di tutto il percorso del dato: stato React → `salva()` →
`writeStore()` → `window.storage` → copia locale → Supabase → coda →
rilettura → fusione.

Non letto: **eseguito**. Il motore di sincronizzazione è stato staccato dal
client Supabase e dal browser (`src/utils/sincronizza.js`) apposta per
poterlo far girare contro un database finto che fa i dispetti veri —
risponde in ritardo, non risponde affatto, risponde quando ormai qualcun
altro ha scritto. Tutti i numeri «prima» qui sotto vengono da esecuzioni.

Verifica: `npm run verifica` → 133 controlli di persistenza. Con il codice
di prima ne fallivano **15** sulla sincronizzazione, **19** sull'identità
degli eventi e **7** sulla cancellazione.

---

## Il verdetto in una riga

L'architettura precedente era **«l'ultimo che scrive vince» su un unico
oggetto JSON che contiene tutte le sigarette**. Non era una scelta
sbagliata di parametri: era una scelta che rende la perdita di dati
inevitabile, non improbabile.

---

## I quattro modi di perdere una sigaretta

Tutti raggiungibili senza fare niente di strano.

### 1. Due dispositivi — 101 invece di 102

```
telefono A legge 100 sigarette
telefono B legge 100 sigarette
A ne registra una  → scrive le sue 101
B ne registra una  → scrive le sue 101, sopra quelle di A
risultato: 101
```

**Gravità: critica. Rischio reale: certo**, non probabile. Basta avere un
telefono e un tablet, o un telefono nuovo, e registrare senza aver
riaperto l'app sull'altro. Vale identico per **due schede** dello stesso
browser, che per giunta condividono anche la copia locale.

Misurato nel banco a centoventi mosse casuali fra due dispositivi: delle
57 sigarette registrate e non cancellate, ne sopravvivevano **26**.

### 2. La risposta lenta cancellava quello che era appena stato scritto

Era il caso descritto nella richiesta, e c'era davvero. `cloudKV.get`
aveva una scadenza — giusto, altrimenti l'app si bloccava su rete lenta —
e alla scadenza partiva con la copia locale. Ma la risposta che arrivava
dopo faceva:

```js
lettura.then((r) => { if (r?.data) localKV.set(key, JSON.stringify(r.data.value)); });
```

Una `set`, non una fusione. Quella risposta è nata **prima** della
sigaretta appena registrata, e la cancellava dalla copia locale. Poi:
refresh → l'app riparte da un registro più vecchio di quello che l'utente
aveva davanti trenta secondi prima → la sigaretta successiva viene salvata
sopra uno stato già sbagliato, e a quel punto è persa anche sul database.

**Gravità: critica.** Verificato: 101 sul dispositivo prima della
risposta, **100 dopo**.

### 3. Il lavoro fatto offline spariva al primo rientro riuscito

`get` restituiva il valore del database ogni volta che il database
rispondeva. Non c'era nessuna nozione di «il locale potrebbe essere più
nuovo». Registrare offline, chiudere l'app, riaprirla online voleva dire
farsi restituire la versione senza quella registrazione.

**Gravità: critica.** Ed è lo scenario più comune di tutti: metropolitana,
ascensore, aereo — cioè i posti in cui uno fuma e apre l'app.

### 4. La coda viveva in memoria

Le scritture non riuscite finivano in una `Map`. Un refresh la azzerava,
e il sistema operativo che chiude l'app in background pure. A quel punto
la scrittura non partiva più mai, e valeva il punto 3.

**Gravità: critica.**

---

## I difetti minori, tutti veri

**La coda buttava via la versione più nuova.** `svuotaCoda` iterava su una
copia della coda e faceva `inCoda.delete(key)` a scrittura riuscita. Se
durante lo svuotamento l'utente registrava un'altra sigaretta, quella
scrittura aveva rimpiazzato la voce in coda — e la `delete` la cancellava.
La versione più recente non arrivava mai al database. Ora si cancella solo
se la voce è ancora **quella** che si è appena scritta.

**Due svuotamenti in parallelo.** `svuotaCoda` partiva dall'evento
`online`, dal timer e dal cambio di sessione, senza nessun lucchetto.

**Le scritture sorpassavano.** `salva()` non aspetta il salvataggio —
giustamente — quindi due modifiche ravvicinate lanciavano due `writeStore`
che correvano una contro l'altra: `localKV.set`, lettura della sessione,
chiamata al database, tre punti in cui la seconda può arrivare prima e far
vincere il registro **più vecchio**. Con Capacitor Preferences, che è
asincrono anche sul dispositivo, il sorpasso è possibile pure sulla copia
locale. Ora c'è una coda per chiave.

**Cancellare era filtrare.** `handleElimina` toglieva l'istante dalla
lista. L'altro dispositivo la sua copia ce l'aveva ancora, e alla prima
riconciliazione la sigaretta tornava dentro. Idem per «azzera lo storico»
e per «annulla» sulle arretrate.

**`ripartenze` era un contatore scalare.** Un contatore non si fonde: due
dispositivi che salgono da 3 a 4 ciascuno danno 4, non 5.

**Le altre schede erano invisibili.** Nessun ascolto dell'evento `storage`.

---

## L'architettura: quattro strade, una scelta

| | affidabilità | offline | multi-device | conflitti | migrazione | costo | complessità |
|---|---|---|---|---|---|---|---|
| **A** JSON + revisione | media | buono | **no** | li vede, non li risolve | nulla | nullo | bassa |
| **B** log di eventi nel JSON | alta | buono | sì | risolti | nulla | nullo | media |
| **C** tabella eventi dedicata | altissima | buono | sì | risolti | migrazione + RLS | righe × utenti | alta |
| **D** ibrido: JSON fuso + revisione | alta | buono | sì | risolti | nulla | nullo | media |

**A da sola non basta.** La revisione trasforma una perdita silenziosa in
un conflitto visibile, ma poi qualcuno deve risolverlo — e per la stessa
persona sui suoi due telefoni la risoluzione dev'essere automatica.
Chiedere «quale versione tieni?» a chi ha registrato una sigaretta in
ascensore non è una risposta.

**C è la soluzione da manuale e qui è sbagliata.** Una tabella di eventi
risolve tutto, ma vuol dire nuovo schema, nuove policy RLS da riverificare
una per una, riscrittura del percorso di lettura e scrittura, e un modello
di dati che non somiglia più a niente di quello che l'app usa oggi. Per un
progetto che ha **zero righe nelle tabelle** e non è ancora stato provato
da due persone, è il tipo di riscrittura che si fa quando i problemi che
risolve li hai già visti, non prima.

**Scelta: D.** Il registro resta un unico JSON in `user_kv` — quindi
nessuna migrazione, nessuna nuova tabella, nessuna policy da riscrivere —
ma cambia il modo in cui due versioni si incontrano:

1. **Non si sceglie, si fonde.** Gli insiemi di istanti (sigarette, voglie
   superate, check-in, ricadute) si fondono con l'unione meno le
   cancellazioni. È un 2P-Set: commutativo, associativo, idempotente. Da
   qui discende che due dispositivi non perdono niente, che i tentativi
   ripetuti non duplicano, e che **l'ordine con cui le sincronizzazioni
   arrivano non cambia il risultato finale**.

2. **L'identità dell'evento è il millisecondo.** Lo era già di fatto — su
   quello sono indicizzate le etichette del registro — e adesso lo è anche
   formalmente. È questo che rende la deduplicazione deterministica e
   sopravvivente al riavvio: non è un `Set` nel client, è la chiave
   primaria dell'evento, uguale su tutti i dispositivi.

3. **Le cancellazioni sono lapidi.** Senza, l'unione farebbe risorgere
   ogni sigaretta tolta dal registro.

4. **I campi singoli hanno un orologio ciascuno.** Un prezzo o è 6,00 o è
   6,50: qui l'unione non vuol dire niente e vince il più recente, ma
   **campo per campo**. Con un orologio solo per tutto il registro,
   cambiare il prezzo sul telefono avrebbe cancellato il motivo scritto sul
   tablet cinque minuti prima.

5. **Una nuova colonna, `user_kv.rev`.** La fusione da sola avrebbe
   comunque una finestra scoperta fra il momento in cui il client legge la
   versione remota e quello in cui riscrive quella fusa. La scrittura
   dichiara da quale revisione parte; se qualcuno ha scritto nel frattempo
   la riga non viene aggiornata, e il client rilegge, rifonde e riprova.

È l'unica modifica al database, ed è quella richiesta dal punto 14 come
«strettamente necessaria per l'integrità del registro».

---

## Tre eccezioni volute, tutte nella stessa direzione

- **`start` prende il minimo.** Il percorso comincia dalla prima sigaretta
  conosciuta, e scoprirne una più vecchia non deve accorciarlo.
- **`ripartenzeBase` prende il massimo.** È un contatore che sale.
- **Un campo che esiste da una parte sola vince**, qualunque cosa dicano
  gli orologi: l'assenza non è una decisione. `null` invece **è** un
  valore — «sono tornato in riduzione» scrive `smessoDal: null` e deve
  poter vincere.

---

## Le statistiche secondarie: «assenza ≠ zero» non valeva dappertutto

**Il record.** Scorreva le sigarette due a due e prendeva la distanza più
grande. Chi spariva per dieci giorni si vedeva assegnare un record di
dieci giorni senza fumare — gli stessi dieci giorni che i contatori si
rifiutano di pagare. Ed è peggio che nei contatori: un record resta
scritto e diventa il numero da battere. Nuova regola **D12**, coerente con
D2 e D3: una pausa conta solo se sta **tutta** dentro un tratto coperto.
La pausa in corso vale sempre, perché si misura dal riferimento.

**`media7`.** Divideva per sette giorni di calendario, quindi contava come
«zero sigarette» i giorni in cui l'app non sapeva niente. Da lì esce la
proiezione a un anno: sparire tre giorni su sette faceva **salire** il
risparmio annunciato per i dodici mesi successivi di oltre cento euro
nello scenario provato. Nuova regola **D13**: denominatore = tempo
coperto.

**`mediaPrec`**, da cui esce l'obiettivo settimanale. Una settimana passata
senza aprire l'app produceva un obiettivo vicino a zero, irraggiungibile,
presentato come se fosse il risultato di un progresso. Ora, se la settimana
non è coperta almeno per mezza giornata, l'obiettivo non c'è e l'app lo
dice.

**Già a posto:** classifica (D11), giorni a zero (D10), tutti i contatori
economici (D7), l'analisi dei trigger (denominatore = sigarette
etichettate).

**Non toccato, e va detto:** le barre «media per settimana» del mese
mostrano ancora le sigarette registrate divise per i giorni pieni, senza
distinguere i giorni coperti. Sono descrittive e non alimentano nessun
calcolo, ma un mese con dentro una settimana di silenzio si legge come un
calo che in parte non è successo.

---

## Cosa resta aperto

**La fusione non ha un tetto.** Le lapidi crescono e basta: un istante è un
numero, quindi anni di uso valgono qualche decina di kilobyte, ma non c'è
niente che le poti. Va guardato quando ci saranno registri veri lunghi.

**Due modifiche allo stesso campo nello stesso millisecondo** si risolvono
con l'identificativo del dispositivo. È deterministico — le due parti
scelgono la stessa — ma è arbitrario: una delle due modifiche si perde.
Con la granularità del millisecondo è un caso da laboratorio.

**Il registro resta un unico oggetto.** Ogni scrittura manda tutto il
registro al database. Con anni di storico diventa qualche centinaio di
kilobyte per sigaretta registrata, ed è il limite che un giorno spingerà
verso la soluzione C. Oggi no.

**Realtime non c'è ancora.** Due dispositivi convergono alla prossima
scrittura o alla prossima apertura, non nell'istante. È il lavoro già in
lista, e la fusione è esattamente il pezzo che serviva per poterlo fare
senza rischiare di perdere dati.

**I gruppi non passano da qui.** `group_members` è una riga per persona,
quindi il conflitto non può nascere; ma `publish` ricostruisce `days` da
zero a ogni scrittura, quindi vale ancora il limite noto sui fusi orari.

**Non è stato provato su Supabase vero.** Il database finto applica le
stesse condizioni di quello vero (`where rev = <attesa>`), ma resta un
finto. Prima di fidarsi serve la prova in due persone su due telefoni, che
è già il punto uno della lista dei prossimi passi.

---

# Seconda parte: l'identità degli eventi

La prima parte ha reso impossibile perdere una sigaretta per colpa della
rete. Restava aperta una domanda che sembrava teorica e non lo era: **che
cosa identifica una sigaretta?**

La risposta era: il suo millisecondo. Sbagliata.

## Il problema è reale, e in un caso è certo

`distribuisci` è una funzione **pura** di (quante, finestra). Due
dispositivi che segnano «ieri, 10 sigarette» producono dieci istanti
identici al millisecondo. Verificato, non stimato:

```
A: [1787985900000, 1787991300000, 1787996700000, …]
B: [1787985900000, 1787991300000, 1787996700000, …]
identiche? true
```

Non è una collisione da una su ottantasei milioni. È **certa**, e succede
alla prima persona che segna lo stesso arretrato su due dispositivi.

Il secondo caso è più banale e più frequente: un **orologio spostato
indietro** — fuso orario, correzione manuale, sincronizzazione NTP — fa
restituire a `Date.now()` millisecondi già usati.

## Cosa succedeva

Non un doppione. Una sigaretta **in meno**, ingoiata dall'unione senza un
errore, senza un avviso, senza niente:

```
due registrazioni nello stesso millisecondo  →  ne sopravvive 1
due dispositivi, stesso millisecondo, fusi   →  1 + 1 = 1
```

E tre conseguenze a cascata:

- **i motivi si scambiavano.** `tags` era indicizzato per istante, quindi
  due sigarette allo stesso millisecondo condividevano l'etichetta;
- **cancellarne una ne cancellava due.** La lapide era l'istante: A
  elimina la sua sigaretta delle 12:30:00.000, e dopo la sincronizzazione
  sparisce anche quella che B aveva registrato nello stesso millisecondo.
  È il test obbligatorio, e falliva: **restava zero invece di uno**;
- **l'esportazione CSV** scriveva una riga sola per due sigarette.

## La soluzione

```
evento = { id, tipo, ts }
```

`id` da `crypto.randomUUID()` — c'è nel browser, in Node e in Capacitor.
Il ripiego non è «quasi unico»: è dispositivo + **contatore monotono** +
caso, quindi la stessa copia dell'app non può riusare un identificativo
nemmeno chiamando la funzione mille volte nello stesso millisecondo.

`ts` resta il tempo vero e non si tocca: **tutta la matematica D1–D13
continua a leggere l'istante**, non l'identificativo.

**`cigs` è ancora un array di numeri.** Non per pigrizia: riscrivere il
motore matematico — 311 controlli — per fargli digerire degli oggetti
avrebbe voluto dire rimettere in discussione codice verificato per
risolvere un problema che non è suo. `eventi` è la verità, le liste sono
proiezioni. L'unica differenza per chi le consuma è che possono contenere
due volte lo stesso numero, che è il punto.

## La migrazione

L'identificativo dei registri vecchi è **derivato dal millisecondo**:
`s:cig:1800000000000`.

È la proprietà che rende la migrazione sicura. Se fosse casuale, due
dispositivi che aggiornano l'app produrrebbero identificativi diversi per
le stesse sigarette, e la prima sincronizzazione avrebbe creato **due
copie di ogni sigaretta mai registrata**. Con l'identificativo derivato,
i due dispositivi arrivano allo stesso risultato senza essersi parlati.

Migrano anche le etichette (`tags[ts]` → `tags[s:cig:ts]`) e le lapidi
vecchie, altrimenti tutto quello che era stato cancellato prima
dell'aggiornamento sarebbe tornato indietro.

**Un limite dichiarato:** la migrazione è sicura fra due dispositivi che
hanno **entrambi** il codice nuovo. Un dispositivo fermo alla versione
precedente che scrive sullo stesso account mentre un altro è aggiornato
può produrre doppioni, perché scrive liste di istanti che il nuovo codice
non può distinguere da proiezioni. Non è una possibilità teorica da
risolvere con altro codice: è una cosa da non fare. Con zero utenti oggi è
gratis evitarla; quando ci saranno utenti veri, l'aggiornamento va fatto su
tutti i dispositivi prima di usarne due insieme.

## Un bug vero, trovato da questi controlli

Non era nell'identità. Lo strato di sincronizzazione, quando trovava sul
database la sigaretta dell'altro dispositivo, la fondeva e scriveva il
risultato — ma **l'app in memoria restava com'era**. Il salvataggio
successivo partiva da lì, la revisione era aggiornata quindi la scrittura
passava senza fondere niente, e la sigaretta dell'altro spariva dal
database.

Non è un caso di laboratorio: succede ogni volta che uno registra
qualcosa offline e poi, rientrato, cancella o modifica qualcosa. Ora
`set` avvisa quando ha dovuto fondere, e l'app rifonde il suo stato — lo
stesso meccanismo che già serviva per le due schede.

## Un'altra invariante, scoperta di rimbalzo

`start ≤ min(cigs)`. `intervalliCoperti` scarta gli eventi precedenti a
`start`, quindi un registro con `start` più recente della sigaretta più
vecchia aveva eventi registrati, contati nei totali e **invisibili alla
copertura**. La fusione lo correggeva già; adesso lo fa anche
l'apertura.

## Cosa cambia per chi usa l'app

Una cosa sola, e va detta: **due lotti arretrati identici su due
dispositivi adesso fanno venti sigarette, non dieci.** Prima si fondevano
in dieci, e sembrava più intelligente — ma era un caso, non una decisione:
si fondevano perché il sistema non sapeva distinguere «lo stesso evento
due volte» da «due eventi uguali». Venti è la risposta onesta: sono state
registrate venti volte.

---

# Terza parte: la cancellazione, e la chiusura

Restava un buco, e sta tutto in una asimmetria: **`aggiorna` dichiarava da
quale revisione partiva, `cancella` no.**

```js
// prima
cancella: (uid, key) => supabase
  .from('user_kv').delete().eq('user_id', uid).eq('key', key)
```

Un DELETE secco. La scrittura era protetta dal controllo di concorrenza; la
cancellazione, che distrugge di più, non lo era:

```
A legge la revisione 10
B modifica il registro          → revisione 11
A cancella, convinta di essere alla 10
→ spariva anche il lavoro di B, che A non aveva mai visto
```

Riprodotto: nello scenario B la riga finiva a `null` e le due sigarette
diventavano **zero**.

## Il difetto è reale, ma oggi non è raggiungibile

Va detto, perché la differenza conta.

Con Supabase configurato — cioè in produzione — eliminare l'account passa
dalla funzione `delete_me` sul database e dalla cascata delle chiavi
esterne, non da questo ramo. Senza Supabase, `window.storage` è la sola
copia locale e non c'è nessun remoto da cancellare. **Nessun utente poteva
incontrare questo bug**, perché nessun percorso dell'app arriva lì.

Si corregge lo stesso, per tre ragioni: `delete` è un metodo pubblico dello
strato di storage; la coda offline può trasportarlo (ci finisce ogni
cancellazione fallita); e la prossima funzione che ne avesse bisogno
l'avrebbe usato così com'era. Un'arma carica lasciata sul tavolo.

## La correzione

La cancellazione dichiara la revisione come tutto il resto. Se qualcuno ha
scritto nel frattempo, la riga non viene toccata e la cancellazione viene
**abbandonata** — non ritentata contro la revisione nuova.

Questo è il punto su cui vale la pena essere espliciti, perché è una
decisione e non un dettaglio: ritentare contro la revisione nuova sarebbe
stato di nuovo un delete cieco, solo più lento. È volutamente diverso dal
ramo della scrittura, dove si fonde: due modifiche si sommano, mentre
«cancella tutto» e «aggiungi una sigaretta» non si sommano, si
contraddicono. Fra le due vince quella che non perde dati.

L'operazione risulta comunque **conclusa**, altrimenti la coda la
ritenterebbe ogni venti secondi per sempre. Il dispositivo viene avvisato e
alla prima lettura si riprende quello che c'è, invece di restare vuoto dopo
aver buttato via la copia locale.

## Le due cancellazioni non sono la stessa cosa

Una confusione facile, che vale la pena mettere per iscritto:

- **cancellare un evento** (togliere una sigaretta dal registro) → lapide
  sull'identificativo, viaggia con i dati, si fonde. Era già a posto.
- **cancellare la chiave** (togliere l'intera riga dal database) → è
  un'operazione di riga, non ha lapide, e nessun altro dispositivo può
  sapere che è successa. È quella che adesso è condizionata alla
  revisione.

Gli scenari D–H della richiesta riguardavano quasi tutti la prima, ed
erano già verdi; il buco era nella seconda.

## Le lapidi reggono

Il percorso completo — A registra X, B lo riceve, A cancella X, B va
offline, registra altro, si riavvia, torna online e si sincronizza — è
adesso un controllo esplicito. X non ricompare: né dopo il rientro, né su
un dispositivo appena installato, né dopo venti rifusioni in ordine misto.

## La fase è chiusa

Delete protetto, offline protetto, lapidi protette, multi-dispositivo
protetto, identità dell'evento protetta. Quello che resta aperto è nella
lista qui sopra e non si risolve con altro codice: si risolve provando
l'app su due telefoni veri.
