# La persistenza — cosa perdeva, e perché adesso non può più

Rilettura di tutto il percorso del dato: stato React → `salva()` →
`writeStore()` → `window.storage` → copia locale → Supabase → coda →
rilettura → fusione.

Non letto: **eseguito**. Il motore di sincronizzazione è stato staccato dal
client Supabase e dal browser (`src/utils/sincronizza.js`) apposta per
poterlo far girare contro un database finto che fa i dispetti veri —
risponde in ritardo, non risponde affatto, risponde quando ormai qualcun
altro ha scritto. Tutti i numeri «prima» qui sotto vengono da esecuzioni.

Verifica: `npm run verifica` → 56 controlli di persistenza. Con il codice
di prima ne fallivano **15**.

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
